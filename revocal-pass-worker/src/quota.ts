import type { Env, PoolState } from './types';

async function dispensedCountForDay(db: D1Database, day: number): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM codes WHERE dispensed_day = ?`)
    .bind(day)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/**
 * §4.2 일일 쿼터(이관) 로직 — 매 요청마다 실시간 계산.
 * day1_quota = 100
 * dayN_quota = 100 + max(0, day(N-1)_quota - day(N-1)_dispensed)
 */
export async function quotaForDay(env: Env, db: D1Database, day: number): Promise<number> {
  const base = Number(env.DAILY_BASE_QUOTA);
  let quota = base;
  for (let d = 2; d <= day; d++) {
    const prevQuota = quota;
    const prevDispensed = await dispensedCountForDay(db, d - 1);
    quota = base + Math.max(0, prevQuota - prevDispensed);
  }
  return quota;
}

export interface PoolStatus {
  quota: number;
  dispensed: number;
  remaining: number;
  poolState: PoolState;
}

export async function computePoolStatus(env: Env, db: D1Database, day: number): Promise<PoolStatus> {
  const quota = await quotaForDay(env, db, day);
  const dispensed = await dispensedCountForDay(db, day);
  const remaining = Math.max(0, quota - dispensed);

  const lowThreshold = Number(env.LOW_THRESHOLD);
  const criticalThreshold = Number(env.CRITICAL_THRESHOLD);

  let poolState: PoolState = 'normal';
  if (remaining <= 0) poolState = 'soldOut';
  else if (remaining <= criticalThreshold) poolState = 'critical';
  else if (remaining <= lowThreshold) poolState = 'low';

  return { quota, dispensed, remaining, poolState };
}
