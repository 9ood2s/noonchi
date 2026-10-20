#!/usr/bin/env node
/**
 * 인사관리기준 PDF 의 [별표] 인사구역 표를 읽는다.  (경기 2027 기준으로 만들었고, 매년 다시 돌린다)
 *
 * 왜 필요한가 — 학교별 인사구역(갑/을/병)과 병구역 급지(가/나/다/라)는 지역가산을 가르는 값인데
 * 공공 API 에 없다. 이 PDF 가 유일한 출처다.
 *
 * ⛔ 왜 pdftotext 만으로는 안 되나
 *   1. 표 테두리를 잃는다 → 학교 이름이 어느 구역 칸에 속하는지 못 가린다. 개수로 끊으면 어긋난다.
 *   2. 밑줄(폐·휴교)과 음영(신설예정교)을 버린다 → 폐교한 학교 이름은 표에 남는데 학교수에는
 *      안 잡혀 개수가 안 맞는다 (예: 성남 갑은 이름 73개인데 학교수 72 — 대원이 폐교).
 *
 * 그래서 두 가지를 겹쳐 읽는다.
 *   pdftocairo -svg       → 표 세로선(열 경계) · 가로선(행 경계) · 밑줄 · 음영
 *   pdftotext -bbox-layout → 낱말과 그 자리
 *
 * 표를 격자로 되살리므로 블록 경계를 추측하지 않는다. 표에 적힌 학교수는 검산에만 쓴다.
 * ⛔ 안 맞는 자리는 조용히 버리지 않는다(CLAUDE.md §11-1). anomalies 에 그대로 싣고 EXIT=1 로 끝낸다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { SIDO, needSource } from './lib/source.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const YEAR = process.argv[2] ?? '2027';
// 원자료 자리는 손으로 적지 않는다 — `scripts/lib/source.mjs` 한 곳에 있다(§12-96)
const PDF = needSource('gyeonggi', SIDO, YEAR, 'standards.pdf');
const OUT = path.join(ROOT, `data/derived/gyeonggi-${YEAR}-personnel-areas.json`);
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'areas-'));
const PAGE_H = 841; // A4 세로 pt

const anomalies = [];
const flag = (where, detail) => anomalies.push({ where, detail });

// ── 원문 다루기 ──────────────────────────────────────────────────────────────

/** 전각 숫자·쉼표를 반각으로. 표에 ２ 와 ， 가 섞여 있다. */
const normalize = (s) =>
  s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[，、]/g, ',');

/** 괄호 안 쉼표는 구분자가 아니다 — "점동(안평분교장, 뇌곡분교장)" 은 한 항목이다. */
function splitNames(s) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** "남면(양덕분교장)" → {school:"남면", branches:["양덕분교장"]} · 심어 둔 밑줄 표시를 함께 읽는다 */
function parseItem(raw) {
  const m = /^([^(]*)(?:\(([^)]*)\))?\s*$/.exec(raw);
  const head = (m?.[1] ?? raw);
  const inner = m?.[2] ?? '';
  const clean = (t) => t.replace(MARKS, '').trim();
  const school = clean(head);
  const branches = inner ? inner.split(',').map(clean).filter(Boolean) : [];
  // 이름 쪽에 '전체' 표시가 있으면 그 학교가 폐·휴교
  const closed = head.includes(MARK_ALL);
  // 괄호 안에 표시가 있거나, 낱말 안쪽부터 그어졌으면 그 분교장이 폐·휴교
  const closedBranches = inner
    ? inner.split(',').filter((b) => b.includes(MARK_ALL) || b.includes(MARK_PART)).map(clean).filter(Boolean)
    : [];
  if (head.includes(MARK_PART) && !closedBranches.length && branches.length) closedBranches.push(...branches);
  // 학교명 없이 분교장만 있는 항목("(대남풍도분교장)")은 밑줄이 앞에서부터 그어져도 분교장이 폐·휴교다
  if (!school && closed && branches.length) return { school: null, branches, closed: false, closedBranches: branches, raw: clean(raw) };
  return { school: school || null, branches, closed, closedBranches, raw: clean(raw) };
}

