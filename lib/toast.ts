/**
 * 토스트 — 화면 아래에 잠깐 떴다 사라지는 한 줄 (`docs/DESIGN.md §12-159`)
 *
 * 사장님(2026-08-23) — 「추가하거나 저장할 때마다 **토스트도 좀 띄워주고**.
 * **아무런 반응이 없는 버튼들이 너무 많음**」.
 *
 * ⛔ **이것은 §11-2 의 나머지 반쪽이다.** 가드 ②가 세는 것은 「실패를 버리지 않았나」인데,
 *    **성공했을 때 아무 말도 안 하는 것**도 같은 종류의 거짓말이다 —
 *    사람은 눌렀는데 아무 일도 안 일어나면 **안 눌린 줄 알고 또 누른다.**
 * ⛔ 부르는 쪽과 받는 쪽이 서로를 모른다(`lib/login-gate.ts` 와 같은 방식).
 *    받는 쪽은 `components/toast.tsx` 하나뿐이고 `app/layout.tsx` 에 달려 **어느 화면에서든** 뜬다.
 * ⛔ **오류 대신 쓰지 않는다.** 판 안에서 고쳐야 하는 잘못(가산점 범위 등)은 그 자리에 적는다 —
 *    토스트는 사라지므로 「무엇을 고쳐야 하나」를 담기에 맞지 않다.
 *    토스트가 맡는 것은 **끝난 일**이다(담겼다 · 저장했다 · 못 했다).
 */

export const TOAST_EVENT = "noonchi:toast";

/** 잘된 것 · 안 된 것. ⛔ 색으로만 가르지 않는다 — 글이 스스로 무엇이 일어났는지 말한다 */
export type ToastKind = "done" | "fail";
export type ToastDetail = { text: string; kind: ToastKind };

/**
 * 한 줄 띄운다. 어디서 불러도 된다.
 * ⛔ 문장을 길게 쓰지 않는다 — 2초 뒤에 사라지므로 읽을 시간이 그만큼뿐이다.
 */
export function toast(text: string, kind: ToastKind = "done") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { text, kind } }));
}
