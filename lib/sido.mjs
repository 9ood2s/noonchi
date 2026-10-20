/**
 * 시·도 한 곳당 한 줄 — 이름과 **바깥 API 가 그 시·도를 부르는 코드**.
 *
 * ⛔ 이 표는 여기 한 곳에만 둔다. 화면(`lib/schools.ts`)과 적재 스크립트(`scripts/*.mjs`)가
 *    같이 읽는다. 두 곳에 두면 한쪽만 늘어나 조용히 어긋난다(CLAUDE.md §11-3).
 *    그래서 `.ts` 가 아니라 `.mjs` 다 — node 가 직접 실행하는 스크립트도 읽어야 한다.
 *
 * ⛔ **여기 있다고 인사구역이 있는 게 아니다.** 이 표는 「학교 목록을 받아올 수 있는 곳」이고,
 *    인사구역·급지·모의지원은 교육청 고시 원문을 읽은 곳(경기·인천)에만 있다.
 *    그 구분은 `lib/schools.ts` 의 `SOURCES` 가 쥔다.
 */

/**
 * 시·도 이름. **화면의 시·도 목록이 이 차례로 난다** — 인사구역까지 읽어 둔 경기·인천이 앞이다.
 *
 * ⛔ `/** @type {const} *\/` 를 지우지 마라. 이것이 있어야 TypeScript 가 이 배열을
 *    `string[]` 이 아니라 **열일곱 개 이름의 묶음**으로 읽는다. `lib/schools.ts` 의 `Sido` 형이
 *    여기서 나온다 — 지우면 오타가 형 검사를 그냥 통과한다.
 */
export const SIDO_NAMES = /** @type {const} */ ([
  '경기', '인천',
  '서울', '부산', '대구', '광주', '대전', '울산', '세종',
  '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
]);

/**
 * ⛔ 코드는 **실제로 불러 보고 적었다**(2026-08-23). 스키마만 보고 적지 않는다(CLAUDE.md §6).
 *   `full`  주소·교육지원청 이름의 앞머리로 붙는 정식 행정구역명
 *   `neis`  나이스 개방포털 `ATPT_OFCDC_SC_CODE` (시도교육청 코드)
 *   `alimi` 학교알리미 `sidoCode` · `sggCode`
 *
 * ⛔ **세종만 `sggCode` 가 다르다.** 다른 시·도는 끝이 `000` 이면 시·도 전체가 오는데
 *    세종은 `36000` 이 「해당 시도 및 시군구에 데이터가 존재하지 않습니다」로 실패하고
 *    **`36110`** 이라야 55교가 온다. 시·군·구가 없는 특별자치시라 그렇다.
 * ⛔ 강원(51)·전북(52)은 **특별자치도로 바뀌며 코드가 바뀐 곳**이다. 옛 42·45 가 아니다.
 */
const CODES = {
  경기: { full: '경기도',         neis: 'J10', alimi: { sido: '41', sgg: '41000' } },
  인천: { full: '인천광역시',     neis: 'E10', alimi: { sido: '28', sgg: '28000' } },
  서울: { full: '서울특별시',     neis: 'B10', alimi: { sido: '11', sgg: '11000' } },
  부산: { full: '부산광역시',     neis: 'C10', alimi: { sido: '26', sgg: '26000' } },
  대구: { full: '대구광역시',     neis: 'D10', alimi: { sido: '27', sgg: '27000' } },
  광주: { full: '광주광역시',     neis: 'F10', alimi: { sido: '29', sgg: '29000' } },
  대전: { full: '대전광역시',     neis: 'G10', alimi: { sido: '30', sgg: '30000' } },
  울산: { full: '울산광역시',     neis: 'H10', alimi: { sido: '31', sgg: '31000' } },
  세종: { full: '세종특별자치시', neis: 'I10', alimi: { sido: '36', sgg: '36110' } },
  강원: { full: '강원특별자치도', neis: 'K10', alimi: { sido: '51', sgg: '51000' } },
  충북: { full: '충청북도',       neis: 'M10', alimi: { sido: '43', sgg: '43000' } },
  충남: { full: '충청남도',       neis: 'N10', alimi: { sido: '44', sgg: '44000' } },
  전북: { full: '전북특별자치도', neis: 'P10', alimi: { sido: '52', sgg: '52000' } },
  전남: { full: '전라남도',       neis: 'Q10', alimi: { sido: '46', sgg: '46000' } },
  경북: { full: '경상북도',       neis: 'R10', alimi: { sido: '47', sgg: '47000' } },
  경남: { full: '경상남도',       neis: 'S10', alimi: { sido: '48', sgg: '48000' } },
  제주: { full: '제주특별자치도', neis: 'T10', alimi: { sido: '50', sgg: '50000' } },
};

/** 이름 하나가 코드 없이 늘어나면 **불러올 때 바로 멈춘다.** 반쯤 붙은 채로 돌지 않게. */
for (const name of SIDO_NAMES) {
  if (!CODES[name]) throw new Error(`lib/sido.mjs — ${name} 의 API 코드가 없다`);
}

/** 이름 + 코드를 한 줄로. 스크립트가 이것을 돈다. */
export const SIDO_LIST = SIDO_NAMES.map((name) => ({ name, ...CODES[name] }));

/** 이름 → 한 줄. 모르는 이름이면 undefined 다 — 부르는 쪽이 멈춘다. */
export const sidoOf = (name) => SIDO_LIST.find((s) => s.name === name);

/**
 * 스크립트가 `process.argv` 로 받은 시·도 이름을 확인한다. 모르면 그 자리에서 멈춘다.
 * ⛔ 조용히 기본값(경기)으로 넘어가지 않는다 — 엉뚱한 시·도 파일을 덮어쓴 채로 통과한다.
 */
export function requireSido(name) {
  const hit = sidoOf(name);
  if (!hit) {
    console.error(`시도를 모르겠다: ${name}. 아는 것 = ${SIDO_NAMES.join(', ')}`);
    process.exit(1);
  }
  return hit;
}
