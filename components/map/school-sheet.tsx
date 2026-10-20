"use client";

/**
 * 폰 — 지도 아래 시트. 손잡이를 끌어 세 단(살짝 / 반 / 가득)으로 세운다.
 *
 * 안에 드는 것(목록·상세)은 데스크톱 왼쪽 칸과 **같은 부품**이다(school-panel.tsx).
 * 여기는 그릇만 맡는다 — 둘에 따로 쓰면 한쪽만 고쳐져 조용히 어긋난다(§11-3).
 *
 * ⛔ 손잡이를 호버 뒤에 숨기지 않는다(§11-4). 폰에는 호버가 없어 영영 못 누른다.
 *    끄는 영역은 44px 이상으로 두고 touch-action:none 을 걸어 지도가 대신 끌려가지 않게 한다.
 * ⛔ 그릇을 단색으로 덮지 않는다 — 유리 두 겹(glass = 흐림·테두리·그림자 / glass-thick = 진하기)으로
 *    뒤 지도가 비치게 둔다. 시트가 화면의 88% 까지 올라가서, 단색이면 지도가 통째로 사라진다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Sido } from "@/lib/schools";
import type { GroupPin, Meta, Pin } from "@/lib/map";
import { SchoolDetail, SchoolList } from "./school-panel";

const PEEK = 104;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const nearest = (v: number, xs: number[]) => xs.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

export function SchoolSheet({
  sido, visible, groups, grouped, selected, meta, onSelect, onGroupPick, onClose, override, overrideKey,
}: {
  sido: Sido;
  visible: Pin[];
  groups: GroupPin[];
  grouped: boolean;
  selected: Pin | null;
  meta: Meta;
  onSelect: (p: Pin) => void;
  onGroupPick: (name: string) => void;
  onClose: () => void;
  /** 레일이 연 칸 — 있으면 목록·상세 대신 이것이 든다(`map-screen.tsx` · §12-95) */
  override?: React.ReactNode;
  /**
   * 그 칸이 무엇인가(`watch`·`me`·null). ⛔ **`override` 자체를 의존성으로 못 쓴다** —
   * 리액트 노드라 그릴 때마다 새것이라, 그걸로 시트를 올리면 **사람이 내려도 곧바로 다시 올라온다.**
   * 열쇠만 받아서 **바뀔 때 한 번**만 올린다.
   */
  overrideKey?: string | null;
}) {
  const [vh, setVh] = useState(800);
  const [height, setHeight] = useState({ value: selected || overrideKey ? Math.round(800 * 0.45) : PEEK, selected, overrideKey, vh });
  const h = height.value;
  const setH = useCallback((next: number | ((current: number) => number)) => {
    setHeight((current) => ({ ...current, value: typeof next === "function" ? next(current.value) : next }));
  }, []);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y0: number; h0: number } | null>(null);

  useEffect(() => {
    const on = () => setVh(window.innerHeight);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const snaps = useMemo(() => [PEEK, Math.round(vh * 0.45), Math.round(vh * 0.88)], [vh]);

  /**
   * 시트 높이를 CSS 변수로 내보낸다 — **지도 조작 단추가 이걸 보고 비켜 앉는다**(`globals.css`).
   * ⛔ 그 단추는 maplibre 가 만든 DOM 이라 리액트에서 클래스를 못 붙인다. 그래서 변수로 건넨다.
   * ⛔ 떠날 때 지운다 — 안 지우면 지도를 나가도 값이 남아 다음 화면이 그만큼 밀린다.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--sheet-h", `${h}px`);
    root.dataset.sheet = h >= snaps[2] - 8 ? "full" : "open";
    return () => {
      root.style.removeProperty("--sheet-h");
      delete root.dataset.sheet;
    };
  }, [h, snaps]);

  // 선택이나 창 크기가 달라진 렌더에서 높이를 맞춘다. 같은 선택에서는 사용자의 드래그를 보존한다.
  if (height.selected !== selected || height.overrideKey !== overrideKey || height.vh !== vh) {
    const raise = (selected && (height.selected !== selected || height.vh !== vh))
      || (overrideKey && (height.overrideKey !== overrideKey || height.vh !== vh));
    setHeight({ selected, overrideKey, vh, value: raise ? Math.max(h, snaps[1]) : h });
  }

  const onDown = useCallback((e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, h0: h };
    setDragging(true);
  }, [h]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!drag.current) return;
    setH(clamp(drag.current.h0 + (drag.current.y0 - e.clientY), PEEK, snaps[2]));
  }, [snaps, setH]);

  const onUp = useCallback(() => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    setH((cur) => nearest(cur, snaps));
  }, [snaps, setH]);

  return (
    <section
      aria-label="학교 목록"
      style={{ height: h, transition: dragging ? "none" : "height .22s cubic-bezier(.32,.72,0,1)" }}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-panel glass glass-thick"
    >
      {/* 손잡이 — 여기를 끈다 */}
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        role="separator"
        aria-label="시트 높이 조절"
        className="flex h-11 shrink-0 cursor-grab items-center justify-center active:cursor-grabbing"
        style={{ touchAction: "none" }}
      >
        <span className="h-1.5 w-11 rounded-full bg-divider" aria-hidden />
      </div>

      {override ?? (selected ? (
        <SchoolDetail p={selected} sido={sido} statYear={meta?.statYear ?? null} onBack={onClose} />
      ) : (
        <SchoolList
          sido={sido} visible={visible} groups={groups} grouped={grouped}
          meta={meta} onSelect={onSelect} onGroupPick={onGroupPick}
        />
      ))}
    </section>
  );
}
