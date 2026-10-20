/**
 * 학교 한 곳의 **공공데이터 표** — 지도 상세(`components/map/school-panel.tsx`)와
 * 정적 화면(`app/school/[code]/page.tsx`)이 **같은 것을 쓴다.**
 *
 * ⛔ 두 화면에 따로 쓰지 않는다. 한쪽만 고쳐져 조용히 어긋난다(CLAUDE.md §11-3).
 *    지도는 브라우저에서, 정적 화면은 빌드할 때 그리는데 **표에 적히는 값은 같아야 한다.**
 * ⛔ 여기는 「무엇을 적나」만 정한다. 어떻게 생겼나(칸·선·색)는 각 화면이 정한다.
 */
import { INCHEON_GRADE_PENDING, UNKNOWN_GRADE, areaFact, areaLabel, incheonGradeLabel } from "@/lib/areas.mjs";
import { pinPerClass, type Pin } from "@/lib/map";
import { hasAreas, type Sido } from "@/lib/schools";

/**
 * 값이 없을 때 쓰는 말 — **「공시 없음」 하나다.**
 *
 * ⛔ 「—」는 「모른다」로 읽히고 0 은 **거짓말**이다(학생이 0명인 학교는 없다).
 *    그래서 무언가는 적어야 한다(2026-08-23 사장님 — 「0으로 비워두지 말고」).
 * ⛔ **왜 없는지를 우리가 짐작하지 않는다**(2026-08-23 사장님 — 「군서미래국제학교는
 *    초중고 통합인데, **21년 개교**야. 그냥 개교예정이건 그냥 없건 구분하지 말고
 *    **솔직하게 공시 없음**이라고 쓰자」).
 *    ⭐ 내가 「학급·교원이 없으면 개교 예정」이라는 규칙을 세웠다가 틀렸다 —
 *       군서미래국제학교는 2021년에 문을 열었는데 초중고 통합이라 초등 공시에 안 잡힌다.
 *       **값이 없는 까닭은 여러 가지고, 우리는 그중 어느 것인지 모른다.**
 */
export const NONE = "공시 없음";

/** 표 한 칸. `href` 면 단추로 그린다(학교 홈페이지) */
export type Cell = { k: string; v: string | { href: string } };

export type Facts = {
  cells: Cell[];
  /**
   * **몇 년 공시인가.** 올해 공시에 없어 작년 것으로 되돌아간 학교만 값이 있다(§12-142).
   * ⛔ 되돌아갔을 때만 적는다 — 늘 붙어 있는 별표는 아무 말도 안 한다.
   * ⛔ 값이 **아예 없는 학교**(「공시 없음」)에는 안 붙인다. 없는 값에 연도를 다는 것은 뜻이 없다.
   */
  oldYear: number | null;
  /** 지역가산 각주 (경기). 없으면 null */
  note: string | null;
  /** 인천 급지가 아직 고시 전인 학교에 다는 줄. 없으면 null */
  gradePending: string | null;
  /**
   * **인사구역 고시 원문을 아직 안 읽은 시·도인가.** 참이면 표에 구역·지역가산 칸이 아예 없다 —
   * 화면이 그 자리에 `components/area-notice.tsx` 를 놓는다.
   * ⛔ 「없음」을 적어 칸을 채우지 않는다. 없는 것은 구역이 아니라 우리가 읽은 고시문이다.
   */
  areaPending: boolean;
};

/**
 * 표에 적히는 것들.
 *
 * ⛔ 인천은 **급지만** 낸다. 인사구역 Ⅰ·Ⅱ·Ⅲ 은 화면에 안 넣는다 —
 *    교사가 전보 때 보는 값이 아니다(2026-08-21 사장님 확인). 저장은 그대로 두고 보여주지만 않는다.
 * ⛔ 인천은 근무연한 칸이 없다(`areaFact` 가 null 을 낸다) — 실제 제한이 지원청 세부기준에 있어
 *    시 기준으로 쓰면 틀린다. 확인 안 된 값은 안 낸다.
 */
