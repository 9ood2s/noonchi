/**
 * 지도 화면이 쓰는 값 — 배경 타일 · 말풍선 색 · 모드
 *
 * ⛔ 구역 → 가산·연한 규칙은 여기 두지 않는다. lib/areas.mjs 한 곳에 있다(CLAUDE.md §11-3).
 *    여기는 "그 값을 무슨 색으로 칠하나" 만 정한다.
 */
import { INCHEON_GRADES, UNKNOWN_GRADE, areaLabel, incheonGradeLabel, regionBonus } from "@/lib/areas.mjs";
import { hasAreas, type School, type Sido } from "@/lib/schools";



/**
 * 지도를 **처음 그릴 때**만 쓰는 자리. 경기를 담는 범위다.
 *
 * ⛔ 시·도마다 중심을 적어 두지 않는다. 시·도를 바꾸면 화면이 **그 시·도 학교 좌표로
 *    `fitBounds` 를 다시 잡는다**(`map-screen.tsx`). 표를 두면 열일곱 줄을 손으로 맞춰야 하고,
 *    학교가 늘 때마다 어긋난다 — 데이터가 스스로 정하게 둔다(CLAUDE.md §7 「확장이 스위치가 되게」).
 */
export const FIRST_VIEW: { center: [number, number]; zoom: number } = {
  center: [127.2, 37.4],
  zoom: 8.4,
};

/** 시·군 말풍선이 보이는 구간과, 개별 학교로 갈라지는 지점 */
export const ZOOM_SPLIT = 10;

/**
 * 이 배율부터는 말풍선에 학교 이름을 같이 적는다.
 * ⛔ 인사구역은 시·군이 통째로 같은 경우가 많다 — 가까이 가면 "을 을 을 을" 만 남아
 *    어느 게 어느 학교인지 알 수 없다. 가까울수록 이름이 필요하다.
 */
export const ZOOM_NAME = 12.5;

/**
 * ⛔ **색 기준은 하나다 — 인사구역(경기) · 급지(인천).**
 *    전에는 「학급당 학생수」로 칠하는 모드가 하나 더 있었고 고르는 칩이 있었다.
 *    사장님이 「색기준은 하나로 고정하고 빼」(2026-08-22) 라 하셔서 걷어냈다.
 *    학급당 학생수는 학교 상세와 목록에 숫자로 그대로 있다 — 지도 색에서만 뺐다.
 *    되살리려면 이 커밋을 되짚으면 된다.
 */

/**
 * 멀리서 볼 때 무엇으로 묶나. **지금은 지원청 고정이다**(고르는 칩을 뺐다, 2026-08-22).
 * ⛔ 시군구는 이제 **필터**로 직접 고른다 — 묶음 기준을 바꾸는 것보다 뜻이 분명하다.
 */
export type Group = "지원청" | "시군구";

/**
 * 말풍선 색. 경기는 지역가산 크기, 인천은 근무연한 제한이 의미 있는 값이다(lib/areas.mjs).
 * ⛔ --up(빨강) --down(파랑) 을 쓰지 않는다. 그 둘은 오름/내림 뜻이 이미 박혀 있다.
 */
/**
 * 말풍선 색.
 *
 * ⛔ **눈대중으로 고르지 않는다.** Lab 공간의 ΔE(색 차이)로 재서 잡았다 —
 *    ① 서로 얼마나 다른가 ② **배경 지도 색과 얼마나 다른가** 둘 다 본다.
 *    배경 타일에서 가장 흔한 색을 뽑아 보면 베이지(#f4f2ed · #e9e8d5 · #e3e0cd)와
 *    물빛(#b0d3e4)이다 — 밝고 노란빛이다. 그래서 **황토·회색은 못 쓴다.**
 *    실제로 회색 말풍선은 지도와 ΔE 11 이라 그냥 묻혔고, 황토는 도로 색과 색상이 16° 차이였다
 *    (2026-08-22 사장님 — 「지도에 자주 등장하는 톤이라 눈에 안띔」).
 * ⛔ 화려하게 가지 않는다 — 채도 0.15~0.46 이다.
 * ⛔ 빨강·파랑에 오름/내림 뜻이 박혀 있어(--up · --down) 그 자리를 피한다.
 *
 * 지금 값 — 경기는 서로 가장 가까운 쌍 ΔE 33 · 인천 35, 지도와는 모두 ΔE 46 이상.
 */
