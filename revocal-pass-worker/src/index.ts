import type { ClaimRequestBody, Env, StatusResponse } from './types';
import { kstDateString, resolveEventDay } from './event-window';
import { computePoolStatus } from './quota';
import { issuePageToken, consumePageToken } from './page-token';
import { checkAndBumpIpRateLimit } from './rate-limit';
import { verifyTurnstile } from './turnstile';
import { claimCode } from './claim';
import { corsHeaders, jsonResponse } from './cors';
import { runDemoToRealResetOnce } from './demo-reset';

// §4.4 회수(recycle) 워크플로우는 이번 행사에서 보류 — /api/admin/recycle는 의도적으로 미구현.

function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || 'unknown';
}

async function handleStatus(request: Request, env: Env): Promise<Response> {
  const day = resolveEventDay(env);

  if (day === null) {
    const body: StatusResponse = { day: null, poolState: 'normal', soldOut: false, outOfWindow: true, pageToken: null };
    return jsonResponse(env, body);
  }

  const pool = await computePoolStatus(env, env.DB, day);
  const pageToken = await issuePageToken(env.DB);

  const body: StatusResponse = {
    day,
    poolState: pool.poolState,
    soldOut: pool.remaining <= 0,
    outOfWindow: false,
    pageToken,
  };
  return jsonResponse(env, body);
}

async function handleClaim(request: Request, env: Env): Promise<Response> {
  const day = resolveEventDay(env);
  if (day === null) {
    return jsonResponse(env, { outOfWindow: true });
  }

  let body: ClaimRequestBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(env, { error: 'invalid_body' }, { status: 400 });
  }

  // §5.4 허니팟 — 사람은 절대 못 채우는 필드가 채워져 있으면 봇으로 간주, 힌트 없이 403만.
  if (body.honeypotField) {
    return jsonResponse(env, { error: 'forbidden' }, { status: 403 });
  }

  const ip = getClientIp(request);
  const rateLimitVerdict = await checkAndBumpIpRateLimit(env, env.DB, ip);
  if (!rateLimitVerdict.ok) {
    return jsonResponse(env, { error: 'rate_limited' }, { status: 429 });
  }

  const tokenVerdict = await consumePageToken(env, env.DB, body.pageToken);
  if (!tokenVerdict.ok) {
    // 봇에게 방어 로직 힌트를 주지 않기 위해 일반적인 오류만 노출.
    return jsonResponse(env, { error: 'forbidden' }, { status: 403 });
  }

  const turnstileOk = await verifyTurnstile(env, body.turnstileToken, ip);
  if (!turnstileOk) {
    return jsonResponse(env, { error: 'forbidden' }, { status: 403 });
  }

  const pool = await computePoolStatus(env, env.DB, day);
  const claimDate = kstDateString();

  const outcome = await claimCode(env.DB, day, claimDate, body.deviceId ?? '', pool.quota);

  if (outcome.kind === 'invalidDevice') {
    return jsonResponse(env, { error: 'invalid_device' }, { status: 400 });
  }

  if (outcome.kind === 'soldOut') {
    const message =
      '안녕하세요!\n브레인데크입니다.\n아쉽지만 추천인코드 100개가 이미 소진되어 오늘은 더 이상 발급할 수 없습니다 😭\n' +
      '다만, braindeck@braindeck.net으로 연락주신다면 신속하게 추천인코드와 임시 비밀번호를 발급해드리겠습니다.\n' +
      '오늘도 좋은하루 보내세요! 감사합니다.';
    return jsonResponse(env, { soldOut: true, message });
  }

  return jsonResponse(env, {
    code: outcome.result.code,
    tempPassword: outcome.result.tempPassword,
    alreadyClaimed: outcome.result.alreadyClaimed,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname === '/api/status' && request.method === 'GET') {
      return handleStatus(request, env);
    }

    if (url.pathname === '/api/claim' && request.method === 'POST') {
      return handleClaim(request, env);
    }

    return jsonResponse(env, { error: 'not_found' }, { status: 404 });
  },

  // wrangler.toml [triggers] cron("0 15 16 8 *" = 8/17 00:00 KST)이 호출.
  // DEMO_DAYS(8/14~16) 소진분을 REAL_DAYS(8/19~21) 시작 전에 1회 자동 리셋(§demo-reset.ts).
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runDemoToRealResetOnce(env.DB));
  },
};
