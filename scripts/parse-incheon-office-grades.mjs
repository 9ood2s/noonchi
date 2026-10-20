#!/usr/bin/env node
/**
 * 인천 교육지원청 세부기준에서 **인사급교(가·나·다급교)** 표를 읽는다.
 *   node scripts/parse-incheon-office-grades.mjs 2027
 *
 * 왜 따로 읽나 — 시교육청 고시문에는 급교 표가 없다. 제24조가 「동일구역 내 학교의 급지 지정은
 * 교육장이 조정한다」로 넘기기 때문이다. 그 표는 **교육지원청마다 따로 고시**한다.
 * 교사가 전보 때 쓰는 말이 이 급교다(「가급교 만기자는 나·다급교로 간다」).
 * ⛔ 시 기준의 인사구역 Ⅰ·Ⅱ·Ⅲ 과는 **다른 값**이다(`docs/postmortems.md`).
 *
 * ⛔ 지원청마다 파일 형식이 다르다 — 남부·북부는 pdf, 서부는 hwp(OLE 복합문서)다.
 *    hwp 는 `scripts/lib/hwp5.mjs` 가 읽는다.
 * ⛔ 2026-08-20 기준 **동부·강화는 아직 고시 전이다.** 지어내지 않고 「없음」으로 내보낸다.
 *
 * 어떻게 읽나 (pdf) — `pdftotext -layout` 만으로는 못 읽는다. 표 한 행이 여러 줄에 걸쳐 있고
 * 급교 이름이 그 **가운데 줄**에 찍혀서, 줄 단위로 끊으면 위쪽 학교가 앞 급교로 넘어간다.
 * 그래서 `pdftocairo -svg` 로 **가로선(행 경계)** 을 되살리고 낱말을 그 행에 넣는다.
 * ⛔ svg 의 y 는 뒤집혀 있다(PDF 원점이 좌하단). `쪽높이 - y` 로 되돌린다.
 *
 * 검산 — 표가 스스로 적어 둔 「계」와 읽어 낸 학교 수를 맞춰 본다. 어긋나면 EXIT=1.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { hwpParagraphs } from './lib/hwp5.mjs';

import { needSource } from './lib/source.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const YEAR = process.argv[2] ?? '2027';
const TMP = fs.mkdtempSync(path.join(process.env.TMPDIR ?? '/tmp', 'grades-'));
// 지원청마다 폴더가 하나씩이다 — `data/source/incheon/<지원청>/<학년도>/`(§12-96)
const src = (office, file) => needSource('incheon', office, YEAR, file);

/** 아직 고시가 안 올라온 지원청. 화면은 이걸 보고 급지를 「?」 로 낸다. */
const PENDING = {
  동부: '2026-08-20 기준 아직 고시 전',
  강화: '2026-08-20 기준 아직 고시 전',
};

// ── 글자 다듬기 ─────────────────────────────────────────────────────────────

/**
 * 각주 표시와 자간 공백을 턴다.
 * ⛔ 「계양(상야분교)」처럼 **괄호가 이름의 일부인 것은 살린다** — 떼면 본교 계양초와 한 이름이 된다.
 */
function clean(raw) {
  return raw
    .replace(/\((?![^)]*분교)[^)]*\)/g, '') // (*) (**) 같은 각주만 뗀다
    .replace(/[()▪·]/g, '')
    .replace(/\s+/g, '') // 「주 안」 같은 자간 공백. 「영종 금산분교장」도 붙여 한 낱말로 둔다
    .replace(/[.,]+$/, '')
    .trim();
}

/** 학교 이름이 아닌 것 — 표의 머리말과 세어 놓은 수. */
const NOT_NAME = /^(계|구역|급교|본교|분교장|[가나다]급교|\d+개?교?|\d+개분교장|인사구역|급교지역|영종지역|도서지역|\d+구역)$/;

/** 「연평, 백령 · 공항 신도분교장」처럼 쉼표로 이어 붙인 덩어리를 학교 이름으로 가른다. */
const names = (chunk) =>
  chunk
    .split(/[,、]|(?<=[)가-힣])\.(?=\s|$)/) // 서부 표에 쉼표 대신 마침표를 찍은 자리가 있다
    .map(clean)
    .filter((s) => s && /[가-힣]/.test(s) && !NOT_NAME.test(s) && !/\d+개/.test(s));

