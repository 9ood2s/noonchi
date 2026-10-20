#!/usr/bin/env node
/**
 * 두 학년도의 인사구역을 대조한다.  node scripts/diff-personnel-areas.mjs 2026 2027
 *
 * 왜 필요한가 — 인사구역과 급지는 매년 조금씩 바뀌고, 급지가 바뀌면 지역가산이 바뀐다
 * (병구역 가·나 100% / 다·라 70%). 무엇이 어떻게 움직였는지 짚어 놓지 않으면
 * 전보년수 계산이 조용히 작년 값으로 남는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { areaLabel, regionBonus } from '../lib/areas.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const [FROM, TO] = [process.argv[2] ?? '2026', process.argv[3] ?? '2027'];
const load = (y) => {
  const f = path.join(ROOT, `data/derived/gyeonggi-${y}-personnel-areas.json`);
  if (!fs.existsSync(f)) {
    console.error(`${path.relative(ROOT, f)} 가 없다. 먼저 돌려라 — node scripts/parse-personnel-areas.mjs ${y}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};

/**
 * 표에 적힌 이름은 해마다 표기가 달라진다 — "수원중촌초"→"수원중촌", "향산초중"→"향산",
 * "판교대장초중"→"판교대장". 끝에 붙는 학교급 글자를 떼야 같은 학교로 이어진다.
 * ⛔ 신설교의 가칭이 정식 이름으로 바뀌는 것("회천3"→"회천새봄", "운정7"→"숲노을")은
 *    이걸로 못 잇는다. 그건 새로 오른 학교로 나오고, 표준학교코드를 붙일 때 손으로 잇는다.
 */
const canon = (name) => name.replace(/(초중|초등학교|초)$/, '');

const index = (j) => {
  const m = new Map();
  for (const r of j.rows) {
    if (r.table !== 1 || !r.school || r.closed) continue;
    m.set(`${r.city}|${canon(r.school)}`, r);
  }
  return m;
};

const a = index(load(FROM));
const b = index(load(TO));
const label = (r) => areaLabel(r.area, r.areaGrade);
const 가산 = (r) => regionBonus(r.area, r.areaGrade).label;

const moved = [];
const opened = [];
const gone = [];
for (const [k, r] of b) {
  const old = a.get(k);
  if (!old) opened.push(r);
  else if (label(old) !== label(r)) moved.push({ key: k, old, now: r });
}
for (const [k, r] of a) if (!b.has(k)) gone.push(r);

console.log(`경기 ${FROM} → ${TO} · 초등 [별표1]\n`);
console.log(`학교 ${a.size} → ${b.size}\n`);

console.log(`⭐ 인사구역·급지가 바뀐 학교 ${moved.length}곳`);
for (const m of moved) {
  const [city] = m.key.split('|');
  const same = 가산(m.old) === 가산(m.now);
  console.log(
    `  ${city} ${m.now.school}: ${label(m.old)} → ${label(m.now)}` +
      `   지역가산 ${가산(m.old)} → ${가산(m.now)}${same ? '' : '  ← 계산에 영향'}`
  );
}
if (!moved.length) console.log('  없음');

console.log(`\n새로 오른 학교 ${opened.length}곳`);
for (const r of opened) console.log(`  ${r.city} ${r.school} (${label(r)})`);
console.log(`\n목록에서 빠진 학교 ${gone.length}곳`);
for (const r of gone) console.log(`  ${r.city} ${r.school} (${label(r)})`);

// 화면이 읽을 수 있게 파일로도 낸다.
// ⛔ 같은 계산을 화면에서 또 하지 않는다 — 한 곳에서 내고 화면은 읽기만 한다(CLAUDE.md §11-3).
const OUT = path.join(ROOT, `data/derived/gyeonggi-${FROM}-${TO}-changes.json`);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      meta: { 시도: '경기', 학교급: '초등', from: +FROM, to: +TO, 생성: 'scripts/diff-personnel-areas.mjs' },
      counts: { from: a.size, to: b.size, moved: moved.length, opened: opened.length, gone: gone.length },
      moved: moved.map((m) => ({
        city: m.now.city,
        school: m.now.school,
        from: label(m.old),
        to: label(m.now),
        fromArea: m.old.area,
        fromGrade: m.old.areaGrade,
        toArea: m.now.area,
        toGrade: m.now.areaGrade,
      })),
      opened: opened.map((r) => ({ city: r.city, school: r.school, area: label(r) })),
      gone: gone.map((r) => ({ city: r.city, school: r.school, area: label(r) })),
    },
    null,
    2
  ) + '\n',
  'utf8'
);
console.log(`\n→ ${path.relative(ROOT, OUT)}`);
