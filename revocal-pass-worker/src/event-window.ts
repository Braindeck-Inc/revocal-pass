import type { Env } from './types';

/** KST(UTC+9) 기준 'YYYY-MM-DD' 문자열. */
export function kstDateString(date: Date = new Date()): string {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/**
 * ⚠️ 의도적 하드코딩 (260814, TJ 승인 — "1회성 사이트라 하드코딩해도 상관없다").
 * 이 사이트는 코엑스 부스 3일 행사 전용 1회성 배포라, 날짜 목록을 환경변수 대신
 * 코드에 직접 박아둠. 재사용하게 되면(§9.2 "상시 브랜드" 논의 참고) 아래 두 배열을
 * 새 날짜로 바꾸거나 다시 env var 기반으로 되돌리면 됨.
 *
 * DEMO_DAYS: 8/14~8/16 — 실사용자 없는 상태에서 TJ가 화면을 직접 확인하기 위한
 *            더미 시연 기간(260814 요청). 이 기간에 소진된 코드는 REAL_DAYS 시작 전
 *            scheduled cron(§ src/index.ts scheduled handler)이 자동으로 리셋함.
 * REAL_DAYS: 8/19(수)~8/21(금) — 실제 코엑스 행사일, 한국시간 기준.
 * 두 구간 사이(8/17~18)는 자연히 어느 배열에도 안 걸려서 outOfWindow로 자동 처리됨 —
 * 별도 분기 코드 없이 "리스트에 없으면 닫힘"이라는 기존 로직 그대로 재사용.
 */
const DEMO_DAYS = ['2026-08-14', '2026-08-15', '2026-08-16'];
const REAL_DAYS = ['2026-08-19', '2026-08-20', '2026-08-21'];

/**
 * 오늘이 행사 기간 중 며칠째인지 반환(1/2/3). 행사 기간이 아니면 null.
 * DEMO_DAYS/REAL_DAYS 둘 다 확인 — 둘 다 "1일차/2일차/3일차"로 동일하게 취급되고,
 * 실제 재고(코드 300개) 격리는 이 함수가 아니라 scheduled cron의 D1 리셋이 담당함.
 *
 * FORCE_WINDOW_OPEN=true(로컬 전용, §8.2)면 위 하드코딩도 무시하고 실제 날짜와
 * 무관하게 1/2/3을 순환시켜서 화면 전수 확인 가능하게 함. 프로덕션엔 반드시 "false".
 */
export function resolveEventDay(env: Env, now: Date = new Date()): number | null {
  if (env.FORCE_WINDOW_OPEN === 'true') {
    const epochDay = Math.floor(now.getTime() / 86400000);
    return (epochDay % 3) + 1;
  }

  const today = kstDateString(now);

  const demoIdx = DEMO_DAYS.indexOf(today);
  if (demoIdx !== -1) return demoIdx + 1;

  const realIdx = REAL_DAYS.indexOf(today);
  if (realIdx !== -1) return realIdx + 1;

  return null;
}
