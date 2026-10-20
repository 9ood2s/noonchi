/**
 * 인사구역·급지 → 지역가산.  근거 = docs/rules-gyeonggi-2027.md §2-1
 *
 * ⛔ 이 규칙은 여기 한 곳에만 둔다. 화면(app/)과 판독 스크립트(scripts/)가 같이 쓴다.
 *    두 곳에 두면 한쪽만 고쳐져 조용히 어긋난다(CLAUDE.md §11-3).
 *    그래서 .ts 가 아니라 .mjs 다 — node 가 직접 실행하는 스크립트도 읽어야 한다.
 */

/** 5학급 이하 학교·분교장. 지역가산표에 **구역과 무관하게** 따로 한 줄로 있다. */
export const SMALL_SCHOOL_PERCENT = 30;

/**
 * 지역가산 비율. 근거 = 경기 2027 [지역가산표]
 *   병구역 가·나 100% · 병구역 다·라 70% · 을구역 50% · **5학급 이하 학교·분교장 30%**
 *
 * ⛔ **"갑구역은 지역가산이 없다"고 박지 않는다.** 표에 갑구역 줄이 없을 뿐이고,
 *    「5학급 이하 학교·분교장 30%」 줄은 **구역을 가리지 않는다.** 갑구역이라도 5학급 이하면 30%다.
 *    우리는 학급수 자료가 없어 그 여부를 모른다 — 모르는 것은 `sure:false` 로 내고 화면이 "—" 를 쓴다.
 *    확인할 수 없는 것을 "없음"으로 굳히면, 화면이 확신을 갖고 틀린 말을 한다.
 *
 * ⛔ 원문(제16조 ③)은 「5학급 이하 30%」와 「병구역 100%」가 겹칠 때 무엇이 우선인지 **말하지 않는다.**
 *    병구역 가·나는 법정 특수지(벽지)라 대개 소규모교다 — 겹치는 게 드문 경우가 아니다.
 *    높은 쪽을 쓰되 **단정하지 않는다.** 낮게 본 값(alt)도 같이 내서 화면이 둘 다 보여준다.
 *    확인되면 고친다(DESIGN.md 열린 것).
 *
 * @param {string} area  갑 | 을 | 병
 * @param {string|null} grade  병구역 급지 가|나|다|라
 * @param {boolean|null} smallSchool  5학급 이하·분교장인가. **null = 모른다**
 * @returns {{ percent: number, label: string, sure: boolean, note: string|null }}
 */
export function regionBonus(area, grade, smallSchool = null) {
  const byArea =
    area === '병' ? (grade === '가' || grade === '나' ? 100 : 70) : area === '을' ? 50 : 0;

  if (smallSchool === true) {
    const hi = Math.max(byArea, SMALL_SCHOOL_PERCENT);
    const lo = Math.min(byArea, SMALL_SCHOOL_PERCENT) || SMALL_SCHOOL_PERCENT;
    if (hi === lo) return { percent: hi, label: `${hi}%`, sure: true, note: null };
    return {
      percent: hi,
      alt: lo,
      label: `${hi}%`,
      sure: false,
      note: `구역 ${byArea}% 와 5학급 이하 ${SMALL_SCHOOL_PERCENT}% 가 겹친다. 원문이 우선순위를 정하지 않아 낮게 보면 ${lo}%`,
    };
  }
  if (smallSchool === false) {
    return { percent: byArea, label: byArea ? `${byArea}%` : '없음', sure: true, note: null };
  }
  // 학급수를 모른다. 구역 비율이 30% 를 넘으면 어차피 그 값이라 결과는 확실하다.
  if (byArea > SMALL_SCHOOL_PERCENT) return { percent: byArea, label: `${byArea}%`, sure: true, note: null };
  return {
    percent: byArea,
    label: byArea ? `${byArea}%` : '—',
    sure: false,
    note: '5학급 이하 학교·분교장이면 30%. 학급수 자료가 없어 확인하지 못했다',
  };
}

/**
 * ⛔⛔ **인천 Ⅰ·Ⅱ·Ⅲ 은 「가·나·다 급지」가 아니다.** 한때 그렇게 바꿔 적었는데 틀렸다(2026-08-20).
 *
 * 고시문 스스로가 둘을 다른 말로 쓴다 — 제8조는 **인사구역**을 Ⅰ·Ⅱ·Ⅲ 으로 정하고,
 * 제24조는 「동일구역 내 학교의 **급지 지정**은 교육장이 조정한다」고 넘긴다.
 * 즉 **급지는 인사구역 안에서 다시 갈리는 값**이고, 그 표는 교육지원청 세부기준에 있다.
 * 실증 — 부평은 전부 Ⅰ구역이지만 그 안에서 가·나·다 급지가 갈린다.
 *
 * ⭐ 2026-08-21 그 표를 넣었다 — 남부·북부·서부 세 곳(`scripts/parse-incheon-office-grades.mjs`).
 * ⛔ **동부·강화는 아직 고시 전이라 값이 없다.** 짐작해 채우지 않고 「?」로 낸다.
 */

