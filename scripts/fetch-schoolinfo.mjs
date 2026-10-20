#!/usr/bin/env node
/**
 * 학교알리미 공시자료를 받는다.  node scripts/fetch-schoolinfo.mjs 경기
 *
 * 무엇을 받나
 *   apiType=0   학교기본정보 — **좌표(LTTUD·LGTUD)** · 교육지원청 · 분교/폐교 여부
 *   apiType=10  학생 현황   — STDNT_SUM(총 학생수) · **STDNT_SUM_21~26(학년별)**
 *                             ⭐ 21 이 1학년이고 26 이 6학년이다. 여섯을 더하면 STDNT_SUM 과 맞는다
 *                                (가평마장초 8+10+9+5+11+9 = 52 ✓ — 재 보고 확인했다)
 *                             ⛔ COL_2G1·COL_2G2 는 학년별 **전입·전출**이다. 학생수가 아니다
 *                             ⛔ 전입·전출(MVIN_SUM·MVT_SUM)은 **안 받는다**(2026-08-23 사장님
 *                                「의미없으니까 빼도 됨」). 한 해 것인지 누적인지도 원문에 없다.
 *   apiType=22  교원 현황   — COL_S(총) · COL_SW(여) · COL_SM(남) · COL_SR(기간제)
 *                             ⛔ COL_1·COL_2 는 교장·교감이다. **안 받는다** — 학교당 1명이라
 *                                성별까지 오면 개인을 가리킨다(CLAUDE.md §1, 2026-08-23 판단).
 *
 * ⛔ **교사 1인당 학생수는 만들지 않는다.** 그 분모의 '교원'에는 보건·영양·사서·상담처럼
 *    수업을 하지 않는 인원이 섞여 있어, 실제 학급 크기보다 훨씬 작게 나온다.
 *    실증 — 강화초는 학급당 19.0명인데 교사당으로 재면 10.0명이다. 교동초는 3.0 대 1.4다.
 *    담임이 맡는 것은 **학급**이므로 학급당 학생수(학생수 ÷ 학급수)를 쓴다.
 *    학급수는 나이스 classInfo 에서 온다(scripts/fetch-classes.mjs).
 *
 * ⭐ 교원수가 TO 추정의 뿌리다. 경기 제11조 ① — "동일교 재직교사의 2분의 1을 초과하여
 *    관내·외를 불문하고 전보 내신할 수 없다". 그 분모가 이 수다.
 *
 * ⛔ 걸리는 자리 둘
 *   1. 나이스와 같은 함정 — **인증키 없이 부르면 5건만 온다.** 오류가 안 나니 개수를 센다.
 *   2. sggCode 는 구(區) 단위다. 수원시(41110)는 없고 장안구(41111)만 있다.
 *      다만 **끝이 000 이면 시도 전체**가 온다(41000·28000). 그래서 한 번만 부르면 된다.
 *      ⛔ 세종은 예외다 — 36000 이 안 되고 36110 이라야 온다. 표는 lib/sido.mjs 에 있다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { requireSido } from '../lib/sido.mjs';
import { loadScriptEnv } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIDO = process.argv[2] ?? '경기';
/**
 * 학교알리미 `sidoCode`·`sggCode`. 표는 `lib/sido.mjs` 한 곳에 있다(§11-3).
 *
 * ⛔ **세종만 `sggCode` 가 다르다.** 다른 시·도는 끝이 `000` 이면 시·도 전체가 오는데
 *    세종은 `36000` 이 「해당 시도 및 시군구에 데이터가 존재하지 않습니다」로 실패하고
 *    `36110` 이라야 온다. 시·군·구가 없는 특별자치시라 그렇다(2026-08-23 불러 보고 확인).
 */
const { sido: SIDO_CODE, sgg: SGG_CODE } = requireSido(SIDO).alimi;

