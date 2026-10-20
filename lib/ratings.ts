/**
 * 별점 — 축과 읽기.  근거 = docs/DESIGN.md §6
 *
 * ⛔ 교사 입력이다. 공공데이터(인사구역·학생수)와 **갈라 보여준다**(CLAUDE.md §2).
 * ⛔ **표본수(N)를 화면에 안 낸다**(2026-08-24 사장님 — 「몇명이 평가했는지는 표기하지 말고」).
 *    갈라 두는 것은 **자리**로 한다 — 별점은 공공데이터 표 밖에 따로 선 칸이다.
 * ⛔ 자유 텍스트를 받지 않는다. 별점만이다(CLAUDE.md §1).
 * ⛔ 평가 단위는 **학교**다. 특정 개인을 가리키는 축을 만들지 않는다.
 */
import { db } from "@/lib/supabase";

/**
 * 여섯 축. 방향은 전부 같다: **1 나쁨 → 5 좋음.** 업무량도 「부담이 적을수록 높다」로 읽는다.
 *
 * ⭐ **2026-08-23 에 「접근성」을 더해 여섯이 됐다**(사장님 — 「관심사유랑 평가 축에 '접근성'도
 *    넣어야함… **교통이 얼마나 편하냐**도 중요한 지표니까」). 전에는 「다섯이 상한」이라고 적어
 *    뒀는데, 이 서비스는 **어느 학교로 옮길까**를 고르는 자리라 교사가 실제로 재는 값에 교통이 든다.
 *    ⛔ **길찾기와 겹치지 않는다** — 길찾기는 **내 집 기준**이라 사람마다 다르고,
 *       이 축은 **그 학교 자체가 얼마나 닿기 쉬운가**다(역·정류장·주차). 값이 다르다.
 * ⛔ 여기서 더 늘리지 않는다. 축이 많을수록 아무도 끝까지 안 채운다(§6).
 * ⛔ 이 목록은 **오각형·육각형을 스스로 그린다** — `components/pentagon.tsx` 가 `AXES.length` 로
 *    각을 나눈다. 축을 늘려도 그림은 안 고친다.
 * ⛔ **라벨 글자가 DB 와 같아야 한다** — 관심 사유 집계 뷰(`school_watch_reasons`)가
 *    `'접근성' = any(reasons)` 로 센다. 한쪽만 고치면 그 칸이 늘 0이다(§11-3).
 *
 * ⛔ 급식은 뺐다(2026-08-20). 입맛이 사람마다 갈려서 **학교의 값이 아니라 평가자의 값**이 된다.
 */
export const AXES = [
  { key: "admin", label: "관리자", hint: "교장·교감" },
  { key: "mood", label: "분위기", hint: "교직원 관계" },
  { key: "rights", label: "교권", hint: null },
  { key: "workload", label: "업무량", hint: "부담 적을수록 높게" },
  { key: "facility", label: "시설", hint: "냉난방·화장실·주차" },
  { key: "access", label: "접근성", hint: "역·정류장·주차" },
] as const;

export type AxisKey = (typeof AXES)[number]["key"];
export const AXIS_KEYS = AXES.map((a) => a.key) as AxisKey[];

/**
 * ⛔ **문턱을 없앴다** (2026-08-24 사장님 — 「표본 3으로 걸어놓은 것들 모두 풀어버려」 ·
 *    「한명이라도 평가하면 그대로 내보내」). 전에 여기 `MIN_SAMPLE = 3` 이 있었다.
 *
 * ⭐ 까닭 — 「빠르게 쌓이는 재미가 있어야 사용자가 늘고, 사용자가 늘어야 표본이 늘어
 *    신뢰도가 높아지는 **선순환**」. 문턱을 두면 그 첫 바퀴가 안 돈다.
 * ⛔ **표본수를 화면에서 함께 뺐다.** 문턱이 없는 채로 「표본 1」을 적으면 그 한 사람이
 *    누구인지 좁혀지고, 안 적으면 그 길이 막힌다 — 문턱을 없앤 것과 한 벌이다.
 * ⛔ **운영 화면(`/admin`)에서는 그대로 본다**(`lib/admin.ts`). 자료가 얼마나 쌓였는지는
 *    운영이 판단할 값이라 거기서는 표본수를 낸다 — 그 화면은 `is_staff()` 가 잠근다.
 */

