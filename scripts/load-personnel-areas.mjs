#!/usr/bin/env node
/**
 * 학교 마스터를 DB 에 넣을 마이그레이션을 만든다.  node scripts/load-personnel-areas.mjs 2027
 *
 * 무엇을 모으나 — 세 갈래에서 온 것을 한 줄로 합친다.
 *   인사구역   교육청 고시 표 (scripts/parse-personnel-areas.mjs · parse-incheon-areas.mjs)
 *   표준학교코드 나이스           (scripts/match-neis.mjs · assign-incheon-areas.mjs)
 *   좌표·교원수·학생수 학교알리미      (scripts/fetch-schoolinfo.mjs)
 *   학급수     나이스 classInfo   (scripts/fetch-classes.mjs)
 *
 * ⛔ 결과를 DB 에만 두지 않는다. 마이그레이션 파일로 저장소에 남긴다.
 *    (postmortems.md 첫 항목 — 스키마가 DB 안에만 있어서 되돌아볼 근거가 없었다)
 * ⛔ 여러 번 돌려도 같아야 한다. 그 학년도치를 지우고 다시 넣는다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SIDO_NAMES } from '../lib/sido.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const YEAR = +(process.argv[2] ?? 2027);

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const q = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const num = (v) => (v === null || v === undefined || Number.isNaN(v) ? 'null' : String(v));
const qArr = (a) => (a?.length ? `ARRAY[${a.map(q).join(',')}]::text[]` : `'{}'::text[]`);

/**
 * 홈페이지 주소를 쓸 수 있는 꼴로 맞춘다.
 *
 * ⛔ **나이스는 앞머리(`https://`)가 없는 줄을 섞어 준다** — `kwonsun-e.goesw.kr` 처럼.
 *    그대로 `href` 에 넣으면 브라우저가 **우리 사이트 안의 경로**로 읽어
 *    `example.com/kwonsun-e.goesw.kr` 로 간다. 오류도 안 나고 그냥 404 다.
 * ⛔ `http`·`https` 가 아니면 버린다 — 링크로 무엇이든 열 수 있게 두지 않는다.
 */
/** 숫자 배열 → `int[]`. ⛔ 없으면 null 이다 — 빈 배열로 두면 「학년별이 있는데 다 0」으로 읽힌다 */
const nums = (a) => (Array.isArray(a) && a.length ? `array[${a.map((n) => Number(n)).join(',')}]::int[]` : 'null');

const web = (v) => {
  const t = (v ?? '').trim();
  if (!t) return null;
  const full = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(full);
    return u.protocol === 'http:' || u.protocol === 'https:' ? full : null;
  } catch {
    return null;
  }
};

const rows = [];

// ── 경기 — 인사구역 표의 줄임말이 이름이고, 정식 이름은 나이스에서 온다 ──────
{
  const m = read(`data/derived/match-${'경기'}-${YEAR}.json`);
  const src = read(`data/derived/gyeonggi-${YEAR}-personnel-areas.json`).meta.원자료;
  for (const r of m.matched) {
    rows.push({
      sido: '경기', level: '초등', office: r.office, city: r.city,
      area: r.area, area_grade: r.areaGrade,
      school_name: r.school, official_name: r.neisName,
      std_code: r.stdCode, lat: r.lat, lng: r.lng, teachers: r.teachers,
      teachers_f: r.teachersF ?? null, teachers_m: r.teachersM ?? null, teachers_t: r.teachersT ?? null,
      // 홈페이지 — 나이스가 준다. ⛔ 개교 예정교는 나이스에 없어 아래에서 null 이다(§12-137)
      homepage: web(r.homepage),
      students: r.students ?? null, students_grade: r.byGrade ?? null, stat_year: r.statYear ?? null, classes: r.classes ?? null,
      branches: r.branches ?? [], opens_year: null, source: src,
    });
  }

  // 개교 예정교 — [별표1] 에 구역이 이미 실려 있지만 아직 나이스에 없다.
  // ⛔ 지원을 일반 전보와 따로 받으므로 섞어 두지 않는다. opens_year 로 갈라 둔다.
  for (const r of m.notInNeis.filter((x) => x.opensSoon)) {
    rows.push({
      sido: '경기', level: '초등', office: r.office, city: r.city,
      area: r.area, area_grade: r.areaGrade,
      school_name: r.school, official_name: null,
      std_code: null, lat: null, lng: null, teachers: null,
      teachers_f: null, teachers_m: null, teachers_t: null, homepage: null,
      students: null, students_grade: null, stat_year: null, classes: null,
      branches: r.branches ?? [], opens_year: YEAR, source: src,
    });
  }
}