/** "35(3)" → {schools:35, branches:3} · "(1)" → {schools:0, branches:1} */
function parseCount(t) {
  const m = /^(\d+)?(?:\((\d+)\))?$/.exec(t.trim());
  if (!m || (!m[1] && !m[2])) return null;
  return { schools: m[1] ? +m[1] : 0, branches: m[2] ? +m[2] : 0 };
}

// ── PDF 에서 뽑아 오기 ──────────────────────────────────────────────────────

/** 낱말과 그 자리. y 는 종이 위에서 아래로 잰다. */
function readWords(page) {
  const f = path.join(TMP, `w${page}.xml`);
  execFileSync('pdftotext', ['-bbox-layout', '-f', String(page), '-l', String(page), PDF, f]);
  const xml = fs.readFileSync(f, 'utf8');
  const words = [];
  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const text = normalize(
      m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    );
    words.push({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text });
  }
  return words;
}

/**
 * 표의 선과 칠한 칸.
 *
 * ⛔ pdftocairo 가 내는 <path> 의 y 는 **뒤집혀 있다**(PDF 원점이 좌하단이라 아래에서 위로 잰다).
 *    같은 파일 안 글자(<use>)와 pdftotext 의 낱말 상자는 위에서 아래로 재므로, 되돌리지 않으면
 *    표 테두리가 25pt 쯤 위로 밀려 헤더 칸에 첫 학교 이름이 들어가는 꼴이 된다.
 *    확인 — 34쪽 헤더 낱말 y 119.6~129.6 ↔ 되돌린 행 경계 118.2~130.9.
 *
 * 글리프 외곽선(폰트 좌표계, 수천 단위)은 걸러 낸다.
 */
function readVectors(page) {
  const f = path.join(TMP, `v${page}.svg`);
  execFileSync('pdftocairo', ['-svg', '-f', String(page), '-l', String(page), PDF, f]);
  const body = fs.readFileSync(f, 'utf8').split('</defs>').pop();
  const hLines = [];
  const vLines = [];
  const rects = [];
  for (const m of body.matchAll(/<path\b([^>]*)>/g)) {
    const d = /\sd="([^"]*)"/.exec(m[1])?.[1];
    if (!d || /C/.test(d)) continue;
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length < 4) continue;
    const xs = nums.filter((_, i) => i % 2 === 0);
    const raw = nums.filter((_, i) => i % 2 === 1);
    if (Math.max(...xs) > 700 || Math.max(...raw) > 900) continue; // 폰트 좌표계
    const ys = raw.map((y) => PAGE_H - y); // 뒤집힌 y 를 되돌린다
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    // 얇으면 선, 두꺼우면 칠한 칸. 밑줄이 두껍게 그려진 경우가 있어 5pt 를 가름선으로 둔다
    // (글자 높이가 10pt 쯤이라 음영 칸은 늘 그보다 두껍다).
    if (y1 - y0 < 5 && x1 - x0 > 1) hLines.push({ y: (y0 + y1) / 2, x0, x1 });
    else if (x1 - x0 < 5 && y1 - y0 > 1) vLines.push({ x: (x0 + x1) / 2, y0, y1 });
    else if (y1 - y0 >= 5 && y1 - y0 < 40) rects.push({ x0, x1, y0, y1 });
  }
  return { hLines, vLines, rects };
}

const uniqSorted = (vals, tol = 1.5) => {
  const out = [];
  for (const v of [...vals].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] > tol) out.push(v);
  return out;
};

// ── 표를 격자로 되살리기 ────────────────────────────────────────────────────

/**
 * 한 열의 행 경계는 **그 열을 가로지르는 선**만으로 정한다.
 * 가로선이 어떤 열을 지나가지 않으면 그 칸은 위 행과 병합된 것이다(지원청·시군 칸이 그렇다).
 */
