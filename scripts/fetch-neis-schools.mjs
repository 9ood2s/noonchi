#!/usr/bin/env node
/**
 * 나이스 개방포털에서 학교 목록을 받는다.  node scripts/fetch-neis-schools.mjs 경기
 *
 * 왜 필요한가 — 인사관리기준 표에는 학교 이름이 줄임말로만 적혀 있다("수원중촌").
 * 표준학교코드를 붙이려면 정식 이름·소속 교육지원청·소재지가 있어야 하고, 그게 여기 있다.
 *
 * ⛔ 인증키 없이 부르면 **오류 없이 페이지당 5행만 온다.** 조용히 모자란 채로 통과한다.
 *    그래서 받은 개수를 서버가 알려 준 총계와 반드시 맞춰 본다(CLAUDE.md §6).
 */
import fs from 'node:fs';
import path from 'node:path';
import { requireSido } from '../lib/sido.mjs';
import { loadScriptEnv } from './lib/env.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const HUB = 'https://open.neis.go.kr/hub/schoolInfo';

const PAGE = 1000; // 나이스가 허용하는 한 쪽 최대

const SIDO = process.argv[2] ?? '경기';
/**
 * ⛔ "초등학교" 만 받으면 빠지는 학교가 있다.
 *    시흥 군서미래국제학교는 나이스에 **각종학교(초)** 로 올라 있는데 인사구역 표에는 들어 있다.
 *    학교종류를 넓혀 받고, 어느 종류에서 왔는지 함께 적어 둔다.
 */
const KINDS = process.argv[3] ? [process.argv[3]] : ['초등학교', '각종학교(초)'];
/** 시도교육청 코드는 `lib/sido.mjs` 한 곳에 있다 — 화면과 스크립트가 같이 읽는다(§11-3) */
const code = requireSido(SIDO).neis;

loadScriptEnv(ROOT);
const KEY = (process.env.NEIS_API_KEY ?? '').trim();
if (!KEY) { console.error('NEIS_API_KEY 환경변수가 비어 있다. .env.local 또는 .env 에 직접 발급한 키를 설정한다.'); process.exit(1); }

async function page(pIndex, kind) {
  const url = new URL(HUB);
  url.searchParams.set('Type', 'json');
  url.searchParams.set('pIndex', String(pIndex));
  url.searchParams.set('pSize', String(PAGE));
  url.searchParams.set('ATPT_OFCDC_SC_CODE', code);
  url.searchParams.set('SCHUL_KND_SC_NM', kind);
  if (KEY) url.searchParams.set('KEY', KEY);

  const res = await fetch(url).catch((e) => {
    throw new Error(`나이스를 못 불렀다: ${e.message}`);
  });
  if (!res.ok) throw new Error(`나이스가 ${res.status} 를 돌려줬다`);
  const body = await res.json();

  if (body.RESULT) return { total: 0, rows: [], message: body.RESULT.MESSAGE, code: body.RESULT.CODE };
  const box = body.schoolInfo;
  if (!Array.isArray(box)) throw new Error(`처음 보는 꼴이다: ${JSON.stringify(body).slice(0, 200)}`);
  const head = box[0]?.head ?? [];
  const total = head.find((h) => h.list_total_count !== undefined)?.list_total_count ?? 0;
  const result = head.find((h) => h.RESULT)?.RESULT;
  return { total, rows: box[1]?.row ?? [], message: result?.MESSAGE, code: result?.CODE };
}

const rows = [];
let short = false;
for (const kind of KINDS) {
  const first = await page(1, kind);
  if (!first.rows.length) {
    console.log(`${SIDO} ${kind} — 없음 (${first.code ?? ''} ${first.message ?? ''})`);
    continue;
  }
  const got = [...first.rows];
  const pages = Math.ceil(first.total / PAGE);
  for (let p = 2; p <= pages; p++) got.push(...(await page(p, kind)).rows);

  // ⛔ 서버가 알려 준 총계와 받은 개수를 맞춰 본다. 키가 없으면 여기서 걸린다.
  const ok = got.length === first.total;
  if (!ok) short = true;
  console.log(`${SIDO} ${kind} — 서버 총계 ${first.total} · 받은 것 ${got.length}${ok ? '  ✓' : '  ⚠️ 모자라다'}`);
  rows.push(...got);
}

console.log(`인증키 ${KEY ? '있음' : '없음'} · 한 쪽 ${PAGE}행 요청 · 모두 ${rows.length}교`);
if (!rows.length) {
  console.error('받은 것이 없다.');
  process.exit(1);
}
if (short) {
  console.log(
    KEY
      ? '키가 있는데도 모자라다. 나이스 응답을 직접 확인한다.'
      : '⛔ 키 없이 부르면 오류 없이 페이지당 5행만 온다. NEIS_API_KEY 환경변수를 채운다.'
  );
  process.exit(1);
}

