import type { Env } from './types';

/** §5.2 페이지로드 1회용 토큰 발급. */
export async function issuePageToken(db: D1Database): Promise<string> {
  const token = crypto.randomUUID();
  await db
    .prepare(`INSERT INTO page_tokens (token, issued_at, consumed) VALUES (?, ?, 0)`)
    .bind(token, Date.now())
    .run();
  return token;
}

export type PageTokenVerdict =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'not_found' | 'expired' | 'already_used' | 'too_fast' };

/**
 * §5.2(1회용/만료) + §5.3(최소 체류시간) 검증.
 * 성공 시 토큰을 즉시 소비 처리(원자적 UPDATE)해서 재사용을 막음.
 */
export async function consumePageToken(env: Env, db: D1Database, token: string | undefined): Promise<PageTokenVerdict> {
  if (!token) return { ok: false, reason: 'missing' };

  const row = await db
    .prepare(`SELECT issued_at, consumed FROM page_tokens WHERE token = ?`)
    .bind(token)
    .first<{ issued_at: number; consumed: number }>();

  if (!row) return { ok: false, reason: 'not_found' };
  if (row.consumed) return { ok: false, reason: 'already_used' };

  const now = Date.now();
  const ttlMs = Number(env.PAGE_TOKEN_TTL_MS);
  const minDwellMs = Number(env.MIN_DWELL_MS);
  const elapsed = now - row.issued_at;

  if (elapsed > ttlMs) return { ok: false, reason: 'expired' };
  if (elapsed < minDwellMs) return { ok: false, reason: 'too_fast' };

  const result = await db
    .prepare(`UPDATE page_tokens SET consumed = 1 WHERE token = ? AND consumed = 0`)
    .bind(token)
    .run();

  if (!result.meta.changes) return { ok: false, reason: 'already_used' };
  return { ok: true };
}
