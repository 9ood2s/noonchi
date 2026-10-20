#!/usr/bin/env node
/**
 * 인사구역 고시가 **없는** 시·도의 학교 목록을 만든다.  node scripts/build-schools.mjs 서울
 *
 * 왜 — 사장님(2026-08-23) 「일단 다른 모든 지역 학교들도 api에서 받아올 수 있는 데이터들은
 * 우리 레이아웃에 맞춰서 때려넣자. 그뒤에 사람들에게 제보를 받거나 문서를 받아서
 * 단계적으로 채워나가고 공지를 띄우는 방식으로 운영하면 될 것 같음.」
 *
 * ⛔ **인사구역(area)은 안 만든다.** 그 값은 교육청 고시 원문을 읽어야 나온다.
 *    경기는 `scripts/match-neis.mjs`, 인천은 `scripts/assign-incheon-areas.mjs` 가 원문을 읽어 붙인다.
 *    나머지 15개 시·도는 원문이 없다 — **null 로 두고 화면이 「인사구역 준비 중」이라고 낸다.**
 *    짐작으로 채우면 화면이 확신을 갖고 틀린 말을 한다(docs/postmortems.md).
 *
 * 무엇을 합치나 — 셋이다.
 *   나이스 schoolInfo   표준학교코드 · 정식 이름 · 관할 교육지원청 · 도로명주소 · 홈페이지 · 설립구분
 *   학교알리미 apiType 0/10/22  좌표 · 학생수(학년별) · 교원수(남녀) · 공시연도
 *   나이스 classInfo     학급수
 *
 * ⛔ **둘을 잇는 열쇠가 없다.** 학교알리미 `SCHUL_CODE`(S090000881)와 나이스 표준학교코드(7652009)는
 *    아예 다른 코드 체계다 — 경기 1,390교 중 겹치는 코드가 **0개**다(2026-08-23 재 봤다).
 *    그래서 **이름으로 잇되, 하나로 좁혀지지 않으면 잇지 않는다**(§아래 `join`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { requireSido } from '../lib/sido.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIDO = process.argv[2] ?? '서울';
const sido = requireSido(SIDO);

const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const maybe = (p) => (fs.existsSync(path.join(ROOT, p)) ? read(p) : null);

const neis = read(`data/derived/neis-${SIDO}-초등.json`).rows;
const info = maybe(`data/derived/schoolinfo-${SIDO}-초등.json`);
const cls = maybe(`data/derived/classes-${SIDO}-초등.json`);
if (!info) console.log(`  ⚠️ schoolinfo-${SIDO}-초등.json 이 없다 — 좌표·학생수·교원수 없이 만든다`);
if (!cls) console.log(`  ⚠️ classes-${SIDO}-초등.json 이 없다 — 학급수 없이 만든다`);

/** 학급수는 표준학교코드로 곧장 붙는다. 나이스끼리라 이을 걱정이 없다. */
const classBy = new Map((cls?.rows ?? []).filter((r) => r.classes > 0).map((r) => [r.code, r.classes]));

/**
 * 교육지원청 이름을 짧게. 「서울특별시강서양천교육지원청」 → 「강서양천」.
 *
 * ⛔ 앞머리를 **한 가지로 못 박지 않는다.** 실제로 오는 꼴이 다섯 가지다(2026-08-23 재 봤다) —
 *      서울특별시강서양천교육지원청 · 창원교육지원청(앞머리 없음)
 *      세종특별자치시교육청 · 충청남도교육청  ← **지원청이 아니라 본청 직속이다**
 *      전남광주통합특별시광주동부교육지원청  ← 광주·전남이 통합돼 앞머리가 바뀌었다
 *      마산교육청(폐지) · 창원교육청(폐지) · 진해교육청(폐지)  ← **없어진 지원청이 그대로 남아 있다**
 *
 * ⛔ **본청 직속은 「교육청」으로 끝나게 둔다**(세종교육청 · 충남교육청). 화면이 그것을 보고
 *    「교육지원청」을 안 붙인다(`lib/site.ts` 의 `officeTitle`). 세종은 실제로 교육지원청이 없다.
 */
const PREFIXES = [
  '전남광주통합특별시', // ⛔ 광주·전남이 함께 쓰는 앞머리. 시·도 이름과 안 맞아 따로 적는다
  sido.full,
];
function shortOffice(raw) {
  let s = (raw ?? '').trim();
  for (const p of PREFIXES) if (s.startsWith(p)) { s = s.slice(p.length); break; }
  if (s.endsWith('교육지원청')) return s.slice(0, -'교육지원청'.length).trim() || SIDO;
  // 본청 직속(세종특별자치시교육청 · 충청남도교육청) — 「○○교육청」으로 남긴다
  if (s.endsWith('교육청')) return `${SIDO}교육청`;
  return s || SIDO;
}