/**
 * 도로명주소가 **두 칸에 나뉘어 오는 학교가 있다.**
 *
 * ⛔ `ORG_RDNDA` 는 「건물번호」가 아니다 — **섞여 있다.** 실제로 받아 보면 세 가지다:
 *     건물번호   서봉초 `…상신하길로195번길` + `84` · 조치원대동초 `…대동학교길 ` + `11`
 *     도로명부터 신평초 `…원주시 지정면` + `신무로 336` · 웅천초 `…여수시 ` + `, 웅천중앙로 61(웅천동)`
 *     참고항목   가곡초 `…비룡로379번길 3` + `(화도읍, 가곡초등학교)`  ← **붙이면 안 된다**
 *
 * 그래서 **앞칸이 숫자로 끝나지 않을 때만** 뒤칸을 붙인다. 숫자로 끝났으면 이미 온전한 주소이고,
 * 뒤칸은 참고항목이다.
 *
 * ⛔ 왜 챙기나 — 번호 없는 주소로 지오코딩하면 NCP 가 오류가 아니라 **빈 배열**을 준다.
 *    조용히 좌표가 안 생긴다(2026-08-23 서봉초 · 다른 세션이 짚었다 · `docs/BACKLOG.md` ⑭).
 */
const fullAddress = (r) => {
  const road = (r.ORG_RDNMA ?? '').trim();
  const rest = (r.ORG_RDNDA ?? '').trim();
  if (!road) return null;
  if (/\d$/.test(road) || !rest) return road;
  return (rest.startsWith(',') ? `${road}${rest}` : `${road} ${rest}`).replace(/\s+/g, ' ').trim();
};

/**
 * 표준학교코드 — **쓸 수 있는 것만 담는다.**
 *
 * ⛔ 나이스는 코드 자리에 **공백을 채워 보내는 학교가 있다.** 충남다우리학교(초)가
 *    `"       "`(공백 일곱)로 온다 — `null` 이 아니라 **문자열**이라 `if (code)` 도
 *    `is not null` 도 전부 지나간다. 그대로 실으면 `/school/       ` 이라는 주소가 만들어져
 *    **사이트맵에 404 가 실려 나간다**(2026-08-23 다른 세션이 잡았다 · `dd650e4`).
 *    빌드는 초록으로 통과한다 — 그래서 여기, 바깥 API 와 닿는 자리에서 끊는다.
 * ⛔ 「모르는 것은 null 로 둔다」(CLAUDE.md §11-1). 공백을 지워 빈 문자열로 두지 않는다.
 */
const code7 = (v) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? v.trim() : null);

const out = rows.map((r) => ({
  code: code7(r.SD_SCHUL_CODE),   // 표준학교코드. ⛔ 숫자가 아니면 null 이다 — 위 code7 참고
  name: r.SCHUL_NM,               // 정식 이름
  office: r.JU_ORG_NM,            // 관할 교육지원청
  kind: r.SCHUL_KND_SC_NM,        // 학교종류
  founded: r.FOND_SC_NM,          // 설립 구분 (공립/사립)
  address: fullAddress(r),        // 도로명 주소 (⛔ 두 칸을 이어 붙인 값이다 — fullAddress 참고)
  // 학교 홈페이지. ⛔ 없는 학교가 있다 — 빈 문자열로 온다(2026-08-23 · §12-137)
  homepage: r.HMPG_ADRES || null,
  region: r.LCTN_SC_NM,           // 소재지
  branch: r.DGHT_SC_NM,           // 주야 구분
  // ⛔ FOAS_MEMRD 는 **개교기념일**이다. 폐교일이 아니다(동탄초 19230606 = 1923년 개교).
  //    처음에 closedAt 이라 이름 붙였다가, 이 값으로 폐교를 거르면 정반대가 된다는 걸 알았다.
  //    나이스는 폐교를 따로 알려 주지 않고 **이름에** 적어 온다 — "전곡초등학교적동분교장(폐교)".
  openedOn: r.FOAS_MEMRD,         // 개교기념일 (yyyymmdd)
}));

/**
 * ⛔ **번호 없는 주소를 세어서 적는다.** 그 학교는 지오코딩이 오류 없이 빈 배열을 받아
 *    좌표가 조용히 안 생긴다. 몇 곳인지 안 적으면 아무도 모른다.
 * ⛔ 「끝이 숫자인가」로 세지 않는다 — 뒤에 참고항목이 붙은 멀쩡한 주소(`… 3 (화도읍)`)가
 *    전부 걸려 진짜 문제가 묻힌다. **숫자가 하나도 없는가**로 센다.
 */
// ⛔ 코드가 없는 학교도 세어서 적는다. 그 학교는 정적 화면도 사이트맵도 안 만들어진다
const noCode = out.filter((r) => !r.code);
if (noCode.length) {
  console.log(`  ⚠️ 표준학교코드가 없는 곳 ${noCode.length} — ${noCode.slice(0, 6).map((r) => r.name).join(' · ')}`);
}

const noNumber = out.filter((r) => !/\d/.test(r.address ?? ''));
if (noNumber.length) {
  console.log(`  ⚠️ 주소에 번호가 없는 곳 ${noNumber.length} — ${noNumber.slice(0, 6).map((r) => `${r.name}(${r.address})`).join(' · ')}`);
}

const OUT = path.join(ROOT, `data/derived/neis-${SIDO}-초등.json`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ meta: { 시도: SIDO, 학교종류: KINDS, 총계: rows.length, 받은날: new Date().toISOString().slice(0, 10) }, rows: out }, null, 2) + '\n');
console.log(`→ ${path.relative(ROOT, OUT)}`);