/** 아직 지원청 고시가 안 올라온 곳. 이 학교들은 급지가 null 이다. */
export const INCHEON_GRADE_PENDING = ['동부', '강화'];

/** 급지가 없을 때 화면이 쓰는 글자. 「모른다」를 「없다」로 굳히지 않는다. */
export const UNKNOWN_GRADE = '?';

/**
 * 인천 급지 이름.
 *
 * ⛔ **원문은 「인사급교」다**(북부·서부 (별표1) 「인사구역별 인사급교」, 남부 「인사구역 및 급교」).
 *    화면에는 교사가 쓰는 말인 **급지**로 적는다 — 시교육청 고시문 제24조도 「급지 지정」이라 쓴다.
 * 남부는 가·나·다급교에 **영종지역·도서지역**이 같은 층으로 붙는다(남부 제6조 ①).
 *
 * @param {string|null} grade  가 | 나 | 다 | 영종지역 | 도서지역 | null(고시 전)
 * @param {{short?: boolean}} [opt] short 면 말풍선용 한 글자
 */
export function incheonGradeLabel(grade, opt = {}) {
  if (!grade) return UNKNOWN_GRADE;
  if (/지역$/.test(grade)) return opt.short ? grade.replace('지역', '') : grade;
  return opt.short ? grade : `${grade}급지`;
}

/** 인천에서 실제로 쓰는 급지 값. 필터·범례가 이 차례로 쓴다. */
export const INCHEON_GRADES = ['가', '나', '다', '영종지역', '도서지역'];

/**
 * 화면에 쓰는 구역 이름. 경기 병구역은 급지까지 붙는다 — "병-나".
 * @param {string} area
 * @param {string|null} grade
 */
export const areaLabel = (area, grade) => (grade ? `${area}-${grade}` : area);

/** "병-나" → ['병', '나'] · "갑" → ['갑', null] */
export function splitArea(label) {
  const [area, grade] = label.split('-');
  return [area, grade ?? null];
}

/**
 * 인천은 **지역가산이 없다.** 인사구역은 근무연한만 가른다(인천 제9조).
 * 경기의 regionBonus 를 인천에 쓰면 쓸모없는 값이 나온다 — 인천 순위는 지역가산을 안 쓴다.
 * @param {string} area  Ⅰ | Ⅱ | Ⅲ
 */
/**
 * ⛔ **화면에서 쓰지 않는다.** 규칙 문서와 대조용으로만 남겨 둔다.
 *    실제 근무연한은 교육지원청 세부기준에 있어서 시 기준으로 쓰면 틀린다.
 *    전보를 내는 교사는 4~5년차 이상이라 급지(가·나·다)만 보면 그 뜻을 안다.
 *    확인되지 않은 정보를 주는 건 신뢰만 깎는다(사장님 확인, 2026-08-20).
 */
export function incheonTerm(area) {
  if (area === 'Ⅲ') return { label: '4년', note: '전입 희망자가 부족하면 1년 연장', sure: true };
  // ⛔ 「제한 없음」이라고 쓰지 않는다 — 그건 **시교육청 기준 본문** 이야기일 뿐이다.
  //    제24조가 「동일구역 내 학교의 급지 지정과 동일교 근무기간」을 교육장에게 넘긴다.
  //    실제 제한은 교육지원청 인사관리세부기준에 있고 우리는 그 원문이 없다.
  //    확인 못 한 것을 「없다」로 굳히면 화면이 확신을 갖고 틀린 말을 한다(docs/postmortems.md).
  return {
    label: '지원청 기준',
    note: '시 기준 본문에는 제한이 없지만 동일교 근무기간은 교육장이 정한다(제24조)',
    sure: false,
  };
}

/** 학급수로 「5학급 이하」인지 가린다. 학급수를 모르면 null(모름)을 낸다. */
export const isSmallSchool = (classes) => (classes == null ? null : classes <= 5);

/**
 * 시·도에 맞는 한 줄 설명을 낸다. 경기는 지역가산, 인천은 근무연한이 의미 있는 값이다.
 * @param {number|null} [classes] 학급수. 주면 「5학급 이하 30%」를 가려서 "모름"을 닫는다.
 */
export function areaFact(sido, area, grade, classes = null) {
  // ⛔ 인천은 화면에 근무연한을 내지 않는다. 실제 제한은 교육지원청 세부기준에 있어서
  //    시 기준으로 쓰면 틀리고, 「지원청 기준」이라고만 쓰면 아무 말도 안 하는 칸이 된다.
  //    교사는 급지(가·나·다)만 보면 그 뜻을 이미 안다(사장님 확인, 2026-08-20).
  if (sido === '인천') return null;
  const b = regionBonus(area, grade, isSmallSchool(classes));
  return { label: `지역가산 ${b.label}`, note: b.note, sure: b.sure };
}
