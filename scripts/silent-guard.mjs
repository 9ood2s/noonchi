#!/usr/bin/env node
/**
 * 가드 ② — 화면이 서버 실패를 버리는 줄을 센다 (CLAUDE.md §11-2)
 *
 * 사고 — 교사가 26명 × 15항목 성적을 다 찍고 저장했는데 한 줄도 안 들어갔다. 다음 날 알았다.
 *
 * ⛔ 실패는 두 꼴로 온다 — 서버가 {ok:false} 를 답하거나, 요청이 끊겨 던진다.
 *    `if (!r.ok)` 만 쓰면 둘째에선 그 줄에 닿지도 못한다. 반드시 `.catch(...)` 를 같이 단다.
 *
 * 여기서 세는 것
 *   1. fetch(...) 를 부르면서 catch 도 try 도 없는 자리
 *   2. supabase 호출에서 error 를 받아 놓고 화면에 쓰지 않는 자리
 *
 * ⚠️ 래칫이다. 베이스라인보다 늘면 실패한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE = path.join(ROOT, 'scripts/silent-guard.baseline.json');
const DIRS = ['app', 'components', 'lib'];

const walk = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(e.name) ? [p] : [];
      })
    : [];

const hits = { fetch에catch없음: [], error를안씀: [] };
for (const file of DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');

  lines.forEach((line, i) => {
    if (!/\bfetch\s*\(/.test(line)) return;
    // 같은 함수 안(앞뒤 12줄)에 catch 나 try 가 있으면 받은 것으로 본다
    const near = lines.slice(Math.max(0, i - 12), i + 13).join('\n');
    if (/\.catch\s*\(|try\s*\{/.test(near)) return;
    hits.fetch에catch없음.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`);
  });

  // supabase 는 던지지 않고 { data, error } 를 준다. error 를 꺼내 놓고 안 쓰면 실패가 조용히 사라진다.
  for (const m of src.matchAll(/const\s*\{[^}]*\berror\b[^}]*\}\s*=\s*await/g)) {
    const at = src.slice(0, m.index).split('\n').length;
    const after = lines.slice(at - 1, at + 25).join('\n');
    if (/\berror\b\s*(&&|\?|\)|\.)|if\s*\(\s*error/.test(after)) continue;
    hits.error를안씀.push(`${rel}:${at}  ${lines[at - 1]?.trim().slice(0, 70)}`);
  }
}

const counts = Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v.length]));
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

if (process.argv.includes('--write')) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log('베이스라인을 새로 적었다', counts);
  process.exit(0);
}

console.log('가드 ② 삼킨 실패', counts, base ? `(베이스라인 ${JSON.stringify(base)})` : '(베이스라인 없음)');
let failed = false;
for (const [k, v] of Object.entries(counts)) {
  const allowed = base?.[k] ?? 0;
  if (v > allowed) {
    failed = true;
    console.log(`\n⚠️ ${k} ${allowed} → ${v} 로 늘었다:`);
    for (const h of hits[k]) console.log(`  · ${h}`);
  }
}
if (failed) {
  console.log('\n실패를 화면에 띄우도록 고친다. 낙관적 갱신을 썼으면 되돌린 뒤 메시지를 띄운다.');
  process.exit(1);
}