loadScriptEnv(ROOT);
const KEY = (process.env.SCHOOLINFO_API_KEY ?? '').trim();
if (!KEY) { console.error('SCHOOLINFO_API_KEY 환경변수가 비어 있다. .env.local 또는 .env 에 직접 발급한 키를 설정한다.'); process.exit(1); }

async function fetchType(apiType, year = YEAR) {
  const u = new URL('https://www.schoolinfo.go.kr/openApi.do');
  u.searchParams.set('apiKey', KEY);
  u.searchParams.set('apiType', String(apiType));
  u.searchParams.set('sidoCode', SIDO_CODE);
  u.searchParams.set('sggCode', SGG_CODE); // 끝이 000 이면 시도 전체. 세종만 36110 이다
  u.searchParams.set('schulKndCode', '02');         // 02 = 초등
  u.searchParams.set('pbanYr', String(year));
  const res = await fetch(u).catch((e) => { throw new Error(`학교알리미를 못 불렀다: ${e.message}`); });
  const body = await res.json().catch(() => null);
  if (!body || body.resultCode !== 'success') throw new Error(`apiType=${apiType} 실패: ${body?.resultMsg ?? res.status}`);
  return body.list ?? [];
}

/**
 * **공시 연도.** 학교알리미는 해마다 한 번 공시하고, `pbanYr` 이 그 해다.
 *
 * ⭐ **작년 것도 같이 받는다** (2026-08-23 사장님 — 「작년 정보는 있고 올해정보만 없는
 *    경우는 작년정보 띄워주고 주석으로 * 하나 달아서 2025년 공시를 알려주던가」).
 *    올해 공시에서 빠진 학교가 작년에는 있는 경우가 실제로 있다 — 경기에서 4곳이 그렇다
 *    (목동초명지분교장 · 이포초하호분교장 · 포천삼정초 · 화성장안초석포분교장).
 * ⛔ **한 해만 되돌아간다.** 두 해 전 값은 「지금 그 학교」와 너무 멀다.
 * ⛔ **섞지 않는다** — 학생수를 작년 것으로 쓰면 교원수도 같은 해 것으로 쓴다.
 *    한 표 안에서 줄마다 연도가 다르면 무엇을 견주는지 알 수 없게 된다.
 */
const YEAR = new Date().getFullYear();
const PREV = YEAR - 1;

const basic = await fetchType(0);
const staff = await fetchType(22);
const stud = await fetchType(10);
const staffPrev = await fetchType(22, PREV);
const studPrev = await fetchType(10, PREV);
console.log(`${SIDO} — 학교기본정보 ${basic.length}교 · 교원현황 ${staff.length}교 · 학생현황 ${stud.length}교`);
console.log(`  ${PREV} 공시도 받아 둔다 — 교원 ${staffPrev.length}교 · 학생 ${studPrev.length}교`);

// ⛔ 키가 없으면 5건만 온다. 두 응답이 다 5의 배수로 적게 오면 그것부터 의심한다.
if (basic.length <= 5 || staff.length <= 5 || stud.length <= 5) {
  console.error('받은 것이 너무 적다. 인증키가 안 먹었을 수 있다.');
  process.exit(1);
}

const staffBy = new Map(staff.map((r) => [r.SCHUL_CODE, r]));
const studBy = new Map(stud.map((r) => [r.SCHUL_CODE, r]));
const staffPrevBy = new Map(staffPrev.map((r) => [r.SCHUL_CODE, r]));
const studPrevBy = new Map(studPrev.map((r) => [r.SCHUL_CODE, r]));

/** 학생수가 있나 — 0 은 「없다」다(공시 전인 학교가 0 으로 온다) */
const hasStud = (r) => Number(r?.STDNT_SUM) > 0;

