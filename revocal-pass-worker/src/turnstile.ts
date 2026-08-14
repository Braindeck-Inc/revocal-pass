import type { Env } from './types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * §5.1 Cloudflare Turnstile 서버사이드 검증.
 * TURNSTILE_MOCK=true(로컬/스테이징, Secret Key 도착 전)면 항상 통과 —
 * 프로덕션 배포 시 반드시 "false" + TURNSTILE_SECRET_KEY 시크릿 등록 필요.
 */
export async function verifyTurnstile(env: Env, token: string | undefined, remoteIp: string): Promise<boolean> {
  if (env.TURNSTILE_MOCK === 'true') return true;
  if (!token || !env.TURNSTILE_SECRET_KEY) return false;

  const body = new URLSearchParams();
  body.set('secret', env.TURNSTILE_SECRET_KEY);
  body.set('response', token);
  body.set('remoteip', remoteIp);

  const res = await fetch(SITEVERIFY_URL, { method: 'POST', body });
  if (!res.ok) return false;
  const data = await res.json<{ success: boolean }>();
  return !!data.success;
}
