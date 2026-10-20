"use client";

/**
 * 도서 지역을 담는 작은 창. 지도에 울릉도·독도를 따로 그리는 것과 같은 방식이다.
 *
 * 왜 — 백령·연평은 경도 124.6 까지 나간다. 본 지도에 같이 넣고 인천 전체를 맞추면
 * **화면 대부분이 바다가 되고 학교가 몰린 육지가 오른쪽 구석에 몰린다**(실제로 그렇게 됐다).
 * 빼는 게 아니라 **갈라 두는 것**이다 — 그 섬들도 소속 교육지원청이 있고, 다급지라 인사에서 중요하다.
 *
 * ⛔ 본 지도와 같은 부품으로 말풍선을 그린다. 누르면 왼쪽 칸(또는 아래 시트)에 상세가 뜬다 —
 *    작은 창이라고 다른 화면으로 보내지 않는다.
 *
 * ⭐ **2026-08-23 에 MapLibre + VWorld 에서 네이버 지도로 옮겼다**(`docs/handoff-naver-map.md`).
 *    이 파일이 먼저다 — 132줄이고 말풍선만 있어서, 좌표 뒤집기와 배율을 여기서 잡아 보고
 *    그 감각을 본 지도에 쓴다.
 */

import { useEffect, useRef, useState } from "react";
import { areaColor, mapLabel, pinInk, type Feat, type Pin } from "@/lib/map";
import { boundsOf, loadNaverMaps, toLatLng } from "@/lib/naver-map";
import type { Sido } from "@/lib/schools";

export function IslandInset({
  features, sido, onSelect,
}: {
  features: Feat<Pin>[];
  sido: Sido;
  onSelect: (p: Pin) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<naver.maps.Map | null>(null);
  const markers = useRef<naver.maps.Marker[]>([]);
  /** ⛔ 지도가 다 만들어졌는지. 이게 없으면 말풍선 찍는 쪽이 먼저 돌아 그냥 지나가고,
      의존값이 안 바뀌어 다시 돌지도 않는다(실제로 하나도 안 찍혔다). */
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!box.current || map.current || features.length === 0) return;
    let dead = false;

    (async () => {
      const nv = await loadNaverMaps().catch(() => null);
      // ⛔ 못 받아도 조용히 둔다 — 본 지도가 같은 실패를 사람에게 보여 준다. 여기서 또 띄우면 두 번이다
      if (!nv || dead || !box.current) return;
      const m = new nv.Map(box.current, {
        center: new nv.LatLng(37.6, 125.5),
        zoom: 8,
        /**
         * ⛔ **손대지 않는 지도다.** 여기서 끌면 본 지도를 만지려던 손가락이 여기 걸린다.
         *    MapLibre 는 `interactive:false` 한 줄이었는데 네이버는 **끄는 것을 하나씩 적어야 한다.**
         *    하나라도 빠뜨리면 그것만 살아 있다(두 손가락 확대가 특히 잘 남는다).
         */
        draggable: false,
        pinchZoom: false,
        scrollWheel: false,
        keyboardShortcuts: false,
        disableDoubleClickZoom: true,
        disableDoubleTapZoom: true,
        disableTwoFingerTapZoom: true,
        disableKineticPan: true,
        zoomControl: false,
        scaleControl: false,
        mapDataControl: false,
        mapTypeControl: false,
        // ⛔ 로고는 본 지도가 낸다. 144px 짜리 창에 또 얹으면 창의 3분의 1을 먹는다
        logoControl: false,
      });
      map.current = m;
      nv.Event.once(m, "init", () => setReady(true));
    })();

    return () => {
      dead = true;
      for (const mk of markers.current) mk.setMap(null);
      markers.current = [];
      map.current?.destroy();
      map.current = null;
    };
  }, [features.length]);

  // 말풍선 다시 찍기 + 범위 맞추기
  useEffect(() => {
    const m = map.current;
    const nv = window.naver?.maps;
    if (!m || !nv || !ready || features.length === 0) return;

    for (const mk of markers.current) mk.setMap(null);
    markers.current = [];

    for (const f of features) {
      const p = f.properties;
      const el = document.createElement("button");
      el.type = "button";
      // ⛔ `nv-center` 가 가운데 맞추기를 한다 — 아래 주석을 보라
      el.className = "pin pin-small nv-center";
      const bg = areaColor(sido, p.a, p.g);
      el.style.background = bg;
      // ⛔ 학급당 모드의 가장 옅은 칸에는 흰 글자를 못 얹는다(대비 2.3:1). 그 칸만 글자를 진하게.
      el.style.color = pinInk(bg);
      el.textContent = mapLabel(sido, p.a, p.g);
      el.setAttribute("aria-label", `${p.n} · ${p.o} · ${mapLabel(sido, p.a, p.g)}`);
      el.addEventListener("click", () => onSelect(p));
      /**
       * ⛔ **네이버는 말풍선의 왼쪽 위 모서리를 좌표에 놓는다.** MapLibre 는 가운데였다.
       *    그대로 두면 말풍선이 죄다 오른쪽 아래로 반 칸씩 밀린다 — 오류는 안 나고 **조금씩 틀린다.**
       *    크기를 미리 알 수 없으니 `anchor` 숫자로는 못 맞춘다. CSS `transform` 으로 스스로
       *    반 칸 물러서게 한다(`.nv-center`). 그림 위치가 옮겨지면 손가락 판정도 함께 옮겨진다.
       */
      markers.current.push(
        new nv.Marker({
          position: toLatLng(f.geometry.coordinates),
          map: m,
          icon: { content: el, anchor: new nv.Point(0, 0) },
        }),
      );
    }

    const b = boundsOf(features.map((f) => f.geometry.coordinates));
    if (b) m.fitBounds(b, { top: 22, right: 22, bottom: 22, left: 22 });
  }, [features, sido, onSelect, ready]);

  if (features.length === 0) return null;

  // 본 지도 위에 떠 있는 판이라 유리로 둔다 — glass 가 흐림·테두리·그림자를, glass-thick 이 진하기를 준다.
  // ⛔ 안에 든 말풍선(.pin)에는 유리를 붙이지 않는다. backdrop-filter 는 **뒤**를 흐리는 것이라
  //    이 판에 걸어도 자식인 지도·말풍선은 그대로 위에 그려진다 — 흐림은 이 판 한 겹에서만 든다.
  return (
    <div className="glass glass-thick pointer-events-auto absolute bottom-4 left-4 z-10 w-56 overflow-hidden rounded-card sm:w-64">
      <p className="flex items-baseline gap-1.5 border-b border-divider px-2.5 py-1.5 text-xs font-medium">
        도서
        <span className="text-ink3 tabular-nums">{features.length}교</span>
      </p>
      <div ref={box} className="h-36 w-full" />
    </div>
  );
}
