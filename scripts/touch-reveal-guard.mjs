#!/usr/bin/env node
/**
 * 가드 ③ — 눌러야 하는 것을 호버 뒤에 숨겼는지 센다 (CLAUDE.md §11-4)
 *
 * 마우스는 지나가기만 해도 신호를 주지만(커서·hover) 손가락은 누르기 전까지 아무 신호가 없다.
 * `opacity-0 group-hover:opacity-100` 으로 숨긴 버튼은 폰에서 영영 못 누른다.
 * 이 서비스는 폰 비중이 크다.
 *
 * ⚠️ 래칫이다. 베이스라인보다 늘면 실패한다.
 *
 * ⛔ **주석은 세지 않는다** — 가드 ① 과 같은 까닭이다. 이 규칙을 설명하는 주석에
 *    `opacity-0 … group-hover:` 라고 적으면 그 줄이 위반으로 잡힌다(실제로 잡혔다, 2026-08-23).
 *    여러 줄 주석은 **파일 전체에서** 먼저 지운다 — 줄 단위로 지우면 가운데 줄이 코드로 세어진다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE = path.join(ROOT, 'scripts/touch-reveal-guard.baseline.json');
const DIRS = ['app', 'components'];

// 숨겼다가 호버로만 드러내는 꼴
const PATTERNS = [
  /opacity-0[^"'`]*group-hover:opacity-/,
  /invisible[^"'`]*group-hover:visible/,
  /hidden[^"'`]*group-hover:(block|flex|inline)/,
  /scale-0[^"'`]*group-hover:scale-/,
];

const walk = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walk(p) : /\.(tsx|ts)$/.test(e.name) ? [p] : [];
      })
    : [];

// 주석을 지우되 줄 수는 그대로 둔다 — 줄 번호가 어긋나면 어디를 고칠지 못 찾는다
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, ' '));

const hits = [];
for (const file of DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
  const rel = path.relative(ROOT, file);
  stripComments(fs.readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      if (PATTERNS.some((p) => p.test(line))) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 70)}`);
    });
}

const counts = { 호버뒤에숨김: hits.length };
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

if (process.argv.includes('--write')) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log('베이스라인을 새로 적었다', counts);
  process.exit(0);
}

console.log('가드 ③ 터치', counts, base ? `(베이스라인 ${JSON.stringify(base)})` : '(베이스라인 없음)');
if (counts.호버뒤에숨김 > (base?.호버뒤에숨김 ?? 0)) {
  console.log('\n⚠️ 호버로만 드러나는 자리가 늘었다:');
  for (const h of hits) console.log(`  · ${h}`);
  console.log('\n폰에서는 영영 못 누른다. 늘 보이게 두거나 눌러서 여는 방식으로 바꾼다.');
  process.exit(1);
}
