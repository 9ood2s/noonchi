#!/usr/bin/env node
/**
 * 인천 인사관리기준 hwpx 에서 인사구역 표를 읽는다.
 *
 * ⭐ 경기와 다른 점 — 읽는 법도, 표가 담은 것도 다르다.
 *
 * 1. **hwpx 는 좌표를 안 봐도 된다.** 겉은 zip 이고 안은 XML 이라 표가 그대로 들어 있다.
 *    칸마다 <hp:cellAddr>(행·열)과 <hp:cellSpan>(병합)이 적혀 있고,
 *    밑줄은 <hh:charPr> 의 <hh:underline> 로 명시된다. 경기 PDF 처럼 선을 그림에서
 *    되찾을 필요가 없다.
 *
 * 2. ⛔ **인천 표에는 학교 목록이 거의 없다.** 「남부교육지원청 관내 학교」처럼 지원청 단위로 적고,
 *    학교 이름이 나오는 것은 강화·옹진뿐이다. 그래서 이 판독기가 내는 것은 **학교 목록이 아니라
 *    구역을 정하는 규칙**이다. 학교별 구역은 나이스에서 학교 목록(소속 지원청·소재지)을 받아
 *    이 규칙을 얹어야 나온다.
 *
 * 3. ⛔ **인사구역 표가 셋이고 서로 다르다.** 교사 · 영양교사 · 유치원이 각각이다.
 *    우리는 초등 교사 표를 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { SIDO, needSource } from './lib/source.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const YEAR = process.argv[2] ?? '2027';
// 원자료 자리는 손으로 적지 않는다 — `scripts/lib/source.mjs` 한 곳에 있다(§12-96)
const HWPX = needSource('incheon', SIDO, YEAR, 'standards.hwpx');
const OUT = path.join(ROOT, `data/derived/incheon-${YEAR}-personnel-areas.json`);

const read = (entry) => execFileSync('unzip', ['-p', HWPX, entry], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');

const unescape = (s) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

// ── 밑줄이 걸린 문자모양 ────────────────────────────────────────────────────

/** 밑줄은 문자모양(charPr) 에 <hh:underline type="BOTTOM"> 으로 적혀 있다. 그 id 를 모아 둔다. */
function underlinedCharPrIds(headerXml) {
  const ids = new Set();
  for (const m of headerXml.matchAll(/<hh:charPr\b[^>]*\bid="(\d+)"[^>]*>([\s\S]*?)<\/hh:charPr>/g)) {
    const u = /<hh:underline\b([^>]*)\/?>/.exec(m[2]);
    if (u && !/type="NONE"/.test(u[1])) ids.add(m[1]);
  }
  return ids;
}

// ── 표 읽기 ─────────────────────────────────────────────────────────────────

/** 칸 안 글자. 밑줄 친 조각은 따로 모아 둔다(개정 표시일 수도, 폐교 표시일 수도 있어 판단은 미룬다). */
function cellText(xml, underlined) {
  let text = '';
  const marks = [];
  for (const run of xml.matchAll(/<hp:run\b([^>]*)>([\s\S]*?)<\/hp:run>/g)) {
    const id = /charPrIDRef="(\d+)"/.exec(run[1])?.[1];
    // ⛔ <hp:t> 안에 <hp:tab/> 같은 태그가 섞여 있다("학<tab>교<tab>명"). 먼저 태그를 걷어낸다.
    const t = unescape(
      [...run[2].matchAll(/<hp:t>([\s\S]*?)<\/hp:t>/g)].map((m) => m[1].replace(/<[^>]*>/g, '')).join('')
    );
    if (!t) continue;
    if (id && underlined.has(id)) marks.push(t);
    text += t;
  }
  return { text: text.replace(/　/g, ' ').replace(/\s+/g, ' ').trim(), marks };
}

function readTables(sectionXml, underlined) {
  const tables = [];
  for (const t of sectionXml.matchAll(/<hp:tbl\b([^>]*)>([\s\S]*?)<\/hp:tbl>/g)) {
    const rows = +(/rowCnt="(\d+)"/.exec(t[1])?.[1] ?? 0);
    const cols = +(/colCnt="(\d+)"/.exec(t[1])?.[1] ?? 0);
    const cells = [];
    for (const c of t[2].matchAll(/<hp:tc\b([\s\S]*?)<\/hp:tc>/g)) {
      const addr = /<hp:cellAddr colAddr="(\d+)" rowAddr="(\d+)"/.exec(c[1]);
      const span = /<hp:cellSpan colSpan="(\d+)" rowSpan="(\d+)"/.exec(c[1]);
      if (!addr) continue;
      const { text, marks } = cellText(c[1], underlined);
      cells.push({ row: +addr[2], col: +addr[1], colSpan: +(span?.[1] ?? 1), rowSpan: +(span?.[2] ?? 1), text, marks });
    }
    tables.push({ rows, cols, cells });
  }
  return tables;
}

const at = (t, row, col) => t.cells.find((c) => c.row === row && c.col === col);

// ── 인사구역 표 고르기 ──────────────────────────────────────────────────────

const AREA = /^([ⅠⅡⅢ])구역$/;

/**
 * 초등 교사 인사구역 표를 고른다.
 * 표가 셋 있다 — 교사 · 영양교사 · 유치원 근무연한.
 * 교사 표는 머리가 "구 역 | 학 교 명" 두 칸이고, 영양교사 표는 학교급 열이 더 붙는다.
 */
