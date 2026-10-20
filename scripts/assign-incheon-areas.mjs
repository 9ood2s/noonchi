#!/usr/bin/env node
/**
 * 인천 학교에 인사구역(Ⅰ·Ⅱ·Ⅲ)을 매긴다.  node scripts/assign-incheon-areas.mjs 2027
 *
 * 왜 스크립트가 필요한가 — 인천 (별표1)은 학교 목록이 아니라 **범위**로 적혀 있다.
 * "남부교육지원청 관내 학교(영종·용유지역 및 옹진군 관내 학교 제외)" 처럼.
 * 이름이 적힌 것은 강화 20교뿐이다. 그래서 나이스 학교 목록에 이 범위를 얹어야 학교별 구역이 나온다.
 *
 * ⛔ 행정구역이 바뀌었다. 고시문은 "영종·용유지역"이라 적었는데 지금 주소는 **영종구**다.
 *    (인천은 중구·동구가 제물포구로, 서구가 검단구·서해구로, 중구 영종·용유가 영종구로 나뉘었다)
 *    그래서 지역을 주소로 가릴 때 옛 이름만 찾으면 한 곳도 못 잡는다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const YEAR = process.argv[2] ?? '2027';
const areasFile = path.join(ROOT, `data/derived/incheon-${YEAR}-personnel-areas.json`);
const neisFile = path.join(ROOT, 'data/derived/neis-인천-초등.json');
for (const f of [areasFile, neisFile]) {
  if (!fs.existsSync(f)) { console.error(`${path.relative(ROOT, f)} 가 없다.`); process.exit(1); }
}
const areas = JSON.parse(fs.readFileSync(areasFile, 'utf8'));
const neis = JSON.parse(fs.readFileSync(neisFile, 'utf8'));

/**
 * 교육지원청이 따로 고시하는 **인사급교(가·나·다급교)**.
 * ⛔ 시 고시문의 인사구역 Ⅰ·Ⅱ·Ⅲ 과 다른 값이다 — 급교는 그 안에서 다시 갈린다(제24조).
 *    교사가 전보 때 쓰는 말이 이 급교(급지)다. `scripts/parse-incheon-office-grades.mjs` 가 읽는다.
 * ⛔ 동부·강화는 아직 고시 전이라 표가 없다. 짐작해 채우지 않고 **비워 둔다**(화면은 「?」로 낸다).
 */
const gradeFile = path.join(ROOT, `data/derived/incheon-${YEAR}-office-grades.json`);
if (!fs.existsSync(gradeFile)) {
  console.error(`${path.relative(ROOT, gradeFile)} 가 없다. 먼저 npm run grades:incheon ${YEAR} 를 돌린다.`);
  process.exit(1);
}
const gradeDoc = JSON.parse(fs.readFileSync(gradeFile, 'utf8'));

/**
 * 급교 표의 이름과 나이스 이름을 같은 꼴로 맞춘다.
 *   인천공항초등학교신도분교장 → 공항신도분교   ↔   공항 신도분교장 → 공항신도분교
 *   인천부평서초등학교         → 부평서         ↔   부평서
 * ⛔ 분교장은 「초등학교」 앞뒤를 이어 붙인다. 앞만 쓰면 본교와 한 이름이 되어 엉뚱한 급교가 붙는다.
 */
const gradeKey = (name) => {
  let s = String(name ?? '').replace(/^인천/, '').replace(/\((?![^)]*분교)[^)]*\)/g, '').replace(/[()]/g, '').trim();
  const m = /^(.*?)초등학교(.*)$/.exec(s);
  if (m) s = m[1] + m[2];
  return s.replace(/분교장$/, '분교').replace(/초$/, '');
};

/** 학교 이름 → { office, grade }. 표에 적힌 이름은 지원청마다 갈라져 있다. */
const gradeOf = new Map();
for (const [office, doc] of Object.entries(gradeDoc.offices)) {
  for (const [grade, schools] of Object.entries(doc.grades)) {
    for (const raw of schools) {
      const key = gradeKey(raw);
      if (gradeOf.has(key)) throw new Error(`급교 표에 같은 이름이 둘 있다: ${key}`);
      gradeOf.set(key, { office, grade, raw });
    }
  }
}
/** 표에 이름이 있는데 학교가 안 붙은 자리. 개교 전 학교가 미리 실려 있기도 하다. */
const gradeUnused = new Set(gradeOf.keys());