export function schoolFacts(sido: Sido, p: Pin): Facts {
  /**
   * ⛔ 인사구역이 없는 시·도는 **구역 규칙을 태우지 않는다.** `areaFact` 는 경기 지역가산표를
   *    쓰는 함수라 area 가 null 이면 「갑구역 · 지역가산 없음」이 나온다 — 우리가 모르는 것을
   *    안다고 적는 셈이다(2026-08-23).
   */
  const areaPending = !hasAreas(sido) || !p.a;
  // 학급수를 넘겨 「5학급 이하 30%」를 가리게 한다 — 그래야 갑구역의 "—" 가 닫힌다
  const fact = areaPending ? null : areaFact(sido, p.a, p.g, p.cl);
  const per = pinPerClass(p);
  const oldYear = p.sy != null && p.st != null ? p.sy : null;

  const cells: Cell[] = [
    // ⛔ 구역을 모르는 시·도는 이 칸을 **아예 안 만든다.** 「공시 없음」과 뜻이 다르다 —
    //    저쪽은 「그 학교 값이 없다」이고 이쪽은 「우리가 그 시·도 규칙을 아직 안 읽었다」다
    ...(areaPending || p.a == null
      ? []
      : [
          sido === "인천"
            ? { k: "급지", v: incheonGradeLabel(p.g) as string }
            : { k: "인사구역", v: areaLabel(p.a, p.g) as string },
        ]),
    ...(fact ? [{ k: "지역가산", v: fact.label.replace(/^지역가산\s*/, "") }] : []),
    { k: "학급당 학생수", v: per == null ? NONE : `${per.toFixed(1)}명` },
    { k: "교육지원청", v: p.o },
    { k: "학생 수", v: p.st == null ? NONE : `${p.st.toLocaleString()}명${oldYear ? "*" : ""}` },
    { k: "학급 수", v: p.cl == null ? NONE : `${p.cl}개` },
    /**
     * 교원 수 — 학교알리미(apiType 22)에서 받아 둔 값을 화면에 낸다
     * (2026-08-23 사장님 — 「남녀교사숫자 이런것도 넣으라고 했는데 빼먹었더라」).
     * ⛔ **TO 를 이 수로 짐작해 적지 않는다.** 「동일교 재직교사의 1/2」은 내신 상한이지 자리 수가 아니다.
     * ⛔ 남녀는 **둘 다 있을 때만** 낸다. 총계와 안 맞아 판독기가 버린 학교는 둘 다 비어 있는데,
     *    그때 한쪽만 적으면 나머지가 0인 것처럼 읽힌다.
     */
    {
      k: "교원 수(남/여)",
      v:
        p.t == null
          ? NONE
          : p.tm == null || p.tf == null
            ? `${p.t}명`
            : `${p.t}명(${p.tm}명/${p.tf}명)`,
    },
    /**
     * 학교 홈페이지 — ⛔ **주소를 그대로 적지 않는다**(2026-08-23 사장님 — 「url 길게 쓰지 말고
     * 버튼으로 만들어서 접속하면 …」). `https://gagok-e.goegn.kr` 같은 주소는 사람이 읽을 것이 아니고,
     * 칸 폭을 넘겨 줄을 밀어낸다.
     */
    { k: "학교 홈페이지", v: p.h ? { href: p.h } : NONE },
  ];

  return {
    cells,
    oldYear,
    note: fact?.note ?? null,
    /** ⛔ 없는 값을 「없음」으로 굳히지 않는다. 어디가 왜 「?」인지 그 자리에 적는다. */
    gradePending:
      sido === "인천" && !p.g
        ? `급지 ${UNKNOWN_GRADE} · ${INCHEON_GRADE_PENDING.join("·")}교육지원청은 인사관리세부기준 고시 전`
        : null,
    areaPending,
  };
}
