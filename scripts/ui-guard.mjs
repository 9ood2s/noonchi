#!/usr/bin/env node
/**
 * 가드 ① — 화면 문구를 기계가 센다 (CLAUDE.md §3)
 *
 * 사람이 기억해야 하는 방어는 반드시 뚫린다. 그래서 세 가지를 센다.
 *   1. 이모지        — 아이콘은 lucide-react 로 쓴다
 *   2. 내부 용어      — 스키마·정규화·집계·크론 같은 말은 코드·문서 전용이다
 *   3. 안내문 어미    — "…해요 / …할 수 있어요" 류. 화면엔 데이터와 짧은 라벨만 둔다
 *
 * ⚠️ 래칫이다. 0 을 요구하면 아무도 안 켠다. 베이스라인보다 늘면 실패한다.
 *
 * ⛔ 주석은 세지 않는다 — 코드 설명은 있어야 한다. 여러 줄 주석은 **파일 전체에서** 먼저 지운다.
 *    (줄 단위로 지우면 `/** … *\/` 의 가운데 줄이 코드로 세어진다. 실제로 이 파일들의
 *     주석에 쓴 표시를 화면 이모지로 잘못 잡은 적이 있다.)
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE = path.join(ROOT, 'scripts/ui-guard.baseline.json');
const DIRS = ['app', 'components'];

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{1F000}-\u{1F0FF}]/u;
const INTERNAL = /스키마|정규화|집계|크론|마이그레이션|인덱스|쿼리|페이로드|캐시 무효화|롤백|시드/;
// 안내문 어미. "…없습니다 / …못했습니다" 같은 빈 상태·오류 문구는 화면에 있어야 하므로 뺀다.
const GUIDE = /(해요|어요|예요|드려요|하세요|보세요|할 수 있(어요|습니다)|해 보세요)[.!?]?["'`<]/;

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
    .replace(/\/\/.*$/gm, '');

const hits = { 이모지: [], 내부용어: [], 안내문: [] };
for (const file of DIRS.flatMap((d) => walk(path.join(ROOT, d)))) {
  const rel = path.relative(ROOT, file);
  const raw = fs.readFileSync(file, 'utf8').split('\n');
  stripComments(fs.readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((code, i) => {
      const where = `${rel}:${i + 1}`;
      const line = raw[i] ?? code;
      if (EMOJI.test(code)) hits.이모지.push(`${where}  ${line.trim().slice(0, 70)}`);
      if (INTERNAL.test(code)) hits.내부용어.push(`${where}  ${line.trim().slice(0, 70)}`);
      if (GUIDE.test(code)) hits.안내문.push(`${where}  ${line.trim().slice(0, 70)}`);
    });
}

const counts = Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v.length]));
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

if (process.argv.includes('--write')) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log('베이스라인을 새로 적었다', counts);
  process.exit(0);
}

console.log('가드 ① UI 문구', counts, base ? `(베이스라인 ${JSON.stringify(base)})` : '(베이스라인 없음)');
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
  console.log('\n고치거나, 일부러 늘린 것이면 npm run guard:ui -- --write 로 베이스라인을 옮긴다.');
  process.exit(1);
}
