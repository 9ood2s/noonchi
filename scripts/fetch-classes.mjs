#!/usr/bin/env node
/**
 * 학급수를 받는다.  node scripts/fetch-classes.mjs 경기
 *
 * 어디서 — 나이스 개방포털 `classInfo`. 학교 하나에 학급 한 줄씩 온다. 세면 학급수다.
 *   {"AY":"2026","GRADE":"1","CLASS_NM":"1","SCHUL_CRSE_SC_NM":"초등학교"}
 *
 * ⭐ **왜 학급수인가** — 담임이 맡는 것은 학급이다. 교사 1인당 학생수는 실제 학급 크기와 다르다.
 *    그 분모의 '교원'에 보건·영양·사서·상담처럼 수업을 하지 않는 인원이 섞여 있기 때문이다.
 *    실증 — 강화초 학급당 19.0명 / 교사당 10.0명. 교동초 3.0 / 1.4.
 *    교직에서 「교사당 학생수」가 늘 욕먹는 지표인 이유다. 우리는 학급당 학생수를 쓴다.
 *
 * ⛔ 학교마다 한 번씩 불러야 한다. 시·도 단위로는 안 준다("필수 값이 누락되어 있습니다").
 * ⛔ 서버가 세어 준 총계(list_total_count)와 받은 줄 수를 맞춰 본다. 조용히 모자라면 아무도 모른다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { requireSido } from '../lib/sido.mjs';
import { loadScriptEnv } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIDO = process.argv[2] ?? '경기';
const YEAR = Number(process.argv[3] ?? new Date().getFullYear());

/** 나이스 시·도교육청 코드. 표는 `lib/sido.mjs` 한 곳에 있다(§11-3) */
const ATPT = requireSido(SIDO).neis;

loadScriptEnv(ROOT);
const KEY = (process.env.NEIS_API_KEY ?? '').trim();
if (!KEY) { console.error('NEIS_API_KEY 환경변수가 비어 있다. .env.local 또는 .env 에 직접 발급한 키를 설정한다.'); process.exit(1); }

const src = path.join(ROOT, `data/derived/neis-${SIDO}-초등.json`);
if (!fs.existsSync(src)) { console.error(`${path.relative(ROOT, src)} 가 없다. 먼저 npm run neis ${SIDO}`); process.exit(1); }
/**
 * ⛔ **코드가 숫자가 아닌 학교는 부르지 않는다.**
 *    나이스가 코드 자리에 공백을 채워 보내는 학교가 있는데(`fetch-neis-schools.mjs` 의 `code7`),
 *    그 공백으로 `classInfo` 를 부르면 **오류가 아니라 남의 학급수가 온다** —
 *    충남다우리학교(초)에 7학급이 붙어 있었다(2026-08-23 실측). 아무 데도 오류가 안 뜬다.
 *    지금은 앞 단계가 이미 null 로 만들어 주지만, 여기서도 한 번 더 막는다 —
 *    이 자리는 바깥 API 를 학교마다 부르는 자리라 잘못 부르면 값이 조용히 섞인다.
 */
const schools = (JSON.parse(fs.readFileSync(src, 'utf8')).rows ?? []).filter((r) => /^\d+$/.test(String(r.code ?? '')));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function classesOf(code, tries = 3) {
  const u = new URL('https://open.neis.go.kr/hub/classInfo');
  for (const [k, v] of Object.entries({
    KEY, Type: 'json', pIndex: 1, pSize: 1000,
    ATPT_OFCDC_SC_CODE: ATPT, SD_SCHUL_CODE: code, AY: YEAR,
  })) u.searchParams.set(k, String(v));

  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(u);
      const j = await res.json();
      // 해당 학교에 학급이 없으면 INFO-200 이 온다. 오류가 아니라 '없음'이다.
      if (j.RESULT?.CODE === 'INFO-200') return { classes: 0, byGrade: {}, empty: true };
      if (j.RESULT) throw new Error(j.RESULT.MESSAGE);

      const total = Number(j.classInfo?.[0]?.head?.[0]?.list_total_count ?? 0);
      const rows = j.classInfo?.[1]?.row ?? [];
      // ⛔ 서버 총계와 받은 줄 수를 맞춘다
      if (rows.length !== total) throw new Error(`총계 ${total} ↔ 받은 것 ${rows.length}`);

      const byGrade = {};
      for (const r of rows) byGrade[r.GRADE] = (byGrade[r.GRADE] ?? 0) + 1;
      return { classes: rows.length, byGrade, empty: false };
    } catch (e) {
      if (i === tries - 1) return { classes: null, byGrade: {}, why: e.message };
      await sleep(400 * (i + 1));
    }
  }
}

/** 동시에 몇 개까지 부를지. 너무 올리면 상대 서버가 막는다. */
const LANES = 6;
const out = [];
let done = 0;

async function lane(queue) {
  while (queue.length) {
    const s = queue.shift();
    const r = await classesOf(s.code);
    out.push({ code: s.code, name: s.name, office: s.office, ...r });
    if (++done % 200 === 0) process.stdout.write(`  ${done}/${schools.length}\n`);
    await sleep(60);
  }
}

const queue = [...schools];
console.log(`[${SIDO} ${YEAR}] 학급수 — ${schools.length}교`);
await Promise.all(Array.from({ length: LANES }, () => lane(queue)));

const failed = out.filter((r) => r.classes == null);
const empty = out.filter((r) => r.empty);
const got = out.filter((r) => r.classes > 0);
console.log(`  받음 ${got.length}교 · 학급 없음 ${empty.length}교 · 못 받음 ${failed.length}교`);
console.log(`  학급 합계 ${got.reduce((a, r) => a + r.classes, 0).toLocaleString()}개`);
if (failed.length) console.log('  못 받음:', failed.slice(0, 8).map((r) => `${r.name}(${r.why})`).join(' · '));

// ⛔ 못 받은 것이 있으면 조용히 넘어가지 않는다
if (failed.length > schools.length * 0.02) {
  console.error(`  ⚠️ 못 받은 것이 ${failed.length}곳이다. 2% 를 넘으면 멈춘다.`);
  process.exit(1);
}

const OUT = path.join(ROOT, `data/derived/classes-${SIDO}-초등.json`);
fs.writeFileSync(
  OUT,
  JSON.stringify(
    { meta: { 시도: SIDO, 학년도: YEAR, 받은날: new Date().toISOString().slice(0, 10), 출처: '나이스 개방포털 classInfo' }, rows: out },
    null,
    2,
  ) + '\n',
);
console.log(`→ ${path.relative(ROOT, OUT)}`);