function rowsOfColumn(hLines, colX0, colX1, top, bottom) {
  // 열 폭이 좁으면(시·군 열은 45pt 쯤) 그 열만 가로지르는 선도 짧다. 폭으로 거르면 그 선을 놓쳐
  // 두 시·군이 한 칸으로 붙는다(2026학년도판 "안양41과천"). 열을 덮는지로만 가른다.
  const ys = hLines
    .filter((l) => l.x0 <= colX0 + 3 && l.x1 >= colX1 - 3 && l.x1 - l.x0 >= (colX1 - colX0) * 0.9)
    .map((l) => l.y);
  const edges = uniqSorted([top, ...ys, bottom]);
  return edges.slice(0, -1).map((y0, i) => ({ y0, y1: edges[i + 1] }));
}

// 밑줄 친 낱말을 표시해 두는 글자. 이름 목록을 쉼표로 가른 뒤에도 어느 항목이었는지 남는다.
export const MARK_ALL = '\u0001';  // 낱말 전체에 밑줄 — 그 학교가 폐·휴교
export const MARK_PART = '\u0002'; // 낱말 안쪽부터 밑줄 — 괄호 안 분교장만 폐·휴교
const MARKS = new RegExp(`[${MARK_ALL}${MARK_PART}]`, 'g');

/**
 * 칸 안 낱말을 읽는 차례(위→아래, 왼→오른)대로 이어 붙인다.
 *
 * ⛔ 그냥 붙이면 안 되는 자리가 둘 있다.
 *   1. 이름이 줄을 넘어가며 끊긴다 — "…숙" / "지, …" → 공백 없이 붙여야 "숙지" 가 된다.
 *   2. 그런데 원본이 줄 끝 쉼표를 빠뜨린 자리가 있다 — "…민세, 평택영신" / "고덕함박, …"
 *      (2026학년도판 평택 을, 화성 갑의 "이솔 호연"). 붙이면 두 학교가 한 학교가 된다.
 *
 * 그래서 이렇게 가른다.
 *   · 같은 줄 안에서 낱말이 나뉘어 있으면 → 다른 이름이다(한 줄 안에서 이름이 끊길 이유가 없다)
 *   · 줄이 바뀔 때는 앞 줄이 칸 오른쪽 끝까지 찼는지 본다. 꽉 찼으면 끊긴 이름, 남았으면 다른 이름
 *   · 괄호가 열려 있는 동안은 무조건 붙인다 — "점동(안평분교장," / "뇌곡분교장)" 은 한 항목이다
 *
 * ⛔ 밑줄 친 학교를 이름으로 맞대 찾으면 안 된다 — "대원" 이 "상대원" 에도 걸린다.
 *    그래서 이어 붙일 때 그 자리에 표시를 심어 둔다.
 */
