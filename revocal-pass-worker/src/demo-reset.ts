import type { Env } from './types';

const RESET_FLAG_KEY = 'demo_to_real_reset_2026';

/**
 * ⚠️ 의도적 하드코딩(260814, TJ 승인 — 1회성 사이트).
 * event-window.ts의 DEMO_DAYS(8/14~16) 소진분을 REAL_DAYS(8/19~21) 시작 전에
 * 자동으로 원복하는 1회성 작업. wrangler.toml의 [triggers] cron이 8/18 00:00 KST에
 * 이 함수를 호출함(scheduled 핸들러, src/index.ts).
 *
 * system_flags 테이블로 중복 실행을 막음 — cron이 같은 해에 두 번 이상 걸리거나
 * (재배포로 트리거가 다시 붙는 경우 등) 수동으로 다시 트리거되어도 한 번만 실행됨.
 * 재사용하는 해가 생기면 이 플래그 행을 지우고 DEMO_DAYS/REAL_DAYS를 새 날짜로 바꾸면 됨.
 */
export async function runDemoToRealResetOnce(db: D1Database): Promise<{ ran: boolean }> {
  const existing = await db.prepare(`SELECT value FROM system_flags WHERE key = ?`).bind(RESET_FLAG_KEY).first();
  if (existing) {
    return { ran: false };
  }

  await db.prepare(`UPDATE codes SET status = 'available', dispensed_day = NULL, dispensed_at = NULL, claimed_by_device = NULL`).run();
  await db.prepare(`DELETE FROM device_claims`).run();
  await db.prepare(`DELETE FROM ip_rate_limit`).run();
  await db.prepare(`DELETE FROM page_tokens`).run();

  await db
    .prepare(`INSERT INTO system_flags (key, value, set_at) VALUES (?, 'done', ?)`)
    .bind(RESET_FLAG_KEY, new Date().toISOString())
    .run();

  return { ran: true };
}
