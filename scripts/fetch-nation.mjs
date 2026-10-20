#!/usr/bin/env node
/**
 * 인사구역 고시가 없는 시·도의 학교 자료를 **처음부터 끝까지** 받아 만든다.
 *
 *   node scripts/fetch-nation.mjs              전부 (나이스 → 학교알리미 → 학급수 → 합치기)
 *   node scripts/fetch-nation.mjs 서울 부산     그 시·도만
 *   node scripts/fetch-nation.mjs --no-classes 학급수는 건너뛴다 (학교 6,000곳을 하나씩 부르는 자리다)
 *
 * ⛔ **경기·인천은 여기서 안 다룬다.** 그 둘은 교육청 고시 표를 읽어 인사구역까지 붙이는
 *    다른 길로 간다(`npm run read` → `npm run match:all`). 여기 넣으면 구역이 날아간다.
 *
 * ⛔ **차례가 뜻이다.** 나이스 목록이 있어야 학급수를 부를 수 있고(학교마다 한 번씩),
 *    셋이 다 있어야 합칠 수 있다. 그래서 `&&` 로 잇는 것이 맞다 —
 *    독립된 검사를 줄 세우지 말라는 규칙(전역 CLAUDE.md §1)은 **서로 안 기다려도 되는 것**에 해당한다.
 * ⛔ 시·도끼리도 **한 번에 하나씩** 돈다. 열일곱을 한꺼번에 부르면 나이스·학교알리미가 막는다.
 *
 * 끝나면 `node scripts/load-personnel-areas.mjs 2027` 로 적재 마이그레이션을 만든다.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { SIDO_NAMES } from '../lib/sido.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');

/** 고시 원문을 읽어 인사구역까지 붙이는 시·도. 여기서 건드리지 않는다. */
const RULED = new Set(['경기', '인천']);

const args = process.argv.slice(2);
const noClasses = args.includes('--no-classes');
const picked = args.filter((a) => !a.startsWith('--'));
const bad = picked.filter((p) => !SIDO_NAMES.includes(p));
if (bad.length) {
  console.error(`시도를 모르겠다: ${bad.join(', ')}. 아는 것 = ${SIDO_NAMES.join(', ')}`);
  process.exit(1);
}
const targets = (picked.length ? picked : SIDO_NAMES).filter((s) => !RULED.has(s));
if (!targets.length) {
  console.error('할 것이 없다. 경기·인천은 npm run read → npm run match:all 로 간다.');
  process.exit(1);
}

const run = (script, ...rest) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...rest], { stdio: 'inherit' });
  // ⛔ 실패를 삼키지 않는다. 한 시·도가 깨졌는데 다음으로 넘어가면 반쯤 만든 파일이 남는다
  if (r.status !== 0) {
    console.error(`\n⛔ ${script} ${rest.join(' ')} 가 ${r.status} 로 끝났다. 여기서 멈춘다.`);
    process.exit(r.status ?? 1);
  }
};

console.log(`전국 적재 — ${targets.length}개 시·도${noClasses ? ' (학급수는 건너뛴다)' : ''}\n`);
for (const sido of targets) {
  console.log(`\n══════ ${sido}`);
  run('fetch-neis-schools.mjs', sido);
  run('fetch-schoolinfo.mjs', sido);
  if (!noClasses) run('fetch-classes.mjs', sido);
  run('build-schools.mjs', sido);
}
console.log('\n다음 — node scripts/load-personnel-areas.mjs 2027 · supabase db push');
