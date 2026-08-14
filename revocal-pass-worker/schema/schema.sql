-- Revocal Pass Worker — D1 schema (§4.1)
-- 1회 실행: wrangler d1 execute revocal-pass-worker-db --file=schema/schema.sql

CREATE TABLE IF NOT EXISTS codes (
  code TEXT PRIMARY KEY,
  temp_password TEXT NOT NULL,
  issued_at TEXT,
  expires_at TEXT,
  status TEXT NOT NULL DEFAULT 'available', -- 'available' | 'dispensed' | 'recycled_available' | 'confirmed_signup'
  dispensed_at TEXT,
  dispensed_day INTEGER,               -- 1 | 2 | 3 | NULL
  claimed_by_device TEXT
);

CREATE INDEX IF NOT EXISTS idx_codes_status ON codes(status);
CREATE INDEX IF NOT EXISTS idx_codes_dispensed_day ON codes(dispensed_day);

-- §5.5, §6.3: deviceId 기준 하루 1회 한도 + 재방문 시 동일 코드 재응답(멱등)
CREATE TABLE IF NOT EXISTS device_claims (
  device_id TEXT NOT NULL,
  claim_date TEXT NOT NULL,            -- KST 날짜, 'YYYY-MM-DD'
  code TEXT NOT NULL,
  claimed_at TEXT NOT NULL,
  PRIMARY KEY (device_id, claim_date)
);

-- §5.5: IP 보조 한도 — 10분 rolling window, 15회 초과 시 10분 쿨다운
CREATE TABLE IF NOT EXISTS ip_rate_limit (
  ip TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,       -- epoch ms, 윈도우 시작 시각
  count INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER                -- epoch ms, NULL이면 차단 아님
);

-- §5.2: 페이지로드 1회용 토큰 (60초 TTL, 1회 소비)
CREATE TABLE IF NOT EXISTS page_tokens (
  token TEXT PRIMARY KEY,
  issued_at INTEGER NOT NULL,          -- epoch ms
  consumed INTEGER NOT NULL DEFAULT 0
);
