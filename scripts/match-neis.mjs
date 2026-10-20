#!/usr/bin/env node
/**
 * 인사구역 표의 학교와 나이스 학교를 잇는다.  node scripts/match-neis.mjs 경기 2027
 *
 * 왜 필요한가 — 인사관리기준 표에는 줄임말만 있다("수원중촌"). 표준학교코드를 붙이려면
 * 나이스의 정식 이름("수원중촌초등학교")과 맞춰야 한다.
 *
 * 맞추는 키 = 교육지원청 + 이름. 시·군이 다르면 같은 이름이 있다(포천 중리 · 이천 중리).
 *
 * ⛔ 못 맞춘 것을 조용히 버리지 않는다(CLAUDE.md §11-1). 양쪽 모두 목록으로 낸다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIDO = process.argv[2] ?? '경기';
const YEAR = process.argv[3] ?? '2027';

const areasFile = path.join(ROOT, `data/derived/gyeonggi-${YEAR}-personnel-areas.json`);
const neisFile = path.join(ROOT, `data/derived/neis-${SIDO}-초등.json`);
for (const f of [areasFile, neisFile]) {
  if (!fs.existsSync(f)) {
    console.error(`${path.relative(ROOT, f)} 가 없다.`);
    process.exit(1);
  }
}

const areas = JSON.parse(fs.readFileSync(areasFile, 'utf8'));
const neis = JSON.parse(fs.readFileSync(neisFile, 'utf8'));

/**
 * 학교알리미 공시자료(좌표·교원수)를 곁들인다. 없으면 없는 대로 간다 — 인사구역 매칭이 본체다.
 * ⭐ 교원수가 TO 추정의 뿌리다(경기 제11조 ① — 동일교 재직교사의 1/2 초과 내신 금지).
 * 잇는 키는 **정식 이름 + 교육지원청**이다. 학교알리미 학교코드(S0900…)는 나이스 표준학교코드와
 * 체계가 달라 코드로 못 잇는다. 그리고 ⛔ 이름만으로는 안 된다 — 경기 안에 같은 이름이 여럿이다
 * (수원 원일초 · 안산 원일초 · 부천 상원초 · 성남 상원초 …). 14곳이 그래서 안 붙었다.
 */
const infoFile = path.join(ROOT, `data/derived/schoolinfo-${SIDO}-초등.json`);
/** 학급수. 나이스 classInfo 에서 왔고 **표준학교코드로 곧장 붙는다**(이름 대조가 필요 없다). */
const classFile = path.join(ROOT, `data/derived/classes-${SIDO}-초등.json`);
const classBy = fs.existsSync(classFile)
  ? new Map(JSON.parse(fs.readFileSync(classFile, 'utf8')).rows.filter((r) => r.classes > 0).map((r) => [r.code, r.classes]))
  : new Map();
const info = fs.existsSync(infoFile) ? JSON.parse(fs.readFileSync(infoFile, 'utf8')).rows : [];
const infoKey = (name, office) => `${name}|${office ?? ''}`;

/**
 * 학교알리미 색인. 같은 지원청에 같은 이름이 둘 이상 올 수 있다.
 *
 * ⛔ 그 중 하나는 **폐교로 표시된 옛 기록**인 경우가 많다(고양 지축초 — 옛 기록은 교원수가 비고,
 *    지금 학교는 교원수 88명·좌표가 있다). 폐교 쪽을 먼저 걷어내면 답이 하나로 정해진다.
 *    그러고도 둘이 남으면 조용히 아무거나 고르지 않는다.
 */
const infoGroups = new Map();
for (const r of info) {
  const k = infoKey(r.name, r.office);
  if (!infoGroups.has(k)) infoGroups.set(k, []);
  infoGroups.get(k).push(r);
}
const infoBy = new Map();
const infoDupes = [];
for (const [k, rows] of infoGroups) {
  if (rows.length === 1) {
    infoBy.set(k, rows[0]);
    continue;
  }
  const open = rows.filter((r) => !r.closed);
  infoBy.set(k, open.length === 1 ? open[0] : null);
  infoDupes.push({ key: k, 전체: rows.length, 폐교아님: open.length, 정해짐: open.length === 1 });
}

/** "경기도수원교육지원청" → "수원" · "경기도광주하남교육지원청" → "광주하남" */
const office = (s) => (s ?? '').replace(/^(경기도|인천광역시)/, '').replace(/교육지원청$/, '').trim();

/**
 * 나이스는 학교 상태를 **이름에 적어** 온다. 따로 필드가 없다.
 *   "전곡초등학교적동분교장(폐교)" · "진접1초(202803신설예정)"
 */