const rows = basic.map((b) => {
  /**
   * 올해 공시에 학생수가 없고 **작년에는 있으면 작년 것을 통째로** 쓴다.
   * ⛔ 통째로다 — 학생수만 작년 것으로 바꾸고 교원수는 올해 것으로 두면 한 학교 안에서
   *    두 해가 섞인다. 어느 줄이 어느 해인지 화면에서 가릴 방법이 없다.
   * ⛔ 작년에도 없으면 **되돌아가지 않는다.** 그때는 값이 없는 것이 사실이다.
   */
  const back = !hasStud(studBy.get(b.SCHUL_CODE)) && hasStud(studPrevBy.get(b.SCHUL_CODE));
  const s = back ? staffPrevBy.get(b.SCHUL_CODE) : staffBy.get(b.SCHUL_CODE);
  const u = back ? studPrevBy.get(b.SCHUL_CODE) : studBy.get(b.SCHUL_CODE);
  return {
    /** 이 줄의 숫자가 **몇 년 공시**인가. 화면이 별표로 알린다(§12-142) */
    statYear: back ? PREV : YEAR,
    code: b.SCHUL_CODE,                 // 학교알리미 학교코드 (나이스 표준학교코드와 다르다)
    name: b.SCHUL_NM,
    office: b.JU_ORG_NM,
    address: b.SCHUL_RDNMA,
    lat: b.LTTUD == null ? null : Number(b.LTTUD),
    lng: b.LGTUD == null ? null : Number(b.LGTUD),
    branch: b.BNHH_YN === 'Y',
    closed: b.CLOSE_YN === 'Y' || b.ABSCH_YN === 'Y',
    founded: b.FOND_SC_CODE,
    teachers: s ? Number(s.COL_S) : null,       // 총 교원수
    teachersF: s ? Number(s.COL_SW) : null,     // 그중 여교원
    teachersM: s ? Number(s.COL_SM) : null,     // 그중 남교원
    // 기간제. ⛔ 많다고 나쁜 학교가 아니다 — 휴직이 많다는 뜻일 수도 있다. 세어서 보여만 준다
    teachersT: s ? Number(s.COL_SR) : null,
    // ⛔ 교원수는 화면에 비교값으로 쓰지 않는다. 모의지원의 「재직교사 1/2」 분모로만 쓴다.
    // ⛔ 학생수 0 은 "학생이 없다"가 아니라 **아직 공시가 안 된 것**이다.
    //    2026년에 문을 연 학교 16곳이 0 으로 온다(위례해솔·의왕푸른·운정중앙 …). 나이스엔 학급이 이미 있다.
    //    0 을 그대로 쓰면 화면이 "학급당 0.0명"이라는 거짓말을 한다. 모르는 것은 null 로 둔다.
    students: Number(u?.STDNT_SUM) > 0 ? Number(u.STDNT_SUM) : null,
    /**
     * 학년별 학생수 1~6학년 (2026-08-23 사장님 — 「그 아래에 학년별 학생수도 넣어줘야함」).
     * ⛔ **총계와 같은 규칙이다** — 총계가 0(공시 전)이면 학년별도 안 쓴다. 0 을 그대로 실으면
     *    화면이 「1학년 0명」이라는 거짓말을 한다.
     * ⛔ 여섯을 더해 총계와 안 맞으면 **버린다.** 반만 맞는 표는 없느니만 못하다.
     */
    byGrade: (() => {
      const total = Number(u?.STDNT_SUM);
      if (!(total > 0)) return null;
      const g = [1, 2, 3, 4, 5, 6].map((i) => Number(u?.[`STDNT_SUM_2${i}`]));
      if (g.some((v) => !Number.isFinite(v) || v < 0)) return null;
      return g.reduce((a, b) => a + b, 0) === total ? g : null;
    })(),
  };
});