/** 「인천광역시북부교육지원청」 → 「북부」. 급교 표는 이 이름으로 갈라져 있다. */
const officeName = (o) => (o ?? '').replace(/인천광역시|교육지원청/g, '');

/** 학교알리미 공시자료(좌표·교원수). 잇는 키는 **정식 이름 + 교육지원청** 이다 — 같은 이름이 여럿 있다. */
const infoFile = path.join(ROOT, 'data/derived/schoolinfo-인천-초등.json');
/** 학급수. 나이스 classInfo 에서 왔고 표준학교코드로 곧장 붙는다. */
const classFile = path.join(ROOT, 'data/derived/classes-인천-초등.json');
const classBy = fs.existsSync(classFile)
  ? new Map(JSON.parse(fs.readFileSync(classFile, 'utf8')).rows.filter((r) => r.classes > 0).map((r) => [r.code, r.classes]))
  : new Map();
const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8')).rows : [];
const infoKey = (name, office) => `${name}|${office ?? ''}`;
const infoBy = new Map();
for (const r of info) {
  const k = infoKey(r.name, r.office);
  infoBy.set(k, infoBy.has(k) ? null : r);
}

/** 표가 이름을 적어 둔 강화 학교. 여기 있는 것은 이름으로 정한다. */
const named = new Map();
for (const a of areas.areas) for (const s of a.schools) named.set(s, a.area);

/**
 * 지금 인천의 구·군. 행정구역이 개편돼 중구·동구가 제물포구로, 서구가 검단구·서해구로,
 * 중구의 영종·용유가 영종구로 나뉘었다.
 */
const GU_NOW = new Set([
  '제물포구', '미추홀구', '연수구', '남동구', '부평구', '계양구', '검단구', '서해구', '영종구',
  '강화군', '옹진군',
]);

/**
 * 나이스 주소가 개편 전 값으로 남아 있는 자리.
 * ⛔ 짐작으로 넣지 않는다. 아래 검사가 짚어 준 것을 원문·본교와 대조해 확인한 것만 넣는다.
 */
const ADDRESS_FIXES = {
  인천영종초등학교금산분교장: {
    gu: '영종구',
    why: '나이스 주소가 옛 중구로 남아 있다. 본교(인천영종초)가 영종구이고 백운로는 영종도 도로명이다.',
  },
};

const guRaw = (addr) => (/인천광역시\s+(\S+)/.exec(addr ?? '') ?? [])[1] ?? null;
const canon = (n) =>
  (n ?? '').replace(/\(.*?\)/g, '').replace(/초등학교.*$/, '').replace(/^인천/, '').trim();

const isBranch = (n) => /분교장/.test(n);
const isSoon = (n) => /개교예정/.test(n);

const rows = [];
const notes = [];

