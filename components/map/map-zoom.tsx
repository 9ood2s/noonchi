"use client";

/**
 * 줄이는·키우는 단추 — **우리가 그린다** (`docs/DESIGN.md §12-169`)
 *
 * 사장님(2026-08-24) — 「+- 버튼이 **우리 디자인이랑 안맞는데** 이건 어떻게 할 수 없나?」.
 *
 * ⛔ **네이버가 만든 단추는 우리 CSS 로 못 고친다.** 그 단추를 만드는 코드가 나중에 따로 받아지는
 *    서브모듈 안에 있어서 클래스 이름을 코드에서 확인할 수가 없다(2026-08-23 에 `maps.js` 를 받아
 *    뒤졌는데 `map_copyright` 하나뿐이었다). **확인 못 한 이름을 겨눈 CSS 는 아무것도 안 하면서
 *    통과만 한다** — 고친 줄 알고 넘어가는 것이 제일 나쁘다.
 * ⭐ 그래서 **그쪽 것을 끄고 우리 것을 그린다**(`zoomControl: false`). 지도를 여닫는 것은
 *    `setZoom` 한 줄이라 우리가 못 할 이유가 없었다.
 * ⛔ 생김새는 **레이어·크로스헤어 단추와 같다**(`glass-2` · `size-11` · `rounded-[15px]`).
 *    같은 자리에 서는 단추가 서로 다르게 생기면 어느 것이 우리 것인지 알 수 없다.
 * ⛔ **폰에서는 안 낸다.** 아래 시트가 화면의 45% 를 덮어 단추가 그 뒤에 숨는다 —
 *    보이는데 안 눌리는 것보다 없는 편이 낫다(§11-4). 손가락은 오므려서 줄인다.
 * ⛔ 한계에 닿으면 **못 누르게 한다.** 눌리는데 아무 일도 안 일어나면 고장으로 읽힌다.
 */

import { Minus, Plus } from "lucide-react";

export function MapZoom({
  zoom, min, max, onZoom,
}: {
  zoom: number;
  min: number;
  max: number;
  onZoom: (to: number) => void;
}) {
  return (
    <div className="pointer-events-auto absolute right-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-1.5 lg:flex">
      <button
        type="button"
        onClick={() => onZoom(Math.min(max, Math.round(zoom) + 1))}
        disabled={zoom >= max - 0.01}
        aria-label="크게 보기"
        className="glass-2 flex size-11 items-center justify-center rounded-[15px] text-ink2 active:opacity-80 disabled:opacity-40"
      >
        <Plus size={18} strokeWidth={2} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => onZoom(Math.max(min, Math.round(zoom) - 1))}
        disabled={zoom <= min + 0.01}
        aria-label="작게 보기"
        className="glass-2 flex size-11 items-center justify-center rounded-[15px] text-ink2 active:opacity-80 disabled:opacity-40"
      >
        <Minus size={18} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}
