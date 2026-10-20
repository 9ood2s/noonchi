/**
 * 경기 초등 전보년수 계산.  근거 = docs/rules-gyeonggi-2027.md
 *
 *   전보년수 = 현임교 근무년수 + 가산년수
 *
 * ⛔ 인천은 이 식을 쓰지 않는다. 평정점 합계(근속·근무성적·호봉)로 순위를 매긴다.
 *    인천 계산기는 따로 짠다(docs/rules-incheon-2027.md §1).
 *
 * ⛔ 이 규칙은 여기 한 곳에만 둔다. 화면과 셀프체크가 같이 쓴다(CLAUDE.md §11-3).
 *    .ts 가 아니라 .mjs 인 것은 node 가 직접 돌리는 셀프체크도 읽어야 해서다.
 *
 * 셈은 **달(月)** 로 한다. 규칙이 "월수까지 계산하고 소수점 이하는 버린다" 이기 때문이다.
 */

/** 비율 가산은 소수점 이하를 버린다(제16조 ③ 가산표 비고). */
const ratio = (months, percent) => Math.floor((months * percent) / 100);

/** 가산의 기준이 되는 현임교 근무년수는 5년을 넘지 못한다(가산표 비고, 2025.7.14. 개정). */
export const CAP_MONTHS = 60;

import { regionBonus } from './areas.mjs';

/** 내신하려면 현임교 2년 이상이어야 한다. 하루라도 모자라면 못 낸다(제13조 ⑥). */
export const MIN_MONTHS = 24;

export const toMonths = (years = 0, months = 0) => Math.round(years * 12 + months);
export const fromMonths = (m) => ({ years: Math.floor(m / 12), months: m % 12 });
/**
 * 개월 수를 사람이 읽는 글자로. ⛔ **0은 「없음」이다.**
 *    전에는 `0월` 이 나왔다 — 가산이 하나도 없을 때 화면에 「가산년수 0월」로 떴다.
 *    0개월이라는 기간이 있는 것처럼 읽힌다(2026-08-23 사장님이 짚었다).
 */
export const label = (m) => {
  const { years, months } = fromMonths(m);
  if (!years && !months) return '없음';
  return years && months ? `${years}년 ${months}월` : years ? `${years}년` : `${months}월`;
};

/**
 * 지역가산 비율.
 * ⛔ 규칙 자체는 lib/areas.mjs 한 곳에만 둔다(§11-3). 여기서 다시 쓰면 한쪽만 고쳐져 조용히 어긋난다.
 *    실제로 어긋나 있었다 — 이쪽은 5학급 이하를 알고 areas.mjs 는 몰라서 화면이 "없음"을 냈다.
 */
export const regionPercent = ({ area, areaGrade, smallSchool = false }) =>
  regionBonus(area, areaGrade, smallSchool).percent;

/**
 * 부장교사 경력 가산. 근거 = 업무가산표
 *   갑구역   1년당 1월 (2007.3.1. 경력부터)
 *   그 밖    1년당 3월 (2017.3.1. 경력부터) · 6월 이상 1년 미만 2월 (2018.3.1. 경력부터)
 * ⛔ 지역승진가산점 부여 대상교에서는 제외된다. 그 학교인지는 우리가 모르므로 입력으로 받는다.
 */
export function headTeacherBonus({ months = 0, inGap = false, excluded = false }) {
  if (excluded || months <= 0) return 0;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (inGap) return years * 1;
  return years * 3 + (rest >= 6 ? 2 : 0);
}

/**
 * 6학년 담임 경력 가산. 근거 = 업무가산표
 *   2011학년도        1년당 1월 (1년 단위, 11개월 15일은 절상)
 *   2012학년도 이후   1년당 3월 · 6월 이상 1년 미만 2월 · 6월 미만 미인정
 */
export function grade6Bonus({ months = 0, before2012Months = 0 }) {
  const old = Math.floor(before2012Months / 12) * 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return old + years * 3 + (rest >= 6 ? 2 : 0);
}

const 표창점수 = { 총리이상: 3, 장관: 2, 교육감: 1, 없음: 0 };

/**
 * 전보년수를 낸다.
 * @returns {{ months:number, base:number, addMonths:number, canApply:boolean, parts:{label:string,months:number,note?:string,altLabel?:string}[] }}
 */
