/**
 * 「이 학교를 담았다 / 뺐다」를 지도에 알리는 한 줄짜리 통로.
 *
 * 하트는 **학교 상세 안**에 있고(`components/watch-button.tsx`) 숫자 배지는 **지도 말풍선** 위에 있다
 * (`components/map/map-screen.tsx`). 둘은 서로를 모른다 —
 * 지도는 layout 아래 어디에나 있을 수 있고, 상태를 위로 끌어올리면 그 위의 모든 화면이 같이 다시 그려진다.
 * → `lib/panel.ts` 와 같은 방식으로 브라우저 이벤트 하나만 건넨다.
 *
 * ⛔ **왜 서버를 다시 안 부르나** — `/map/watch` 는 2분 캐시라 방금 담은 것이 바로 안 온다.
 *    누른 사람에게는 **그 자리에서** 숫자가 움직여야 한다(§12-159 — 반응 없는 단추를 없앤다).
 * ⛔ 그래서 **성공한 뒤에만** 보낸다. 미리 보내고 되돌리면 화면이 잠깐 거짓말을 한다(§11-2).
 */

export const WATCH_EVENT = "noonchi:watch";
export type WatchDetail = { stdCode: string; saved: boolean };

export function notifyWatch(stdCode: string, saved: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<WatchDetail>(WATCH_EVENT, { detail: { stdCode, saved } }));
}