function pickTeacherTable(tables) {
  return tables.find((t) => {
    const head = at(t, 0, 0)?.text.replace(/\s/g, '');
    const second = at(t, 0, 1)?.text.replace(/\s/g, '');
    return head === '구역' && second === '학교명' && t.cols === 2;
  });
}

/** "◦" 로 갈린 항목을 낸다. */
const bullets = (s) => s.split(/[◦○]/).map((x) => x.trim()).filter(Boolean);

/**
 * 항목을 두 갈래로 가른다.
 *   rule   — "남부교육지원청 관내 학교(영종·용유지역 학교 및 옹진군 관내 학교 제외)" 처럼 범위로 적은 것
 *   schools — "강화, 합일, 갑룡, …" 처럼 학교 이름을 늘어놓은 것
 * 기관(교육청 부설·센터)은 학교가 아니라 따로 둔다.
 */
function classify(item) {
  const t = item.replace(/\s+/g, ' ').trim();
  if (/(교육지원청|관내|지역)\s*(학교|초등학교)|관리교/.test(t)) {
    const ex = /\(([^)]*제외[^)]*)\)/.exec(t);
    return { kind: 'rule', text: t, except: ex ? ex[1].trim() : null };
  }
  if (/(교육청|센터|회관|학습관|연수원|교육원|공립특수학교)/.test(t)) return { kind: 'institution', text: t };
  const names = t.split(',').map((x) => x.trim()).filter(Boolean);
  if (names.length && names.every((n) => /^[가-힣]{2,8}$/.test(n))) return { kind: 'schools', text: t, schools: names };
  return { kind: 'unknown', text: t };
}

// ── 실행 ────────────────────────────────────────────────────────────────────

if (!fs.existsSync(HWPX)) {
  console.error(`${path.relative(ROOT, HWPX)} 가 없다.`);
  process.exit(1);
}
const underlined = underlinedCharPrIds(read('Contents/header.xml'));
const tables = readTables(read('Contents/section0.xml'), underlined);
const table = pickTeacherTable(tables);
if (!table) {
  console.error(`인사구역 표(구 역 | 학 교 명)를 못 찾았다. 표 ${tables.length}개를 훑었다.`);
  process.exit(1);
}

const anomalies = [];
const areas = [];
for (let r = 1; r < table.rows; r++) {
  const name = at(table, r, 0)?.text ?? '';
  const body = at(table, r, 1);
  const m = AREA.exec(name.replace(/\s/g, ''));
  if (!m || !body) { anomalies.push({ where: `${r}행`, detail: `구역 칸을 못 읽었다 — "${name}"` }); continue; }
  const items = bullets(body.text).map(classify);
  const unknown = items.filter((i) => i.kind === 'unknown');
  for (const u of unknown) anomalies.push({ where: `${m[1]}구역`, detail: `무엇인지 못 가린 항목 — "${u.text}"` });
  areas.push({
    area: m[1],
    rules: items.filter((i) => i.kind === 'rule').map(({ text, except }) => ({ text, except })),
    schools: items.filter((i) => i.kind === 'schools').flatMap((i) => i.schools),
    institutions: items.filter((i) => i.kind === 'institution').map((i) => i.text),
    marks: body.marks,
  });
}

const result = {
  meta: {
    학년도: +YEAR,
    시도: '인천',
    대상: '초등 교사',
    원자료: path.relative(ROOT, HWPX),
    생성: 'scripts/parse-incheon-areas.mjs',
    읽는법: 'hwpx 는 zip 안 XML 이라 표가 그대로 들어 있다. 칸마다 행·열 주소와 병합이 적혀 있어 좌표를 볼 필요가 없다.',
    '⛔ 이 표는 학교 목록이 아니다':
      '「남부교육지원청 관내 학교」처럼 지원청 단위로 적혀 있고 학교 이름이 나오는 것은 강화·옹진뿐이다. ' +
      '학교별 구역은 나이스에서 학교 목록(소속 지원청·소재지)을 받아 rules 를 얹어야 나온다.',
    '⛔ 인사구역 표가 셋이다': '교사 · 영양교사 · 유치원이 서로 다르다. 이 파일은 초등 교사 표만 읽었다.',
    열이름: {
      area: '인사구역 (Ⅰ/Ⅱ/Ⅲ)',
      rules: '범위로 적은 것 — 지원청·지역 단위. except 는 그 범위에서 빼는 것',
      schools: '이름이 적힌 학교 (강화·옹진)',
      institutions: '학교가 아닌 기관 (센터·교육원 등)',
      marks: '밑줄 친 조각 — 인천 표에는 폐·휴교 범례가 없다. 개정 표시로 보인다',
    },
  },
  areas,
  anomalies,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');

console.log(`[인천 ${YEAR}] 초등 교사 인사구역`);
for (const a of areas) {
  console.log(`\n  ${a.area}구역`);
  for (const r of a.rules) console.log(`    범위: ${r.text}`);
  if (a.schools.length) console.log(`    학교 ${a.schools.length}교: ${a.schools.join(', ')}`);
  if (a.institutions.length) console.log(`    기관 ${a.institutions.length}: ${a.institutions.join(' · ')}`);
}
console.log(`\n→ ${path.relative(ROOT, OUT)}`);
if (anomalies.length) {
  console.log(`\n⚠️ 못 가린 자리 ${anomalies.length}건 — 버리지 않고 그대로 실었다:`);
  for (const a of anomalies) console.log(`  · ${a.where} — ${a.detail}`);
  process.exit(1);
}
