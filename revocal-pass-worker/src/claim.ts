import type { Env } from './types';

export interface ClaimResult {
  code: string;
  tempPassword: string;
  alreadyClaimed: boolean;
}

export type ClaimOutcome =
  | { kind: 'claimed'; result: ClaimResult }
  | { kind: 'soldOut' }
  | { kind: 'invalidDevice' };

/**
 * §4.3 원자적 발급 + §6.3 deviceId 기준 멱등 처리.
 * 같은 deviceId가 오늘 이미 발급받았으면 새로 꺼내지 않고 기존 발급 기록을 그대로 반환.
 */
export async function claimCode(
  db: D1Database,
  day: number,
  claimDate: string,
  deviceId: string,
  quota: number,
): Promise<ClaimOutcome> {
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length > 200) {
    return { kind: 'invalidDevice' };
  }

  const existing = await db
    .prepare(`SELECT code FROM device_claims WHERE device_id = ? AND claim_date = ?`)
    .bind(deviceId, claimDate)
    .first<{ code: string }>();

  if (existing) {
    const codeRow = await db
      .prepare(`SELECT code, temp_password FROM codes WHERE code = ?`)
      .bind(existing.code)
      .first<{ code: string; temp_password: string }>();
    if (codeRow) {
      return {
        kind: 'claimed',
        result: { code: codeRow.code, tempPassword: codeRow.temp_password, alreadyClaimed: true },
      };
    }
  }

  const dispensedRow = await db
    .prepare(`SELECT COUNT(*) AS c FROM codes WHERE dispensed_day = ?`)
    .bind(day)
    .first<{ c: number }>();
  if ((dispensedRow?.c ?? 0) >= quota) {
    return { kind: 'soldOut' };
  }

  // 단일 UPDATE...RETURNING 문으로 원자적 발급(§4.3) — 같은 코드가 두 명에게 나가지 않음.
  const now = new Date().toISOString();
  const claimed = await db
    .prepare(
      `UPDATE codes
       SET status = 'dispensed', dispensed_at = ?, dispensed_day = ?, claimed_by_device = ?
       WHERE code = (
         SELECT code FROM codes
         WHERE status IN ('available', 'recycled_available')
         ORDER BY code
         LIMIT 1
       )
       RETURNING code, temp_password`,
    )
    .bind(now, day, deviceId)
    .first<{ code: string; temp_password: string }>();

  if (!claimed) {
    return { kind: 'soldOut' };
  }

  await db
    .prepare(
      `INSERT INTO device_claims (device_id, claim_date, code, claimed_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(device_id, claim_date) DO NOTHING`,
    )
    .bind(deviceId, claimDate, claimed.code, now)
    .run();

  return {
    kind: 'claimed',
    result: { code: claimed.code, tempPassword: claimed.temp_password, alreadyClaimed: false },
  };
}
