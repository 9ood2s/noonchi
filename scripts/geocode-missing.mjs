#!/usr/bin/env node
/**
 * 좌표가 없는 학교에 좌표를 붙인다.  node scripts/geocode-missing.mjs 2027
 *
 * 학교알리미 공시에 안 잡히는 학교가 있다 — 2026년에 문을 연 곳(공시가 아직)과,
 * 오래됐는데 목록에서 빠진 곳(동탄초는 1923년 개교다). 나이스에는 **도로명주소가 다 있다.**
 * 그 주소를 네이버 클라우드 Geocoding 에 넣어 좌표를 얻는다.
 *
 * ⛔ 이미 있는 좌표를 덮지 않는다. 비어 있는 것만 채운다.
 * ⛔ 결과를 data/derived/ 에 남긴다 — 키 없이도 `areas:sql` 이 돌아야 하고,
 *    나중에 값이 이상하면 무엇을 받았는지 되돌아볼 수 있어야 한다.
 * ⚠️ 신설예정교는 주소가 아직 없다. 못 찾는 게 맞다 — 실패로 세지 않는다.
 *
 * ⛔ 남은 확인 — NCP Geocoding 결과를 저장해도 되는지 약관을 못 읽었다(DESIGN.md §12 열린 것).
 *    브이월드는 변환 결과 저장이 금지라 그 이유로 juso.go.kr 를 받으려던 참이었다.
 *    막히면 같은 주소를 juso.go.kr 로 다시 변환하면 된다 — 좌표값 자체는 같은 공개 사실이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadScriptEnv } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const YEAR = +(process.argv[2] ?? 2027);
const OUT = path.join(ROOT, `data/derived/geocoded-${YEAR}.json`);
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

loadScriptEnv(ROOT);
const KEY_ID = process.env.NCP_MAPS_KEY_ID;
const KEY = process.env.NCP_MAPS_KEY;
if (!KEY_ID || !KEY) {
  console.error('⛔ NCP_MAPS_KEY_ID · NCP_MAPS_KEY 환경변수가 없다. .env.local 또는 .env 에 직접 발급한 키를 설정한다.');
  process.exit(1);
}

// ── 좌표가 빈 학교 모으기 ────────────────────────────────────────────────
const need = [];
{
  const m = read(`data/derived/match-경기-${YEAR}.json`);
  for (const r of m.matched) {
    if (r.lat == null || r.lng == null) need.push({ sido: '경기', code: r.stdCode, name: r.neisName ?? r.school });
  }
}
{
  const a = read(`data/derived/incheon-${YEAR}-school-areas.json`);
  for (const r of a.schools) {
    if (r.lat == null || r.lng == null) need.push({ sido: '인천', code: r.code, name: r.name });
  }
}

// ── 나이스에서 도로명주소 찾기 ───────────────────────────────────────────
const neis = new Map();
for (const sido of ['경기', '인천']) {
  const j = read(`data/derived/neis-${sido}-초등.json`);
  for (const r of (Array.isArray(j) ? j : j.rows ?? j.schools ?? [])) {
    if (r.code) neis.set(r.code, r.address);
    if (r.name) neis.set(`${sido}|${r.name}`, r.address);
  }
}
const addrOf = (s) => neis.get(s.code) ?? neis.get(`${s.sido}|${s.name}`) ?? null;

// ── 주소 → 좌표 ─────────────────────────────────────────────────────────
const cache = fs.existsSync(OUT) ? read(`data/derived/geocoded-${YEAR}.json`) : { meta: {}, schools: {} };
const geocode = async (query) => {
  const url = `https://maps.apigw.ntruss.com/map-geocode/v2/geocode?query=${encodeURIComponent(query)}`;
  const r = await fetch(url, { headers: { 'x-ncp-apigw-api-key-id': KEY_ID, 'x-ncp-apigw-api-key': KEY } });
  if (!r.ok) throw new Error(`지오코딩 실패 (HTTP ${r.status})`);
  const j = await r.json();
  // ⛔ status 를 확인한다. 200 이어도 OK 가 아닐 수 있다.
  if (j.status !== 'OK') throw new Error(`status ${j.status} ${j.errorMessage ?? ''}`);
  const a = (j.addresses ?? [])[0];
  return a ? { lat: +a.y, lng: +a.x, matched: a.roadAddress || a.jibunAddress } : null;
};

let got = 0, kept = 0, noAddr = 0, failed = 0;
for (const s of need) {
  if (!s.code) { noAddr++; console.log(`  ${(s.name ?? '').padEnd(22)} 나이스에 없음 (신설예정교)`); continue; }
  if (cache.schools[s.code]) { kept++; continue; }
  const addr = addrOf(s);
  if (!addr) { noAddr++; console.log(`  ${s.name.padEnd(22)} 주소 없음`); continue; }
  try {
    const hit = await geocode(addr);
    if (!hit) { failed++; console.log(`  ${s.name.padEnd(22)} 못 찾음 · ${addr}`); continue; }
    cache.schools[s.code] = { sido: s.sido, name: s.name, address: addr, ...hit };
    got++;
    console.log(`  ${s.name.padEnd(22)} ${hit.lng.toFixed(6)}, ${hit.lat.toFixed(6)}  ← ${hit.matched}`);
  } catch (e) {
    failed++;
    console.log(`  ${s.name.padEnd(22)} 실패 · ${e.message.slice(0, 80)}`);
  }
}

cache.meta = {
  학년도: YEAR,
  받은날: new Date().toISOString().slice(0, 10),
  출처: '네이버 클라우드 Geocoding (maps.apigw.ntruss.com/map-geocode/v2)',
  주소출처: '나이스 개방포털 학교기본정보',
  설명: '학교알리미 공시에 좌표가 없는 학교만. 이미 좌표가 있는 학교는 건드리지 않는다.',
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(cache, null, 1) + '\n');

console.log(`\n좌표가 빈 학교 ${need.length} · 새로 얻음 ${got} · 이미 있던 것 ${kept} · 주소 없음(신설예정교) ${noAddr} · 실패 ${failed}`);
console.log(`→ ${path.relative(ROOT, OUT)}  (합계 ${Object.keys(cache.schools).length}교)`);
if (failed) console.log('⚠️ 실패한 것은 주소를 원문과 대조한다. 짐작으로 좌표를 넣지 않는다.');
