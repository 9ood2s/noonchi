/**
 * 통근 경로를 지도에 그리라고 알리는 통로 (`docs/DESIGN.md §12-101`)
 *
 * ⛔ 통근 칸은 학교 상세 안에 있고, 선을 그리는 것은 지도다 — 둘은 서로를 모른다.
 *    상태를 위로 끌어올리면 학교를 고를 때마다 지도 전체가 다시 그려진다.
 *    그래서 `lib/panel.ts` 와 같은 방식으로 **브라우저 이벤트 하나**로 건넨다.
 * ⛔ 학교를 갈아타거나 칸을 닫으면 **반드시 지우라고 알린다.** 안 그러면 옛 경로가
 *    남의 학교 위에 남는다.
 */

export type RouteLine = {
  /** 자동차 경로 [[경도,위도], …] */
  car: [number, number][] | null;
  /** 대중교통 구간별 선 — 수단이 달라 색을 가른다 */
  transit: { kind: string; points: [number, number][] }[] | null;
  /**
   * 「출근」이면 선의 **시작이 집**이고 끝이 학교, 「퇴근」이면 그 반대다.
   * ⛔ 집 좌표를 따로 안 보낸다 — **선의 양 끝이 곧 집과 학교**다.
   *    따로 보내면 둘이 어긋날 수 있고(격자로 뭉갠 집과 실제 출발점이 다르다),
   *    그러면 아이콘이 선에서 떨어져 뜬다.
   */
  dir: "출근" | "퇴근";
};

export const ROUTE_EVENT = "noonchi:route";

export function showRoute(line: RouteLine | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RouteLine | null>(ROUTE_EVENT, { detail: line }));
}

/* ────────────────────────────────────────────────────────────────────────
   상세보기 — 고른 경로의 구간 목록

   ⛔ **넓은 화면에서는 접었다 폈다 하지 않고 옆 칸으로 편다**
      (2026-08-23 사장님 — 「상세보기는 패널옆에 닫을수 있는 새로운 패널을 열거나
      패널을 옆으로 확장해서 보여줘야 가독성이 좋지」).
      길찾기 칸은 학교 상세 안에 들어 있어서 폭이 380px 이고, 그 안에서 또 펼치면
      환승 네 번짜리 여정이 글자만 잘린 채 세로로 길어진다.
   ⛔ 폰(1024 미만)은 옆 칸을 세울 자리가 없다. 거기서는 그대로 접었다 편다.
   ⛔ 여는 쪽(길찾기 칸)과 그리는 쪽(지도)이 서로를 모른다 — `ROUTE_EVENT` 와 같은 방식이다.
   ──────────────────────────────────────────────────────────────────────── */

/** 여정 한 구간 — 지도에 그리는 좌표(points)는 여기 안 담는다. 화면에 쓸 것만 */
export type RouteStep = {
  kind: string;
  label: string;
  from: string | null;
  to: string | null;
  stops: number | null;
  min: number | null;
  m: number | null;
};

export type RouteDetail = {
  mode: string;
  /** 「최적」·「최소환승」 같은 이름 */
  label: string;
  min: number;
  km: number | null;
  transfers: number | null;
  walk: number | null;
  toll: number | null;
  /** 「출근」·「퇴근」 */
  dir: string;
  /** 「07:30 기준」의 그 시각 */
  at: string | null;
  steps: RouteStep[];
};

export const ROUTE_DETAIL_EVENT = "noonchi:route-detail";
/** 옆 칸의 ✕ → 길찾기 칸에게 「접어라」고 되알린다. 펼침 상태의 주인은 길찾기 칸 하나다 */
export const ROUTE_DETAIL_CLOSE = "noonchi:route-detail-close";

export function showRouteDetail(d: RouteDetail | null) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<RouteDetail | null>(ROUTE_DETAIL_EVENT, { detail: d }));
}

export function closeRouteDetail() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ROUTE_DETAIL_CLOSE));
}