function cellText(words, x0, x1, y0, y1, underlined, joinNames = false) {
  const ws = words
    .filter((w) => w.x0 >= x0 - 2 && w.x1 <= x1 + 2 && w.y0 >= y0 - 1 && w.y1 <= y1 + 1)
    .sort((a, b) => (Math.abs(a.y0 - b.y0) > 3 ? a.y0 - b.y0 : a.x0 - b.x0));
  const mark = (w) => {
    const u = underlined?.get(w);
    return u ? (u.whole ? MARK_ALL : MARK_PART) + w.text : w.text;
  };
  if (!joinNames || !ws.length) return ws.map(mark).join('');

  const lines = [];
  for (const w of ws) {
    const l = lines.find((l) => Math.abs(l.y - w.y0) < 3);
    if (l) l.ws.push(w);
    else lines.push({ y: w.y0, ws: [w] });
  }
  const rightMost = Math.max(...ws.map((w) => w.x1));

  let out = '';
  let depth = 0;
  for (let li = 0; li < lines.length; li++) {
    const L = lines[li];
    const prevFull = li > 0 && Math.max(...lines[li - 1].ws.map((w) => w.x1)) > rightMost - 9;
    for (let i = 0; i < L.ws.length; i++) {
      const t = mark(L.ws[i]);
      if (out && depth === 0 && !/[,(]$/.test(out)) {
        const sameLine = i > 0;
        if (sameLine || !prevFull) out += ',';
      }
      out += t;
      depth += (t.match(/\(/g) ?? []).length - (t.match(/\)/g) ?? []).length;
    }
  }
  return out;
}

const cellWords = (words, x0, x1, y0, y1) =>
  words.filter((w) => w.x0 >= x0 - 2 && w.x1 <= x1 + 2 && w.y0 >= y0 - 1 && w.y1 <= y1 + 1);

/** 어느 행에 걸치는 값인지 — 행 범위와 겹치는 첫 칸 값을 준다(병합 칸은 여러 행에 걸친다). */
const valueAt = (cells, y) => cells.find((c) => y >= c.y0 - 1 && y <= c.y1 + 1)?.text ?? '';

// ── 밑줄·음영 ───────────────────────────────────────────────────────────────

/** 밑줄(폐·휴교)이 걸린 낱말을 찾는다. 밑줄은 글자 바로 아래에 오고 한 낱말의 x 범위 안에 들어간다.
 *  표 가로 테두리는 낱말보다 훨씬 넓어 이 조건에서 저절로 걸러진다. */
function markUnderlines(hLines, words, tableTop, tableBottom) {
  const found = new Map();
  for (const u of hLines) {
    if (u.y < tableTop || u.y > tableBottom + 5) continue;
    const w = words.find(
      (w) => u.y >= w.y1 - 1 && u.y <= w.y1 + 4 && u.x0 >= w.x0 - 1.5 && u.x1 <= w.x1 + 1.5
    );
    if (!w) continue;
    // 낱말 왼쪽 끝에서 시작하면 이름 전체가, 안쪽에서 시작하면 괄호 안(분교장)만 그어진 것이다
    found.set(w, { whole: u.x0 - w.x0 < 3, text: w.text });
  }
  return found;
}

/** 음영(신설예정교)이 걸린 낱말을 찾는다. */
function markShaded(rects, words) {
  const found = new Set();
  for (const r of rects) {
    if (r.x1 - r.x0 > 300) continue; // 헤더 행 전체 음영은 표시가 아니다
    for (const w of words) {
      if (w.x0 < r.x1 - 0.5 && w.x1 > r.x0 + 0.5 && w.y0 < r.y1 - 0.5 && w.y1 > r.y0 + 0.5) found.add(w);
    }
  }
  return found;
}

// ── 한 쪽 읽기 ──────────────────────────────────────────────────────────────

/** 한 쪽에 표가 둘 이상 있다(별표3 과 한울타리표가 같은 쪽에 있다). 세로선의 세로 범위로 표를 가른다. */
function groupTables(vLines) {
  const tall = vLines.filter((l) => l.y1 - l.y0 > 60);
  const groups = [];
  for (const l of tall) {
    const g = groups.find((g) => Math.abs(g.top - l.y0) < 6 && Math.abs(g.bottom - l.y1) < 6);
    if (g) g.lines.push(l);
    else groups.push({ top: l.y0, bottom: l.y1, lines: [l] });
  }
  return groups.filter((g) => g.lines.length >= 4).sort((a, b) => a.top - b.top);
}

const AREA = /^[갑을병]$/;
const GRADE = /^[가나다라]$/;

/** 표 하나를 읽어 행 목록을 낸다. */
function readTable(words, hLines, g, page, underlined) {
  const cols = uniqSorted(g.lines.map((l) => l.x), 2);
  if (cols.length < 5) return null;
  const { top, bottom } = g;
  // 표 바로 위 줄이 그 표의 이름이다. 별표3 과 한울타리표처럼 한 쪽에 표가 둘일 때 이걸로 가른다.
  const caption =
    words
      .filter((w) => w.y1 > top - 26 && w.y1 <= top + 1)
      .sort((a, b) => a.x0 - b.x0)
      .map((w) => w.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() || `${page}쪽 표`;
  const tableId = `${page}#${Math.round(top)}`;
  const wide = hLines.filter((l) => l.y > top - 2 && l.y < bottom + 2);

  const nCol = cols.length - 1;
  const iName = nCol - 2;
  const iCount = nCol - 1;

  // 학년도 열이 셋인 별표4 는 구조가 달라 따로 읽는다
  if (/학년도/.test(cellText(words, cols[1], cols[2], top, top + 30))) return { kind: '신설교' };

  const cellsOf = (i) =>
    rowsOfColumn(wide, cols[i], cols[i + 1], top, bottom)
      .map((r) => ({ ...r, text: cellText(words, cols[i], cols[i + 1], r.y0, r.y1).trim() }))
      .filter((c) => c.text);

  const offices = cellsOf(0);
  const cities = cellsOf(1);
  // 인사구역 칸도 세로로 병합된다 — 안양과 과천이 둘 다 갑이면 "갑" 을 한 번만 적는다.
  const areaCells = rowsOfColumn(wide, cols[2], cols[3], top, bottom).map((r) => ({
    ...r,
    text: (cellText(words, cols[2], cols[3], r.y0, r.y1).match(/[갑을병]/) ?? [''])[0],
  }));
  const nameRows = rowsOfColumn(wide, cols[iName], cols[iName + 1], top, bottom);
  const counts = cellsOf(iCount);

  const rows = [];
  for (const r of nameRows) {
    const names = cellText(words, cols[iName], cols[iName + 1], r.y0, r.y1, underlined, true).trim();
    if (!names) continue;
    // 헤더는 "학 교 명" 처럼 자간이 벌어져 낱말이 쪼개진다. 붙여서 본다.
    const flat = names.replace(MARKS, '').replace(/[\s,]/g, '');
    if (/^(학교명|유치원명|학교수|유치원수|비고)$/.test(flat)) continue;

    // 인사구역 칸은 낱말을 글자로 가른다 — 급지가 있으면 그 행은 병구역이다.
    // (급지를 가르는 세로선은 병구역 행에만 있어 짧다. 열로 나누려 들면 놓친다.)
    const marks = cellWords(words, cols[2], cols[iName], r.y0, r.y1).map((w) => w.text.trim());
    const grade = marks.find((t) => GRADE.test(t)) ?? null;
    const mid = (r.y0 + r.y1) / 2;
    const area = grade ? '병' : (marks.find((t) => AREA.test(t)) ?? valueAt(areaCells, mid));
    rows.push({
      page,
      caption,
      tableId,
      office: valueAt(offices, mid),
      city: valueAt(cities, mid),
      area,
      grade,
      countText: valueAt(counts, mid),
      names,
    });
  }
  return { kind: '인사구역', rows };
}

function readPage(page, ctx) {
  const words = readWords(page);
  const { hLines, vLines, rects } = readVectors(page);
  const title = words.map((w) => w.text).join('');
  const t1 = /\[별표(\d)\]/.exec(title);
  if (t1) ctx.table = +t1[1];
  if (!words.some((w) => /^(교육지원청|시.군명)$/.test(w.text))) return null; // 표가 없는 쪽

  // ⛔ 밑줄이 폐·휴교를 뜻하는 것은 [별표1] 뿐이다. 범례에 그렇게 적혀 있다.
  //    별표2·3 의 밑줄은 이번에 고친 줄을 나타내는 개정 표시라, 폐교로 읽으면 멀쩡한 학교가 사라진다.
  const underlineMeansClosed = ctx.table === 1;

  if (!ctx.table) return null; // 본문의 가산표는 인사구역 표가 아니다

  const shaded = markShaded(rects, words);

  const out = { rows: [], underlined: [], shaded: [...shaded].map((w) => w.text), newSchools: [] };
  for (const g of groupTables(vLines)) {
    const marks = underlineMeansClosed ? markUnderlines(hLines, words, g.top, g.bottom) : new Map();
    const t = readTable(words, hLines, g, page, marks);
    if (!t) continue;
    if (t.kind === '신설교') { out.newSchools.push(...readNewSchools(words, hLines, g, page)); continue; }
    out.rows.push(...t.rows.map((r) => ({ ...r, table: ctx.table })));
    out.underlined.push(...[...marks.values()]);
  }
  return out;
}

/** [별표4] 신설교(원) — 학년도 열이 셋이고 행은 교육지원청 하나씩이다. */
function readNewSchools(words, hLines, g, page) {
  const cols = uniqSorted(g.lines.map((l) => l.x), 2);
  const { top, bottom } = g;
  const wide = hLines.filter((l) => l.y > top - 2 && l.y < bottom + 2);
  const rows = rowsOfColumn(wide, cols[0], cols[1], top, bottom);
  const years = [];
  for (let i = 1; i < cols.length - 1; i++) {
    const head = cellText(words, cols[i], cols[i + 1], top, top + 30);
    const y = /(\d{4})학년도/.exec(head);
    if (y) years.push({ i, year: +y[1] });
  }
  const out = [];
  for (const r of rows) {
    const office = cellText(words, cols[0], cols[1], r.y0, r.y1).trim();
    if (!office || office === '교육지원청') continue;
    for (const { i, year } of years) {
      for (const name of splitNames(cellText(words, cols[i], cols[i + 1], r.y0, r.y1, null, true).trim())) {
        out.push({ page, office, year, name });
      }
    }
  }
  return out;
}

// ── 실행 ────────────────────────────────────────────────────────────────────

const pageCount = +(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [PDF]).toString())?.[1] ?? 0);
const all = [];
const newSchools = [];
const marks = { 폐휴교: [], 신설예정교: [] };
const ctx = { table: 0 };
for (let p = 1; p <= pageCount; p++) {
  const r = readPage(p, ctx);
  if (!r) continue;
  all.push(...r.rows);
  newSchools.push(...r.newSchools);
  marks.폐휴교.push(...r.underlined.map((u) => ({ page: p, ...u })));
  marks.신설예정교.push(...r.shaded.map((t) => ({ page: p, text: t })));
}