const closedTag = (n) => /\(폐교\)/.test(n);
const soonTag = (n) => /신설예정/.test(n);
const branchTag = (n) => /분교장/.test(n.replace(/\(폐교\)/, ''));

/** 이름을 맞대기 좋게 다듬는다. "수원중촌초등학교"→"수원중촌" · "군서미래국제학교(초)"→"군서미래국제학교" */
const canon = (n) =>
  (n ?? '')
    .replace(/\(폐교\)/, '')
    .replace(/\(초\)$/, '')
    .replace(/초등학교$/, '')
    .trim();

const neisAll = neis.rows.map((r) => ({ ...r, officeShort: office(r.office) }));
const live = neisAll.filter((r) => !closedTag(r.name) && !soonTag(r.name));
const mainPublic = live.filter((r) => r.founded === '공립' && !branchTag(r.name));

/** 인사구역 표에서 살아 있는 초등학교 · 표가 폐·휴교로 표시한 학교 */
const tableRows = areas.rows.filter((r) => r.table === 1 && r.school && !r.closed);
const tableClosed = new Set(
  areas.rows.filter((r) => r.table === 1 && r.school && r.closed).map((r) => `${r.office}|${r.school}`)
);
/** 별표4 가 알려 주는 당해 학년도 신설교 — 아직 개교 전이라 나이스에 없는 게 정상이다 */
const openingSoon = new Set(
  (areas.newSchools ?? []).filter((n) => n.year === +YEAR).map((n) => `${n.office}|${n.name}`)
);

// 나이스 쪽 색인 — 같은 지원청 안에서 이름으로 찾는다
const index = new Map();
for (const r of mainPublic) {
  const key = `${r.officeShort}|${canon(r.name)}`;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(r);
}

const matched = [];
const notInNeis = [];
const usedCodes = new Set();

for (const t of tableRows) {
  const key = `${t.office}|${t.school}`;
  const hit = index.get(key);
  if (!hit) {
    // ⛔ 왜 빠졌는지를 문자열로만 남기지 않는다. 뒤에서 이 줄을 골라 쓸 곳이 있어서,
    //    문장을 다시 읽어 판단하게 하면 문구를 고치는 순간 조용히 어긋난다.
    const soon = openingSoon.has(key);
    notInNeis.push({ ...t, opensSoon: soon, why: soon ? '아직 개교 전 (별표4 신설교)' : '나이스에서 못 찾음' });
    continue;
  }
  if (hit.length > 1) {
    // 같은 지원청에 같은 이름이 둘이면 손으로 봐야 한다 — 조용히 하나를 고르지 않는다
    notInNeis.push({ ...t, why: `나이스에 같은 이름이 ${hit.length}곳` });
    continue;
  }
  const gong = infoBy.get(infoKey(hit[0].name, hit[0].office)) ?? null;
  matched.push({
    ...t,
    stdCode: hit[0].code,
    neisName: hit[0].name,
    address: hit[0].address,
    // 학교 홈페이지 — 나이스가 준다(HMPG_ADRES). 없는 학교는 null (§12-137)
    homepage: hit[0].homepage ?? null,
    lat: gong?.lat ?? null,
    lng: gong?.lng ?? null,
    teachers: gong?.teachers ?? null,
    teachersF: gong?.teachersF ?? null,
    teachersM: gong?.teachersM ?? null,
    teachersT: gong?.teachersT ?? null,
    students: gong?.students ?? null,
    // 학년별 학생수 1~6학년. ⛔ 총계와 안 맞으면 원자료 단계에서 이미 null 이다(§12-138)
    byGrade: gong?.byGrade ?? null,
    // 이 학교 숫자가 몇 년 공시인가. 작년 것으로 되돌아갔으면 화면이 별표로 알린다(§12-142)
    statYear: gong?.statYear ?? null,
    classes: classBy.get(hit[0].code) ?? null,
  });
  usedCodes.add(hit[0].code);
}

const notInTable = mainPublic
  .filter((r) => !usedCodes.has(r.code))
  .map((r) => ({
    office: r.officeShort,
    name: r.name,
    code: r.code,
    address: r.address,
    why: tableClosed.has(`${r.officeShort}|${canon(r.name)}`)
      ? `${YEAR}학년도에 폐·휴교 (표에 밑줄)`
      : '표에서 못 찾음',
  }));

const 설명된것 = (list) => list.filter((x) => !/못 찾음/.test(x.why)).length;

