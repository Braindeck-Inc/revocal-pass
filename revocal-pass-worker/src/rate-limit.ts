import type { Env } from './types';

export type RateLimitVerdict = { ok: true } | { ok: false; retryAfterMs: number };

/**
 * §5.5 IP 보조 한도 — 10분 rolling window 동안 15회 초과 시 10분 쿨다운.
 * 기기당 하루 1회가 1차 한도이고, 이건 "짧은 시간에 몰아치는" 스크립트형
 * 어뷰징만 걸러내는 2차 안전판(근거: plan §5.5).
 */
export async function checkAndBumpIpRateLimit(env: Env, db: D1Database, ip: string): Promise<RateLimitVerdict> {
  const now = Date.now();
  const windowMs = Number(env.IP_RATE_LIMIT_WINDOW_MS);
  const maxCount = Number(env.IP_RATE_LIMIT_MAX);
  const cooldownMs = Number(env.IP_RATE_LIMIT_COOLDOWN_MS);

  const row = await db
    .prepare(`SELECT window_start, count, blocked_until FROM ip_rate_limit WHERE ip = ?`)
    .bind(ip)
    .first<{ window_start: number; count: number; blocked_until: number | null }>();

  if (row?.blocked_until && now < row.blocked_until) {
    return { ok: false, retryAfterMs: row.blocked_until - now };
  }

  if (!row || now - row.window_start > windowMs) {
    // 새 윈도우 시작
    await db
      .prepare(
        `INSERT INTO ip_rate_limit (ip, window_start, count, blocked_until)
         VALUES (?, ?, 1, NULL)
         ON CONFLICT(ip) DO UPDATE SET window_start = excluded.window_start, count = 1, blocked_until = NULL`,
      )
      .bind(ip, now)
      .run();
    return { ok: true };
  }

  const newCount = row.count + 1;
  if (newCount > maxCount) {
    const blockedUntil = now + cooldownMs;
    await db
      .prepare(`UPDATE ip_rate_limit SET count = ?, blocked_until = ? WHERE ip = ?`)
      .bind(newCount, blockedUntil, ip)
      .run();
    return { ok: false, retryAfterMs: cooldownMs };
  }

  await db.prepare(`UPDATE ip_rate_limit SET count = ? WHERE ip = ?`).bind(newCount, ip).run();
  return { ok: true };
}
