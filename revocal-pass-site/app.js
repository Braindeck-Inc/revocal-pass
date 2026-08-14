// Revocal Pass — 프론트엔드 로직 (§6)
// 이 파일에는 비밀이 전혀 없음. 코드 풀은 전부 Worker(API_BASE)가 쥐고 있음.

(function () {
  'use strict';

  // 로컬 개발 시 wrangler dev 기본 포트(8787)를 가리키도록 자동 판별.
  var API_BASE = (function () {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return 'http://localhost:8787';
    }
    return 'https://revocal-pass-worker.revocal-pass-worker.workers.dev'; // 260814 배포 완료
  })();

  var DEVICE_ID_KEY = 'revocal-pass-device-id';
  var PAGE_LOAD_AT = Date.now();

  // §5.1 Turnstile 위젯 콜백 — data-callback="onTurnstileSuccess"에서 호출됨
  window.onTurnstileSuccess = function (token) {
    window.__turnstileToken = token;
  };

  // ---------- deviceId (§5.5) ----------
  function getDeviceId() {
    var fromStorage = null;
    try {
      fromStorage = localStorage.getItem(DEVICE_ID_KEY);
    } catch (e) {}
    if (!fromStorage) {
      fromStorage = readCookie(DEVICE_ID_KEY);
    }
    if (!fromStorage) {
      fromStorage = generateUuid();
    }
    try {
      localStorage.setItem(DEVICE_ID_KEY, fromStorage);
    } catch (e) {}
    writeCookie(DEVICE_ID_KEY, fromStorage, 400);
    return fromStorage;
  }

  function generateUuid() {
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
  }

  // ---------- 오늘 날짜(KST) 키 — §6.3 클라이언트 캐싱 ----------
  function kstDateKey() {
    var kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
    return kstNow.toISOString().slice(0, 10); // YYYY-MM-DD
  }

  function claimCacheKey() {
    return 'revocal-pass-claim-' + kstDateKey();
  }

  function readCachedClaim() {
    try {
      var raw = localStorage.getItem(claimCacheKey());
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeCachedClaim(code, tempPassword) {
    try {
      localStorage.setItem(claimCacheKey(), JSON.stringify({ code: code, tempPassword: tempPassword }));
    } catch (e) {}
  }

  // ---------- DOM refs ----------
  var els = {
    badgeRow: document.getElementById('badge-row'),
    poolBadge: document.getElementById('pool-badge'),
    stateIdle: document.getElementById('state-idle'),
    stateIssued: document.getElementById('state-issued'),
    stateSoldout: document.getElementById('state-soldout'),
    stateOutOfWindow: document.getElementById('state-outofwindow'),
    stateError: document.getElementById('state-error'),
    claimBtn: document.getElementById('claim-btn'),
    btnLabel: document.querySelector('#claim-btn .btn-label'),
    btnSpinner: document.querySelector('#claim-btn .btn-spinner'),
    issuedCode: document.getElementById('issued-code'),
    issuedPassword: document.getElementById('issued-password'),
    soldoutMessage: document.getElementById('soldout-message'),
    retryBtn: document.getElementById('retry-btn'),
    hpField: document.getElementById('hp-field'),
  };

  var SOLDOUT_TEXT =
    '안녕하세요!\n' +
    '브레인데크입니다.\n' +
    '아쉽지만 추천인코드 100개가 이미 소진되어 오늘은 더 이상 발급할 수 없습니다 😭\n' +
    '다만, braindeck@braindeck.net으로 연락주신다면 신속하게 추천인코드와 임시 비밀번호를 발급해드리겠습니다.\n' +
    '오늘도 좋은하루 보내세요! 감사합니다.';

  var ALL_STATES = [els.stateIdle, els.stateIssued, els.stateSoldout, els.stateOutOfWindow, els.stateError];

  function showState(el) {
    ALL_STATES.forEach(function (s) {
      s.hidden = s !== el;
    });
  }

  function setBadge(poolState) {
    if (poolState === 'low') {
      els.badgeRow.hidden = false;
      els.poolBadge.textContent = '소진임박';
      els.poolBadge.className = 'badge low';
    } else if (poolState === 'critical') {
      els.badgeRow.hidden = false;
      els.poolBadge.textContent = '곧 마감';
      els.poolBadge.className = 'badge critical';
    } else if (poolState === 'soldOut') {
      els.badgeRow.hidden = false;
      els.poolBadge.textContent = '소진';
      els.poolBadge.className = 'badge soldout';
    } else {
      els.badgeRow.hidden = true;
    }
  }

  function setButtonLoading(loading) {
    els.claimBtn.disabled = loading;
    els.btnSpinner.hidden = !loading;
    els.btnLabel.textContent = loading ? '발급 중...' : '체험 코드 받기';
  }

  function renderIssued(code, tempPassword) {
    els.issuedCode.textContent = code;
    els.issuedPassword.textContent = tempPassword;
    showState(els.stateIssued);
  }

  function renderSoldOut() {
    els.soldoutMessage.textContent = SOLDOUT_TEXT;
    setBadge('soldOut');
    showState(els.stateSoldout);
  }

  function renderOutOfWindow() {
    setBadge(null);
    showState(els.stateOutOfWindow);
  }

  function renderError() {
    showState(els.stateError);
  }

  // ---------- API ----------
  var currentPageToken = null;

  function fetchStatus() {
    return fetch(API_BASE + '/api/status', { method: 'GET' })
      .then(function (res) {
        return res.json();
      });
  }

  function submitClaim(pageToken) {
    var deviceId = getDeviceId();
    return fetch(API_BASE + '/api/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: deviceId,
        pageToken: pageToken,
        honeypotField: els.hpField ? els.hpField.value : '',
        // Turnstile 토큰: 사이트 키가 실제로 붙기 전까지는 빈 문자열.
        // Worker는 로컬/스테이징에서 TURNSTILE_MOCK=true일 때만 이를 허용.
        turnstileToken: window.__turnstileToken || '',
      }),
    }).then(function (res) {
      return res.json().then(function (body) {
        return { ok: res.ok, status: res.status, body: body };
      });
    });
  }

  function init() {
    // 재방문 시 §6.3 1차: localStorage 캐시가 있으면 API 호출 없이 바로 렌더
    var cached = readCachedClaim();
    if (cached && cached.code) {
      renderIssued(cached.code, cached.tempPassword);
      // 배지만 조용히 최신화(실패해도 무시)
      fetchStatus().then(function (s) {
        if (s && s.poolState) setBadge(s.poolState);
      }).catch(function () {});
      return;
    }

    fetchStatus()
      .then(function (status) {
        if (status.outOfWindow) {
          renderOutOfWindow();
          return;
        }
        currentPageToken = status.pageToken || null;
        setBadge(status.poolState);
        if (status.soldOut) {
          renderSoldOut();
          return;
        }
        showState(els.stateIdle);
      })
      .catch(function () {
        renderError();
      });
  }

  function handleClaimClick() {
    if (!currentPageToken) {
      // 토큰이 없으면(예: 상태 조회 실패 후 재시도) 상태부터 다시 받아옴
      init();
      return;
    }

    setButtonLoading(true);

    submitClaim(currentPageToken)
      .then(function (result) {
        setButtonLoading(false);
        var body = result.body || {};

        if (body.outOfWindow) {
          renderOutOfWindow();
          return;
        }
        if (body.soldOut) {
          renderSoldOut();
          return;
        }
        if (!result.ok || !body.code) {
          renderError();
          return;
        }

        writeCachedClaim(body.code, body.tempPassword);
        renderIssued(body.code, body.tempPassword);
      })
      .catch(function () {
        setButtonLoading(false);
        renderError();
      });
  }

  els.claimBtn.addEventListener('click', handleClaimClick);
  if (els.retryBtn) {
    els.retryBtn.addEventListener('click', init);
  }

  init();

  // 로컬 프리뷰(§8.2)용: 목업 데이터로 화면 상태를 강제 전환해볼 수 있는 훅.
  // 프로덕션 동작에는 전혀 관여하지 않음 — 콘솔에서 수동 호출 전용.
  window.__revocalPreview = {
    idle: function () { setBadge(null); showState(els.stateIdle); },
    low: function () { setBadge('low'); showState(els.stateIdle); },
    critical: function () { setBadge('critical'); showState(els.stateIdle); },
    soldOut: renderSoldOut,
    outOfWindow: renderOutOfWindow,
    issued: function (code, pw) { renderIssued(code || '00000004', pw || '?Q7aFx$Q'); },
    error: renderError,
  };
})();