const fixed = [];
for (const r of neis.rows) {
  let g = guRaw(r.address);
  let fixNote = null;
  const fix = ADDRESS_FIXES[r.name];
  if (fix) { g = fix.gu; fixNote = fix.why; fixed.push({ name: r.name, gu: g, why: fix.why }); }
  const gong = infoBy.get(infoKey(r.name, r.office)) ?? null;
  /**
   * ⛔ 이름만으로 붙이면 안 된다 — **인천에는 같은 이름의 학교가 여럿 있다.**
   *    강화 삼산초가 북부 「삼산」에 붙어, 고시가 안 난 강화 학교에 급교가 생겼었다.
   *    표가 지원청별로 갈라져 있으니 **지원청까지 맞을 때만** 붙인다.
   */
  const found = gradeOf.get(gradeKey(r.name)) ?? null;
  const hit = found && found.office === officeName(r.office) ? found : null;
  if (hit) gradeUnused.delete(gradeKey(r.name));
  const base = {
    code: r.code, name: r.name, office: r.office, address: r.address, gu: g, founded: r.founded,
    homepage: r.homepage ?? null,
    lat: gong?.lat ?? null, lng: gong?.lng ?? null, teachers: gong?.teachers ?? null,
    teachersF: gong?.teachersF ?? null, teachersM: gong?.teachersM ?? null, teachersT: gong?.teachersT ?? null,
    students: gong?.students ?? null, byGrade: gong?.byGrade ?? null,
    statYear: gong?.statYear ?? null, classes: classBy.get(r.code) ?? null,
    // 급교는 지원청 고시가 있는 곳만 붙는다. 없으면 null 이고 화면이 「?」로 낸다.
    grade: hit?.grade ?? null,
  };

  // 인사구역은 공립 교원이 도는 자리다. 사립은 대상이 아니다.
  if (r.founded === '사립') { notes.push({ ...base, why: '사립 — 인사구역 대상이 아니다' }); continue; }
  // ⛔ 국립도 아니다. 경인교대부설초는 교육부 소속이고 **따로 면접을 봐서 간다**(2026-08-21 사장님 확인).
  if (r.founded === '국립') { notes.push({ ...base, why: '국립 — 시·도 인사 대상이 아니다(따로 면접을 봐서 간다)' }); continue; }
  if (isSoon(r.name)) { notes.push({ ...base, why: '개교예정 — 아직 학교가 없다' }); continue; }

  // 1) 강화군 — 표에 이름이 적혀 있다. 그대로 따른다.
  if (g === '강화군') {
    const key = canon(r.name);
    const area = named.get(key);
    if (!area) { notes.push({ ...base, why: `강화군인데 표의 이름 목록에 없다 ("${key}")` }); continue; }
    rows.push({ ...base, area, by: '표에 이름이 적힌 강화 학교', fixNote });
    continue;
  }
  // 2) 옹진군 관내 학교 → Ⅲ
  if (g === '옹진군') { rows.push({ ...base, area: 'Ⅲ', by: '옹진군 관내', fixNote }); continue; }
  // 3) 영종·용유지역 학교 → Ⅱ. 지금 행정구역으로는 영종구다.
  if (g === '영종구') { rows.push({ ...base, area: 'Ⅱ', by: '영종·용유지역 (지금 영종구)', fixNote }); continue; }
  // 4) 그 밖 남부·북부·동부·서부 지원청 관내 → Ⅰ
  if (g) {
    // ⛔ 없어진 구 이름이 나오면 조용히 Ⅰ 로 밀지 않는다. 행정구역이 또 바뀌었을 수 있다.
    if (!GU_NOW.has(g)) { notes.push({ ...base, why: `지금 인천에 없는 구·군이다 ("${g}"). 주소가 개편 전 값이거나 구역이 또 바뀌었다` }); continue; }
    rows.push({ ...base, area: 'Ⅰ', by: `${g} — 남부·북부·동부·서부 지원청 관내`, fixNote });
    continue;
  }

  notes.push({ ...base, why: '주소에서 구·군을 못 읽었다' });
}

// ⛔ 분교장은 본교와 다른 섬에 있다(인천공항초는 영종구인데 그 신도분교장은 옹진군).
//    표에 분교장 규정이 없어 **소재지 기준**으로 매겼다. 근거가 약한 자리라 따로 세어 둔다.
const branches = rows.filter((r) => isBranch(r.name));