/**
 * ⛔ 밑줄이 그어졌다고 다 폐·휴교가 아니다.
 *    2026학년도판은 **새로 여는 학교에도 밑줄을 그어** 놓았다(복정1 · 고천2 · 회천3 · 운정7 …).
 *    음영으로 가리려 했으나 칠한 칸을 알아보는 게 판마다 들쭉날쭉했다.
 *    [별표4] 가 당해 학년도 신설교 이름을 그대로 적어 주므로 그것으로 가른다 — 원본이 스스로 주는 값이다.
 */
// ⛔ 이름만으로 맞추면 안 된다 — 2026학년도판에서 이천에 신설교 "중리" 가 생기는 바람에
//    포천의 폐교 "중리" 가 되살아났다. 교육지원청을 함께 본다.
const openingSoon = new Set(
  newSchools.filter((n) => n.year === +YEAR).map((n) => `${n.office}|${n.name}`)
);

/**
 * 원본 오타를 바로잡는 목록.
 *
 * ⛔ 짐작으로 넣지 않는다. **검산이 어긋난다고 짚어 준 자리를 원본과 대조해 확인한 것만** 넣는다.
 *    넣은 것은 결과 파일의 corrections 에 그대로 남는다.
 *
 * 왜 코드로 못 가리나 — 학교 이름은 칸 안에서 줄을 넘어가며 끊긴다("…숙" / "지, …").
 * 줄 끝이 칸 오른쪽까지 꽉 찼으면 끊긴 이름으로 보고 붙이는데, 원본이 줄 끝 쉼표를 빠뜨리면
 * 꽉 찬 모양이 똑같아서 두 학교가 한 학교로 붙는다.
 */