/**
 * **없어진 교육지원청을 지금 지원청으로 옮긴다.**
 *
 * ⛔ 나이스가 **폐지된 지원청 이름을 그대로 주는 학교가 있다.** 경남 64교가
 *    「마산교육청(폐지)」·「창원교육청(폐지)」·「진해교육청(폐지)」로 온다 — 2010년 창원시 통합으로
 *    없어진 이름이다. 그대로 실으면 **없는 지원청 화면 세 장**이 만들어지고, 정작 창원교육지원청
 *    목록에서는 그 64교가 빠진다.
 * ⛔ **이름을 손으로 매기지 않는다.** 「마산은 창원이다」를 코드에 박으면 다음 개편 때 또 틀린다.
 *    같은 **시·군에 있는 다른 학교들이 실제로 어느 지원청에 속해 있는지**를 세어 가장 많은 곳으로 옮긴다.
 *    근거가 데이터 안에 있고, 옮긴 것은 아래에서 세어서 알린다.
 * ⛔ 같은 시·군에 멀쩡한 지원청이 하나도 없으면 **안 옮긴다.** 짐작으로 옮기느니 그대로 두고 알린다.
 */
const moved = [];
function fixDeadOffices(list) {
  const dead = (o) => /폐지/.test(o);
  const byCity = new Map();
  for (const r of list) {
    if (!r.city || dead(r.office)) continue;
    if (!byCity.has(r.city)) byCity.set(r.city, new Map());
    const m = byCity.get(r.city);
    m.set(r.office, (m.get(r.office) ?? 0) + 1);
  }
  for (const r of list) {
    if (!dead(r.office)) continue;
    const m = r.city ? byCity.get(r.city) : null;
    if (!m || !m.size) { moved.push({ name: r.name, from: r.office, to: null }); continue; }
    const [to] = [...m].sort((a, b) => b[1] - a[1])[0];
    moved.push({ name: r.name, from: r.office, to });
    r.office = to;
  }
}

/**
 * 학교 이름을 짧게. 「서울가곡초등학교」 → 「서울가곡」 · 「영종초등학교금산분교장」 → 「영종금산분교장」.
 * ⛔ 앞머리는 안 지운다. 「서울」을 떼면 전국에서 같은 이름이 무더기로 겹친다.
 */
const shortName = (s) => (s ?? '').replace(/초등학교(.*)$/, '$1').trim() || s;

/**
 * 도로명주소에서 시·군·구. 시·도 이름 다음 칸이다.
 * ⛔ 「경상남도 창원시 마산회원구」처럼 시 아래 구가 또 있으면 **시**를 쓴다 —
 *    전보가 도는 단위에 가깝고, 경기(수원·성남)와 결이 맞는다.
 * ⛔ 세종은 시·군·구가 없다. 둘째 칸이 도로명(「세종로」)이라 그대로 쓰면 엉뚱한 값이 된다.
 *    시·군·구로 끝나는 말이 아니면 null 이다.
 */
function cityOf(address) {
  const t = (address ?? '').trim().split(/\s+/);
  const one = t[1];
  if (!one || !/[시군구]$/.test(one)) return null;
  return one;
}

/**
 * 나이스 학교 한 줄에 학교알리미 한 줄을 잇는다.
 *
 * ⛔ **이름이 하나로 좁혀질 때만 잇는다.** 못 좁히면 **아무것도 안 붙이고 세어서 알린다.**
 *    엉뚱한 학교의 좌표·학생수를 붙이는 것보다 비어 있는 편이 낫다 —
 *    빈 좌표는 안 찍힐 뿐이지만 틀린 좌표는 화면이 하는 거짓말이다(2026-08-23 · 갈현초 사고).
 * ⛔ 교육지원청 이름으로는 못 좁힌다 — **두 API 가 다르게 부른다.**
 *    광주 각화초는 나이스가 「전남광주통합특별시광주동부교육지원청」, 학교알리미가
 *    「광주광역시동부교육지원청」이라고 한다. 그래서 **주소의 시·군·구**로 좁힌다.
 */
const byName = new Map();
for (const r of info?.rows ?? []) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r);
}

const unmatched = [];
const ambiguous = [];
function join(n) {
  const cands = byName.get(n.name) ?? [];
  if (!cands.length) { unmatched.push(n.name); return null; }
  if (cands.length === 1) return cands[0];
  const city = cityOf(n.address);
  const narrowed = cands.filter((c) => cityOf(c.address) === city);
  if (narrowed.length === 1) return narrowed[0];
  ambiguous.push({ name: n.name, city, 후보: cands.length });
  return null;
}

/**
 * ⛔ **공립만 담는다.** 이 표는 인사구역 표다 — 교사가 전보로 갈 수 있는 자리를 담는다.
 *    사립·국립(교육대 부설)은 시·도 전보 대상이 아니다. 인천도 같은 규칙으로 사립을 뺐다.
 * ⛔ **「(가칭)」 학교는 뺀다.** 아직 문을 안 열었고, **언제 여는지 우리가 모른다.**
 *    경기는 고시문 [별표4]가 개교 학년도를 알려 줘서 `opens_year` 에 담을 수 있지만
 *    여기는 근거가 없다. 「2027년 개교」라고 적으면 그건 우리가 지어낸 값이다.
 * ⛔ 이름에 「폐교」·「휴교」가 박힌 줄도 뺀다 — 나이스는 폐교를 따로 안 알려 주고 이름에 적어 온다.
 */
