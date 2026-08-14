/**
 * §4.1 CSV → D1 1회 임포트 스크립트.
 *
 * 실행 방법(둘 중 하나):
 *   wrangler d1 execute revocal-pass-worker-db --file=scripts/import-codes.sql   (아래로 생성한 SQL)
 *
 * 이 스크립트는 CSV(`code,temporaryPassword,expiresAt`)를 읽어서
 * INSERT 문 묶음(scripts/import-codes.sql)을 생성만 함 — 실제 D1 반영은
 * Cloudflare 계정/DB가 생긴 뒤 위 wrangler 명령으로 별도 실행.
 *
 * CSV 원본은 이 리포에 절대 커밋하지 않음(.gitignore 처리, §4.1).
 *
 * 사용법: node scripts/import-csv.mjs <csv경로>
 */

import { readFileSync, writeFileSync } from 'node:fs';

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('사용법: node scripts/import-csv.mjs <csv경로>');
  process.exit(1);
}

const raw = readFileSync(csvPath, 'utf-8');
const lines = raw.trim().split(/\r?\n/);
const header = lines[0].split(',');

const codeIdx = header.indexOf('code');
const pwIdx = header.indexOf('temporaryPassword');
const expIdx = header.indexOf('expiresAt');

if (codeIdx === -1 || pwIdx === -1 || expIdx === -1) {
  console.error('CSV 헤더가 예상과 다름. code,temporaryPassword,expiresAt 컬럼이 필요.');
  process.exit(1);
}

function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

const statements: string[] = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  const code = cols[codeIdx];
  const tempPassword = cols[pwIdx];
  const expiresAt = cols[expIdx];
  if (!code) continue;

  statements.push(
    `INSERT INTO codes (code, temp_password, issued_at, expires_at, status) VALUES ('${escapeSqlString(
      code,
    )}', '${escapeSqlString(tempPassword)}', CURRENT_TIMESTAMP, '${escapeSqlString(expiresAt)}', 'available');`,
  );
}

const outPath = 'scripts/import-codes.sql';
writeFileSync(outPath, statements.join('\n') + '\n', 'utf-8');
console.log(`생성 완료: ${outPath} (${statements.length}개 코드)`);
console.log('다음 실행: wrangler d1 execute revocal-pass-worker-db --file=scripts/import-codes.sql');