const CORRECTIONS = {
  2026: [
    {
      where: '평택 을',
      from: '평택영신고덕함박',
      to: '평택영신,고덕함박',
      why: '원본이 줄 끝 쉼표를 빠뜨렸다(…해창, 민세, 평택영신 / 고덕함박, …). 2027학년도판에는 둘이 따로 적혀 있다.',
    },
  ],
};

const corrections = [];
function applyCorrections(text) {
  let out = text;
  for (const c of CORRECTIONS[YEAR] ?? []) {
    if (!out.includes(c.from)) continue;
    out = out.split(c.from).join(c.to);
    corrections.push(c);
  }
  return out;
}

const rows = [];
const warnings = [];
for (const r of all) {
  const items = splitNames(applyCorrections(r.names)).map(parseItem);
  const count = parseCount(r.countText);
  let schools = 0;
  let branches = 0;
  for (const it of items) {
    // 원본 오타로 낱자 하나만 있는 항목이 있다(2027학년도판 고양 유치원 "솔마루, ㄹ, 고양장항").
    // 학교가 아니니 세지 않되, 조용히 버리지 않고 적어 둔다.
    if (it.school && /^[\u3130-\u318F]$/.test(it.school)) {
      warnings.push({ where: `${r.page}쪽 ${tidy(r.city)} ${r.area}${r.grade ?? ''}`.trim(), detail: `원본에 낱자 하나만 있는 항목 "${it.school}" — 학교로 세지 않았다` });
      continue;
    }
    const { closedBranches } = it;
    const closed = it.closed && !openingSoon.has(`${tidy(r.office)}|${it.school}`);
    if (it.school && !closed) schools++;
    branches += it.branches.length - closedBranches.length;
    rows.push({
      table: r.table,
      caption: r.caption,
      office: tidy(r.office),
      city: tidy(r.city),
      cityRaw: r.city,
      officeRaw: r.office,
      tableId: r.tableId,
      area: r.area,
      areaGrade: r.grade,
      school: it.school,
      branches: it.branches,
      closed,
      closedBranches,
      page: r.page,
    });
  }
  const where = `${r.page}쪽 ${tidy(r.city) || tidy(r.office) || '?'} ${r.area}${r.grade ?? ''}`.trim();
  if (!count) { warnings.push({ where, detail: `원본에 학교수 칸이 비어 있다 — ${r.names}` }); continue; }
  if (schools !== count.schools) flag(where, `표에 적힌 ${count.schools}교 ↔ 읽어 낸 ${schools}교 — ${r.names}`);
  // ⚠️ 분교장 수는 원본의 (n) 표기가 성겨서 실패로 치지 않는다. 수원은 신풍분교장이 있는데 총계가 그냥 100 이다.
  else if (branches !== count.branches) warnings.push({ where, detail: `분교장 표 ${count.branches} ↔ 읽어 낸 ${branches}` });
}

