/**
 * 인천 초등 **교육지원청간(청간) 전보** 순위 점수.  근거 = docs/rules-incheon-2027.md §1 (제11조 ②)
 *
 * ⛔ **관내(같은 지원청 안) 전보는 이 산식이 아니다.** 조문 제목이 「교사·교감의 **교육지원청간** 전보」다.
 *    관내는 교육지원청 세부기준이 정한다 — **근무성적 조정점의 50% + 지원청 가산점([별표2])**.
 *    자릿수부터 다르다. 이 값을 관내 점수로 쓰면 틀린다(2026-08-21 사장님 지적).
 *
 *   순위 점수 = ① 인천시교육청 근속연수   월 0.05점 (≤ 9점)
 *             + ② 소속 교육지원청 근속연수 월 0.05점 (≤ 9점)
 *             + ③ 근무성적 평정점  최종 조정점의 10%
 *             + ④ 교육총경력      1월 1일 현재 호봉의 10% (≤ 3점)
 *
 * ⛔ 경기와 아예 다르다. 경기는 전보년수(근무년수 + 가산년수) 순이고 지역가산이 있는데,
 *    인천은 평정점 합계 순이고 지역가산이 없다. 두 계산기를 섞으면 틀린 값이 나온다.
 *
 * ⛔ 셈은 **1/100점 단위 정수**로 한다. 0.05 를 실수로 더하면 오차가 쌓인다.
 *
 * ⛔ **이 넷이 전부가 아니다.** 인천은 시교육청이 뼈대(인사관리기준)만 내고,
 *    제24조·제25조가 **교육지원청 인사관리세부기준**으로 넘긴다 — 급지 지정, 동일교 근무기간,
 *    그리고 학년부장·통합학급 같은 가산점이 거기 있다. 우리는 그 원문을 아직 갖고 있지 않다.
 *    없는 규칙을 지어내지 않고, **교사가 자기 지원청 가산점을 직접 넣게** 하고
 *    무엇이 안 들어갔는지 화면에 적는다(DESIGN.md §12 ㉒).
 *    경기는 다르다 — 도교육청이 세부기준을 직접 내서 부장·통합학급 가산이 본문 표에 있다.
 */

/** 근속 평정점 — 월 0.05점, 상한 9점. 둘(시교육청·지원청)에 각각 걸린다. */
export const TENURE_PER_MONTH = 5;   // 1/100점
export const TENURE_CAP = 900;       // 9점
/** 교육총경력 — 호봉의 10%, 상한 3점. 30호봉이면 상한에 닿는다. */
export const CAREER_CAP = 300;       // 3점
/** 교육지원청간 전보는 동일교 1년 이상부터다(제11조 ①). 경기는 2년이다. */
export const MIN_SAME_SCHOOL_MONTHS = 12;

export const toMonths = (years = 0, months = 0) => Math.round(years * 12 + months);
/** 1/100점 정수를 사람이 읽는 점수로. */
export const score = (hundredths) => (hundredths / 100).toFixed(2);

/**
 * ⚠️ 근무성적 평정 **최종 조정점**은 100점 척도로 본다.
 *    인천 기준 원문에는 만점이 안 적혀 있다. 교육공무원 승진규정의 근무성적평정이 100점 척도라
 *    그렇게 두었다. 조정점을 직접 넣으면 만점을 몰라도 계산은 맞는다.
 */
export const RATING_SCALE = 100;

/**
 * @param {object} input
 * @param {number} input.cityMonths      인천시교육청 근속 (달)
 * @param {number} input.officeMonths    지금 소속 교육지원청 근속 (달)
 * @param {number|null} input.rating     근무성적 최종 조정점 (0~100). 모르면 null
 * @param {number} input.step            1월 1일 현재 호봉
 * @param {number} input.sameSchoolMonths 동일교 근무 (달) — 자격 확인용
 * @param {number} [input.districtBonus] 교육지원청 세부기준 가산점 (점). 우리가 규칙을 모르므로 직접 받는다
 */
export function transferScore(input) {
  const {
    cityMonths = 0, officeMonths = 0, rating = null, step = 0, sameSchoolMonths = 0,
    districtBonus = 0,   // 교육지원청 세부기준 가산점 (점). 교사가 직접 넣는다
  } = input;

  const tenureCity = Math.min(cityMonths * TENURE_PER_MONTH, TENURE_CAP);
  const tenureOffice = Math.min(officeMonths * TENURE_PER_MONTH, TENURE_CAP);
  const career = Math.min(Math.round(step * 10), CAREER_CAP);
  const ratingPts = rating == null ? null : Math.round(rating * 10);

  const extra = Math.round((Number(districtBonus) || 0) * 100);
  const known = tenureCity + tenureOffice + career + extra;
  const parts = [
    { label: '인천시교육청 근속', hundredths: tenureCity, note: tenureCity >= TENURE_CAP ? '상한 9점' : undefined },
    { label: '교육지원청 근속', hundredths: tenureOffice, note: tenureOffice >= TENURE_CAP ? '상한 9점' : undefined },
    { label: '교육총경력', hundredths: career, note: career >= CAREER_CAP ? '상한 3점' : `${step}호봉` },
  ];
  if (ratingPts != null) parts.push({ label: '근무성적', hundredths: ratingPts, note: `최종 조정점 ${rating}` });
  if (extra) parts.push({ label: '지원청 가산점', hundredths: extra, note: '직접 넣은 값' });

  return {
    total: ratingPts == null ? null : known + ratingPts,
    known,                                   // 근무성적을 뺀 점수
    min: known,                              // 근무성적을 0 으로 봤을 때
    max: known + RATING_SCALE * 10,          // 100점을 다 받았을 때
    ratingKnown: ratingPts != null,
    parts,
    canApply: sameSchoolMonths >= MIN_SAME_SCHOOL_MONTHS,
  };
}

/**
 * 근무성적 최종 조정점 1점이 근속 몇 달과 같은가.
 *   조정점 1점 = 평정점 0.1점 = 근속 2달
 * ⚠️ 「평정점 1점」과 헷갈리기 쉽다. 평정점 1점은 조정점 10점이고, 근속 20달이다.
 */
export const ratingPointInMonths = (ratingPoints = 1) => (ratingPoints * 10) / TENURE_PER_MONTH;