// ── pdf 를 격자로 되살리기 ──────────────────────────────────────────────────

function readWords(pdf, page) {
  const f = path.join(TMP, `w${page}.xml`);
  execFileSync('pdftotext', ['-bbox-layout', '-f', String(page), '-l', String(page), pdf, f]);
  const words = [];
  const re = /<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([\s\S]*?)<\/word>/g;
  for (let m; (m = re.exec(fs.readFileSync(f, 'utf8'))) !== null; ) {
    words.push({
      x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4],
      text: m[5].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&apos;/g, "'").trim(),
    });
  }
  return words;
}

/**
 * 표를 가로지르는 선의 y. 이게 행 경계다.
 *
 * ⛔ svg 의 y 는 뒤집혀 있어 되돌린다(PDF 원점이 좌하단).
 * ⛔ **한 행 경계가 선 하나로 그려져 있지 않다.** 칸마다 따로 그어서 「77→141 · 141→250 · …」
 *    조각으로 온다. 조각 하나의 길이로 거르면 그 행 경계를 통째로 놓치고,
 *    급교 행이 헤더까지 삼켜 학교 수가 늘어난다. 그래서 **같은 y 의 조각을 이어 붙여** 잰다.
 */
function readRowEdges(pdf, page, pageH) {
  const f = path.join(TMP, `v${page}.svg`);
  execFileSync('pdftocairo', ['-svg', '-f', String(page), '-l', String(page), pdf, f]);
  const body = fs.readFileSync(f, 'utf8').split('</defs>').pop();
  const pieces = [];
  for (const m of body.matchAll(/<path\b([^>]*)>/g)) {
    const d = /\sd="([^"]*)"/.exec(m[1])?.[1];
    if (!d || /C/.test(d)) continue;
    const nums = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    if (nums.length < 4) continue;
    const xs = nums.filter((_, i) => i % 2 === 0);
    const raw = nums.filter((_, i) => i % 2 === 1);
    if (Math.max(...xs) > 700 || Math.max(...raw) > 900) continue; // 글리프 외곽선
    const flipped = raw.map((y) => pageH - y);
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...flipped), Math.max(...flipped)];
    if (y1 - y0 < 5 && x1 - x0 > 1) pieces.push({ y: (y0 + y1) / 2, x0, x1 });
  }

  // 같은 높이의 조각을 모아 덮은 폭을 잰다. 표 폭쯤 덮으면 그게 행 경계다.
  const byY = [];
  for (const p of pieces.sort((a, b) => a.y - b.y)) {
    const last = byY[byY.length - 1];
    if (last && p.y - last.y <= 2) last.spans.push(p);
    else byY.push({ y: p.y, spans: [p] });
  }
  const covered = (spans) => {
    let sum = 0, end = -Infinity;
    for (const s of spans.sort((a, b) => a.x0 - b.x0)) {
      sum += Math.max(0, s.x1 - Math.max(s.x0, end));
      end = Math.max(end, s.x1);
    }
    return sum;
  };
  return byY.filter((r) => covered(r.spans) > 300).map((r) => r.y);
}

const pageOf = (pdf, re) => {
  const n = +(/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [pdf]).toString())?.[1] ?? 0);
  for (let p = n; p >= 1; p--) {
    const t = execFileSync('pdftotext', ['-layout', '-f', String(p), '-l', String(p), pdf, '-'], { encoding: 'utf8' });
    if (re.test(t)) return p;
  }
  throw new Error(`${path.basename(pdf)} 에서 급교 표를 못 찾았다`);
};

/**
 * 급교 행 하나를 읽는다. 라벨이 있는 행의 위아래 가로선 사이에 있는 낱말이 그 급교의 학교다.
 * @param joinGap 낱말 사이가 이만큼보다 좁으면 한 낱말로 붙인다(자간을 벌려 적은 표 때문에).
 */
