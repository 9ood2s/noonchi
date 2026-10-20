/**
 * 로그인 · 가입을 **지도 위 모달**로 연다 (`docs/DESIGN.md §12-95` · §12-144)
 *
 * 2026-08-23 사장님 — 「**회원가입과 로그인 모두 지도창 위의 모달에서** 진행하면 좋겠음」.
 * §12-95 「지도화면에서 나가는 페이지는 만들지마」와 같은 줄기다.
 *
 * ⛔ **`lib/panel.ts` 와 달리 주소를 바꾸지 않는다.** 칸(관심목록·마이페이지)은 새로고침해도
 *    같은 것이 열려야 하지만, 로그인 모달은 그럴 이유가 없다 — 로그인이 끝나면 제자리로 돌아온다.
 *    주소에 남겨 두면 로그인한 뒤 새로고침할 때마다 다시 뜬다.
 * ⛔ 부르는 쪽과 받는 쪽이 서로를 모른다. 받는 쪽은 `components/login-gate.tsx` 하나뿐이고
 *    `app/layout.tsx` 에 달려 있어 **어느 화면에서든** 뜬다.
 */

export const LOGIN_EVENT = "noonchi:login";

/** 로그인 모달을 연다. 어디서 불러도 된다 */
export function openLogin() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOGIN_EVENT));
}

/**
 * 로그인이 끝나면 돌아올 곳 = **지금 보고 있는 화면**.
 * ⛔ 경로와 물음표 뒤만 쓴다 — 주소 전체를 넘기면 우리 화면 밖으로도 보낼 수 있다(`safeNext`).
 */
export function hereAsNext(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname + window.location.search;
}