const byArea = rows.reduce((m, r) => ((m[r.area] = (m[r.area] ?? 0) + 1), m), {});
const byGrade = rows.reduce((m, r) => ((m[r.grade ?? '?'] = (m[r.grade ?? '?'] ?? 0) + 1), m), {});
const pendingOffices = new Set(Object.keys(gradeDoc.pending ?? {}));
/** 고시가 있는 지원청인데 급교를 못 받은 학교 — 이름이 안 맞았다는 뜻이라 그냥 두면 안 된다. */
const gradeMisses = rows.filter((r) => !r.grade && !pendingOffices.has(officeName(r.office)));
console.log(`[인천 ${YEAR}] 학교별 인사구역`);
console.log(`  나이스 ${neis.rows.length}교 → 매긴 것 ${rows.length}교 · 뺀 것 ${notes.length}교`);
console.log(`  ${Object.entries(byArea).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.log(`  그중 분교장 ${branches.length}곳 (소재지 기준으로 매겼다)`);
if (info.length) {
  console.log(`  학교알리미 곁들임 — 좌표 ${rows.filter((r) => r.lat != null).length}교 · 교원수 ${rows.filter((r) => r.teachers != null).length}교`);
  const per = rows.filter((r) => r.students != null && r.classes > 0);
  console.log(`  학생수 ${rows.filter((r) => r.students != null).length}교 · 학급수 ${rows.filter((r) => r.classes != null).length}교 · 학급당 학생수 ${per.length}교`);
}

console.log(`  급교 — ${Object.entries(byGrade).sort().map(([k, v]) => `${k} ${v}`).join(' · ')}` +
  `  (「?」 는 아직 고시 전인 ${[...pendingOffices].join('·')})`);
if (gradeUnused.size) {
  console.log(`\n급교 표에 있는데 학교가 없는 이름 ${gradeUnused.size}곳: ${[...gradeUnused].join(' · ')}`);
  console.log('  (개교 전 학교가 표에 미리 실린 자리다. 나이스에 없으면 여기 남는다)');
}

if (notes.length) {
  console.log(`\n뺀 학교 ${notes.length}곳:`);
  for (const n of notes) console.log(`  · ${n.name} — ${n.why}`);
}
console.log(`\n분교장 ${branches.length}곳:`);
for (const b of branches) console.log(`  · ${b.name} → ${b.area} (${b.gu})`);
if (fixed.length) {
  console.log(`\n주소를 손으로 바로잡은 자리 ${fixed.length}곳:`);
  for (const f of fixed) console.log(`  · ${f.name} → ${f.gu} — ${f.why}`);
}

const OUT = path.join(ROOT, `data/derived/incheon-${YEAR}-school-areas.json`);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      meta: {
        시도: '인천',
        학년도: +YEAR,
        생성: 'scripts/assign-incheon-areas.mjs',
        규칙: '강화군은 표의 이름 목록 · 옹진군 Ⅲ · 영종구(옛 영종·용유) Ⅱ · 그 밖 Ⅰ',
        '급교(급지)': '교육지원청 세부기준 (별표1). 동부·강화는 고시 전이라 null 이다.',
        '⛔ 행정구역 개편': '고시문의 "영종·용유지역"이 지금 주소로는 영종구다. 중구·동구는 제물포구, 서구는 검단구·서해구로 나뉘었다.',
        '⛔ 분교장': '표에 규정이 없어 소재지 기준으로 매겼다. 본교와 구역이 다를 수 있다.',
      },
      counts: { neis: neis.rows.length, assigned: rows.length, excluded: notes.length, byArea, byGrade, branches: branches.length },
      addressFixes: fixed,
      schools: rows,
      excluded: notes,
    },
    null,
    2
  ) + '\n'
);
console.log(`\n→ ${path.relative(ROOT, OUT)}`);

// 강화 20교는 표가 이름을 다 적어 두었다. 여기가 어긋나면 읽기가 틀린 것이다.
const ghwa = rows.filter((r) => r.gu === '강화군');
const want = named.size;
if (ghwa.length !== want) {
  console.log(`\n⚠️ 강화 — 표에 적힌 ${want}교 ↔ 매긴 ${ghwa.length}교`);
  process.exit(1);
}
console.log(`검산 · 강화 표 ${want}교 ↔ 매긴 ${ghwa.length}교 ✓`);

// ⛔ 고시가 나온 지원청인데 급교가 안 붙었으면 이름 맞추기가 틀린 것이다. 조용히 넘기지 않는다.
if (gradeMisses.length) {
  console.log(`\n⚠️ 급교를 못 받은 학교 ${gradeMisses.length}곳 (고시는 나온 지원청이다):`);
  for (const m of gradeMisses) console.log(`  · ${m.name} [${officeName(m.office)}]`);
  process.exit(1);
}
const ghost = rows.filter((r) => r.grade && pendingOffices.has(officeName(r.office)));
if (ghost.length) {
  console.log(`\n⚠️ 고시 전인 지원청인데 급교가 붙은 학교 ${ghost.length}곳 — 다른 지원청 학교와 이름이 겹쳤다:`);
  for (const m of ghost) console.log(`  · ${m.name} [${officeName(m.office)}] → ${m.grade}`);
  process.exit(1);
}
const graded = rows.filter((r) => r.grade).length;
console.log(`검산 · 급교 ${graded}교 ↔ 고시가 나온 지원청 학교 ${rows.length - rows.filter((r) => pendingOffices.has(officeName(r.office))).length}교 ✓`);
