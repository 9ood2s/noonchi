/**
 * 시·도교육청 열일곱 곳의 좌표를 받아 둔다.  node scripts/geocode-sido-offices.mjs
 *
 * 사장님(2026-08-23) — 「시도 중심이 아닌데. **경기는 수원. 인천은 구월동. 서울은 서울시청**
 * 뭐 이게 되야지. 서울은 양주, 인천은 바다위, 세종은 천안, 경기는 이천 여주까지 가고」.
 *
 * ⛔ **내가 「학교들의 한가운데」로 잡았던 것이 틀렸다.** 한가운데는 교육청이 있는 자리가 아니고,
 *    거기서 겹침을 풀겠다고 또 밀어내니 서울이 양주로, 인천이 바다로 갔다. 두 번 틀린 셈이다.
 * ⛔ **좌표를 손으로 적지 않는다.** 지어낸 숫자는 검산할 길이 없다.
 *    각 교육청의 **공개된 도로명 주소**를 적고 지오코딩으로 좌표를 받는다 — 주소는 사람이 확인할 수 있다.
 * ⛔ 결과를 파일로 남긴다. 교육청은 이사하지 않는다 — 화면이 켜질 때마다 바깥을 부를 값이 아니다.
 *
 * ⚠️ 저장 약관은 학교 좌표와 같은 자리다(`DESIGN.md §12 열린 것` · `geocode-missing.mjs` 머리주석).
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadScriptEnv } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'data/derived/sido-offices.json');

loadScriptEnv(ROOT);
const KEY_ID = process.env.NCP_MAPS_KEY_ID;
const KEY = process.env.NCP_MAPS_KEY;
if (!KEY_ID || !KEY) {
  console.error('⛔ NCP_MAPS_KEY_ID · NCP_MAPS_KEY 환경변수가 없다. .env.local 또는 .env 에 직접 발급한 키를 설정한다.');
  process.exit(1);
}

/**
 * 시·도교육청 본청 주소 — 각 교육청이 공개한 도로명 주소다.
 * ⛔ 시·도 이름은 `lib/schools.ts` 의 `SOURCES`·`SIDO_NAMES` 와 **같은 표기**여야 한다.
 *    다르면 붙일 곳을 못 찾아 그 시·도만 말풍선이 안 뜬다.
 */
const OFFICES = [
  ['서울', '서울특별시 종로구 송월길 48'],
  ['부산', '부산광역시 부산진구 화지로 12'],
  ['대구', '대구광역시 수성구 수성로76길 11'],
  ['인천', '인천광역시 남동구 정각로 9'],
  ['광주', '광주광역시 서구 화운로 93'],
  ['대전', '대전광역시 서구 둔산로 89'],
  ['울산', '울산광역시 중구 함월15길 20'],
  ['세종', '세종특별자치시 한누리대로 2154'],
  ['경기', '경기도 수원시 장안구 조원로 18'],
  ['강원', '강원특별자치도 춘천시 영서로 2854'],
  ['충북', '충청북도 청주시 서원구 청남로 1929'],
  ['충남', '충청남도 홍성군 홍북읍 선화로 22'],
  ['전북', '전북특별자치도 전주시 완산구 홍산로 111'],
  ['전남', '전라남도 무안군 삼향읍 어진누리길 10'],
  ['경북', '경상북도 안동시 풍천면 도청대로 511'],
  // ⛔ **의창구가 아니라 성산구다.** 처음에 의창구로 적었더니 지오코딩이 0건을 냈다 —
  //    오류가 아니라 조용히 빈 배열이라, 이 스크립트가 세지 않았으면 경남만 말풍선이 안 떴다.
  ['경남', '경상남도 창원시 성산구 중앙대로 241'],
  ['제주', '제주특별자치도 제주시 문연로 5'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geocode(query) {
  const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { 'x-ncp-apigw-api-key-id': KEY_ID, 'x-ncp-apigw-api-key': KEY } });
  if (!r.ok) throw new Error(`지오코딩 실패 (서버 ${r.status})`);
  const j = await r.json();
  // ⛔ 빈 배열이 온다 — 오류가 아니라 조용히 없다. 그대로 넘기지 않는다
  const hit = j?.addresses?.[0];
  if (!hit) return null;
  return { lat: Number(hit.y), lng: Number(hit.x), matched: hit.roadAddress || hit.jibunAddress };
}

const out = {};
let missed = 0;
for (const [sido, addr] of OFFICES) {
  const hit = await geocode(addr);
  if (!hit) {
    missed += 1;
    console.log(`  ⚠️ ${sido} — 못 찾았다: ${addr}`);
    continue;
  }
  out[sido] = { addr, lat: Math.round(hit.lat * 1e5) / 1e5, lng: Math.round(hit.lng * 1e5) / 1e5 };
  console.log(`  ${sido.padEnd(3)} ${out[sido].lat.toFixed(5)}, ${out[sido].lng.toFixed(5)}  ${hit.matched}`);
  await sleep(120);
}

// ⛔ 하나라도 못 찾으면 그대로 두지 않는다 — 빠진 시·도는 말풍선이 안 뜬다
if (missed) {
  console.error(`\n⛔ ${missed}곳을 못 찾았다. 주소를 고치고 다시 돌린다.`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  JSON.stringify(
    {
      meta: {
        무엇: '시·도교육청 본청 좌표 — 지도에서 지역을 고르는 말풍선이 선다',
        출처: '네이버 클라우드 Geocoding (maps.apigw.ntruss.com/map-geocode/v2)',
        주소출처: '각 시·도교육청이 공개한 도로명 주소',
        받은날: new Date().toISOString().slice(0, 10),
        곳: Object.keys(out).length,
      },
      offices: out,
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
console.log(`\n${Object.keys(out).length}곳 → ${path.relative(ROOT, OUT)}`);