/** "1.수원100" · "평택73(3)" · "성남(2)" 에서 순번과 총계를 떼어 낸다. */
function tidy(t) {
  return (t ?? '').replace(/^\d+\.?/, '').replace(/(\d+(\(\d+\))?|\(\d+\))$/, '').trim();
}

// ── 검산 — 표에 적힌 시군 총계·지원청 총계와 맞춰 본다 ─────────────────────
// 표에는 세 겹의 수가 적혀 있다. 구역별 학교수 · 시군 총계 · 지원청 총계.
// 셋이 다 맞아야 제대로 읽은 것이다. 안 맞으면 그 자리를 그대로 싣는다.
function reconcile(level) {
  const key = level === 'city' ? 'cityRaw' : 'officeRaw';
  const groups = new Map();
  for (const r of rows) {
    const raw = r[key];
    if (!raw) continue;
    const k = `${r.tableId}|${raw}`;
    const g = groups.get(k) ?? { table: r.table, caption: r.caption, raw, schools: 0 };
    if (r.school && !r.closed) g.schools++;
    groups.set(k, g);
  }
  for (const g of groups.values()) {
    const m = /(\d+)(?:\((\d+)\))?$|\((\d+)\)$/.exec(g.raw);
    if (!m) continue; // 총계가 안 적힌 칸
    const declared = +(m[1] ?? m[3]);
    if (!Number.isFinite(declared)) continue;
    if (g.schools !== declared)
      flag(`${g.caption} · ${level === 'city' ? '시군' : '지원청'} ${tidy(g.raw)}`,
        `표에 적힌 총계 ${declared} ↔ 읽어 낸 ${g.schools}`);
  }
}
reconcile('city');
reconcile('office');