/**
 * ⛔ **검산 — 교원 총원은 남 + 여여야 한다.** 경기·인천 1,372교 전부 맞았다(2026-08-23).
 *    안 맞으면 우리가 칸을 잘못 읽은 것이므로 **모름으로 두고 어디가 그랬는지 적는다.**
 *
 * ⚠️ **전입·전출은 아예 안 받는다**(2026-08-23 사장님 「의미없으니까 빼도 됨」).
 *    처음엔 「전출이 학생수보다 많을 수 없다」고 검산을 걸었다가 **틀렸다** — 걸린 곳이
 *    신설교였다(고덕함박초 학생 463 · 전입 493. 새로 연 학교라 전원이 전입이다).
 *    ⛔ 짐작으로 「이상값」이라 부르지 않는다.
 */
const anomalies = [];
for (const r of rows) {
  if (r.teachers != null && r.teachersF != null && r.teachersM != null && r.teachers !== r.teachersF + r.teachersM) {
    anomalies.push({ name: r.name, teachers: r.teachers, f: r.teachersF, m: r.teachersM, 왜: '총 교원수가 남+여와 다르다' });
    r.teachersF = null;
    r.teachersM = null;
  }
}
/**
 * ⛔ **검산 — 남의 좌표를 받은 학교를 거른다** (2026-08-23 사장님 — 「과천 갈현초는 왜 갈현초로도
 *    있고 갑,을 두개다 있는거임?」 지도에 두 학교가 겹쳐 있었다).
 *
 *    학교알리미 원자료에 **이름이 짧은 학교가, 제 이름을 앞머리로 달고 있는 다른 학교의 좌표를
 *    그대로 받는** 오류가 있다. 경기 1,409교에서 여섯 곳이 걸렸다 —
 *      갈현초(파주 탄현면)가 과천갈현초 자리에 42.7km · 대원초(성남)가 파주대원초 자리에 44.3km
 *      이동초(포천)가 용인이동초 자리에 79.1km · 중리초(포천)가 이천중리초 자리에 73.1km
 *      경수초(안산)가 경일초 자리에 · 부발초백록분교장(이천)이 부발초 자리에
 * ⛔ **우리가 이름으로 붙이는 자리는 없다.** 위에서 보듯 학교코드(`SCHUL_CODE`)로만 붙이고
 *    좌표는 `LTTUD`·`LGTUD` 를 그대로 쓴다. **원자료가 그렇다** — 고칠 수 없으니 거르는 수밖에 없다.
 * ⛔ **모르는 것은 null 로 둔다.** 비워 두면 `geocode-missing.mjs` 가 나이스 도로명주소로 채운다.
 *    ⚠️ **어느 쪽이 틀렸는지 알 수 없으므로 양쪽 다 버린다.** 한쪽만 살리면 반은 틀린 채로 남는다.
 * ⛔ **시·도를 가리지 않는다.** 주소의 둘째 칸(시·군·구)만 보므로 전국 어디서나 그대로 돈다.
 */
/** 「경기도 파주시 탄현면 …」 의 둘째 칸. 인천은 「인천광역시 강화군 …」 이라 같은 자리다 */
const cityOf = (a) => (a ?? '').trim().split(/\s+/)[1] ?? null;
const drop = (r, why) => {
  anomalies.push({ name: r.name, address: r.address, lat: r.lat, lng: r.lng, 왜: why });
  r.lat = null;
  r.lng = null;
};

// ① 주소가 다른데 좌표가 같다 — 한쪽이 남의 자리에 서 있다.
//    ⛔ 주소까지 같으면 건드리지 않는다. 본교와 분교장이 한 자리인 경우가 실제로 있다.
{
  const same = new Map();
  for (const r of rows) {
    if (r.lat == null || r.lng == null) continue;
    const k = `${r.lat},${r.lng}`;
    same.set(k, [...(same.get(k) ?? []), r]);
  }
  for (const g of same.values()) {
    if (g.length < 2 || new Set(g.map((r) => r.address)).size < 2) continue;
    for (const r of g) drop(r, '주소가 다른데 좌표가 같다');
  }
}