export function transferYears(input) {
  const {
    area = '갑', areaGrade = null, smallSchool = false,
    serviceMonths = 0,                  // 현임교 근무년수 (달)
    headTeacherMonths = 0, headTeacherExcluded = false,
    grade6Months = 0, grade6Before2012Months = 0,
    innovationSchool = 'none',          // none | before2017 | from2017
    innovationMonths = 0,
    practiceSchoolMonths = 0,           // 교육실습학교 (직접 지도한 교사)
    multiculturalMonths = 0,            // 다문화 특별학급 담임
    circuitMonths = 0,                  // 순회담당교사(특수·전문상담)
    inclusiveMonths = 0,                // 통합학급교사
    combinedClassMonths = 0,            // 복식학급 담당교사
    centerMonths = 0,                   // 특수교육지원센터·특수교육순회·Wee센터
    nulbomMonths = 0,                   // 늘봄전담실장 (2027학년도부터)
    coupleOfficials = false,            // 부부공무원
    threeChildren = false,              // 세 자녀 이상
    twoInfants = false,                 // 2명의 영유아(7세 이하)
    award = '없음',
  } = input;

  // 비율 가산의 기준값은 5년으로 묶인다. 합계 상한이 아니라 **기준값** 상한이다.
  const base = Math.min(serviceMonths, CAP_MONTHS);

  const parts = [];
  /** altLabel = 원문이 우선순위를 안 정한 자리에서 '낮게 보면 얼마인지'. 없으면 undefined. */
  const add = (label, months, note, altLabel) => {
    if (months > 0) parts.push({ label, months, note, altLabel });
  };

  // ⛔ 겹치는 자리는 단정하지 않는다. regionBonus 가 낮게 본 값(alt)과 까닭(note)을 같이 준다.
  const region = regionBonus(area, areaGrade, smallSchool);
  add(
    '지역가산',
    ratio(base, region.percent),
    region.note ?? undefined,
    region.alt != null ? `낮게 보면 ${label(ratio(base, region.alt))}` : undefined,
  );

  add('부장교사', headTeacherBonus({ months: headTeacherMonths, inGap: area === '갑', excluded: headTeacherExcluded }));
  add('6학년 담임', grade6Bonus({ months: grade6Months, before2012Months: grade6Before2012Months }));
  add('순회담당교사', ratio(circuitMonths, 30));
  add('통합학급교사', ratio(inclusiveMonths, 30));
  if (area === '갑' || area === '을') add('복식학급', ratio(combinedClassMonths, 30));
  add('특수교육지원센터·Wee센터', ratio(Math.min(centerMonths, CAP_MONTHS), 100));
  if (innovationSchool === 'before2017') add('혁신학교', ratio(Math.min(innovationMonths, CAP_MONTHS), 100), '2017학년도 이전 지정');
  if (innovationSchool === 'from2017') add('혁신학교', ratio(Math.min(innovationMonths, CAP_MONTHS), 50), '2017학년도부터 지정');
  add('교육실습학교', Math.floor(practiceSchoolMonths / 12) * 1);
  add('다문화 특별학급', Math.floor(multiculturalMonths / 12) * 1);
  add('늘봄전담실장', ratio(Math.min(nulbomMonths, CAP_MONTHS), 50), '2027학년도부터');

  if (coupleOfficials) add('부부공무원', ratio(base, 30));
  if (threeChildren) add('세 자녀 이상', ratio(base, 50));
  if (twoInfants) add('영유아 2명', ratio(base, 50));
  add('표창', 표창점수[award] ?? 0, award !== '없음' ? award : undefined);

  const addMonths = parts.reduce((n, p) => n + p.months, 0);

  // ⛔ 합산 상한을 넣지 않는다. "합산 가산년수는 현임교 근무년수의 100%를 초과할 수 없다" 는
  //    제17조 ③ — **교장** 전보 우대 조항이다. 교사(제16조)에게는 적용되지 않는다.
  //    넣으면 틀린 값이 나온다(docs/rules-gyeonggi-2027.md 참고).
  return {
    months: serviceMonths + addMonths,
    base: serviceMonths,
    addMonths,
    canApply: serviceMonths >= MIN_MONTHS,
    parts,
  };
}
