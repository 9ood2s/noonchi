"use client";

/**
 * 범례 — **급지가 무슨 색인지 알려 준다** (`docs/DESIGN.md §12-97`)
 *
 * 자리는 **오른쪽 아래**다(2026-08-23 사장님).
 *
 * ⛔ **누르는 것이 아니다.** 색으로 고르는 일은 §12-91-1 에서 없앴다 — 구역·급지 필터와
 *    같은 일을 둘로 하고 있었기 때문이다. 여기 남은 것은 **설명 하나**다.
 * ⛔ **네이버 로고와 자리를 다툰다.** 로고는 오른쪽 아래 구석에 붙박이로 서고
 *    **없앨 수 없다**(네이버 지도 이용 조건이다 — `logoControl: false` 는 약관 위반이다).
 *    자리도 `position` 하나만 바꿀 수 있고 크기·모양은 못 건드린다.
 *    그래서 **범례가 비켜 앉는다**(`bottom-8`) — 겹쳐 있으면 둘 다 지저분해 보인다.
 * ⛔ 줄이는·키우는 단추는 오른쪽 **가운데**로 보냈다(`map-screen.tsx`) — 여기 셋이 모이면
 *    오른쪽 아래가 통째로 막힌다.
 * ⛔ 흐림을 두 겹으로 걸지 않는다. 작은 판이라 `glass-2` 하나면 된다.
 */

import { useEffect, useRef } from "react";
import type { Sido } from "@/lib/schools";
import { legend } from "@/lib/map";
import { AreaNoticeLine } from "@/components/area-notice";

export function MapLegend({ sido }: { sido: Sido }) {
  const box = useRef<HTMLDivElement>(null);
  const rows = legend(sido);

  // 내 높이를 내보낸다 — 지도 조작 단추가 이걸 보고 위에 앉는다
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--legend-h", `${el.offsetHeight}px`);
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => {
      ro.disconnect();
      document.documentElement.style.removeProperty("--legend-h");
    };
  }, [sido]);

  return (
    <div
      ref={box}
      aria-label="말풍선 색"
      className="glass-2 pointer-events-none absolute bottom-8 right-3 z-20 hidden rounded-card px-2.5 py-2 lg:block"
    >
      {/*
        ⛔ **인사구역 고시를 아직 안 읽은 시·도는 색으로 가른 것이 없다.** 빈 판을 띄우지 않고
           왜 비었는지 한 줄로 적는다 — 판이 아예 사라지면 「범례가 없어졌다」로 읽힌다.
      */}
      {rows.length === 0 && <AreaNoticeLine />}
      <ul className="flex flex-col gap-1">
        {rows.map((l) => (
          <li key={l.label} className="flex items-center gap-2 whitespace-nowrap text-[11px] font-medium text-ink2">
            <span
              className="size-2.5 shrink-0 rounded-[3px] border"
              style={{ background: l.color, borderColor: "var(--pin-edge)" }}
              aria-hidden
            />
            {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