const skipped = { 사립: 0, 국립: 0, 가칭: 0, 폐교: 0 };
const rows = [];
for (const n of neis) {
  if (n.founded !== '공립') { skipped[n.founded] = (skipped[n.founded] ?? 0) + 1; continue; }
  if (/가칭/.test(n.name)) { skipped.가칭++; continue; }
  if (/폐교|휴교/.test(n.name)) { skipped.폐교++; continue; }

  const g = join(n);
  rows.push({
    code: n.code,
    name: n.name,
    shortName: shortName(n.name),
    office: shortOffice(n.office),
    city: cityOf(n.address),
    address: n.address,
    homepage: n.homepage ?? null,
    founded: n.founded,
    branch: /분교장/.test(n.name),
    // 아래는 학교알리미에서 온다. 못 이었으면 전부 null 이다 — 「모른다」가 사실이다
    lat: g?.lat ?? null,
    lng: g?.lng ?? null,
    teachers: g?.teachers ?? null,
    teachersF: g?.teachersF ?? null,
    teachersM: g?.teachersM ?? null,
    teachersT: g?.teachersT ?? null,
    students: g?.students ?? null,
    byGrade: g?.byGrade ?? null,
    statYear: g?.statYear ?? null,
    classes: classBy.get(n.code) ?? null,
  });
}

// ⛔ 없어진 지원청을 지금 지원청으로 옮긴다. 옮긴 것은 아래에서 센다
fixDeadOffices(rows);

const n = (f) => rows.filter(f).length;
console.log(`[${SIDO}] 공립 초등 ${rows.length}교`);
console.log(`  건너뛴 것 ${JSON.stringify(skipped)}`);
console.log(
  `  좌표 ${n((r) => r.lat != null)} · 교원수 ${n((r) => r.teachers != null)} · 학생수 ${n((r) => r.students != null)} · 학급수 ${n((r) => r.classes != null)} · 홈페이지 ${n((r) => r.homepage)}`,
);
console.log(`  시·군·구 ${new Set(rows.map((r) => r.city).filter(Boolean)).size}개 · 교육지원청 ${new Set(rows.map((r) => r.office)).size}개`);

// ⛔ 못 이은 것을 조용히 넘기지 않는다. 몇 곳인지 세어서 적고, 이름을 남긴다.
if (moved.length) {
  const ok = moved.filter((m) => m.to);
  const no = moved.filter((m) => !m.to);
  const what = [...new Set(ok.map((m) => `${m.from} → ${m.to}`))];
  if (ok.length) console.log(`  없어진 지원청을 옮긴 학교 ${ok.length} — ${what.join(' · ')}`);
  if (no.length) console.log(`  ⚠️ 없어진 지원청인데 옮길 곳을 못 찾은 학교 ${no.length} — ${no.slice(0, 5).map((m) => `${m.name}(${m.from})`).join(' · ')}`);
}
if (unmatched.length) console.log(`  ⚠️ 학교알리미에 이름이 없어 못 이은 곳 ${unmatched.length} — ${unmatched.slice(0, 6).join(' · ')}`);
if (ambiguous.length) console.log(`  ⚠️ 같은 이름이 여럿이라 못 좁힌 곳 ${ambiguous.length} — ${ambiguous.slice(0, 6).map((a) => `${a.name}(${a.city ?? '시군구모름'}·후보${a.후보})`).join(' · ')}`);

// 같은 시·군·구에 짧은 이름이 겹치면 화면에서 구분이 안 된다. 세어서 알린다(적재에서 다시 걸린다)
const seen = new Set();
const dupes = [];
for (const r of rows) {
  const k = `${r.city ?? ''}|${r.shortName}`;
  if (seen.has(k)) dupes.push(k);
  seen.add(k);
}
if (dupes.length) console.log(`  ⚠️ 같은 시·군·구에 짧은 이름이 겹치는 곳 ${dupes.length} — ${dupes.slice(0, 6).join(' · ')}`);

const OUT = path.join(ROOT, `data/derived/schools-${SIDO}-초등.json`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      meta: {
        시도: SIDO,
        받은날: new Date().toISOString().slice(0, 10),
        원자료: '나이스 개방포털 학교기본정보·학급정보 · 학교알리미 공시자료(기본·학생·교원)',
        인사구역: '없음 — 교육청 고시 원문을 아직 안 읽었다',
        건너뛴것: skipped,
        못이은곳: unmatched.length,
        못좁힌곳: ambiguous.length,
      },
      rows,
    },
    null,
    2,
  ) + '\n',
);
console.log(`→ ${path.relative(ROOT, OUT)}`);