export const PALETTE = {
  가산100: "#522c77",
  가산70: "#396a5b",
  가산50: "#863253",
  가산없음: "#4a435b",
  인천가: "#323786",
  인천나: "#2e6151",
  인천다: "#428235",
  인천영종: "#86326d",
  인천도서: "#7f412f",
  급지모름: "#4a435b",
  /**
   * **인사구역 고시를 아직 안 읽은 시·도.** 색으로 가를 것이 없으니 한 색으로 낸다.
   * ⛔ 새 색을 고르지 않았다 — 「가산 없음」과 같은 값이다. 그 색은 이미 배경 지도와
   *    ΔE 를 재서 잡아 둔 것이고, 두 시·도가 한 화면에 같이 뜨는 일이 없어 헷갈리지 않는다.
   */
  구역없음: "#4a435b",
  선택: "#16202e",
} as const;

/**
 * 말풍선 글자 색. **바탕이 밝으면 검은 글자**다.
 *
 * ⛔ 흰 글자로 고정하지 않는다. 「가산 없음 · ? 급지」는 일부러 밝은 회색이라
 *    흰 글자를 얹으면 대비가 1.9:1 이라 안 읽힌다(재서 잡았다).
 * 경계값 0.1833 은 흰 글자 대비가 딱 4.5:1 이 되는 상대휘도다 — 1.05/(L+0.05) = 4.5.
 */