const live = rows.filter((r) => r.school && !r.closed);
const byTable = {};
for (const r of live) {
  const t = `별표${r.table}`;
  byTable[t] ??= {};
  const k = `${r.area}${r.areaGrade ?? ''}`;
  byTable[t][k] = (byTable[t][k] ?? 0) + 1;
}

const result = {
  meta: {
    학년도: +YEAR,
    시도: '경기',
    원자료: path.relative(ROOT, PDF),
    생성: 'scripts/parse-personnel-areas.mjs',
    읽는법:
      'PDF 를 벡터로 뽑아 표 격자(세로선=열, 가로선=행)를 되살리고 낱말을 칸에 넣었다. ' +
      '표에 적힌 학교수는 검산에만 썼다. 밑줄(폐·휴교)과 음영(신설예정교)은 그림이라 pdftotext 가 버리므로 벡터에서 되찾았다.',
    표: { 1: '초등학교 인사구역', 2: '유치원 인사구역', 3: '특수학교 인사구역', 4: '신설교(원)' },
    열이름: {
      table: '몇 번 별표에서 나왔나',
      office: '교육지원청',
      city: '시·군',
      area: '인사구역 (갑/을/병)',
      areaGrade: '병구역 급지 (가/나/다/라) — 지역가산 가·나 100% / 다·라 70%',
      school: '학교명 (표에 적힌 줄임말 그대로. 표준학교코드는 나이스 대조 후 붙인다)',
      branches: '분교장',
      closed: '폐·휴교 (별표1 에 밑줄로 표시된 것)',
      closedBranches: '폐·휴교인 분교장',
    },
  },
  rows,
  newSchools,
  marks,
  checks: {
    살아있는것: live.length,
    별표별: byTable,
    신설교: newSchools.length,
    폐휴교표시: marks.폐휴교.length,
    신설예정교표시: marks.신설예정교.length,
  },
  corrections,
  warnings,
  anomalies,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + '\n', 'utf8');

console.log(`[경기 ${YEAR}] 살아있는 것 ${live.length}`);
for (const [t, v] of Object.entries(byTable)) console.log(`  ${t}`, v);
console.log(`신설교(원) ${newSchools.length}건 · 폐·휴교 표시 ${marks.폐휴교.length}건 · 신설예정교 표시 ${marks.신설예정교.length}건`);
console.log(`→ ${path.relative(ROOT, OUT)}`);
if (corrections.length) {
  console.log(`\n원본 오타를 바로잡은 자리 ${corrections.length}건:`);
  for (const c of corrections) console.log(`  · ${c.where} — "${c.from}" → "${c.to}" (${c.why})`);
}
if (warnings.length) {
  console.log(`\n분교장 수만 어긋난 자리 ${warnings.length}건 (원본 표기가 성기다 — 실패로 치지 않는다):`);
  for (const w of warnings) console.log(`  · ${w.where} — ${w.detail}`);
}
if (anomalies.length) {
  console.log(`\n⚠️ 표와 안 맞는 자리 ${anomalies.length}건 — 버리지 않고 그대로 실었다:`);
  for (const a of anomalies) console.log(`  · ${a.where} — ${a.detail}`);
  process.exit(1);
}