// ── 인천 — 표에 학교 목록이 없다. 나이스 정식 이름이 곧 이름이고 줄임말을 만들어 둔다 ──
{
  const a = read(`data/derived/incheon-${YEAR}-school-areas.json`);
  const src = read(`data/derived/incheon-${YEAR}-personnel-areas.json`).meta.원자료;
  const shortOffice = (s) => (s ?? '').replace(/^인천광역시/, '').replace(/교육지원청$/, '').trim();
  const shortName = (s) => (s ?? '').replace(/초등학교(.*)$/, '$1').trim() || s;
  for (const r of a.schools) {
    rows.push({
      sido: '인천', level: '초등', office: shortOffice(r.office), city: r.gu,
      // 급교(급지)는 교육지원청 고시에서 왔다. 동부·강화는 아직 고시 전이라 null 이고 화면이 「?」로 낸다.
      area: r.area, area_grade: r.grade ?? null,
      school_name: shortName(r.name), official_name: r.name,
      std_code: r.code, lat: r.lat, lng: r.lng, teachers: r.teachers,
      teachers_f: r.teachersF ?? null, teachers_m: r.teachersM ?? null, teachers_t: r.teachersT ?? null,
      homepage: web(r.homepage),
      students: r.students ?? null, students_grade: r.byGrade ?? null, stat_year: r.statYear ?? null, classes: r.classes ?? null,
      branches: [], opens_year: null, source: src,
    });
  }
}

/**
 * ── 인사구역 고시를 아직 안 읽은 시·도 ─────────────────────────────────────
 *
 * 사장님(2026-08-23) 「일단 다른 모든 지역 학교들도 api에서 받아올 수 있는 데이터들은
 * 우리 레이아웃에 맞춰서 때려넣자. 그뒤에 사람들에게 제보를 받거나 문서를 받아서
 * 단계적으로 채워나가고 공지를 띄우는 방식으로 운영하면 될 것 같음.」
 *
 * ⛔ **`area` 를 null 로 넣는다.** 짐작으로 채우지 않는다 — 구역은 교육청 고시 원문에만 있다.
 *    화면은 `hasAreas(sido)` 가 거짓이면 구역 배지·범례·필터를 아예 안 그리고 공지를 낸다.
 * ⛔ 경기·인천은 여기 안 온다 — 위에서 고시 표를 읽어 이미 넣었다.
 * ⛔ 파일이 없는 시·도는 **조용히 건너뛰지 않고 세어서 알린다.** 적재를 반쯤 하고 지나가면
 *    화면에서 그 시·도만 텅 비는데 아무도 그 까닭을 모른다(CLAUDE.md §11-1).
 */
{
  const RULED = new Set(['경기', '인천']);
  const missing = [];
  for (const sido of SIDO_NAMES) {
    if (RULED.has(sido)) continue;
    const rel = `data/derived/schools-${sido}-초등.json`;
    if (!fs.existsSync(path.join(ROOT, rel))) { missing.push(sido); continue; }
    const doc = read(rel);
    for (const r of doc.rows) {
      rows.push({
        sido, level: '초등', office: r.office, city: r.city,
        area: null, area_grade: null,
        school_name: r.shortName, official_name: r.name,
        std_code: r.code, lat: r.lat, lng: r.lng, teachers: r.teachers,
        teachers_f: r.teachersF ?? null, teachers_m: r.teachersM ?? null, teachers_t: r.teachersT ?? null,
        homepage: web(r.homepage),
        students: r.students ?? null, students_grade: r.byGrade ?? null,
        stat_year: r.statYear ?? null, classes: r.classes ?? null,
        branches: [], opens_year: null, source: doc.meta.원자료,
      });
    }
  }
  if (missing.length) console.log(`  ⚠️ 학교 목록이 아직 없는 시·도 ${missing.length} — ${missing.join(' · ')} (npm run schools:all)`);
}

// ── 좌표가 빈 학교를 채운다 — 나이스 도로명주소를 지오코딩한 결과(scripts/geocode-missing.mjs) ──
// 학교알리미 공시에 안 잡히는 학교가 있다(2026년 개교라 공시 전이거나, 오래됐는데 목록에서 빠졌거나).
// ⛔ 이미 있는 좌표는 안 건드린다. ⛔ 파일이 없으면 그냥 지나간다 — 키 없이도 이 스크립트가 돌아야 한다.
{
  const p = path.join(ROOT, `data/derived/geocoded-${YEAR}.json`);
  if (fs.existsSync(p)) {
    const g = read(`data/derived/geocoded-${YEAR}.json`).schools ?? {};
    let n = 0;
    for (const r of rows) {
      if (r.lat != null || r.lng != null || !r.std_code) continue;
      const hit = g[r.std_code];
      if (!hit) continue;
      r.lat = hit.lat;
      r.lng = hit.lng;
      n++;
    }
    console.log(`  좌표를 주소로 채운 학교 ${n}`);
  }
}