export function pinInk(bg: string): string {
  const v = (i: number) => {
    const c = parseInt(bg.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * v(0) + 0.7152 * v(1) + 0.0722 * v(2);
  return lum > 0.1833 ? "#0a1a27" : "#ffffff";
}

export const AREA_COLORS = [...new Set(Object.values(PALETTE))];

/**
 * 학교 하나가 '구역' 모드에서 가질 색.
 *
 * ⛔ 인천은 **인사구역(Ⅰ·Ⅱ·Ⅲ)이 아니라 급지(가·나·다)로 칠한다.** 교사가 전보 때 보는 값이 급지다.
 *    급지가 없는 곳(동부·강화 — 아직 고시 전)은 회색으로 두고 말풍선에 「?」를 적는다.
 */
export function areaColor(sido: string, area: string | null, grade: string | null): string {
  /**
   * ⛔ **인사구역 고시를 아직 안 읽은 시·도**는 여기서 끝난다. 아래 규칙은 경기·인천 전용이라
   *    그대로 태우면 「갑구역 · 지역가산 없음」 색이 나온다 — 우리가 모르는 것을 안다고 칠하는 셈이다.
   */
  if (!hasAreas(sido as Sido) || !area) return PALETTE.구역없음;
  if (sido === "인천") {
    if (grade === "가") return PALETTE.인천가;
    if (grade === "나") return PALETTE.인천나;
    if (grade === "다") return PALETTE.인천다;
    if (grade === "영종지역") return PALETTE.인천영종;
    if (grade === "도서지역") return PALETTE.인천도서;
    return PALETTE.급지모름;
  }
  const p = regionBonus(area, grade).percent;
  if (p >= 100) return PALETTE.가산100;
  if (p >= 70) return PALETTE.가산70;
  if (p >= 50) return PALETTE.가산50;
  return PALETTE.가산없음;
}

/**
 * **지도 말풍선**에 박히는 글자 — 짧게.
 *   경기 — 갑 · 을 · 병 (급지는 **색**으로 가른다. 병 가·나는 진하게, 다·라는 중간)
 *   인천 — 가 · 나 · 다
 *
 * ⛔ 「병나」처럼 붙여 쓰지 않는다. 원문은 「병 │ 나」로 칸을 나눠 적고,
 *    붙이면 「병나」라는 없는 급지가 있는 것처럼 읽힌다.
 * ⛔ 급지를 말풍선에서 뺐다고 못 찾는 게 아니다 — 필터에서 급지로 고를 수 있고,
 *    상세에는 「병-나」로 다 나온다.
 */
/**
 * ⛔ 인사구역이 없는 시·도는 **null 을 낸다.** 「없음」·「-」 같은 글자를 지어내지 않는다 —
 *    말풍선에 적을 것이 없으면 안 적는 것이 맞다. 왜 없는지는 범례 자리에서 한 번만 말한다.
 */
export const mapLabel = (sido: Sido, area: string | null, grade: string | null): string | null =>
  !hasAreas(sido) || !area
    ? null
    : sido === "인천"
      ? (incheonGradeLabel(grade, { short: true }) as string)
      : (areaLabel(area, null) as string);

/** 필터·상세에 쓰는 **온전한** 이름. 경기는 급지까지 — "병-나" · 인천은 "가급지" */
export const fullLabel = (sido: Sido, area: string | null, grade: string | null): string | null =>
  !hasAreas(sido) || !area
    ? null
    : sido === "인천"
      ? (incheonGradeLabel(grade) as string)
      : (areaLabel(area, grade) as string);

/**
 * 범례 한 줄 — 무슨 색이 무엇을 뜻하는지, 그리고 **그 줄을 누르면 걸리는 필터**.
 *
 * ⛔ 설명과 필터를 갈라 두지 않는다(2026-08-21 사장님). 색을 보고 「이게 뭐지」 한 사람이
 *    바로 그 줄을 눌러 그것만 보게 한다. 갈라 두면 같은 값을 고르는 길이 둘이 되고 어긋난다(§11-3).
 */
export type LegendPick = { zones?: string[]; grades?: string[] };
export type LegendRow = { color: string; label: string; pick: LegendPick };

export function legend(sido: Sido): LegendRow[] {
  // ⛔ 인사구역이 없는 시·도는 **범례가 빈다.** 색으로 가른 것이 없는데 범례를 내면 거짓말이 된다.
  if (!hasAreas(sido)) return [];
  if (sido === "인천")
    return [
      { color: PALETTE.인천가, label: "가급지", pick: { grades: ["가"] } },
      { color: PALETTE.인천나, label: "나급지", pick: { grades: ["나"] } },
      { color: PALETTE.인천다, label: "다급지", pick: { grades: ["다"] } },
      { color: PALETTE.인천영종, label: "영종지역", pick: { grades: ["영종지역"] } },
      { color: PALETTE.인천도서, label: "도서지역", pick: { grades: ["도서지역"] } },
      { color: PALETTE.급지모름, label: "? · 지원청 고시 전", pick: { grades: [UNKNOWN_GRADE] } },
    ];
  // ⛔ 경기는 색이 **지역가산 크기**다. 구역 하나가 아니라 구역+급지 묶음에 걸린다.
  return [
    { color: PALETTE.가산100, label: "병 가·나 · 지역가산 100%", pick: { zones: ["병"], grades: ["가", "나"] } },
    { color: PALETTE.가산70, label: "병 다·라 · 70%", pick: { zones: ["병"], grades: ["다", "라"] } },
    { color: PALETTE.가산50, label: "을 · 50%", pick: { zones: ["을"] } },
    { color: PALETTE.가산없음, label: "갑 · 없음", pick: { zones: ["갑"] } },
  ];
}

/** 이 학교가 범례 한 줄이 가리키는 무리인가. 그 줄을 낼지 말지 셀 때 쓴다 */
export function matchPick(pick: LegendPick, p: Pick<Pin, "a" | "g">): boolean {
  if (pick.zones && (p.a == null || !pick.zones.includes(p.a))) return false;
  if (pick.grades && !pick.grades.includes(p.g ?? UNKNOWN_GRADE)) return false;
  return true;
}

/** 두 목록이 같은 것을 담고 있나. 범례 줄이 지금 켜져 있는지 볼 때 쓴다 */
const same = (a: string[] = [], b: string[] = []) => a.length === b.length && a.every((x) => b.includes(x));

/** 이 범례 줄이 지금 걸려 있나 */
export const legendOn = (pick: LegendPick, zones: string[], grades: string[]) =>
  same(pick.zones ?? [], zones) && same(pick.grades ?? [], grades);

/** 지도가 받는 한 점. 이름을 짧게 쓰는 것은 1,638개가 한 번에 오기 때문이다. */
export type Pin = {
  k: string | null; n: string; f: string | null; o: string; c: string | null;
  /** 인사구역. ⛔ **null 은 「모른다」다** — 고시 원문을 안 읽은 시·도의 학교다 */
  a: string | null; g: string | null; t: number | null; b: number;
  /** 교원 수 중 여 · 남 (학교알리미). ⛔ 총계(`t`)와 안 맞으면 원자료에서 이미 둘 다 비워 온다 */
  tf: number | null; tm: number | null;
  /** 학교 홈페이지 (나이스). ⛔ 적재할 때 `https://` 를 붙여 둔 값이다 */
  h: string | null;
  /** 학년별 학생수 1~6학년. ⛔ 총계와 맞을 때만 온다 — 없으면 null (§12-138) */
  sg: number[] | null;
  /** 이 숫자들이 몇 년 공시인가. 올해가 아니면 화면이 별표를 붙인다(§12-142) */
  sy: number | null;
  /** 학생수 · 학급수. 화면은 이 둘로 학급당 학생수를 낸다 */
  st: number | null; cl: number | null;
  /** 도서 지역인가 (1/0). 화면에서 켜고 끈다 */
  i?: 0 | 1;
};

export const pinOf = (s: School): Pin => ({
  k: s.stdCode, n: s.name, f: s.officialName, o: s.office, c: s.city,
  a: s.area, g: s.areaGrade, t: s.teachers, b: s.branches.length,
  tf: s.teachersF, tm: s.teachersM, h: s.homepage, sg: s.studentsByGrade, sy: s.statYear,
  st: s.students, cl: s.classes,
});

/** 지도가 받아 가는 꾸러미. 화면 여러 곳이 같이 쓰므로 여기 둔다(components 끼리 서로 import 하면 고리가 생긴다). */
export type Feat<P> = { id: number; geometry: { coordinates: [number, number] }; properties: P };
export type GroupPin = { g: string; n: number };
export type Meta = {
  total: number; placed: number;
  unplaced: { name: string; office: string }[];
  /** 도서 지역 학교 수 */
  islands: number;
  /**
   * 그 시·도에서 **가장 최근 공시 연도**(학교알리미). 0 이면 공시가 하나도 없다.
   * ⛔ 인사구역 고시가 없는 시·도는 이것이 자료 출처의 기준일이 된다 — 출처가 빈 화면을 안 낸다(§2).
   */
  statYear: number;
};
export type Pack = {
  schools: { features: Feat<Pin>[] };
  offices: { features: Feat<GroupPin>[] };
  cities: { features: Feat<GroupPin>[] };
  meta: Meta;
};
/**
 * `/map/data/<시·도>` 가 돌려주는 것 — **한 시·도치**다.
 * ⛔ 전에는 열일곱 시·도가 한 덩이로 왔다. 전국이 되면서 갈랐다(`app/map/data/[sido]/route.ts`).
 */
export type SidoPack = { year: number; sido: Sido } & Pack;

/** 말풍선·상세에 쓸 학급당 학생수. 둘 중 하나라도 없으면 null. */
export const pinPerClass = (p: Pick<Pin, "st" | "cl">) => (p.st && p.cl ? p.st / p.cl : null);

/**
 * 말풍선에 무엇을 적나 — **레이어 창에서 고른다**(2026-08-23 사장님).
 * ⛔ 필터가 아니다. 어느 학교를 보여줄지는 안 바꾸고 **적는 글자만** 바꾼다.
 * ⛔ **여럿을 한꺼번에 고를 수 있다**(2026-08-23 사장님 「여러개 선택할 수도 있게」).
 *    그래서 숫자에는 **단위를 붙인다** — 「15 · 23.7」은 어느 것이 학급수인지 못 가린다.
 * ⛔ 여럿일 때는 **줄을 나눠 쌓는다**(2026-08-23 사장님 「같은 줄이 있으니 보기 싫음」) —
 *    한 줄로 이으면 말풍선이 옆으로 길어져 옆 학교를 덮는다. 그래서 여기서는 **잇지 않고**
 *    배열 그대로 낸다. 줄을 어떻게 놓을지는 화면이 정한다.
 * ⛔ 값이 없는 학교는 그 칸을 비운다 — 0 으로 적지 않는다. 0학급인 학교는 없다.
 * ⛔ 하나도 안 고르면 **글자 없이 색만** 남는다. 그것도 쓸 수 있는 상태다(범례가 색을 말한다).
 */
export type PinValue = "구역" | "학급수" | "학급당";
export const PIN_VALUES: { key: PinValue; label: string }[] = [
  { key: "구역", label: "인사구역 · 급지" },
  { key: "학급수", label: "학급 수" },
  { key: "학급당", label: "학급당 학생수" },
];

/** 그 학교의 말풍선에 적힐 글자들. 고른 차례가 아니라 **늘 같은 차례**로 낸다 */
export function pinTexts(vs: PinValue[], sido: Sido, p: Pin): string[] {
  const out: string[] = [];
  // ⛔ 구역이 없는 시·도는 그 칸을 **비운다.** 「?」도 안 적는다 — 학교마다 붙는 물음표는 아무 말도 안 한다
  const zone = vs.includes("구역") ? mapLabel(sido, p.a, p.g) : null;
  if (zone) out.push(zone);
  // ⛔ 「15개」가 아니라 **「15학급」**이다(2026-08-23 사장님). 「개」는 무엇을 세는지 안 말한다
  if (vs.includes("학급수") && p.cl != null) out.push(`${p.cl}학급`);
  if (vs.includes("학급당")) {
    const per = pinPerClass(p);
    if (per != null) out.push(`${per.toFixed(1)}명`);
  }
  return out;
}

/**
 * 필터 갈래. ⛔ 이름이 필요한 까닭 — 「고를 거리」를 만들 때 **자기 자신만 빼고** 세야 한다.
 *    급지를 「가」로 걸어 둔 채 급지 목록까지 급지로 거르면 「나」가 사라져 둘째를 못 고른다.
 */
export type Facet = "zones" | "grades" | "offices" | "cities" | "classes";
export const FACETS: Facet[] = ["zones", "grades", "offices", "cities", "classes"];

/**
 * 필터가 고르는 값 셋 — 구역 · 급지 · 학급수.
 *
 * ⛔ 구역과 급지는 **다른 값이다.** 경기는 구역(갑·을·병) 안에 급지(가·나·다·라)가 있고,
 *    인천은 인사구역(Ⅰ·Ⅱ·Ⅲ)과 급지(가·나·다·영종·도서)가 아예 따로 돈다.
 *    전에는 「병나」처럼 붙인 열쇠 하나로 골랐는데, 그러면 「병 전체」나 「가급지 전체」를 못 고른다.
 */
// ⛔ 인사구역이 없는 시·도는 **고를 거리가 없다.** 빈 목록을 내면 필터 단추가 저절로 사라진다.
export const zoneChoices = (sido: Sido): string[] =>
  !hasAreas(sido) ? [] : sido === "인천" ? ["Ⅰ", "Ⅱ", "Ⅲ"] : ["갑", "을", "병"];

export const gradeChoices = (sido: Sido): string[] =>
  !hasAreas(sido) ? [] : sido === "인천" ? [...INCHEON_GRADES, UNKNOWN_GRADE] : ["가", "나", "다", "라"];

/** 급지 한 칸의 이름. 인천은 「가급지」, 경기는 「가」 (경기 급지는 병 아래에만 있다) */
export const gradeLabel = (sido: Sido, g: string, short = false) =>
  sido === "인천" ? (incheonGradeLabel(g, { short }) as string) : g;