console.log(`[${SIDO} ${YEAR}] 인사구역 표 ↔ 나이스`);
if (infoDupes.length) {
  const fixed = infoDupes.filter((d) => d.정해짐);
  console.log(`  학교알리미에 이름이 겹친 ${infoDupes.length}곳 — 폐교 기록을 걷어 ${fixed.length}곳이 정해졌다`);
  for (const d of infoDupes) console.log(`    · ${d.key} (${d.전체}건 중 폐교아님 ${d.폐교아님}) ${d.정해짐 ? '→ 붙임' : '→ 못 정함'}`);
}
console.log(`  나이스 ${neisAll.length}교 — 폐교 ${neisAll.filter((r) => closedTag(r.name)).length} · 신설예정 ${neisAll.filter((r) => soonTag(r.name)).length} · 분교장 ${live.filter((r) => branchTag(r.name)).length} · 사립 ${live.filter((r) => r.founded !== '공립').length}`);
console.log(`    → 공립 본교 ${mainPublic.length}교`);
console.log(`  인사구역 표 ${tableRows.length}교 (폐·휴교로 뺀 것 ${tableClosed.size})`);
console.log(`\n  ⭐ 이어진 것 ${matched.length}교 (${((matched.length / tableRows.length) * 100).toFixed(1)}%)`);
const noInfo = [];
if (info.length) {
  const withXY = matched.filter((m) => m.lat != null).length;
  const withT = matched.filter((m) => m.teachers != null).length;
  const withS = matched.filter((m) => m.students != null).length;
  const withC = matched.filter((m) => m.classes != null).length;
  const per = matched.filter((m) => m.students != null && m.classes > 0);
  console.log(`  학생수 ${withS}교 · 학급수 ${withC}교 · 학급당 학생수를 낼 수 있는 곳 ${per.length}교`);
  if (per.length) {
    const v = per.map((m) => m.students / m.classes).sort((a, b) => a - b);
    console.log(`    학급당 학생수 — 가장 적은 곳 ${v[0].toFixed(1)} · 가운데 ${v[Math.floor(v.length / 2)].toFixed(1)} · 가장 많은 곳 ${v[v.length - 1].toFixed(1)}`);
  }
  console.log(`  학교알리미 곁들임 — 좌표 ${withXY}교 · 교원수 ${withT}교`);
  // ⛔ 안 붙은 것을 세기만 하고 넘기지 않는다. 왜인지 적어 둔다.
  const infoNames = new Set(info.map((r) => r.name));
  for (const m of matched) {
    if (m.lat != null && m.teachers != null) continue;
    const 있나 = infoNames.has(m.neisName);
    noInfo.push({
      city: m.city, school: m.neisName,
      why: !있나 ? '학교알리미에 그 이름이 없다 (새로 여는 학교이거나 이름이 다르다)'
        : m.lat == null && m.teachers == null ? '학교알리미에 있지만 좌표도 교원수도 비어 있다 (새로 여는 학교)'
        : m.lat == null ? '좌표만 비어 있다' : '교원수만 비어 있다',
    });
  }
  if (noInfo.length) {
    console.log(`\n  공시자료가 안 붙은 ${noInfo.length}곳:`);
    for (const n of noInfo) console.log(`    · ${n.city} ${n.school} — ${n.why}`);
  }
}

const show = (title, list) => {
  if (!list.length) return;
  console.log(`\n${title} ${list.length}곳 — 설명된 것 ${설명된것(list)}`);
  for (const x of list) console.log(`  · ${x.office} ${x.city ?? ''} ${x.school ?? x.name} — ${x.why}`);
};
show('표에만 있는 것', notInNeis);
show('나이스에만 있는 것', notInTable);

const 남은수수께끼 = [...notInNeis, ...notInTable].filter((x) => /못 찾음/.test(x.why)).length;
console.log(`\n설명 안 되는 자리 ${남은수수께끼}곳`);

const OUT = path.join(ROOT, `data/derived/match-${SIDO}-${YEAR}.json`);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      meta: { 시도: SIDO, 학년도: +YEAR, 생성: 'scripts/match-neis.mjs', 맞춘키: '교육지원청 + 이름' },
      counts: { neis: neisAll.length, neisMainPublic: mainPublic.length, table: tableRows.length, matched: matched.length, 남은수수께끼 },
      matched,
      notInNeis,
      notInTable,
      noInfo,
    },
    null,
    2
  ) + '\n'
);
console.log(`\n→ ${path.relative(ROOT, OUT)}`);
if (남은수수께끼) process.exit(1);