// 같은 칸에 같은 이름이 둘이면 넣기 전에 걸린다 — 조용히 지우지 않고 세어서 알린다
const seen = new Map();
const dupes = [];
for (const r of rows) {
  const k = `${r.sido}|${r.level}|${r.city ?? ''}|${r.school_name}`;
  if (seen.has(k)) dupes.push(k);
  else seen.set(k, r);
}
const unique = [...seen.values()];

const CHUNK = 400;
const chunks = [];
for (let i = 0; i < unique.length; i += CHUNK) chunks.push(unique.slice(i, i + CHUNK));

const cols =
  'sido, school_year, level, office, city, area, area_grade, school_name, official_name, std_code, lat, lng, teachers, teachers_f, teachers_m, teachers_t, homepage, students, students_grade, stat_year, classes, branches, closed, opens_year, source';
const tuple = (r) =>
  `(${q(r.sido)},${YEAR},${q(r.level)},${q(r.office)},${q(r.city)},${q(r.area)},${q(r.area_grade)},` +
  `${q(r.school_name)},${q(r.official_name)},${q(r.std_code)},${num(r.lat)},${num(r.lng)},${num(r.teachers)},` +
  `${num(r.teachers_f)},${num(r.teachers_m)},${num(r.teachers_t)},${q(r.homepage)},` +
  `${num(r.students)},${nums(r.students_grade)},${num(r.stat_year)},${num(r.classes)},` +
  `${qArr(r.branches)},false,${num(r.opens_year)},${q(r.source)})`;

const sql = `-- ${YEAR}학년도 학교 마스터 — scripts/load-personnel-areas.mjs 가 만든 것
-- 인사구역(교육청 고시) + 표준학교코드(나이스) + 좌표·교원수(학교알리미)
-- 대상 = 전국 17개 시·도 **공립 초등**. 인사구역은 고시 원문을 읽은 경기·인천만 채워져 있고
-- 나머지 15개 시·도는 null 이다(화면이 「인사구역 준비 중」으로 낸다).
-- 영양교사·보건교사는 담지 않는다(CLAUDE.md §7).
-- 여러 번 돌려도 같도록 그 학년도치를 지우고 다시 넣는다.

delete from public.personnel_areas where school_year = ${YEAR};

${chunks.map((part) => `insert into public.personnel_areas\n  (${cols})\nvalues\n  ${part.map(tuple).join(',\n  ')};`).join('\n\n')}
`;

const ts = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
const OUT = path.join(ROOT, `supabase/migrations/${ts}_seed_areas_${YEAR}.sql`);
fs.writeFileSync(OUT, sql, 'utf8');

const by = (f) => unique.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {});
console.log(`${YEAR}학년도 학교 마스터 ${unique.length}교`, by((r) => r.sido));
console.log(`  좌표 ${unique.filter((r) => r.lat != null).length} · 교원수 ${unique.filter((r) => r.teachers != null).length} · 표준학교코드 ${unique.filter((r) => r.std_code).length}`);
const per = unique.filter((r) => r.students && r.classes);
console.log(`  학생수 ${unique.filter((r) => r.students).length} · 학급수 ${unique.filter((r) => r.classes).length} · 학급당 학생수를 낼 수 있는 곳 ${per.length}`);
{
  const withArea = unique.filter((r) => r.area);
  console.log(`  인사구역이 있는 학교 ${withArea.length} · 없는 학교 ${unique.length - withArea.length}`);
  console.log(`  구역별`, withArea.reduce((m, r) => ((m[`${r.sido} ${r.area}${r.area_grade ?? ''}`] = (m[`${r.sido} ${r.area}${r.area_grade ?? ''}`] ?? 0) + 1), m), {}));
}
const soon = unique.filter((r) => r.opens_year);
if (soon.length) console.log(`  개교 예정 ${soon.length}교 — ${soon.map((r) => `${r.city} ${r.school_name}(${r.area})`).join(' · ')}`);
if (dupes.length) console.log(`⚠️ 같은 칸에 이름이 겹친 것 ${dupes.length}건: ${dupes.slice(0, 5).join(' / ')}`);
console.log(`→ ${path.relative(ROOT, OUT)} (${(Buffer.byteLength(sql) / 1024).toFixed(0)}KB · ${chunks.length}덩이)`);
