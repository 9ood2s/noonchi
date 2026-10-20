"use client";

/**
 * 학교 한 곳만 보여 주는 **작은 지도** — 학교별 정적 화면의 머리 띠다.
 *
 * ⭐ **왜 두나** — 검색으로 들어온 사람이 처음 보는 화면이 이것이다(2026-08-23 사장님 —
 *    「문서처럼 생긴게 마음에 안듦」 · 「앱과 같은 모양새라면 상관없음」).
 *    지도가 없으면 아무리 유리를 얹어도 문서로 읽힌다. 지도 서비스라는 것이 한눈에 보여야 한다.
 *
 * ⛔ **`components/map/map-screen.tsx` 를 끌어오지 않는다.** 그쪽은 1,600개 말풍선·필터·검색·
 *    길찾기를 다 안고 있어서, 학교 하나 보여주려고 그걸 들이면 이 화면이 앱만큼 무거워진다.
 *    여기가 필요한 것은 **배경 지도 하나와 말풍선 하나**뿐이다.
 *
 * ⛔ **못 움직이게 둔다**(끌기·확대 전부 끔). 까닭 둘 —
 *    ① 폰에서 이 지도가 화면을 세로로 가로막으면 **손가락이 갇혀 페이지를 못 내린다.**
 *    ② 여기서 지도를 만지게 할 까닭이 없다 — 진짜 지도는 아래 「지도에서 보기」 한 번이다.
 *
 * ⛔ **못 뜨면 조용히 배경만 남긴다.** 값은 아래 표에 다 있으므로 사람이 잃는 것이 없다.
 *    다만 콘솔에는 남긴다 — 우리가 모르는 채로 지나가지 않게(CLAUDE.md §11-2 의 뜻).
 *    ⚠️ 키가 `supaclass` 계정 것이라 그쪽이 갈면 여기도 같이 죽는다(`BACKLOG` ⑫).
 */

import { useEffect, useRef } from "react";
import { loadNaverMaps } from "@/lib/naver-map";
import { pinInk } from "@/lib/map";

export function SchoolMap({
  lat, lng, label, color, name,
}: {
  lat: number;
  lng: number;
  /** 말풍선에 적는 짧은 값 — 인사구역(경기) 또는 급지(인천) */
  /** 인사구역·급지. ⛔ 고시를 안 읽은 시·도는 **null** 이다 — 그때는 이름만 적는다 */
  label: string | null;
  color: string;
  name: string;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let dead = false;
    loadNaverMaps()
      .then((nv) => {
        if (dead || !box.current) return;
        const at = new nv.LatLng(lat, lng);
        const map = new nv.Map(box.current, {
          center: at,
          zoom: 15,
          // ⛔ 손가락·휠을 다 막는다. 위 머리주석 참고
          draggable: false,
          pinchZoom: false,
          scrollWheel: false,
          disableDoubleClickZoom: true,
          disableTwoFingerTapZoom: true,
          keyboardShortcuts: false,
          scaleControl: false,
          mapTypeControl: false,
          mapDataControl: false,
          zoomControl: false,
          /**
           * ⛔ **NAVER 로고를 오른쪽 위로 올린다.** 기본은 왼쪽 아래인데, 거기는 이 화면에서
           *    **유리 판이 덮는 자리**다 — 유리라 로고가 판 너머로 비쳐 지저분하고,
           *    무엇보다 로고는 가리면 안 된다(네이버 이용 조건).
           * ⛔ 지우지 않는다. 지우는 것은 조건 위반이다.
           */
          logoControl: true,
          logoControlOptions: { position: nv.Position.TOP_RIGHT },
        });

        /**
         * 말풍선 — 지도 화면과 **같은 부품**이다(`.pin-anchor.nv-bottom` + `.pin`).
         * ⛔ 여기서 새로 그리지 않는다. 색·모양이 지도와 어긋나면 같은 학교가 두 얼굴이 된다(§11-3).
         * ⛔ 이름을 펴 둔다(`pin-named`) — 학교 하나뿐이라 옆을 덮을 것이 없다.
         */
        const wrap = document.createElement("span");
        wrap.className = "pin-anchor nv-bottom";
        const pill = document.createElement("span");
        pill.className = "pin pin-named";
        pill.style.background = color;
        pill.style.color = pinInk(color);
        pill.style.cursor = "default";
        const nm = document.createElement("span");
        nm.className = "pin-nm";
        nm.textContent = name;
        pill.append(nm);
        // ⛔ 구역이 없으면 그 칸을 아예 안 만든다. 빈 <b> 는 알약에 군더더기 여백만 남긴다
        if (label) {
          const b = document.createElement("b");
          b.textContent = label;
          pill.append(b);
        }
        wrap.append(pill);

        new nv.Marker({ position: at, map, icon: { content: wrap, anchor: new nv.Point(0, 0) } });
      })
      .catch((e) => {
        // ⛔ 삼키지 않는다 — 사람에게는 안 알리되(값은 아래 표에 다 있다) 우리는 안다
        console.error("학교 지도를 못 띄웠다", e);
      });
    return () => {
      dead = true;
    };
  }, [lat, lng, label, color, name]);

  /**
   * ⛔ **자리를 인라인으로 박는다 — `absolute inset-0` 으로 두면 지도가 안 보인다.**
   *    네이버 SDK 가 이 칸에 `position: relative` 를 **인라인으로 덮어쓰기 때문에**
   *    `inset-0` 이 크기를 못 정하게 되고, 칸 높이가 **0** 이 된다.
   *    그런데 SDK 가 `overflow: hidden` 도 같이 걸어서 **타일이 통째로 잘려 안 보인다** —
   *    오류는 하나도 안 나고 지도만 조용히 사라진다(MapLibre 때도 같은 일이 있었다, `HANDOFF`).
   *    그래서 **높이·너비를 직접** 준다. SDK 는 그 둘은 안 건드린다.
   */
  return <div ref={box} style={{ width: "100%", height: "100%" }} aria-hidden />;
}
