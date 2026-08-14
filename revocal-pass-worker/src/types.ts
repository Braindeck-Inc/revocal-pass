export interface Env {
  DB: D1Database;

  EVENT_DAYS: string; // "2026-08-19,2026-08-20,2026-08-21"
  LOW_THRESHOLD: string;
  CRITICAL_THRESHOLD: string;
  DAILY_BASE_QUOTA: string;
  PAGE_TOKEN_TTL_MS: string;
  MIN_DWELL_MS: string;
  IP_RATE_LIMIT_WINDOW_MS: string;
  IP_RATE_LIMIT_MAX: string;
  IP_RATE_LIMIT_COOLDOWN_MS: string;
  FORCE_WINDOW_OPEN: string;
  TURNSTILE_MOCK: string;
  ALLOWED_ORIGIN: string;

  // secrets (wrangler secret put)
  TURNSTILE_SECRET_KEY?: string;
  PAGE_TOKEN_SECRET?: string;
}

export type PoolState = 'normal' | 'low' | 'critical' | 'soldOut';

export interface StatusResponse {
  day: number | null;
  poolState: PoolState;
  soldOut: boolean;
  outOfWindow: boolean;
  pageToken: string | null;
}

export interface ClaimRequestBody {
  deviceId?: string;
  pageToken?: string;
  turnstileToken?: string;
  honeypotField?: string;
}