function rowsByLabel(words, edges, labels, joinGap) {
  const rows = [];
  for (const { grade, re } of labels) {
    const label = words.find((w) => re.test(w.text));
    if (!label) throw new Error(`「${grade}」 라벨을 못 찾았다`);
    const mid = (label.y0 + label.y1) / 2;
    const top = Math.max(...edges.filter((y) => y < mid), -Infinity);
    const bottom = Math.min(...edges.filter((y) => y > mid), Infinity);
    if (!Number.isFinite(top) || !Number.isFinite(bottom)) throw new Error(`「${grade}」 행 경계를 못 찾았다`);
    const inside = words.filter(
      (w) => (w.y0 + w.y1) / 2 > top && (w.y0 + w.y1) / 2 < bottom && w !== label
    );

    // ⛔ 한 행 안에도 줄이 여럿이다. **줄로 먼저 묶고 그 안에서 x 로 세운다.**
    //    통째로 정렬하면 오른쪽 끝 「계」 칸의 숫자가 글자보다 y 가 살짝 위라 앞으로 튀어나와,
    //    바로 뒤 학교 이름과 붙어 「22길주」 같은 것이 생긴다.
    const lines = [];
    for (const w of inside.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(w.y0 - last[0].y0) < 4) last.push(w);
      else lines.push([w]);
    }

    // 같은 줄에서 가까이 붙은 낱말은 한 덩어리로 — 「주 안」처럼 자간을 벌려 적은 이름을 되붙인다.
    const chunks = [];
    for (const line of lines) {
      let last = null;
      for (const w of line.sort((a, b) => a.x0 - b.x0)) {
        if (last && w.x0 - last.x1 >= 0 && w.x0 - last.x1 <= joinGap) chunks[chunks.length - 1] += w.text;
        else chunks.push(w.text);
        last = w;
      }
    }
    const text = chunks.join(' , ');
    rows.push({
      grade,
      schools: chunks.flatMap(names),
      said: /(\d+)\s*개?교/.test(text) ? +/(\d+)\s*개?교/.exec(text)[1] : (/(?:^|,)\s*(\d+)\s*(?:,|$)/.exec(text) ? +/(?:^|,)\s*(\d+)\s*(?:,|$)/.exec(text)[1] : null),
      saidBranch: /(\d+)\s*개?\s*,?\s*분교장/.test(text) ? +/(\d+)\s*개?\s*,?\s*분교장/.exec(text)[1] : null,
    });
  }
  return rows;
}

// ── 지원청별로 읽기 ─────────────────────────────────────────────────────────

const GRADE_LABELS = [
  { grade: '가', re: /^[‘'’]?가[’'‘]?급교$/ },
  { grade: '나', re: /^[‘'’]?나[’'‘]?급교$/ },
  { grade: '다', re: /^[‘'’]?다[’'‘]?급교$/ },
];

/**
 * 남부 — [별표1] 초등학교 인사구역 및 급교.
 * 급교가 다섯 갈래다. 가·나·다급교에 **영종지역·도서지역**이 같은 층으로 붙는다(제6조 ①이 그렇게 쓴다).
 * 이름은 세로로 한 줄에 하나씩, 자간을 벌려 적는다(「주 안」).
 */
function parseNambu() {
  const pdf = src('nambu', 'standards.pdf');
  const page = pageOf(pdf, /초등학교 인사구역 및 급교[\s\S]*제5조제1항/);
  const rows = rowsByLabel(
    readWords(pdf, page),
    readRowEdges(pdf, page, 842),
    [...GRADE_LABELS, { grade: '영종지역', re: /^영종지역$/ }, { grade: '도서지역', re: /^도서지역$/ }],
    20
  );
  return { page, rows, note: '남부는 영종지역·도서지역이 급교와 같은 층이다(제6조 ①). 계는 본교와 분교장을 따로 센다.' };
}

/** 북부 — (별표1) 인사구역별 인사급교. 계 67 에는 분교 1(계양 상야분교)이 들어 있다. */
function parseBukbu() {
  const pdf = src('bukbu', 'standards.pdf');
  const page = pageOf(pdf, /인사구역별 인사급교/);
  // ⛔ 북부 표는 자간을 안 벌린다. 붙이면 열이 바뀌는 자리(「대정」 다음 「부개서」)가 한 이름이 된다.
  const rows = rowsByLabel(readWords(pdf, page), readRowEdges(pdf, page, 841), GRADE_LABELS, 0);
  return { page, rows, note: '북부 계 67 에는 분교 1(계양 상야분교)이 들어 있다.' };
}