/**
 * ⛔⛔ **축 값은 `null` 일 수 있다.** 전에 여기가 `Record<AxisKey, number>` 라고 **거짓말을 하고 있었고**,
 *    그래서 타입 검사가 아무 말도 안 한 채로 화면이 `null.toFixed(1)` 을 불러 **통째로 터졌다**
 *    (2026-08-24 · 인천가현초 · `DESIGN.md §12-173-4`).
 *
 * 까닭 — **접근성은 2026-08-23 에 생긴 축이라 그 전 별점에는 값이 없다.**
 * `avg()` 는 null 을 안 세므로 그 학교의 전 별점에 접근성이 없으면 평균도 **null** 이 나온다.
 * ⛔ **0으로 채우지 않는다** — 0점을 준 사람과 안 고른 사람은 다르다(§11-1 의 결).
 * ⛔ 축을 새로 늘릴 때마다 같은 일이 생긴다. **화면은 늘 「값이 없는 축」을 그릴 수 있어야 한다.**
 */
export type RatingAvg = { std_code: string; n: number } & Record<AxisKey, number | null>;
export type RatingByYear = RatingAvg & { started_year: number };

/**
 * 3월 1일에 바뀌는 학년도. 한 번 남기면 **다음 3월 1일부터** 다시 남길 수 있다(§6).
 *
 * ⛔ 「2월 28일까지」라고 쓰지 않는다. 윤년이면 2월 29일이 있어 하루가 어긋난다.
 *    푸는 날(3월 1일)로 말하면 해마다 같다.
 * ⛔ 교사의 정기전보는 **3월 1일자뿐**이다(경기 제8조 ②). 9월 1일자는 교(원)감·교(원)장·
 *    교육전문직원이고, 교사 쪽은 휴·복직이나 신규 임용이 주라 학교 평가의 경계가 되지 않는다.
 */
export function schoolYearNow(now = new Date()) {
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return seoul.getMonth() + 1 >= 3 ? seoul.getFullYear() : seoul.getFullYear() - 1;
}

/** 잠금이 풀리는 날. 다음 3월 1일이다. */
/**
 * 다시 남길 수 있는 날. ⛔ **사람 말로 적는다** — `2027. 3. 1.` 은 기계가 찍은 꼴이라
 *    화면에서 날짜인지 판번호인지 한눈에 안 들어온다(2026-08-23 사장님 화면에서 그렇게 보였다).
 * ⛔ 소속교(`lib/home-school.ts`)도 **이 함수를 쓴다** — 두 곳이 다른 꼴로 적으면
 *    같은 3월 1일이 두 가지로 보인다(§11-3).
 */
export const unlockDate = (year = schoolYearNow()) => `${year + 1}년 3월 1일`;

/**
 * 학교 하나의 평균과 연도별 평균.
 *
 * ⛔ **문턱이 없다** — 한 명이 남긴 학교도 온다(2026-08-24). 아무도 안 남겼으면 `avg` 가 `null` 이고,
 *    화면은 그때 「아직 평가가 없습니다」를 적는다.
 * ⛔ 실패를 삼키지 않는다(§11-2). 못 읽으면 null 이 아니라 까닭을 함께 돌려준다.
 */
export async function ratingsOf(stdCode: string): Promise<{
  avg: RatingAvg | null;
  byYear: RatingByYear[];
  /** 이 학교에 근무 이력을 남긴 사람 수. 별점을 안 준 사람도 센다 */
  history: number;
  error: string | null;
}> {
  const [a, y, h] = await Promise.all([
    db.from("school_rating_avg").select("*").eq("std_code", stdCode).maybeSingle(),
    db.from("school_rating_by_year").select("*").eq("std_code", stdCode).order("started_year", { ascending: false }),
    db.from("school_history_count").select("n").eq("std_code", stdCode).maybeSingle(),
  ]);

  const error = a.error?.message ?? y.error?.message ?? h.error?.message ?? null;
  return {
    avg: (a.data as RatingAvg | null) ?? null,
    byYear: (y.data as RatingByYear[] | null) ?? [],
    history: (h.data as { n: number } | null)?.n ?? 0,
    error,
  };
}

/**
 * 여러 학교의 평균을 **한 번에** 읽는다 — 비교 판이 쓴다(§12-144).
 *
 * ⛔ 학교마다 `ratingsOf` 를 부르면 3곳에 요청이 아홉 번 나간다(뷰가 셋이다).
 *    비교 판에 필요한 것은 **평균뿐**이라 뷰 하나만 본다.
 * ⛔ **문턱이 없다** — 안 오는 것은 「아무도 안 남겼다」는 뜻이고, 화면은 「평가 없음」으로 적는다.
 * ⛔ 실패를 삼키지 않는다(§11-2).
 */
export async function ratingsOfMany(codes: string[]): Promise<{ avg: Record<string, RatingAvg>; error: string | null }> {
  if (!codes.length) return { avg: {}, error: null };
  const { data, error } = await db.from("school_rating_avg").select("*").in("std_code", codes);
  const avg: Record<string, RatingAvg> = {};
  for (const r of (data as RatingAvg[] | null) ?? []) avg[r.std_code] = r;
  return { avg, error: error?.message ?? null };
}
