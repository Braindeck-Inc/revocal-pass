import type { Env } from './types';

/** KST(UTC+9) 기준 'YYYY-MM-DD' 문자열. */
export function kstDateString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * 오늘이 행사 기간(§9.1 #6, 00:00~24:00 KST 8/19~8/21) 중 며칠째인지 반환.
 * 행사 기간이 아니면 null.
 *
 * FORCE_WINDOW_OPEN=true(로컬/스테이징 전용, §8.2)이면 실제 날짜 대신
 * 1/2/3을 하루 단위로 순환시켜서 날짜 조작 없이 3일치 화면을 전부 확인 가능하게 함.
 * 프로덕션에는 반드시 "false"로 배포.
 */
export function resolveEventDay(env: Env, now: Date = new Date()): number | null {
  if (env.FORCE_WINDOW_OPEN === 'true') {
    const epochDay = Math.floor(now.getTime() / 86400000);
    return (epochDay % 3) + 1;
  }

  const eventDays = env.EVENT_DAYS.split(',').map((s) => s.trim());
  const today = kstDateString(now);
  const idx = eventDays.indexOf(today);
  return idx === -1 ? null : idx + 1;
}