/**
 * ② 제 주소의 시·군에서 너무 멀다. 같은 시·군 학교들의 좌표 한가운데(중앙값)와 견준다.
 *
 * ⛔ **이건 버리지 않는다. 세어서 적기만 한다.** 버리게 만들었다가 물렀다 —
 *    **섬 학교가 통째로 걸린다.** 옹진군은 백령·대청·연평이 흩어져 있어 한가운데서 140km 가
 *    넘고, 경기도 안산 풍도분교장(44.8km)·화성 제부분교장(31.3km)이 걸린다. 전부 제자리인데도.
 *    ①이 경기에서 진짜 오류 여섯 곳을 다 잡았고 ②가 더 잡은 것은 **하나도 없었다** —
 *    지우게 두면 멀쩡한 좌표만 날린다.
 * ⚠️ 그래도 남겨 둔다. ①은 **틀린 좌표가 둘이 겹쳤을 때만** 보인다. 한 곳만 엉뚱한 데로
 *    간 경우는 ①에 안 걸리고 이 줄에만 뜬다. 뜨면 사람이 주소를 보고 가린다.
 * ⛔ 평균이 아니라 중앙값이다 — 틀린 좌표 하나가 평균을 끌고 가면 검산이 그것에 맞춰진다.
 */
const farFromCity = [];
{
  const mid = (xs) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const by = new Map();
  for (const r of rows) {
    if (r.lat == null) continue;
    const c = cityOf(r.address);
    if (c) by.set(c, [...(by.get(c) ?? []), r]);
  }
  const center = new Map(
    [...by].filter(([, v]) => v.length >= 3).map(([c, v]) => [c, [mid(v.map((r) => r.lat)), mid(v.map((r) => r.lng))]]),
  );
  for (const r of rows) {
    if (r.lat == null) continue;
    const c = center.get(cityOf(r.address));
    if (!c) continue;
    const km = Math.hypot((r.lat - c[0]) * 111, (r.lng - c[1]) * 88);
    if (km > 25) farFromCity.push({ name: r.name, address: r.address, km: +km.toFixed(1) });
  }
}
if (farFromCity.length) {
  console.log(`\n  ⚠️ 제 시·군에서 25km 넘게 떨어진 곳 ${farFromCity.length}건 — **버리지 않았다.** 섬이면 맞는 값이다:`);
  for (const f of farFromCity) console.log(`    · ${f.name} ${f.km}km — ${f.address}`);
}

if (anomalies.length) {
  console.log(`\n  ⚠️ 앞뒤가 안 맞아 **모름으로 둔** 값 ${anomalies.length}건:`);
  for (const a of anomalies) console.log(`    · ${a.name} — ${a.왜} (${JSON.stringify(a)})`);
}

const noCoord = rows.filter((r) => r.lat == null || r.lng == null);
const noStaff = rows.filter((r) => r.teachers == null);
const noStud = rows.filter((r) => r.students == null);
console.log(`  좌표 없는 곳 ${noCoord.length} · 교원수 없는 곳 ${noStaff.length} · 학생수 없는 곳 ${noStud.length}`);
console.log(`  학생 합계 ${rows.reduce((a, r) => a + (r.students ?? 0), 0).toLocaleString()}명`);
if (noCoord.length) console.log('  좌표 없음:', noCoord.slice(0, 8).map((r) => r.name).join(', '));
if (noStaff.length) console.log('  교원수 없음:', noStaff.slice(0, 8).map((r) => r.name).join(', '));

const OUT = path.join(ROOT, `data/derived/schoolinfo-${SIDO}-초등.json`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ meta: { 시도: SIDO, 받은날: new Date().toISOString().slice(0, 10), 항목: { 0: '학교기본정보(좌표)', 10: '학생 현황', 22: '교원 현황' } }, anomalies, farFromCity, rows }, null, 2) + '\n');
console.log(`→ ${path.relative(ROOT, OUT)}`);