/**
 * 서부 — [별표 1] 인사구역별 인사급교(초등). hwp 라 표 칸이 문단 하나씩 나온다.
 * 급교 이름 뒤로 칸이 이어지다가 **숫자만 있는 칸**이 그 급교의 계다.
 */
function parseSeobu() {
  const cells = hwpParagraphs(fs.readFileSync(src('seobu', 'standards.hwp')));
  const at = cells.findIndex((c) => c.includes('인사구역별 인사급교(초등)'));
  if (at < 0) throw new Error('서부 [별표 1] 을 못 찾았다');
  const rows = [];
  let cur = null;
  for (const cell of cells.slice(at)) {
    if (/^([가나다])급교$/.test(cell)) { cur = { grade: cell[0], schools: [], said: null, saidBranch: null }; rows.push(cur); continue; }
    if (!cur) continue;
    if (/^계$/.test(cell)) break;
    if (/^\d+$/.test(cell)) { cur.said = +cell; cur = null; continue; }
    cur.schools.push(...names(cell));
  }
  return { page: null, rows, note: '서부는 hwp(OLE 복합문서)다. scripts/lib/hwp5.mjs 가 읽는다.' };
}

// ── 내보내기 ────────────────────────────────────────────────────────────────

const OFFICES = { 남부: parseNambu, 북부: parseBukbu, 서부: parseSeobu };
const isBranch = (n) => /분교/.test(n);

const out = {
  meta: {
    시도: '인천', 학년도: +YEAR, 생성: 'scripts/parse-incheon-office-grades.mjs',
    무엇: '교육지원청 인사관리세부기준 (별표1) 초등 인사급교 — 가·나·다급교',
    '⛔ 인사구역과 다른 값': '시 고시문의 Ⅰ·Ⅱ·Ⅲ 은 인사구역이고, 급교는 그 안에서 다시 갈린다(제24조).',
    '⛔ 아직 없는 곳': '동부·강화는 고시 전이다. 화면에서 「?」 로 낸다.',
    '안 담은 것': '지원청 안의 인사구역(부평 1·2구역, 서구 1·2구역, 검단구역 등)은 이번에 안 담았다.',
  },
  offices: {},
  pending: PENDING,
};

let bad = 0;
console.log(`[인천 ${YEAR}] 교육지원청 인사급교`);
for (const [office, parse] of Object.entries(OFFICES)) {
  const { rows, note, page } = parse();
  const grades = {};
  let total = 0;
  console.log(`  ${office}교육지원청${page ? ` (${page}쪽)` : ''}`);
  for (const r of rows) {
    const main = r.schools.filter((s) => !isBranch(s));
    const branches = r.schools.filter(isBranch);
    if (grades[r.grade]) throw new Error(`${office} — 「${r.grade}」 를 두 번 읽었다`);
    grades[r.grade] = r.schools;
    total += r.schools.length;
    // 표가 적어 둔 계와 맞춘다. 분교장을 따로 센 표(남부)는 본교만, 함께 센 표(북부)는 다 세어 견준다.
    const want = r.saidBranch != null ? main.length : r.schools.length;
    const ok = r.said != null && r.said === want;
    const okBranch = r.saidBranch == null || r.saidBranch === branches.length;
    if (!ok || !okBranch) bad++;
    console.log(
      `    ${r.grade}${/지역$/.test(r.grade) ? '' : '급교'} ${String(r.schools.length).padStart(3)}교` +
        `  표 ${r.said ?? '?'}${r.saidBranch != null ? ` + 분교장 ${r.saidBranch}` : ''}  ${ok && okBranch ? '✓' : '✗'}`
    );
  }
  out.offices[office] = { note, total, grades };
  console.log(`    계 ${total}교`);
}
console.log(`  ⛔ 아직 고시 전 — ${Object.keys(PENDING).join(' · ')}`);

const OUT = path.join(ROOT, `data/derived/incheon-${YEAR}-office-grades.json`);
fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`\n→ ${path.relative(ROOT, OUT)}`);

if (bad) { console.error(`\n⚠️ 표의 계와 안 맞는 자리 ${bad}곳 — 읽기가 틀렸다.`); process.exit(1); }
