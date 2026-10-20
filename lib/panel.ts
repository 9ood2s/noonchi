/**
 * 레일 ↔ 지도 사이의 한 줄짜리 통로 (`docs/DESIGN.md §12-95`)
 *
 * ⛔ **모든 것은 지도를 열어 둔 채로 한다**(2026-08-23 사장님 — 「지도화면에서 나가는 페이지는
 *    만들지마. 모든걸 지도를 열어둔 상태에서 다 처리할 수 있게」).
 *    그래서 레일이 즐겨찾기·마이페이지를 누르면 **화면을 갈아치우지 않고** 지도 위 칸을 연다.
 *
 * ⛔ **`useSearchParams` 를 쓰지 않는다.** 그것을 쓰면 지도 화면이 Suspense 를 요구해서
 *    정적 생성이 깨진다(`map-screen.tsx` 가 시·도를 읽을 때 이미 같은 까닭으로 피했다).
 * ⛔ 리액트 상태를 위로 끌어올리지도 않는다 — 레일은 `app/layout.tsx` 에 있고 지도는
 *    그 자식이라, 끌어올리면 **레일이 든 모든 화면**이 지도 상태를 안고 다시 그려진다.
 * → 그래서 브라우저 이벤트 하나로 건넨다. 보내는 쪽도 받는 쪽도 서로를 모른다.
 *
 * 처음 들어올 때(다른 화면에서 지도로 올 때)는 주소에 적어 보낸다 — `/map?panel=watch`.
 */

export type PanelKey = null | "watch" | "me";

export const PANEL_EVENT = "noonchi:panel";

/** 주소에 적힌 것이 쓸 수 있는 값인가 */
export const panelFrom = (v: string | null): PanelKey =>
  v === "watch" || v === "me" ? v : null;

/**
 * 칸을 열라고 알린다. ⛔ 주소도 함께 바꾼다 — 새로고침하면 같은 칸이 다시 열려야 한다.
 *    ⛔ `pushState` 가 아니라 `replaceState` 다. 칸을 여닫을 때마다 뒤로가기 이력이 쌓이면
 *       사용자가 지도를 벗어나려고 뒤로가기를 열 번 눌러야 한다.
 */
export function openPanel(key: PanelKey) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (key) url.searchParams.set("panel", key);
  else url.searchParams.delete("panel");
  window.history.replaceState(null, "", url);
  window.dispatchEvent(new CustomEvent<PanelKey>(PANEL_EVENT, { detail: key }));
}
