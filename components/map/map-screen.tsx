"use client";

/**
 * 지도 화면 — 배경은 **네이버 Dynamic Map**, 말풍선은 HTML.
 *
 * 넓은 화면(1024 이상)은 **왼쪽 목록 + 오른쪽 지도** 두 칸이다. 폴드를 펼쳤을 때
 * 네이버 지도가 보여주는 모양이고, 목록과 지도를 같이 보며 비교할 수 있다.
 * 폰은 지도 위에 검색이 뜨고 아래 시트를 끌어 올린다.
 * ⛔ 두 레이아웃이 **같은 부품**을 쓴다(map-controls · school-panel). 그릇만 다르다(§11-3).
 *
 * ⛔ 지도 라이브러리의 글자 기능을 쓰지 않는다. 그러려면 글리프 파일을 내려받아야 하고
 *    그건 사실상 웹폰트다(CLAUDE.md §13 — 한글 서비스라 안 받기로 했다).
 *    말풍선을 HTML 로 얹으면 시스템 폰트로 그려지고, 색도 화면 토큰을 그대로 쓴다.
 *
 * ⛔ 한 화면에 얹는 말풍선 개수에 상한을 둔다. 이건 §11-1 이 금지한 '침묵 상한'이 아니다 —
 *    저장하는 값을 자르는 게 아니라, 너무 빽빽하면 시·군 단위로 묶어 보여주고 학교 수를 함께 적는다.
 *    아무것도 조용히 사라지지 않는다.
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { List, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { SIDOS, hasAreas, type Sido } from "@/lib/schools";
import { UNKNOWN_GRADE } from "@/lib/areas.mjs";
import {
  FIRST_VIEW, ZOOM_NAME, ZOOM_SPLIT,
  areaColor, mapLabel, pinInk, pinPerClass, pinTexts, PIN_VALUES, PALETTE,
  type Facet, type Feat, type Group, type GroupPin, type Pack, type Pin, type PinValue, type SidoPack,
  FACETS,
} from "@/lib/map";
import { MAP_STYLE, boundsOf, loadNaverMaps, morphWithOffset, toLatLng } from "@/lib/naver-map";
import { isDarkNow } from "@/components/theme-toggle";
import { ALL_FILTERS, MapFilters, MapSearch, type FilterKey } from "./map-controls";
import { PANEL_EVENT, openPanel, panelFrom, type PanelKey } from "@/lib/panel";
import { WATCH_EVENT, type WatchDetail } from "@/lib/watch-signal";
import { authClient } from "@/lib/auth/client";
import { db } from "@/lib/supabase";
import { readHomeSchool } from "@/lib/home-school";
import { CHANGED as HOME_CHANGED, homePoint, readHome, type Home } from "@/lib/home";
import { ROUTE_DETAIL_EVENT, ROUTE_EVENT, type RouteDetail, type RouteLine } from "@/lib/route-line";
import { RouteDetailPanel } from "@/components/map/route-detail";
import { MePanel, WatchPanel } from "./panel-views";
import { ComparePanel } from "./compare-panel";
import { IslandInset } from "./island-inset";
import { MapLayers } from "./map-layers";
import { MapLegend } from "./map-legend";
import { SchoolSheet } from "./school-sheet";
import { GoMine, type GoTarget } from "./go-mine";
import { MapZoom } from "./map-zoom";
import { SchoolDetail, SchoolList } from "./school-panel";

/**
 * 경로 양 끝에 세우는 아이콘 — 집과 학교.
 *
 * ⛔ **lucide 의 길을 그대로 옮겨 적은 것이다**(lucide-react v1.33.0 · ISC · CLAUDE.md §3).
 *    경로 표시는 리액트가 아니라 `document.createElement` 로 짓는 DOM 이라 컴포넌트를 못 쓴다.
 *    ⛔ **lucide 를 올릴 때 이 길이 바뀌었는지 본다.**
 * ⛔ `innerHTML` 로 넣는다. **바깥에서 온 값이 하나도 안 섞인 붙박이 글자**라 안전하다.
 */
const ICON_SVG = (paths: string) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>';

const HOUSE_SVG = ICON_SVG(
  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>' +
    '<path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
);
const SCHOOL_SVG = ICON_SVG(
  '<path d="M14 21v-3a2 2 0 0 0-4 0v3"/><path d="M18 4.933V21"/>' +
    '<path d="m4 6 7.106-3.79a2 2 0 0 1 1.788 0L20 6"/>' +
    '<path d="m6 11-3.52 2.147a1 1 0 0 0-.48.854V19a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a1 1 0 0 0-.48-.853L18 11"/>' +
    '<path d="M6 4.933V21"/><circle cx="12" cy="9" r="2"/>',
);

/**
 * 통근 경로선 색 — ⛔ 길찾기 칸의 막대·아이콘과 **같은 색**이어야 눈이 잇는다(§12-101-4).
 *    `route-detail.tsx` 의 `bgOf` 와 짝이다. 한쪽만 바꾸면 지도와 목록이 다른 말을 한다.
 */
const ROUTE_INK: Record<string, string> = {
  자동차: "#1f56ab",
  지하철: "#2f9e93",
  도보: "#8a94a2",
  기타: "#c2571f",
};

/**
 * 한 화면에 얹는 말풍선 상한. 넘으면 지원청·시군 단위로 묶는다.
 * ⛔ **120 에서 80 으로 내렸다**(2026-08-23 사장님이 겹쳐 쌓인 화면을 보내 주셨다).
 *    말풍선 하나가 값 둘을 담으면(「22학급」「22.7명」) 55×38px 이다. 그것이 120개면
 *    학교가 몰린 자리에서는 **서로를 덮어 아무것도 못 읽는다** — 숫자를 보여주려고 만든 것이
 *    숫자를 가린다. 80 이면 같은 자리에서 겹침이 눈에 띄게 준다.
 * ⛔ 배율(`ZOOM_SPLIT`)만으로는 못 잡는다. 같은 배율이라도 부천은 빽빽하고 가평은 성기다.
 *    **개수로 재는 이 조건이 그 차이를 받아 준다.**
 */
const PIN_LIMIT = 80;
/** 이 폭부터 두 칸으로 간다. 왼쪽 칸 너비와 함께 여기 한 곳에만 둔다. */
const WIDE = "(min-width: 1024px)";
/**
 * 말풍선 배지에 들어가는 **하트** — lucide `heart` 를 svg 로 직접 짓는다.
 *
 * ⛔ **여기는 리액트가 아니다.** 말풍선은 네이버 지도에 얹는 DOM 이라 `<Heart/>` 부품을 못 쓴다.
 *    그렇다고 이모지를 쓰지 않는다(CLAUDE.md §3) — 길(path)을 그대로 옮긴다.
 * ⛔ 길 데이터는 `node_modules/lucide-react/dist/esm/icons/heart.mjs` 에서 가져왔다.
 *    lucide 를 올릴 때 모양이 바뀌면 여기도 같이 본다.
 */
const HEART_PATH =
  "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5";
function heartSvg(): SVGSVGElement {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(NS, "path");
  path.setAttribute("d", HEART_PATH);
  svg.append(path);
  return svg;
}

/**
 * 배율의 아래·위 끝. ⛔ **한 곳에만 적는다** — 지도에 거는 값과 우리 ＋/− 단추가 「끝에 닿았나」를
 * 보는 값이 달라지면, 단추는 눌리는데 지도가 안 움직인다(§12-169).
 */
const MIN_ZOOM = 7;
const MAX_ZOOM = 17;

const PANEL_W = 380;

export function MapScreen() {
  // 정적 페이지는 그대로 만들고, URL을 읽는 경계만 클라이언트에서 채운다.
  return <Suspense fallback={null}><MapScreenLocation /></Suspense>;
}

function MapScreenLocation() {
  const params = useSearchParams();
  // 새 지역·지원청·학교로 이동하면 초기 선택도 새로 시작한다.
  // 레일 패널·로그인 query 변경은 현재 지도·선택을 유지한다.
  const target = JSON.stringify([params.get("sido"), params.get("office"), params.get("school")]);
  return <MapScreenSession key={target} initialSearch={params.toString()} />;
}

function MapScreenSession({ initialSearch }: { initialSearch: string }) {
  const [initial] = useState(() => {
    const q = new URLSearchParams(initialSearch);
    const want = q.get("sido");
    return {
      sido: want && (SIDOS as readonly string[]).includes(want) ? want as Sido : "경기" as Sido,
      picked: !!(want || q.get("office") || q.get("school")),
      office: q.get("office"),
      school: q.get("school"),
      panel: panelFrom(q.get("panel")),
    };
  });
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<naver.maps.Map | null>(null);
  /**
   * 지금 지도에 올라 있는 말풍선 — **열쇠로 찾을 수 있게 담는다**(전에는 배열이었다).
   * ⛔ **다시 안 만든다.** 지도를 밀 때마다 전부 부수고 새로 만들면 화면이 번쩍이고 손이 걸린다
   *    (2026-08-23 사장님 — 「지도를 밀면 순간 좀 버벅거리면서 이동함. 옮길때마다 클릭할 때마다
   *    마커가 전부 빤짝하고 다시 뜸」). 네이버 말풍선 하나를 만드는 일은 감싸는 칸을 짓고
   *    자리를 재는 일이라 MapLibre 보다 훨씬 비싸다 — 40개면 밀 때마다 240번 남짓 DOM 을 만진다.
   *    그래서 **화면에 새로 들어온 것만 만들고, 나간 것만 거둔다.**
   */
  const markers = useRef(new Map<string, naver.maps.Marker>());
  /** 말풍선 **속**이 달라지는 조건. 이게 바뀌면 그때만 통째로 다시 짓는다 */
  const shapeRef = useRef("");
  /** 통근 경로선. ⛔ 네이버에는 「source 에 데이터를 갈아 끼운다」가 없다 — 선을 직접 지웠다 만든다 */
  const lines = useRef<naver.maps.Polyline[]>([]);
  /** 경로 양 끝(집·학교) 아이콘. 선과 함께 지웠다 만든다 */
  const ends = useRef<naver.maps.Marker[]>([]);
  /**
   * **늘 서 있는 집** — 길찾기를 안 눌러도 지도에 집이 보인다
   * (2026-08-23 사장님 — 「주소를 추가했으면 내 주소도 지도에서 항상 보이도록해주고」).
   * ⛔ 경로의 양 끝(`ends`)과 **다른 것**이다. 저것은 경로를 그릴 때만 서고 경로가 지워지면 같이 진다.
   * ⛔ 자리는 **500m 격자의 한가운데**다(§12-57) — 우리는 정확한 좌표를 아예 안 갖고 있다.
   *    그래서 실제 집에서 최대 350m 쯤 떨어져 앉는다. 그 값으로 통근 시간도 재고 있으니 같은 자리다.
   */
  const homeMk = useRef<naver.maps.Marker | null>(null);
  /** ⛔ `paintRoute` 는 한 번만 만들어 두고 쓴다 — 집은 ref 로 읽는다(`wideRef` 와 같은 까닭) */
  const homeRef = useRef<Home | null>(null);
  const pinEls = useRef(new Map<string, HTMLElement>());
  /**
   * 마지막으로 그린 화면. ⛔ **같은 화면이면 다시 안 그린다** — 말풍선 1,600개를 지웠다
   *    다시 만드는 일이라 화면이 번쩍인다(2026-08-23 사장님이 짚었다).
   *    패널이 열려 지도 폭이 바뀌면 `resize()` 가 `moveend` 를 부르는데, 그때 화면은
   *    안 움직였는데도 전부 다시 그렸다.
   */
  const drawnAt = useRef<string>("");

  /** moveend 가 붙잡는 함수. ref 로 두지 않으면 지도를 만들 때의 옛 함수를 계속 부른다. */
  const drawRef = useRef<(fromMove?: boolean) => void>(() => {});

  /**
   * 받아 둔 시·도별 꾸러미. ⛔ **한 번 받은 시·도는 들고 있는다** — 시·도를 오갈 때마다
   *    다시 받으면 폰에서 같은 것을 몇 번씩 내려받는다. 전국 6,236교를 한 번에 받지 않으려고
   *    시·도별로 가른 것이므로, 가른 것을 다시 되돌리지 않게 여기서 모아 둔다.
   */
  const [packs, setPacks] = useState<Record<string, Pack>>({});
  /**
   * **지역을 골랐나.** 처음 들어오면 `false` 라 전국이 보이고 시·도 말풍선만 뜬다(§12-167).
   *
   * 사장님(2026-08-23) — 「초기에 들어오면 딱 그 광역시도 교육청이 지도에 마커로 떠있어야 하는거
   * 아님? … **경기도부터 맨날 잡혀있으면 사람들 기분 나쁠 듯 ㅎㅎ**」. 맞는 말이다 —
   * 부산 교사가 열 때마다 경기가 잡혀 있으면 **여기는 경기 서비스**로 읽힌다.
   *
   * ⛔ **주소에 지역이 적혀 오면 건너뛴다**(`?sido=`·`?school=`·`?office=`). 학교별 정적 화면이나
   *    검색에서 들어온 사람에게 「지역을 고르십시오」를 한 번 더 물으면 두 번 누르게 된다.
   * ⛔ `sido` 를 `null` 로 두지 않는다 — 아래 수십 곳이 시·도가 있다고 보고 짜여 있다.
   *    **고르기 전에는 그 시·도를 안 그릴 뿐이다.**
   */
  const [picked, setPicked] = useState(initial.picked);
  /** 시·도마다 말풍선 하나 — 학교들의 한가운데(`/map/sido`) */
  const [sidoPins, setSidoPins] = useState<{ sido: string; n: number; lat: number; lng: number }[]>([]);
  const [failed, setFailed] = useState<string | null>(null);
  const [sido, setSido] = useState<Sido>(initial.sido);
  /** 멀리서 볼 때 무엇으로 묶나. 전보가 도는 단위가 지원청이라 그쪽이 기본이다. */
  const group: Group = "지원청";
  /**
   * 도서 지역을 켜 뒀나.
   *
   * ⭐ **기본이 「켜짐」이다**(2026-08-23 사장님 — 「레이어는 기본적으로 **켤 수 있는 것은
   *    다 켠 상태**를 기본으로 해줘」). 전에는 꺼 두고 찾아서 켜게 했는데, 그러면
   *    **백령·연평 학교가 없는 것처럼 보인다** — 그 섬들이야말로 Ⅲ구역 근무연한이 걸리는,
   *    인사에서 제일 중요한 자리다.
   * ⛔ **처음 보이는 범위에는 여전히 안 넣는다.** 켜는 것과 「지도를 맞출 때 세는 것」은 다른 일이다 —
   *    백령이 범위에 들어가면 지도 중심이 서해 바다로 가서 학교가 몰린 육지가 구석에 몰린다.
   *    `fitBounds` 는 도서를 **늘** 뺀다(아래). 켜져 있어도 첫 화면은 안 흔들린다.
   */
  const [islands, setIslands] = useState(true);
  /**
   * 필터로 고른 값들. **비어 있으면 전부 본다.**
   * ⛔ 구역과 급지를 하나의 열쇠("병나")로 묶어 두지 않는다. 그러면 「병 전체」를 못 고른다.
   */
  const [zones, setZones] = useState<string[]>([]);
  const [grades, setGrades] = useState<string[]>([]);
  const [offices, setOffices] = useState<string[]>([]);
  /**
   * 고른 시·군. ⛔ 지원청과 **다른 값이다** — 경기는 25개 지원청이 31개 시·군을 덮는데
   * 광주하남·구리남양주·군포의왕·동두천양주·안양과천·화성오산 여섯이 두 시를 묶는다.
   * 인천은 남부 하나가 미추홀·영종·옹진·제물포 넷을 덮는다.
   * 지원청은 「갈 수 있는 범위」고 시·군은 「사는 곳」이라 둘 다 고를 수 있어야 한다(2026-08-22 사장님).
   */
  const [cities, setCities] = useState<string[]>([]);
  /**
   * 고른 학급수 범위 `[최소, 최대]`. `null` 이면 전부다.
   * ⛔ 구간 넷(5학급 이하·6~11…)에서 슬라이더로 바꿨다(2026-08-22 사장님).
   *    학급수를 **모르는 학교**는 범위를 걸어 두면 빠진다 — 모르는 것을 담지 않는다.
   */
  const [classes, setClasses] = useState<[number, number] | null>(null);
  /** 지금 꺼내 둔 필터 칩. 처음엔 「지역」 하나뿐이고 나머지는 「+」 로 꺼낸다 */
  /**
   * 서 있는 필터 칩. ⛔ **처음부터 다 세운다**(2026-08-23 사장님 · §12-100).
   *    빼는 것은 칩의 ✕, 다시 넣는 것은 「+」 — 둘 다 전과 같다.
   */
  const [shown, setShown] = useState<FilterKey[]>(() => initial.sido === "인천" ? ALL_FILTERS.filter((k) => k !== "구역") : ALL_FILTERS);
  /**
   * 왼쪽 칸을 목록으로 열어 뒀나. ⛔ 기본은 닫힘이다 — 늘 열어 두면 지도의 380px 을
   * 아무것도 안 하는 채로 먹는다(2026-08-21 사장님). 학교를 고르면 상세로 저절로 열린다.
   */
  const [listOpen, setListOpen] = useState(false);
  /** 행정구역 경계선을 얹을지 */
  const [selected, setSelected] = useState<Pin | null>(null);
  const [visible, setVisible] = useState<Pin[]>([]);
  const [grouped, setGrouped] = useState(true);
  /** 지도 callback에서 받은 화면 범위 스냅샷. 렌더 중에는 SDK를 조회하지 않는다. */
  const [groupSnapshot, setGroupSnapshot] = useState<{ sido: Sido; groups: GroupPin[] } | null>(null);
  const groupsInView = groupSnapshot && groupSnapshot.sido === sido ? groupSnapshot.groups : [];
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(false);
  /** 지금 배율 — 우리가 그린 ＋/− 단추가 한계에 닿았는지 보는 데 쓴다(§12-169) */
  const [zoom, setZoom] = useState(FIRST_VIEW.zoom);
  const [wide, setWide] = useState(false);
  /** ⛔ `paintRoute` 는 한 번만 만들어 두고 쓴다 — 최신 `wide` 는 ref 로 읽는다 */
  const wideRef = useRef(false);
  /**
   * 말풍선에 무엇을 적나 — 레이어 창에서 고른다(§12-91).
   * ⭐ **셋 다 켜 둔다**(2026-08-23 사장님 — 「켤 수 있는 것은 다 켠 상태를 기본으로」).
   * ⛔ 차례는 `PIN_VALUES` 가 정한다 — 여기서 손으로 적으면 둘이 어긋난다(§11-3).
   */
  const [pinValue, setPinValue] = useState<PinValue[]>(PIN_VALUES.map((v) => v.key));
  /** 오늘 그 학교를 확인한 사람 수 — 학교코드 → 사람 수 (§12-92) */
  /**
   * 학교별 **관심목록에 담은 사람 수**. 말풍선 위 배지가 이걸 그린다(§12-158).
   * ⛔ 전에는 「오늘 확인한 사람 수」였다(§12-92). 2026-08-23 사장님이 바꾸셨다 —
   *    「그걸 **관심목록에 추가한 숫자**로 표기하는 거임. **하트랑 숫자 하나만** 띄워주면 됨」.
   *    ⛔ **조회수를 세는 것 자체는 그대로 둔다**(`/api/view`) — 우리가 가진 유일한 관심도 기록이고,
   *       한 사람이 하루에 한 번뿐이라 값이 싸다. 화면에서만 뺐다.
   */
  const [watch, setWatch] = useState<Record<string, number>>({});
  /** 레일이 연 칸 — 관심목록 · 마이페이지 (§12-95). ⛔ 화면을 갈아치우지 않는다 */
  const [panel, setPanel] = useState<PanelKey>(initial.panel);
  /**
   * ⛔ **말풍선 손잡이는 한 번만 달고 계속 쓴다** — 그래서 최신 상태를 `panel` 로 못 읽는다
   *    (손잡이를 달던 그때의 값이 안에 굳는다). 지금 값은 이 ref 로 읽는다. `wideRef` 와 같은 까닭이다.
   */
  const panelRef = useRef<PanelKey>(initial.panel);
  /**
   * 비교 판에 올린 학교들 (§12-144). ⛔ **화면 가운데**에 뜨고 지도를 덮는다
   * (2026-08-23 사장님 — 「이건 패널이 좀 커져서 지도를 덮어도 좋아」).
   * ⛔ 학교코드만 든다 — 학교 값은 이미 받아 둔 꾸러미에서 찾는다. 다시 물으면 같은 것을 두 번 받는다.
   */
  const [compare, setCompare] = useState<string[]>([]);
  useEffect(() => {
    panelRef.current = panel;
  }, [panel]);
  /** 오른쪽 아래 범례를 낼지 (§12-97). ⛔ 처음엔 켜져 있다 — 색 뜻을 모르면 지도가 알록달록할 뿐이다 */
  const [legendOn, setLegendOn] = useState(true);

  /**
   * 홈에서 지원청을 눌러 들어온 경우 그 이름을 잠깐 들고 있는다 (`/map?sido=경기&office=수원`).
   * ⛔ **목록이 오기 전에는 못 건다.** 없는 이름을 필터에 걸면 학교가 하나도 안 남고,
   *    칩도 안 서 있어서 뺄 방법조차 없다 — 화면이 빈 채로 멈춘다.
   */
  const wantOffice = useRef<string | null>(initial.office);
  /**
   * 학교별 정적 화면에서 「지도에서 보기」를 눌러 들어온 경우 (`/map?sido=경기&school=<표준학교코드>`).
   * ⛔ 지원청과 같은 까닭으로 **목록이 오기 전에는 못 건다** — 아래에서 맞춰 본다.
   */
  const wantSchool = useRef<string | null>(initial.school);

  const pack = packs[sido] ?? null;

  /** 지도 이동용 표시다. React 화면을 그릴 때는 읽지 않는다. */
  const skipFit = useRef(false);
  const selectedRef = useRef(false);

  /** 지역을 바꾸는 동작이 필터도 함께 비운다. 화면 폭·지도 준비 상태는 선택을 풀지 않는다. */
  const changeSido = useCallback((next: Sido) => {
    if (next === sido) return;
    setSido(next);
    setFailed(null);
    setZones([]);
    setGrades([]);
    setOffices([]);
    setCities([]);
    setClasses(null);
    setSelected(null);
    selectedRef.current = false;
    setShown((v) => next === "인천"
      ? v.filter((k) => k !== "구역")
      : v.includes("구역") ? v : ALL_FILTERS.filter((k) => k === "구역" || v.includes(k)));
    if (!hasAreas(next)) setPinValue((v) => v.length === 1 && v[0] === "구역" ? ["학급수"] : v);
  }, [sido]);

  /**
   * 통근 경로를 지도에 그린다 (§12-101).
   * ⛔ 말풍선처럼 DOM 을 얹지 않는다 — 선은 **지도 레이어**여야 확대·축소를 따라간다.
   * ⛔ 자동차와 대중교통을 **가른다.** 한 색이면 어느 것이 어느 길인지 안 보인다.
   * ⛔ 알림이 `null` 이면 **반드시 지운다.** 안 그러면 옛 경로가 남의 학교 위에 남는다.
   */
  const wantLine = useRef<RouteLine | null>(null);
  /** 길찾기 상세 — 학교 상세 칸 **오른쪽**에 칸 하나를 더 세운다(§12-110) */
  const [routeDetail, setRouteDetail] = useState<RouteDetail | null>(null);
  /** ⛔ `paintRoute` 안에서 최신값을 읽어야 해서 ref 로도 둔다 */
  const detailRef = useRef(false);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<RouteDetail | null>).detail;
      detailRef.current = !!d;
      setRouteDetail(d);
    };
    window.addEventListener(ROUTE_DETAIL_EVENT, on);
    return () => window.removeEventListener(ROUTE_DETAIL_EVENT, on);
  }, []);

  /**
   * 밀린 경로를 실제로 그린다. 자리가 아직 없으면 `false` 를 돌려주고 **`ready` 때 다시 부른다.**
   * ⛔ **`isStyleLoaded()` 로 막지 않는다.** 2026-08-23 사장님 「길찾기도 지금 눌러보면 경로가
   *    안그려지넹」의 원인이 그것이었다 — 그 함수는 「스타일이 준비됐나」가 아니라
   *    **「지금 이 순간 모든 타일까지 다 받아졌나」**를 답한다. 배경 지도 타일은 지도를 움직일 때마다
   *    새로 받으므로 수시로 `false` 다. 그 사이에 경로를 누르면 알림이 **조용히 버려졌고**,
   *    다시 시도할 길이 없어 영영 안 그려졌다(§11-2 와 같은 꼴 — 실패를 화면이 버린다).
   *    `setData` 는 타일이 받아지는 중에도 안전하다. 필요한 것은 **source 가 있느냐** 하나뿐이다.
   */
  const paintRoute = useCallback(() => {
    const m = map.current;
    const nv = window.naver?.maps;
    if (!m || !nv) return false;

    // ⛔ 네이버에는 「source 에 데이터를 갈아 끼운다」가 없다. 선을 지웠다 다시 만든다
    for (const ln of lines.current) ln.setMap(null);
    lines.current = [];
    for (const mk of ends.current) mk.setMap(null);
    ends.current = [];

    const line = wantLine.current;
    const segs: { kind: string; pts: [number, number][] }[] = [];
    if (line?.car?.length) segs.push({ kind: "자동차", pts: line.car });
    for (const t of line?.transit ?? []) if (t.points?.length) segs.push({ kind: t.kind, pts: t.points });

    for (const seg of segs) {
      const path = seg.pts.map(toLatLng);
      /**
       * ⛔ **흰 테두리를 한 겹 깐다.** 배경 지도가 밝든 어둡든 선이 읽혀야 한다.
       *    MapLibre 에서는 `route-halo` 레이어였다 — 여기서는 두꺼운 흰 선을 먼저 그린다.
       * ⛔ `clickable: false` — 선이 학교 위를 덮으면 말풍선을 못 누른다(§11-4).
       */
      lines.current.push(
        new nv.Polyline({ map: m, path, strokeColor: "#ffffff", strokeWeight: 7, strokeOpacity: 0.85, strokeLineCap: "round", clickable: false }),
      );
      lines.current.push(
        new nv.Polyline({
          map: m,
          path,
          strokeColor: ROUTE_INK[seg.kind] ?? ROUTE_INK.기타,
          strokeWeight: 4,
          strokeLineCap: "round",
          // 도보는 점선으로 — 타는 것과 걷는 것이 한눈에 갈린다
          strokeStyle: seg.kind === "도보" ? "shortdash" : "solid",
          clickable: false,
        }),
      );
    }

    /**
     * 경로 **양 끝에 집과 학교**를 세운다 (2026-08-23 사장님 — 「집-학교인데 지도상에 아이콘이 없다」).
     * ⛔ 좌표를 따로 안 받는다 — **선의 양 끝이 곧 집과 학교**다. 따로 받으면 둘이 어긋나
     *    아이콘이 선에서 떨어져 뜬다(집은 500m 격자로 뭉개서 다루기 때문이다 · §12-57).
     * ⛔ 어느 끝이 집인지는 **방향이 정한다** — 출근이면 시작이 집, 퇴근이면 끝이 집이다.
     * ⛔ 학교 말풍선과 겹친다. 그래서 **동그라미 하나**로 작게 둔다(사장님 — 「그냥 아이콘만
     *    동그랗게 띄워주면 좋을 거 같은데」). 알약에 아이콘을 넣는 것은 이미 한 번 물렀다(§12-113).
     */
    const first = segs[0]?.pts[0];
    const lastSeg = segs[segs.length - 1];
    const last = lastSeg?.pts[lastSeg.pts.length - 1];
    if (first && last) {
      const home = line?.dir === "퇴근" ? last : first;
      const school = line?.dir === "퇴근" ? first : last;
      for (const [at, svg, name] of [
        [home, HOUSE_SVG, "집"],
        [school, SCHOOL_SVG, "학교"],
      ] as const) {
        const el = document.createElement("span");
        el.className = "route-end nv-center";
        el.setAttribute("aria-label", name);
        el.innerHTML = svg;
        ends.current.push(
          new nv.Marker({
            position: toLatLng(at),
            map: m,
            icon: { content: el, anchor: new nv.Point(0, 0) },
            // ⛔ 말풍선보다 위에 온다 — 경로의 끝이 학교 뒤에 숨으면 뜻이 없다
            zIndex: 200,
          }),
        );
      }
    }

    /**
     * 늘 서 있는 집.
     * ⛔ **경로를 그리는 중에는 안 세운다.** 그때는 경로의 끝(위 `ends`)이 이미 집을 그린다.
     *    둘 다 세우면 같은 자리에 동그라미가 둘 겹치는데, 경로의 시작점은 길 위로 당겨진 좌표라
     *    격자 한가운데와 수십 미터 어긋나 **살짝 엇갈린 채로 두 개**가 보인다.
     * ⛔ 말풍선보다는 위, 경로의 끝(200)보다는 아래에 둔다.
     * ⛔ 손가락을 안 먹는다(`.route-end` 가 `pointer-events: none`) — 그 아래 학교를 눌러야 한다.
     */
    const h = homeRef.current;
    if (homeMk.current) {
      homeMk.current.setMap(null);
      homeMk.current = null;
    }
    if (h && !segs.length) {
      const el = document.createElement("span");
      el.className = "route-end nv-center";
      el.setAttribute("aria-label", "집");
      el.innerHTML = HOUSE_SVG;
      const at = homePoint(h);
      homeMk.current = new nv.Marker({
        position: new nv.LatLng(at.lat, at.lng),
        map: m,
        icon: { content: el, anchor: new nv.Point(0, 0) },
        zIndex: 150,
      });
    }

    /**
     * ⛔ **그린 다음 그 경로가 보이게 지도를 옮긴다.** 안 그러면 「안 그려진다」와 구별이 안 된다 —
     *    집이 화면 밖이면 선의 대부분이 화면 밖이라 아무것도 안 보인다(2026-08-23 실제로 그랬다).
     * ⛔ 왼쪽에 상세 칸이 서 있으면 그만큼 비켜 준다. 안 그러면 선이 칸 뒤에 숨는다.
     */
    const b = boundsOf(segs.flatMap((g) => g.pts));
    if (b) {
      /**
       * 왼쪽 여백 = 레일(76) + 상세 칸(PANEL_W) + 열려 있으면 길찾기 상세 칸(10+336) + 숨 30.
       * ⛔ **지도 폭의 45% 를 넘기지 않는다.** 좁은 노트북에서 여백이 지도보다 넓어지면
       *    남는 자리가 손바닥만 해져 경로가 점 하나로 줄어든다.
       */
      const room = m.getSize().width || window.innerWidth;
      const want = 76 + PANEL_W + (detailRef.current ? 346 : 0) + 30;
      m.fitBounds(
        b,
        wideRef.current
          ? { top: 96, bottom: 40, left: Math.min(want, Math.round(room * 0.45)), right: 40, maxZoom: 15 }
          : { top: 110, bottom: Math.round(window.innerHeight * 0.5), left: 28, right: 28, maxZoom: 15 },
      );
    }
    return true;
  }, []);

  useEffect(() => {
    const on = (e: Event) => {
      wantLine.current = (e as CustomEvent<RouteLine | null>).detail;
      paintRoute();
    };
    window.addEventListener(ROUTE_EVENT, on);
    return () => window.removeEventListener(ROUTE_EVENT, on);
  }, [paintRoute]);

  // 지도가 늦게 서면 그 사이에 밀린 경로를 그린다. ⛔ 버리지 않는다
  useEffect(() => {
    if (ready) paintRoute();
  }, [ready, paintRoute]);

  /**
   * 집을 읽어 두고, 바뀌면 다시 그린다 (「집에서」에서 주소를 넣거나 지우면 알림이 온다).
   * ⛔ **그리는 도중에 읽지 않는다** — `localStorage` 는 브라우저에만 있어 서버 그림과 어긋난다
   *    (`lib/home.ts` 의 규칙). 붙은 뒤에 읽는다.
   * ⛔ 지도가 아직 안 섰으면 그리지 않고 값만 든다 — 위 `ready` 효과가 그때 한 번 더 그린다.
   */
  useEffect(() => {
    const read = () => {
      homeRef.current = readHome();
      if (map.current) paintRoute();
    };
    read();
    window.addEventListener(HOME_CHANGED, read);
    return () => window.removeEventListener(HOME_CHANGED, read);
  }, [paintRoute]);

  // 레일이 칸을 열라고 알린다. ⛔ 서로를 모른 채 이벤트 하나로만 오간다(`lib/panel.ts`)
  useEffect(() => {
    const on = (e: Event) => setPanel((e as CustomEvent<PanelKey>).detail);
    window.addEventListener(PANEL_EVENT, on);
    return () => window.removeEventListener(PANEL_EVENT, on);
  }, []);

  /**
   * 오늘 조회수를 받는다. ⛔ **실패해도 지도는 그대로 돈다** — 곁들이는 값이지 조건이 아니다.
   *    다만 삼키지 않는다(§11-2) — 못 받으면 콘솔에 남기고 숫자를 안 그린다.
   * ⛔ `.catch` 를 같이 단다. 요청이 끊기면 `error` 를 볼 자리에 닿지도 못한다.
   */
  useEffect(() => {
    const controller = new AbortController();
    fetch("/map/watch", { signal: controller.signal })
      .then(async (r) => {
        const j = await r.json();
        if (!j?.ok) throw new Error(j?.error ?? String(r.status));
        setWatch(j.watch ?? {});
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) console.error("[관심목록 수]", e);
      });
    return () => controller.abort();
  }, []);

  /**
   * **내가 담은 학교들.** 말풍선 하트를 붉게 칠하는 데 쓴다(§12-165).
   *
   * ⛔ 남의 것은 안 온다 — `watchlist` 는 자기 줄만 읽힌다(RLS). 여기서 거를 것이 없다.
   * ⛔ **로그인 안 했으면 빈 채로 둔다.** 손님에게 계정을 만들지 않는다 —
   *    담은 것이 없으면 붉힐 것도 없다(`watch-button.tsx` 와 같은 판단).
   * ⛔ 실패해도 지도는 돈다. 다만 삼키지 않는다(§11-2).
   */
  const [mine, setMine] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = authClient();
        const { data: me } = await supabase.auth.getUser();
        if (!me.user) return;
        const { data, error } = await supabase.from("watchlist").select("std_code");
        if (error) throw new Error(error.message);
        if (alive) setMine(new Set((data ?? []).map((r) => r.std_code as string)));
      } catch (e) {
        console.error("[관심목록]", e);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 하트를 눌러 담거나 뺀 그 순간, **그 학교 배지만** ±1 한다(§12-159).
   * ⛔ 서버를 다시 부르지 않는다 — `/map/watch` 는 2분 캐시라 방금 담은 것이 안 온다.
   *    누른 사람에게는 **그 자리에서** 숫자가 움직여야 한다.
   * ⛔ 0 아래로는 안 내려간다. 남이 뺀 것이 캐시에 아직 안 잡혔을 때 음수가 될 수 있다.
   */
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<WatchDetail>).detail;
      if (!d?.stdCode) return;
      setWatch((v) => ({ ...v, [d.stdCode]: Math.max(0, (v[d.stdCode] ?? 0) + (d.saved ? 1 : -1)) }));
      // ⛔ 붉은 하트도 그 자리에서 따라간다 — 담자마자 붉어지고 빼자마자 돌아온다
      setMine((v) => {
        const next = new Set(v);
        if (d.saved) next.add(d.stdCode);
        else next.delete(d.stdCode);
        return next;
      });
    };
    window.addEventListener(WATCH_EVENT, on);
    return () => window.removeEventListener(WATCH_EVENT, on);
  }, []);

  /**
   * 학교를 고르면 「확인했다」로 센다. ⛔ **같은 사람은 하루에 한 번만** 센다(서버가 막는다).
   * ⛔ **한 번 보낸 학교는 다시 안 보낸다**(2026-08-23 사장님 「몇만명 단위의 사람들이 보더라도
   *    안정적으로 돌아가야 함」). 서버가 기본키로 막긴 하지만 **요청 자체가 안 가는 게 낫다** —
   *    한 사람이 지도를 훑으며 스무 번 누르면 스무 번이 그대로 서버로 간다.
   * ⛔ 실패를 삼키지 않는다 — 콘솔에 남긴다. 화면은 그대로 둔다.
   */
  const sent = useRef(new Set<string>());
  useEffect(() => {
    const code = selected?.k;
    if (!code || sent.current.has(code)) return;
    sent.current.add(code);
    fetch("/api/view", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stdCode: code }),
    })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok || !j?.ok) {
          console.error("[조회수]", j?.error ?? r.status);
          // 못 보냈으면 표시를 지운다 — 다음에 다시 누르면 한 번 더 보낸다
          sent.current.delete(code);
          return;
        }
        // ⛔ 여기서 배지를 올리지 않는다. 배지는 이제 **관심목록 수**다(§12-158) —
        //    조회수는 우리 기록으로만 남고 화면에는 안 나온다.
      })
      .catch((e: unknown) => {
        sent.current.delete(code);
        console.error("[조회수]", e);
      });
  }, [selected]);

  /**
   * ⛔ **사파리가 화면 전체를 확대하는 것을 막는다** (2026-08-23 사장님 —
   *    「확대하다보면 웹 페이지 자체가 확대되서 ui가 안보임」).
   *    애플은 iOS 10 부터 `user-scalable=no` 를 **접근성 때문에 무시한다.** 그래서 그 값만으로는
   *    안 듣고, 사파리 전용 `gesturestart` 를 직접 막아야 한다.
   * ⛔ **화면 전체(document)에 건다.** 지도 칸에만 걸면 손가락 둘이 검색줄이나 시트 위에서
   *    시작했을 때 그대로 페이지가 확대된다 — 사장님 화면이 그 꼴이었다.
   * ⛔ `passive: false` 여야 `preventDefault` 가 듣는다.
   * ⛔ 이 화면에서만 건다. 다른 화면(로그인·계산기)은 글자를 키워 볼 수 있어야 한다.
   */
  useEffect(() => {
    const stop = (e: Event) => e.preventDefault();
    for (const n of ["gesturestart", "gesturechange", "gestureend"])
      document.addEventListener(n, stop, { passive: false });
    return () => {
      for (const n of ["gesturestart", "gesturechange", "gestureend"])
        document.removeEventListener(n, stop);
    };
  }, []);

  // 넓은 화면인지 본다. ⛔ 서버에서 알 수 없으므로 브라우저에서만 잰다.
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  // 칸이 갈리거나 합쳐지면 지도 크기가 달라진다 — 알려 주지 않으면 잘린 채로 남는다
  useEffect(() => {
    // ⛔ 네이버는 `resize()` 가 아니라 `autoResize()` 다. 칸이 갈리면 지도가 잘린 채로 남는다
    map.current?.autoResize();
    // ⛔ 폰에서 안 내는 일은 이제 우리 부품이 `lg:` 로 한다(`map-zoom.tsx`) — 여기서 끄고 켤 것이 없다
  }, [wide]);

  useEffect(() => {
    wideRef.current = wide;
  }, [wide]);

  /**
   * ⭐ **소속교를 정해 둔 사람에게는 지역을 묻지 않는다** (2026-08-24 사장님 —
   *    「처음 입장화면에서 나는 **영통으로 설정이 되어있는디 전국지도가 뜸**」).
   *
   * 지역 고르기는 **어디 사람인지 모를 때** 묻는 것이다. 이미 소속교를 정해 둔 사람에게 또 물으면
   * 매번 두 번 누르게 된다 — 크로스헤어가 하는 일을 첫 화면이 스스로 한다.
   *
   * ⛔ **주소에 지역이 적혀 온 경우에는 안 본다** — 그때는 그 지역이 뜻이다(학교 정적 화면 · 검색).
   * ⛔ **한 번만 본다.** 뒤에 사용자가 다른 시·도를 고르면 그대로 둔다.
   * ⛔ **로그인 안 했으면 아무 일도 안 한다** — 소속교는 로그인한 사람 것이다. 그때는 전국이 뜬다.
   * ⛔ 실패해도 전국 화면으로 간다. 삼키지 않고 콘솔에 남긴다(§11-2).
   */
  const askedMine = useRef(false);
  useEffect(() => {
    if (askedMine.current || picked) return;
    askedMine.current = true;
    let alive = true;
    (async () => {
      try {
        const mine = await readHomeSchool();
        if (!alive || !mine?.std_code) return;
        const { data, error } = await db
          .from("personnel_areas")
          .select("sido, lat, lng")
          .eq("std_code", mine.std_code)
          .not("lat", "is", null)
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const at = data as { sido: string; lat: number; lng: number } | null;
        if (!alive || !at || !(SIDOS as readonly string[]).includes(at.sido)) return;
        // ⛔ 맞추기를 건너뛴다 — 안 그러면 시·도 전체가 떠서 소속교가 안 보인다(§12-168-1)
        skipFit.current = true;
        wantSchool.current = mine.std_code;
        changeSido(at.sido as Sido);
        setPicked(true);
        map.current?.morph(toLatLng([at.lng, at.lat]), Math.max(map.current.getZoom(), ZOOM_NAME));
      } catch (e) {
        console.error("[첫 화면] 소속교", e);
      }
    })();
    return () => { alive = false; };
  }, [picked, changeSido]);

  /**
   * 시·도 말풍선을 받는다. ⛔ **고르기 전에만** 부른다 — 고른 뒤에는 쓸 일이 없다.
   * ⛔ 못 받으면 **경기로 열어 준다.** 고를 것이 없는 빈 화면보다 낫다(§11-2 — 삼키지 않고 콘솔에 남긴다).
   */
  useEffect(() => {
    if (picked || sidoPins.length) return;
    let alive = true;
    fetch("/map/sido")
      .then((r) => r.json())
      .then((j: { ok?: boolean; sidos?: { sido: string; n: number; lat: number; lng: number }[] }) => {
        if (!alive) return;
        if (!j?.ok || !j.sidos?.length) {
          console.error("[시·도] 목록을 못 받았습니다");
          setPicked(true);
          return;
        }
        setSidoPins(j.sidos);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        console.error("[시·도]", e);
        setPicked(true);
      });
    return () => { alive = false; };
  }, [picked, sidoPins.length]);

  // ── 점 목록을 받는다 — **고른 시·도치만** ─────────────────────────────
  // ⛔ 실패를 화면이 버리지 않는다. 응답이 나쁜 경우와 요청이 끊긴 경우를 둘 다 받는다(§11-2).
  // ⛔ 이미 받아 둔 시·도는 다시 안 받는다.
  useEffect(() => {
    // ⛔ 고르기 전에는 안 받는다 — 안 그릴 것을 미리 받으면 첫 화면에서 헛되이 쓴다
    if (!picked || packs[sido]) return;
    let alive = true;
    fetch(`/map/data/${encodeURIComponent(sido)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`학교 목록을 못 받았습니다 (서버 ${r.status})`))))
      .then((j: SidoPack) => {
        if (!alive) return;
        setPacks((prev) => ({ ...prev, [j.sido]: { schools: j.schools, offices: j.offices, cities: j.cities, meta: j.meta } }));
      })
      .catch((e: unknown) => alive && setFailed(e instanceof Error ? e.message : "학교 목록을 못 받았습니다"));
    return () => { alive = false; };
  }, [sido, packs, picked]);

  // ── 말풍선을 다시 찍는다 ────────────────────────────────────────────────
  /**
   * 이 학교가 필터를 지나나. ⛔ **지도와 도서창이 같은 함수를 쓴다**(§11-3).
   *    전에 구역 필터를 지도에만 걸어 두고 도서창엔 안 걸어 서로 다른 학교를 보여준 적이 있다.
   *    학급수를 모르는 학교는 어느 구간에도 안 든다 — 모르는 것을 담지 않는다.
   */
  /**
   * 필터 하나하나. ⛔ **따로 두는 까닭** — 「고를 거리」를 만들 때 자기 자신만 빼고 세야 한다.
   *    급지를 「가」로 걸어 둔 채 급지 목록을 급지까지 걸러 만들면 「나」가 사라져 둘째를 못 고른다.
   */
  const match = useCallback(
    (p: Pin, f: Facet): boolean => {
      // ⛔ 구역이 없는 학교(고시를 안 읽은 시·도)는 구역 필터에 안 걸린다 — 그 시·도엔 구역 필터가 아예 없다
      if (f === "zones") return zones.length === 0 || (p.a != null && zones.includes(p.a));
      if (f === "grades") return grades.length === 0 || grades.includes(p.g ?? UNKNOWN_GRADE);
      if (f === "offices") return offices.length === 0 || offices.includes(p.o);
      if (f === "cities") return cities.length === 0 || (p.c != null && cities.includes(p.c));
      if (f === "classes") return classes == null || (p.cl != null && p.cl >= classes[0] && p.cl <= classes[1]);
      return true;
    },
    [zones, grades, offices, cities, classes],
  );

  /** 고른 것 몇 가지를 빼고 나머지를 다 지나나 */
  const except = useCallback(
    (p: Pin, skip: Facet[]) => FACETS.every((f) => skip.includes(f) || match(p, f)),
    [match],
  );

  /**
   * 이 학교가 필터를 지나나. ⛔ **지도와 도서창이 같은 함수를 쓴다**(§11-3).
   *    전에 구역 필터를 지도에만 걸어 두고 도서창엔 안 걸어 서로 다른 학교를 보여준 적이 있다.
   *    학급수를 모르는 학교는 어느 구간에도 안 든다 — 모르는 것을 담지 않는다.
   */
  const passes = useCallback((p: Pin) => except(p, []), [except]);

  /** 하나라도 걸어 뒀나 — 걸었으면 묶지 않고 학교를 그대로 보여준다 */
  const filtering = zones.length + grades.length + offices.length + cities.length > 0 || classes != null;

  /**
   * 화면 밖으로 나간 말풍선만 거둔다.
   * ⛔ **남아 있는 것은 안 건드린다** — 그것이 번쩍임을 없애는 전부다.
   * ⛔ `pinEls` 에서도 함께 지운다. 안 지우면 조회수·고른 표시가 **떼어 낸 칸**을 계속 만진다
   *    (오류는 안 나고 조용히 아무 일도 안 한다 — 그래서 더 못 찾는다).
   */
  const sweep = useCallback((want: Set<string>) => {
    for (const [id, mk] of markers.current) {
      if (want.has(id)) continue;
      mk.setMap(null);
      markers.current.delete(id);
      if (id.startsWith("s:")) pinEls.current.delete(id.slice(2));
    }
  }, []);

  const draw = useCallback((fromMove = false) => {
    const m = map.current;
    const nv = window.naver?.maps;
    if (!m || !nv) return;

    /**
     * **아직 지역을 안 골랐으면 시·도 말풍선만 그린다**(§12-167).
     * ⛔ 학교 말풍선과 **같은 부품**을 쓴다(`.pin-anchor` · `.pin`) — 생김새가 다르면
     *    누르는 것인지를 사람이 다시 판단해야 한다.
     * ⛔ 화면 범위로 거르지 않는다. 열일곱뿐이고 전국이 한눈에 들어와 있어야 고를 수 있다.
     * ⛔ 한 번 그리면 다시 안 짓는다 — 밀 때마다 다시 지으면 번쩍인다(학교 쪽과 같은 까닭).
     */
    if (!picked) {
      if (sidoPins.length === 0 || markers.current.size > 0) return;
      for (const sp of sidoPins) {
        const wrap = document.createElement("button");
        wrap.type = "button";
        wrap.className = "pin-anchor nv-bottom";
        const el = document.createElement("span");
        el.className = "pin";
        el.style.background = PALETTE.선택;
        el.style.color = "#ffffff";
        /**
         * ⛔ **이름만 적는다**(2026-08-23 사장님 — 「그냥 지역은 숫자를 빼고 이름만 넣어」).
         *    학교 수까지 적으면 알약이 두 줄이 되어 **실제 교육청이 가까운 곳끼리 겹친다**
         *    (수도권 셋 · 세종·대전 · 부산·경남). 겹침을 좌표로 풀려다 두 번 실패했고,
         *    **적는 것을 줄이는 쪽이 답이었다.** 학교 수는 고른 뒤에 목록 머리줄이 말한다.
         */
        const nm = document.createElement("b");
        nm.textContent = sp.sido;
        el.append(nm);
        const stem = document.createElement("span");
        stem.className = "pin-stem";
        const dot = document.createElement("span");
        dot.className = "pin-dot";
        dot.style.background = PALETTE.선택;
        wrap.append(el, stem, dot);
        wrap.setAttribute("aria-label", `${sp.sido} ${sp.n}교 — 눌러서 고르기`);
        wrap.addEventListener("click", () => {
          if (!(SIDOS as readonly string[]).includes(sp.sido)) return;
          changeSido(sp.sido as Sido);
          setPicked(true);
        });
        markers.current.set(
          `sido:${sp.sido}`,
          new nv.Marker({
            position: new nv.LatLng(sp.lat, sp.lng),
            map: m,
            icon: { content: wrap, anchor: new nv.Point(0, 0) },
          }),
        );
      }
      return;
    }
    if (!pack) return;

    // ⛔ `getBounds()` 는 `Bounds` 로 넓게 적혀 있다. 우리 지도는 늘 위경도라 좁혀 쓴다
    const b = m.getBounds() as naver.maps.LatLngBounds;
    /**
     * ⛔ **지도가 움직여서 불린 것인데 화면이 그대로면 그냥 나간다.**
     *    패널이 열려 지도 폭이 바뀌면 `resize()` 가 `moveend` 를 부르는데, 그때 화면은
     *    안 움직였는데도 말풍선 1,600개를 지웠다 다시 만들어 **번쩍였다**(2026-08-23 사장님).
     * ⛔ **필터·시·도가 바뀌어 불린 것은 절대 건너뛰지 않는다**(`fromMove` 가 false 다) —
     *    건너뛰면 필터를 걸어도 화면이 안 바뀐다. 그래서 조건을 화면 좌표로만 두지 않는다.
     *    좌표는 소수 넷째 자리(약 11m)까지만 견준다 — 그보다 잔 흔들림은 눈에 안 보인다.
     */
    const sig = [
      b.west().toFixed(4), b.south().toFixed(4), b.east().toFixed(4), b.north().toFixed(4),
      m.getZoom().toFixed(2),
    ].join("|");
    if (fromMove && sig === drawnAt.current) return;
    drawnAt.current = sig;

    const inView = <P,>(f: Feat<P>) => {
      const [lng, lat] = f.geometry.coordinates;
      return lng >= b.west() && lng <= b.east() && lat >= b.south() && lat <= b.north();
    };

    const keep = (f: Feat<Pin>) => (islands || !f.properties.i) && passes(f.properties);
    const near = pack.schools.features.filter(keep).filter(inView);
    // ⛔ 필터를 걸어 놓았으면 묶지 않는다. 걸어 놓고도 묶음 말풍선만 나오면 고른 값이 안 보인다.
    const asCities = !filtering && (m.getZoom() < ZOOM_SPLIT || near.length > PIN_LIMIT);
    setGrouped(asCities);
    setVisible(near.map((f) => f.properties));
    setGroupSnapshot({ sido, groups: (group === "지원청" ? pack.offices : pack.cities).features.filter(inView).map((f) => f.properties) });

    const withName = m.getZoom() >= ZOOM_NAME;
    /**
     * ⛔ **말풍선 속이 달라지는 조건**만 모은다. 화면 범위는 여기 안 넣는다 —
     *    넣으면 밀 때마다 「속이 달라졌다」가 되어 전부 다시 짓게 된다(그게 번쩍임의 원인이었다).
     *    시·도 · 묶음 기준 · 도서 · 묶을지 · 이름을 펼지 · 레이어에서 고른 값 여섯이다.
     */
    // ⛔ 지역을 고른 순간 시·도 말풍선을 거둔다. 안 거두면 학교 위에 겹쳐 남는다
    for (const [id, mk] of markers.current) {
      if (!id.startsWith("sido:")) continue;
      mk.setMap(null);
      markers.current.delete(id);
    }

    const shape = [sido, group, islands, asCities, withName, pinValue.join(",")].join("|");
    if (shape !== shapeRef.current) {
      for (const mk of markers.current.values()) mk.setMap(null);
      markers.current.clear();
      pinEls.current.clear();
      shapeRef.current = shape;
    }
    /** 이번 화면에 있어야 할 것들. 여기 없는 것만 거둔다 */
    const want = new Set<string>();


    if (asCities) {
      for (const f of (group === "지원청" ? pack.offices : pack.cities).features.filter(inView)) {
        const id = "g:" + f.properties.n;
        want.add(id);
        // ⛔ 이미 있으면 **그대로 둔다.** 다시 만들면 번쩍인다
        if (markers.current.has(id)) continue;
        const el = document.createElement("button");
        el.type = "button";
        el.className = "pin pin-city";
        el.style.background = "var(--ink-strip)";
        el.setAttribute("aria-label", `${f.properties.g} ${f.properties.n}교 — 눌러서 크게 보기`);
        const n = document.createElement("b");
        n.textContent = String(f.properties.n);
        const c = document.createElement("span");
        c.textContent = f.properties.g;
        el.append(n, c);
        el.addEventListener("click", () =>
          m.morph(toLatLng(f.geometry.coordinates), Math.max(m.getZoom() + 2, ZOOM_SPLIT + 0.5)),
        );
        // ⛔ `nv-center` 가 가운데 맞추기를 한다 — 네이버는 왼쪽 위 모서리를 좌표에 놓는다
        el.classList.add("nv-center");
        markers.current.set(
          id,
          new nv.Marker({
            position: toLatLng(f.geometry.coordinates),
            map: m,
            icon: { content: el, anchor: new nv.Point(0, 0) },
          }),
        );
      }
      sweep(want);
      return;
    }


    for (const f of near) {
      const p = f.properties;
      const id = "s:" + (p.k ?? `${p.n}/${p.c}`);
      want.add(id);
      // ⛔ 이미 있으면 **그대로 둔다.** 다시 만들면 번쩍이고, 고른 표시·조회수까지 날아간다
      if (markers.current.has(id)) continue;
      const per = pinPerClass(p);
      /**
       * 말풍선에 적을 값은 **레이어 창에서 고른 것들**이다(2026-08-23 사장님).
       * ⛔ 하나도 없으면 **글자 없이 색만** 남는다 — 범례가 색을 말하므로 그것도 쓸 수 있다.
       */
      const parts = pinTexts(pinValue, sido, p);

      // ⛔ 알약만 두지 않는다. 꼬리와 점이 있어야 **어느 점을 가리키는지** 보인다(시안 M)
      const wrap = document.createElement("button");
      wrap.type = "button";
      // ⛔ `nv-bottom` — 꼬리 끝이 학교 자리에 앉아야 한다. MapLibre 의 `anchor:"bottom"` 자리다
      wrap.className = "pin-anchor nv-bottom";
      const el = document.createElement("span");
      // ⛔ 값이 둘 이상이면 **세로로 쌓는다**(2026-08-23 사장님). 한 줄로 이으면 옆으로 길어져
      //    옆 학교를 덮고, 지도가 글자로 막힌다.
      el.className =
        (withName ? "pin pin-named" : "pin") +
        (parts.length === 0 ? " pin-bare" : "") +
        (parts.length > 1 ? " pin-multi" : "");
      const bg = areaColor(sido, p.a, p.g);
      el.style.background = bg;
      // ⛔ 흰 글자로 고정하지 않는다. 「가산 없음 · ?급지」는 밝은 회색이라 흰 글자가 안 읽힌다.
      el.style.color = pinInk(bg);
      /**
       * ⛔ **이름 칸을 늘 만들어 둔다.** 고를 때마다 말풍선을 다시 만들면 1,600개가 매번
       *    다시 그려진다. 보일지 말지는 CSS 가 정한다(`.pin > .pin-nm`).
       */
      const nm = document.createElement("span");
      nm.className = "pin-nm";
      nm.textContent = p.n;
      el.append(nm);
      // 값마다 줄 하나. ⛔ 이어 붙이지 않는다 — 줄을 나누는 것이 이 화면의 뜻이다.
      for (const part of parts) {
        const b = document.createElement("b");
        b.textContent = part;
        el.append(b);
      }
      /**
       * **관심목록에 담은 사람 수** — 하트 하나와 숫자 하나다(2026-08-23 사장님 · §12-158).
       * ⛔ 0 은 안 그린다. 「0」이 붙으면 아무도 안 담은 학교라는 낙인이 된다.
       * ⛔ **자리를 늘 만들어 둔다.** 숫자가 바뀔 때마다 말풍선을 다시 만들면
       *    학교 하나를 누를 때마다 **1,600개가 통째로 다시 그려져 화면이 번쩍인다**
       *    (2026-08-23 사장님이 짚었다). 아래 따로 도는 갱신이 숫자만 갈아 끼운다.
       * ⛔ **이모지를 쓰지 않는다**(CLAUDE.md §3). lucide 하트를 svg 로 그린다 —
       *    말풍선은 리액트가 아니라 DOM 으로 짓는 자리라 아이콘 부품을 못 쓴다.
       */
      const badge = document.createElement("span");
      badge.className = "pin-watch";
      badge.hidden = true;
      badge.append(heartSvg(), document.createElement("b"));
      wrap.append(badge);

      const stem = document.createElement("span");
      stem.className = "pin-stem";
      const dot = document.createElement("span");
      dot.className = "pin-dot";
      dot.style.background = bg;
      wrap.append(el, stem, dot);

      wrap.setAttribute(
        "aria-label",
        `${p.n} · ${mapLabel(sido, p.a, p.g)}` +
          (p.cl == null ? "" : ` · ${p.cl}학급`) +
          (per == null ? "" : ` · 학급당 ${per.toFixed(1)}명`),
      );
      /**
       * ⛔ **같은 것을 다시 누르면 푼다.** 전에는 늘 고르기만 해서, 한 번 고르면
       *    나머지가 흐려진 채로 빠져나올 길이 없었다(2026-08-23 사장님).
       * ⛔ 열쇠가 없는 학교는 이름+시군으로 견준다 — 열쇠로만 견주면 둘 다 `undefined` 라
       *    **아무 학교나 눌러도 풀린다.**
       * ⭐ **다른 칸(관심목록·마이페이지)이 열려 있으면 그것을 내리고 학교로 간다**
       *    (2026-08-23 사장님 — 「다른 패널 열었다가도 지도의 학교 마커 클릭하면 바로
       *    학교 정보 패널 띄워지도록」). 전에는 `selected` 만 바뀌고 칸은 레일 것이 계속 이겨서
       *    (`panelBody ?? …`) **누른 학교가 안 보였다.** 넓은 화면·폰 둘 다 같은 자리였다.
       * ⛔ 그때는 **풀지 않고 무조건 고른다.** 이미 고른 학교를 레일 칸 뒤에서 다시 누르면
       *    푸는 것이 되어, 칸만 닫히고 학교는 안 뜬다 — 누른 사람의 뜻과 반대다.
       */
      wrap.addEventListener("click", () => {
        const railOpen = panelRef.current != null;
        if (railOpen) {
          setPanel(null);
          openPanel(null);
        }
        setSelected((cur) =>
          !railOpen && cur && (p.k ? cur.k === p.k : cur.n === p.n && cur.c === p.c) ? null : p,
        );
      });
      if (p.k) pinEls.current.set(p.k, wrap);
      /**
       * ⛔ 꼬리 끝이 학교 자리에 앉아야 한다 — 가운데로 두면 알약이 점을 덮는다.
       *    MapLibre 는 `anchor: "bottom"` 한 줄이었는데, 네이버의 `anchor` 는 **픽셀 숫자**라
       *    글자 길이에 따라 폭이 달라지는 HTML 말풍선에는 못 쓴다. CSS 로 스스로 물러선다.
       */
      markers.current.set(
        id,
        new nv.Marker({
          position: toLatLng(f.geometry.coordinates),
          map: m,
          icon: { content: wrap, anchor: new nv.Point(0, 0) },
        }),
      );
    }
    sweep(want);
  }, [pack, sido, group, islands, passes, filtering, pinValue, sweep, picked, sidoPins, changeSido]);

  useEffect(() => {
    drawRef.current = draw;
    draw();
  }, [draw]);

  // ── 지도를 만든다 (한 번) ───────────────────────────────────────────────
  /**
   * ⭐ **2026-08-23 에 MapLibre + VWorld 에서 네이버 Dynamic Map 으로 옮겼다**
   *    (`docs/DESIGN.md §12-108` · `docs/handoff-naver-map.md`).
   * ⛔ **스타일 두 벌을 우리가 안 만든다.** 네이버가 배경 지도를 준다.
   *    다만 **어두운 기본 지도는 없다** — Style Editor 로 만들어 `customStyleId` 를 받아야 한다.
   *    아직 안 만들었으므로 밝은 지도 하나로 간다. 만들면 `MAP_STYLE` 에 넣기만 하면 된다.
   */
  useEffect(() => {
    if (!box.current || map.current) return;
    let dead = false;
    let m: naver.maps.Map | null = null;
    let media: MediaQueryList | null = null;
    let onTheme: (() => void) | null = null;
    let themeOff: (() => void) | null = null;
    const mountedMarkers = markers.current;

    (async () => {
      const nv = await loadNaverMaps();
      if (dead || !box.current) return;
      media = window.matchMedia("(prefers-color-scheme: dark)");
      const styleOf = () => (isDarkNow() ? MAP_STYLE.dark : MAP_STYLE.light);

      m = new nv.Map(box.current, {
        center: toLatLng(FIRST_VIEW.center),
        zoom: FIRST_VIEW.zoom,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        ...(styleOf() ? { customStyleId: styleOf() } : {}),
        /**
         * 줄이는·키우는 단추 — **오른쪽 가운데**다.
         * ⛔ 오른쪽 **아래**가 아니다. 거기는 범례가 쓴다(§12-97). MapLibre 때는 범례가 자기 높이를
         *    `--legend-h` 로 내보내고 단추가 그 위에 앉게 CSS 로 밀어 올렸는데, **네이버 단추는
         *    그렇게 못 민다** — 그 단추를 만드는 코드가 나중에 따로 받아지는 서브모듈 안에 있어서
         *    클래스 이름을 확인할 수가 없다(maps.js 를 받아 뒤졌다). **확인 못 한 이름을 겨눈
         *    CSS 는 아무것도 안 하면서 통과만 한다.** 그래서 겹칠 자리를 아예 피한다.
         * ⛔ 오른쪽 위도 안 된다 — 겹쳐보기 단추가 있다.
         */
        /**
         * ⛔ **네이버 단추를 안 쓴다**(2026-08-24 사장님 — 「+- 버튼이 우리 디자인이랑 안맞는데」).
         *    그 단추는 나중에 따로 받아지는 서브모듈이 만들어서 **우리 CSS 로 못 고친다** —
         *    확인 못 한 이름을 겨눈 규칙은 아무것도 안 하면서 통과만 한다. 우리가 그린다
         *    (`components/map/map-zoom.tsx`).
         */
        zoomControl: false,
        // ⛔ 지도 종류 고르개·축척은 안 낸다. 우리 화면에는 쓸 일이 없고 오른쪽 아래를 어지럽힌다
        mapTypeControl: false,
        scaleControl: false,
        mapDataControl: false,
      });
      map.current = m;

      /**
       * ⛔ **`idle` 이지 `moveend` 가 아니다.** 네이버에는 `moveend` 가 없다 —
       *    끌기가 끝나도 관성으로 더 미끄러지므로, **다 멈춘 뒤**를 알리는 것이 `idle` 이다.
       *    `dragend` 로 잡으면 미끄러지는 동안의 새 화면에서 말풍선이 안 그려진다.
       */
      nv.Event.addListener(m, "idle", () => {
        drawRef.current(true);
        // ⛔ `m` 은 이 안에서 다시 좁혀 준다 — 바깥 변수라 타입이 늘 null 일 수 있다고 본다
        const now = map.current;
        if (now) setZoom(now.getZoom());
      });
      /**
       * ⛔ **빈 지도를 누르면 고른 것을 푼다** (2026-08-23 사장님 — 「빈화면을 클릭하거나
       *    마커를 다시클릭하거나 다른 학교를 클릭해도 마커가 해제가 안됨」).
       *    푸는 길이 아예 없었다 — 말풍선을 누르면 늘 **고르기만** 했고, 지도에는 손잡이가 없었다.
       * ⛔ 말풍선 위를 누른 것은 **빼야 한다.** 안 빼면 학교를 고르는 그 순간 곧바로 풀린다.
       *    `stopPropagation` 으로는 못 막는다 — 네이버가 어느 단계에서 듣는지 모른다.
       *    그래서 **원래 눌린 자리가 말풍선 안인지**를 직접 본다. 이건 단계와 상관없이 참이다.
       */
      nv.Event.addListener(m, "click", (e: { domEvent?: Event }) => {
        const t = e?.domEvent?.target;
        if (t instanceof Element && t.closest(".pin-anchor, .pin")) return;
        setSelected(null);
      });
      nv.Event.once(m, "init", () => {
        setReady(true);
        drawRef.current();
      });

      /**
       * 밝기가 바뀌면 배경 지도도 같이 바꾼다.
       * ⛔ 운영체제 설정만 보지 않는다 — 화면 오른쪽 위 토글로 고른 값이 그걸 이긴다.
       * ⛔ `MAP_STYLE` 이 비어 있으면(= Style Editor 로 아직 안 만들었으면) **아무것도 안 한다.**
       *    없는 스타일 id 를 넣으면 지도가 통째로 회색이 된다.
       */
      const swap = () => {
        const id = styleOf();
        if (!id) return;
        map.current?.setOptions("customStyleId", id);
      };
      onTheme = swap;
      media.addEventListener("change", onTheme);
      window.addEventListener("runaway:theme", swap);
      themeOff = () => window.removeEventListener("runaway:theme", swap);
    })().catch((e: unknown) => setFailed(e instanceof Error ? e.message : "지도를 못 띄웠습니다"));

    return () => {
      dead = true;
      if (media && onTheme) media.removeEventListener("change", onTheme);
      themeOff?.();
      for (const mk of mountedMarkers.values()) mk.setMap(null);
      mountedMarkers.clear();
      for (const ln of lines.current) ln.setMap(null);
      lines.current = [];
      for (const mk of ends.current) mk.setMap(null);
      ends.current = [];
      homeMk.current?.setMap(null);
      homeMk.current = null;
      m?.destroy();
      map.current = null;
    };
  }, []);

  /**
   * **고르기 전에는 전국이 다 보이게 맞춘다**(§12-167).
   * ⛔ `FIRST_VIEW`(경기 기준 배율)로 두면 **남해안·제주가 화면 밖**이라 고를 수가 없다 —
   *    「고르십시오」라고 해 놓고 절반을 안 보여주는 꼴이다(2026-08-23 화면에서 그랬다).
   * ⛔ 시·도 목록으로 범위를 잡는다. 숫자로 배율을 박지 않는다 —
   *    시·도가 늘거나 줄면 그 숫자가 조용히 틀려진다.
   * ⛔ 한 번만 맞춘다. 사람이 밀거나 확대한 뒤에 다시 맞추면 손이 안 듣는 것처럼 느껴진다.
   */
  const fitted = useRef(false);
  useEffect(() => {
    const m = map.current;
    const nv = window.naver?.maps;
    if (picked || fitted.current || !ready || !m || !nv || sidoPins.length === 0) return;
    fitted.current = true;
    let w = 180, e = -180, s2 = 90, n = -90;
    for (const p of sidoPins) {
      if (p.lng < w) w = p.lng;
      if (p.lng > e) e = p.lng;
      if (p.lat < s2) s2 = p.lat;
      if (p.lat > n) n = p.lat;
    }
    // ⛔ 말풍선이 꼬리까지 있어 위쪽이 더 필요하다. 아래는 폰의 시트를 피한다
    m.fitBounds(new nv.LatLngBounds(new nv.LatLng(s2, w), new nv.LatLng(n, e)), {
      top: 96, bottom: wide ? 48 : 140, left: 56, right: 56,
    });
  }, [picked, ready, sidoPins, wide]);

  useEffect(() => {
    const m = map.current;
    const nv = window.naver?.maps;
    // ⛔ 고르기 전에는 맞추지 않는다 — 맞추면 전국을 보여주려던 첫 화면이 경기로 끌려간다
    if (!picked || !m || !nv || !pack) return;
    /**
     * ⛔ **「내 자리로」가 옮겨 놓은 것을 덮지 않는다.** 그 단추는 한 곳을 겨눠 옮기는데
     *    여기는 시·도 전체를 담으려 든다 — 늦게 도는 쪽이 이겨서 옮긴 것이 사라졌다(§12-168-1).
     * ⛔ 한 번만 건너뛴다. 계속 건너뛰면 시·도를 바꿔도 지도가 안 따라간다.
     */
    if (skipFit.current) {
      skipFit.current = false;
      return;
    }
    /**
     * ⛔ **고른 학교가 있으면 시·도 전체로 안 맞춘다**(2026-08-24). 이 효과는 `ready`(지도 준비됨)와
     *    `wide` 로도 도는데, 그 신호가 **학교를 고른 뒤에 오면 지원청 맞추기를 덮는다** —
     *    좌표만 옮겨지고 말풍선이 안 뜬 까닭이 그것이었다. 상태가 아니라 ref 로 본다:
     *    이 효과의 의존성에 `selected` 를 넣으면 학교를 고를 때마다 시·도 전체로 튄다.
     */
    if (selectedRef.current) return;
    let w = 180, e = -180, s2 = 90, n = -90;
    for (const f of pack.schools.features) {
      // ⛔ 도서는 **늘** 뺀다. 넣으면 화면 대부분이 바다가 되고 육지가 구석에 몰린다.
      //    도서는 왼쪽 아래 작은 창(IslandInset)이 맡는다.
      if (f.properties.i) continue;
      const [lng, lat] = f.geometry.coordinates;
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s2) s2 = lat;
      if (lat > n) n = lat;
    }
    /** ⛔ 네이버 `fitBounds` 는 여백을 **옵션에 펼쳐** 받는다(`padding` 이라는 칸이 없다) */
    m.fitBounds(
      new nv.LatLngBounds(new nv.LatLng(s2, w), new nv.LatLng(n, e)),
      wide ? { top: 28, bottom: 28, left: 28, right: 28 } : { top: 140, bottom: 120, left: 20, right: 20 },
    );
  }, [sido, pack, ready, wide, picked]);

  /**
   * 관심목록 배지의 **숫자만** 갈아 끼운다 (§12-158).
   * ⛔ **말풍선을 다시 만들지 않는다.** 다시 만들면 학교 하나를 누를 때마다 1,600개가
   *    통째로 다시 그려져 화면이 번쩍인다 — 2026-08-23 에 실제로 그랬다.
   *    `data-on` 을 바꿔 고른 표시를 주는 것과 같은 방식이다.
   * ⛔ 하트(svg)는 그대로 두고 `<b>` 만 건드린다. `textContent` 로 통째로 갈면 하트가 날아간다.
   */
  useEffect(() => {
    for (const [code, el] of pinEls.current) {
      const badge = el.querySelector<HTMLElement>(".pin-watch");
      const num = badge?.querySelector("b");
      if (!badge || !num) continue;
      const n = watch[code];
      badge.hidden = !n;
      if (n) num.textContent = String(n);
      // ⭐ 내가 담은 학교면 하트를 붉게 (§12-165). 색만 CSS 가 바꾼다
      badge.dataset.mine = mine.has(code) ? "1" : "";
    }
  }, [watch, mine, visible]);

  /**
   * 고른 학교에 표시를 준다 — 말풍선을 다시 만들지 않고 `data-on` 만 바꾼다.
   * ⛔ 감싼 칸(`pin-anchor`)에 붙인다. 알약에만 붙이면 꼬리·점이 옛 색으로 남아 따로 논다.
   *    알약 쪽은 `.pin-anchor[data-on="1"] .pin` 이 아니라 `.pin[data-on]` 이 잡으므로
   *    두 곳에 다 적는다.
   */
  useEffect(() => {
    for (const [code, el] of pinEls.current) {
      const on = selected?.k === code ? "1" : "";
      el.setAttribute("data-on", on);
      /**
       * ⛔ **`firstElementChild` 로 잡지 않는다.** 감싼 칸의 첫 자식은 알약이 아니라
       *    **조회수 배지**다(그것을 먼저 붙인다 — 눈에 보이는 순서는 CSS `order` 가 정한다).
       *    그대로 두면 고른 표시가 배지에 붙어 **알약은 하나도 안 바뀐다** —
       *    2026-08-23 에 그 상태였다. 이름으로 잡으면 붙이는 순서가 바뀌어도 안 깨진다.
       */
      const pill = el.querySelector<HTMLElement>(".pin");
      if (pill) pill.setAttribute("data-on", on);
    }
    // ③ 스포트라이트 — 하나를 고르면 나머지가 물러난다. 켜는 자리는 지도 칸 하나다
    if (box.current) box.current.dataset.picked = selected ? "1" : "";
    selectedRef.current = selected != null;
  }, [selected, visible]);

  /**
   * 고른 학교로 옮긴다.
   * ⛔ 폰은 아래 시트(화면 45%)가 지도를 덮으므로 위로 밀어 올린다. 안 그러면 누른 학교가 안 보인다.
   * ⛔ 넓은 화면도 이제 왼쪽 칸이 지도 **위에** 뜬다(전에는 옆에 있었다). 칸이 열려 있으면
   *    그 폭의 절반만큼 오른쪽으로 밀어야 누른 학교가 칸 뒤에 숨지 않는다.
   */
  useEffect(() => {
    const m = map.current;
    if (!m || !selected || !pack) return;
    const f = pack.schools.features.find((x) =>
      selected.k ? x.properties.k === selected.k : x.properties.n === selected.n && x.properties.c === selected.c,
    );
    if (!f) return;
    /** ⛔ 네이버에는 `offset` 이 없다 — 픽셀만큼 되민 중심을 우리가 잰다(`morphWithOffset`) */
    morphWithOffset(
      m,
      f.geometry.coordinates,
      Math.max(m.getZoom(), 13),
      wide ? Math.round(PANEL_W / 2) : 0,
      wide ? 0 : -Math.round(window.innerHeight * 0.17),
    );
  }, [selected, pack, wide]);

  /** 칸이 열려 있나 — 고른 학교가 있거나, 목록을 열어 뒀거나, 레일이 칸을 열었을 때.
      ⛔ 「고정」은 없앴다(2026-08-23 사장님 — 「핀고정 빼고」). 그 자리에 하트가 들어갔다(§12-126) */
  const panelOpen = listOpen || selected != null || panel != null;
  /** 닫으면 둘 다 내린다. 하나만 내리면 닫았는데 다시 열리는 것처럼 보인다. */
  const closePanel = useCallback(() => {
    setSelected(null);
    setListOpen(false);
  }, []);

  /** ⛔ 검색·목록에서 고를 때도 레일 칸을 내린다 — 말풍선을 누른 것과 **같은 뜻**이다.
      한쪽만 고치면 「검색으로 고르면 안 뜬다」가 남는다(§11-3) */
  const goTo = useCallback((p: Pin) => {
    setPanel(null);
    openPanel(null);
    setSelected(p);
    setQuery("");
  }, []);

  /**
   * **내 자리로 옮긴다**(§12-168). 소속교면 그 학교를 고르고, 주거지면 그리로만 옮긴다.
   *
   * ⛔ **다른 시·도의 학교일 수 있다** — 중간발령으로 옮긴 사람이 그렇다. 그때는 시·도를 갈아 끼우고
   *    `wantSchool` 에 적어 둔다. 목록이 온 뒤에 고르는 일은 **이미 있는 그 효과**가 한다 —
   *    여기서 또 기다리는 코드를 짜지 않는다(§11-3).
   * ⛔ 지역을 아직 안 골랐어도 간다 — 소속교가 있다는 것은 이미 고른 것과 같다.
   * ⛔ 배율을 낮추지 않는다 — 이미 가까이 있으면 그대로 두고 자리만 옮긴다.
   */
  const goMine = useCallback((t: GoTarget) => {
    const m = map.current;
    /**
     * ⛔⛔ **뒤이어 도는 「시·도 전체가 들어오게 맞춘다」를 한 번 건너뛴다.**
     *    2026-08-24 사장님 — 「학교를 영통으로 설정해봤는데 크로스헤어를 누르면 **영통으로 안가고
     *    경기도 전역이 뜬다**」. 까닭은 이렇다 — 여기서 지도를 옮기면 그 직후에 `picked` 가 켜지고
     *    학교 목록이 도착하는데, 그 목록이 오는 순간 맞추기 효과가 돌아 **내가 옮겨 놓은 자리를
     *    통째로 덮는다.** 옮긴 것이 안 보이고 시·도 전체가 뜬 것이 그래서다.
     */
    skipFit.current = true;
    setPicked(true);
    if (t.kind === "school") {
      /**
       * ⛔ **여기서 지도를 옮기지 않는다.** 옮기면 배율이 그대로라 말풍선이 안 뜨고,
       *    뒤이어 도는 「지원청에 맞춘다」와 서로 밀어 자리가 두 번 튄다.
       *    `wantSchool` 에 적어 두면 **목록이 온 뒤에** 그 길이 지원청까지 맞춰 준다(위 효과).
       * ⛔ 같은 시·도여도 `wantSchool` 로 넘긴다 — 목록이 아직 안 왔을 수 있다.
       *    이미 와 있으면 그 효과가 `pack` 이 그대로여도 다시 돌지 않으므로 여기서 한 번 깨워 준다.
       */
      wantSchool.current = t.stdCode;
      if ((SIDOS as readonly string[]).includes(t.sido) && t.sido !== sido) {
        changeSido(t.sido as Sido);
      } else if (pack) {
        // 같은 시·도이고 목록도 이미 있다 — 효과를 기다릴 것 없이 바로 연다
        const f = pack.schools.features.find((x) => x.properties.k === t.stdCode);
        if (f) {
          wantSchool.current = null;
          setSelected(f.properties);
          m?.morph(toLatLng([t.lng, t.lat]), Math.max(m.getZoom(), ZOOM_NAME));
        }
      }
      return;
    }
    // 주거지는 고를 학교가 없다 — 좌표로만 옮긴다
    m?.morph(toLatLng([t.lng, t.lat]), Math.max(m.getZoom(), ZOOM_NAME));
  }, [sido, pack, changeSido]);

  /** 목록에서 묶음을 누르면 지도가 그리로 확대된다 — 지도 말풍선을 누른 것과 같다. */
  const goGroup = useCallback((name: string) => {
    const m = map.current;
    const src = group === "지원청" ? pack?.offices : pack?.cities;
    const f = src?.features.find((c) => c.properties.g === name);
    if (m && f) m.morph(toLatLng(f.geometry.coordinates), Math.max(m.getZoom() + 2, ZOOM_SPLIT + 0.5));
  }, [pack, group]);

  const found = useMemo(() => {
    const q = query.trim();
    if (!q || !pack) return [];
    return pack.schools.features
      .filter((f) => islands || !f.properties.i)
      .filter((f) => f.properties.n.includes(q) || (f.properties.f ?? "").includes(q))
      .slice(0, 20)
      .map((f) => f.properties);
  }, [query, pack, islands]);

  /** 도서 학교. 켜 뒀을 때만 작은 창에 뜬다. */
  const islandFeatures = useMemo(
    () =>
      islands && pack
        ? pack.schools.features
            .filter((f) => f.properties.i)
            .filter((f) => passes(f.properties))
        : [],
    [islands, pack, passes],
  );

  /**
   * 고를 거리 — **엑셀 자동필터처럼 판다**(2026-08-22 사장님).
   * 지원청을 서부로 놓으면 급지 목록에 서부에 실제로 있는 급지만 나온다.
   * 전에는 목록이 붙박이라, 서부에는 하나도 없는 「?」(고시 전)가 그대로 서 있었다.
   *
   * ⛔ **자기 자신은 빼고 센다.** 급지를 「가」로 걸어 둔 채 급지 목록까지 급지로 거르면
   *    「나」가 사라져 둘째를 못 고른다. 엑셀도 그렇게 한다.
   * ⛔ 지도에 보이는 범위로 좁히지 않는다. 지도를 움직일 때마다 고를 거리가 바뀌면
   *    방금 있던 항목이 사라져 무엇을 고르다 만 것인지 알 수 없다.
   * ⛔ 도서를 꺼 두면 도서 학교는 안 센다 — 화면에 없는 학교의 값을 고르게 두지 않는다.
   */
  /**
   * 이 시·도의 학교 전부(도서 토글만 반영). **고를 거리의 뿌리**다.
   * ⛔ 목록을 `avail` 에서 만들지 않는다 — `avail` 은 이미 좁혀진 집합이라
   *    거기서 목록을 뽑으면 **지금 고른 값이 목록에서 사라져 낱개로 못 뺀다.**
   *    지원청을 [성남, 수원] 으로 걸고 시군구를 [수원] 으로 좁히면 지원청 목록에서 성남이 사라져,
   *    성남만 빼는 길이 없어진다(전체를 지우거나 칩을 빼는 수밖에 없다). 실제로 그랬다.
   *    좁히는 일은 `Many` 의 `at` 한 곳에만 맡긴다 — 구역·급지가 이미 그렇게 돈다.
   */
  const rows = useMemo(
    () => (pack?.schools.features ?? []).map((f) => f.properties).filter((p) => islands || !p.i),
    [pack, islands],
  );

  const avail = useMemo(() => {
    const at = (skip: Facet[]) => rows.filter((p) => except(p, skip));
    // 학급수는 값이 아니라 **범위**다 — 나머지 필터를 지난 학교의 가장 작은 값과 가장 큰 값
    const cls = at(["classes"]).map((p) => p.cl).filter((n): n is number => n != null);
    return {
      zones: new Set(at(["zones"]).map((p) => p.a).filter((a): a is string => a != null)),
      grades: new Set(at(["grades"]).map((p) => p.g ?? UNKNOWN_GRADE)),
      offices: new Set(at(["offices"]).map((p) => p.o)),
      cities: new Set(at(["cities"]).map((p) => p.c).filter((c): c is string => c != null)),
      classes: cls.length ? ([Math.min(...cls), Math.max(...cls)] as [number, number]) : null,
    };
  }, [rows, except]);

  /** 고를 거리 — **시·도 전체**에서 뽑는다. 좁히는 것은 `avail` 이 맡는다(위 주석) */
  const ko = (a: string, b: string) => a.localeCompare(b, "ko");
  const officeChoices = useMemo(() => [...new Set(rows.map((p) => p.o))].sort(ko), [rows]);
  const cityChoices = useMemo(
    () => [...new Set(rows.map((p) => p.c).filter((c): c is string => c != null))].sort(ko),
    [rows],
  );

  /**
   * 주소에 적혀 온 학교를 **목록이 온 뒤에** 고른다 (`/map?school=<표준학교코드>`).
   * 학교별 정적 화면(`/school/<코드>`)에서 넘어오는 길이다(`DESIGN.md §12-155`).
   *
   * ⛔ 한 번만 건다. 뒤에 사용자가 다른 학교를 고르면 그대로 둔다 — 다시 걸면 못 벗어난다.
   * ⛔ **없는 코드면 조용히 버린다.** 억지로 열면 빈 상세가 뜬다. 지도는 그냥 시·도 전체로 열린다.
   * ⛔ 좌표가 없는 학교는 말풍선이 없다 — 그래도 상세는 연다(`goTo` 안에서 지도가 알아서 맞춘다).
   */
  useEffect(() => {
    const want = wantSchool.current;
    if (!want || !pack) return;
    wantSchool.current = null;
    const f = pack.schools.features.find((x) => x.properties.k === want);
    if (!f) return;
    setSelected(f.properties);

    /**
     * ⭐ **그 학교의 지원청에 맞춘다**(2026-08-24 사장님 — 「크로스헤어 눌러서 왔으면 그 학교
     *    마커까지 뜨도록 해줘야하는데, **좌표만 이동하고 마커가 보일만큼 확대되지는 않네**」 ·
     *    「**지원청까지는 맞춰줄 수 있잖아**」).
     * ⛔ 좌표만 옮기면 **배율이 그대로**다 — 전국이 보이는 배율에서 옮기면 말풍선이 안 그려진다
     *    (묶음으로 바뀌는 지점 아래라 학교가 안 뜬다).
     * ⛔ 숫자로 배율을 박지 않는다. 지원청마다 넓이가 아주 다르다 — 옹진군과 광명은 다른 자다.
     * ⛔ 맞춘 **뒤에** 「고른 학교로 옮긴다」가 돌아 그 학교를 가운데로 당긴다. 순서가 뜻이다.
     */
    // ⛔ 뒤이어 도는 「시·도 전체 맞추기」를 한 번 건너뛴다 — 안 그러면 지원청 맞추기가 덮인다
    skipFit.current = true;
    selectedRef.current = true;
    const m = map.current;
    const nv = window.naver?.maps;
    const office = f.properties.o;
    const pts = pack.schools.features.filter((x) => x.properties.o === office && !x.properties.i);
    if (!m || !nv || pts.length === 0) return;
    let w = 180, e = -180, s2 = 90, n = -90;
    for (const x of pts) {
      const [lng, lat] = x.geometry.coordinates;
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s2) s2 = lat;
      if (lat > n) n = lat;
    }
    m.fitBounds(
      new nv.LatLngBounds(new nv.LatLng(s2, w), new nv.LatLng(n, e)),
      wide ? { top: 28, bottom: 28, left: 28, right: 28 } : { top: 140, bottom: 120, left: 20, right: 20 },
    );
  }, [pack, wide]);

  /**
   * 주소에 적혀 온 지원청을 **목록이 찬 뒤에** 칩으로 세운다 (`BACKLOG` ⑤ — 누른 대로 안 되던 링크).
   * ⛔ 한 번만 건다. 뒤에 사용자가 칩을 빼면 그대로 둔다 — 다시 걸면 못 뺀다.
   * ⛔ 없는 이름이면 조용히 버린다. 억지로 걸면 학교가 하나도 안 남는다.
   * 그리고 그 지원청으로 지도를 옮긴다 — 필터만 걸고 시·도 전체를 보여주면 어디가 바뀐지 모른다.
   */
  useEffect(() => {
    const want = wantOffice.current;
    if (!want || officeChoices.length === 0) return;
    wantOffice.current = null;
    if (!officeChoices.includes(want)) return;
    setOffices([want]);

    const m = map.current;
    const nv = window.naver?.maps;
    const pts = (pack?.schools.features ?? []).filter((f) => f.properties.o === want && !f.properties.i);
    if (!m || !nv || pts.length === 0) return;
    let w = 180, e = -180, s2 = 90, n = -90;
    for (const f of pts) {
      const [lng, lat] = f.geometry.coordinates;
      if (lng < w) w = lng;
      if (lng > e) e = lng;
      if (lat < s2) s2 = lat;
      if (lat > n) n = lat;
    }
    /** ⛔ 네이버 `fitBounds` 는 여백을 **옵션에 펼쳐** 받는다(`padding` 이라는 칸이 없다) */
    m.fitBounds(
      new nv.LatLngBounds(new nv.LatLng(s2, w), new nv.LatLng(n, e)),
      wide ? { top: 28, bottom: 28, left: 28, right: 28 } : { top: 140, bottom: 120, left: 20, right: 20 },
    );
  }, [officeChoices, pack, wide]);

  const comparePins = useMemo(() => compare
    .map((c) => pack?.schools.features.find((f) => f.properties.k === c)?.properties)
    .filter((p): p is Pin => !!p), [compare, pack]);

  /**
   * ⛔ **훅이 다 끝난 뒤에 돌아선다.** 위로 올리면 안 된다 —
   *    `failed` 는 렌더 사이에 바뀌는 값이라(fetch 실패 · 지도 초기화 실패),
   *    조건이 참이 되는 렌더에서 아래 훅들을 통째로 건너뛴다. 리액트는 그걸 던진다
   *    (「Rendered fewer hooks than expected」 — 개발만이 아니라 운영 빌드도 던진다).
   *    그러면 여기 준비해 둔 「지도를 띄울 수 없습니다」는 **한 번도 안 그려지고**
   *    화면이 통째로 갈린다. 실패를 알리려던 코드가 실패를 숨기는 꼴이었다(§11-2 가 뒤집힌다).
   */
  if (!process.env.NEXT_PUBLIC_NCP_MAPS_CLIENT_ID)
    return (
      <Fail title="지도를 띄울 수 없습니다">
        네이버 지도 키가 없습니다. <code>.env.local</code> 의{" "}
        <code>NEXT_PUBLIC_NCP_MAPS_CLIENT_ID</code> 를 확인해 주세요.
      </Fail>
    );
  if (failed) return <Fail title="지도를 띄울 수 없습니다">{failed}</Fail>;

  /**
   * 레일이 연 칸의 내용. ⛔ **화면을 갈아치우지 않는다** — 지도를 열어 둔 채로 이 칸만 바뀐다.
   *    넓은 화면은 왼쪽 칸, 폰은 아래 시트다. 그릇은 학교 상세가 쓰던 것 그대로다(§11-3).
   */
  const closeRailPanel = () => {
    setPanel(null);
    openPanel(null);
  };
  const panelBody =
    panel === "watch" ? (
      <WatchPanel
        onClose={closeRailPanel}
        onCompare={setCompare}
        onPick={(code) => {
          // 즐겨찾기에서 학교를 누르면 **지도가 그리로 간다.** 칸은 학교 상세로 바뀐다.
          const f = pack?.schools.features.find((x) => x.properties.k === code);
          if (!f) return;
          closeRailPanel();
          setSelected(f.properties);
          map.current?.morph(toLatLng(f.geometry.coordinates), Math.max(map.current.getZoom(), ZOOM_NAME));
        }}
      />
    ) : panel === "me" ? (
      <MePanel onClose={closeRailPanel} />
    ) : null;

  /**
   * 칸 머리줄에 붙는 단추. ⛔ 절대 자리로 얹지 않는다 — 그러면 구역 배지 위에 겹친다(겹쳤었다).
   * ⛔ **여기 남은 것은 「닫기」 하나다.** 「고정」은 2026-08-23 에 뺐고, 관심목록(하트)은
   *    여기가 아니라 **학교 상세 안**에서 그린다 — 이 `actions` 는 폰의 아래 시트로 안 넘어간다.
   */
  const panelActions = (
    <>
      <button
        type="button"
        onClick={() => { closeRailPanel(); closePanel(); }}
        aria-label="닫기"
        className="flex size-9 items-center justify-center rounded-full text-ink3 active:bg-fill"
      >
        <X size={17} aria-hidden />
      </button>
    </>
  );

  const search = <MapSearch sido={sido} query={query} found={found} onQuery={setQuery} onPick={goTo} />;
  const filters = (
    <MapFilters
      sido={sido}
      zones={zones} grades={grades} offices={offices} cities={cities} classes={classes}
      officeChoices={officeChoices} cityChoices={cityChoices} avail={avail} shown={shown}
      onSido={changeSido}
      onZones={setZones} onGrades={setGrades} onOffices={setOffices} onCities={setCities} onClasses={setClasses}
      onShown={setShown}
    />
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* ⛔ 자리를 클래스로 잡지 않는다. 지도 라이브러리가 이 칸에 position:relative 를 걸어
          Tailwind 의 absolute 를 덮어쓴다 — 그러면 지도 칸이 화면을 안 채우고, 말풍선이 칸 밖에
          그려져 **손가락이 닿지 않는다**(보이는데 안 눌린다). 인라인으로 박아 규칙 순서를 이긴다. */}
      {/* ⛔ `touchAction: "none"` — 두 손가락으로 벌릴 때 **브라우저가 페이지를 확대하지 않게** 한다.
          지도는 자기 손가락 처리를 따로 하므로 브라우저 몫을 꺼도 확대·이동이 그대로 된다.
          이걸 안 걸면 사파리가 화면 전체를 키워 검색줄·필터가 밖으로 밀려난다(§12-114). */}
      {/* ⛔ `userSelect: "none"` — **지도를 끌 때 글자가 긁히지 않게** 한다
          (2026-08-23 사장님 — 「맵 탐색중에 텍스트가 이렇게 긁히는 경우가 있는데」.
          보내 주신 화면에서 말풍선의 「약대」가 파랗게 잡혀 있었다).
          지도를 미는 동작은 브라우저 눈에는 **글자 위를 지나는 드래그**와 똑같다. 그래서
          말풍선 글자가 잡히고, 한 번 잡히면 다음 드래그가 지도를 안 밀고 **선택 범위를 늘린다.**
          ⛔ 지도 칸에만 건다 — 왼쪽 칸·검색 결과는 글자를 집어 복사할 수 있어야 한다.
          ⛔ 우리 말풍선은 이 칸 **안에** 그려지므로 여기 한 줄이면 다 덮는다.
          ⛔ `-webkit-` 도 같이 적는다. 사파리는 아직 표준 이름만으로는 안 듣는다. */}
      <div
        ref={box}
        style={{
          position: "absolute",
          inset: 0,
          touchAction: "none",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
      />


      {/* ⛔ 검색과 필터는 늘 지도 위에 뜬다. 학교 목록 위에 얹지 않는다 —
          지도를 바꾸는 값(원인)과 그 결과인 목록을 한 칸에 섞으면 무엇이 무엇인지 안 보인다.
          ⛔ 넓은 화면에서는 **검색이 왼쪽, 필터 칩이 그 오른쪽으로 한 줄**이다.
             폰(390)은 한 줄에 둘 다 못 넣는다 — 검색을 위에 두고 칩만 가로로 민다.
          ⛔ 자리는 **가운데 위**다(2026-08-21 사장님). 왼쪽 끝은 비워 둔다 —
             거기 떠 있는 아이콘 레일(app-rail.tsx)이 있다. 오른쪽 위는 레이어 단추가 쓴다. */}
      {/* ⛔ z-30 이다. 아래 시트·왼쪽 칸·「목록」 단추가 z-20 이라 z-10 으로 두면 그것들 **밑에 깔린다**.
          떠 있는 메뉴(z-40)보다는 아래다. */}
      {/*
        ⛔ **좌우 여백은 줄마다 다르다 — 칸 전체에 걸지 않는다**(2026-08-23 사장님 —
           「상단 검색창과 필터 처리 방식은 구글 맵을 참고할 것. 우리가 필터영역을 너무 좁게쓰고 있음」).
           칸 전체에 `pl-16 pr-16` 을 걸면 **양쪽 단추를 피하느라 128px 을 버린다.** 폰(390)에서
           칩 줄에 남는 것이 262px 뿐이었다 — 칩 두 개 반이다.
           단추가 있는 것은 **첫 줄(검색)뿐**이고, 칩 줄은 그 아래라 피할 것이 없다.
        ⛔ **이 칸에는 `overflow` 를 걸지 않는다.** 칩 줄이 화면 오른쪽 끝을 넘어가지만,
           자르는 일은 **지도 칸**(이 칸의 부모, `overflow-hidden`)이 이미 한다.
           여기 걸면 칩 펼침이 잘린다 — 펼침은 `fixed` 라 지도 칸에는 안 걸리지만
           **자기 조상이 자르면 걸린다.** 그리고 세로로도 잘려 알약 그림자가 다시 상한다(§12-125).
      */}
      {/* ⛔ **지역을 고르기 전에는 검색줄·필터를 안 낸다**(§12-167).
          전국이 보이는 화면에서 「지원청 전체」·「급지 전체」는 고를 거리가 없고,
          검색은 어느 시·도의 학교를 찾는지가 안 정해져 있다. 고른 뒤에 선다. */}
      {picked && (
      <div className="top-bar pointer-events-none absolute inset-x-0 top-0 z-30 py-3">
        {wide ? (
          /*
            ⛔ **검색은 왼쪽 끝, 필터는 그 오른쪽으로 한 줄**이다(2026-08-23 사장님 · §12-100).
               전에는 가운데 정렬이라 필터를 더할 때마다 검색창이 왼쪽으로 밀렸다.
            ⛔ 넘치면 **밀어서 본다**(가로 스크롤). 줄바꿈하면 지도를 두 줄이 덮는다.
            ⛔ 감싼 칸에 `pointer-events-auto` 를 주지 않는다 — 그러면 빈자리까지 손가락을 먹어
               그 아래 지도를 못 끈다. 내용에 붙는 칸에만 준다.
          */
          <div className="flex items-start gap-2 pl-16 pr-16 lg:pl-[76px]">
            <div className="pointer-events-auto w-72 shrink-0">{search}</div>
            <div className="min-w-0 flex-1">{filters}</div>
          </div>
        ) : (
          // ⛔ 감싼 칸에 pointer-events-auto 를 주지 않는다. 그러면 검색창 옆 빈자리까지
          //    손가락을 먹어 그 아래 지도를 못 끈다. 내용에 붙는 칸에만 준다.
          <div className="w-full">
            {/* ⛔ 왼쪽 메뉴 단추(left-3, 44px)만 피한다. **오른쪽은 끝까지 쓴다** —
                레이어 단추를 칩 줄 아래로 내려서 이 줄에는 피할 것이 없어졌다(map-layers.tsx). */}
            <div className="pointer-events-auto mb-2 pl-16 pr-3">{search}</div>
            {/*
              칩 줄은 **화면 끝까지 쓴다** — 구글 지도가 그렇게 한다.
              ⛔ `-mr-10` 으로 오른쪽 끝을 넘긴다. 칩이 화면 가장자리에서 **잘린 채로 보이는 것**이
                 곧 「더 있다, 밀어라」는 신호다. 잘라 놓고 화살표로 또 알릴 필요가 없다(§12-123-1).
              ⛔ 왼쪽은 `pl-3` — 메뉴 단추의 왼쪽 끝(left-3)과 줄을 맞춘다.
              ⛔ 넘어간 자리는 **지도 칸**이 자른다(`overflow-hidden`). 빈 자리는 손가락을 안 먹는다
                 — `pointer-events-auto` 는 알약에만 있다.
            */}
            <div className="-mr-10 pl-3">{filters}</div>
          </div>
        )}
      </div>
      )}

      {/* 범례 — 오른쪽 아래. ⛔ 누르는 것이 아니라 **설명**이다(§12-97). 레이어 창에서 끈다 */}
      {legendOn && <MapLegend sido={sido} />}

      {/* 지도 레이어 — **필터가 아니다.** 지도 위에 무엇을 그릴지 고른다(§12-90).
          ⛔ 오른쪽 위다. 왼쪽 위는 레일, 가운데 위는 검색·필터가 쓴다. */}
      {/* 내 자리로 — 소속교 1순위, 없으면 주거지(§12-168). 레이어 단추 바로 아래 */}
      <GoMine onGo={goMine} />

      {/* 줄이기·키우기 — 우리가 그린다(§12-169). 폰에서는 안 뜬다 */}
      <MapZoom
        zoom={zoom}
        min={MIN_ZOOM}
        max={MAX_ZOOM}
        onZoom={(to) => {
          map.current?.setZoom(to, true);
          setZoom(to);
        }}
      />

      <MapLayers
        sido={sido}
        islands={islands} hasIslands={(pack?.meta.islands ?? 0) > 0} onIslands={setIslands}
        legendOn={legendOn} onLegend={setLegendOn}
        pinValue={pinValue} onPinValue={setPinValue}
      />

      {/* ⛔ **왼쪽 칸은 필요할 때만 열린다**(2026-08-21 사장님). 늘 서 있으면 지도의 380px 을
          아무것도 안 하는 채로 먹는다. 학교를 고르면 상세로 열리고, 「목록」을 누르면 목록으로 열린다.
          ⛔ 단색으로 덮지 않는다 — 유리다. 뒤로 지도가 비치는 것이 이 화면의 뜻이다. */}
      {wide && panelOpen && (
        <aside
          aria-label={selected ? "학교 상세" : "학교 목록"}
          style={{ width: PANEL_W }}
          /* ⛔ **왼쪽으로도 위로도 비켜 앉는다.**
             · 왼쪽 — 레일(12 + 폭 56)을 피해 76px 부터. `left-3` 이면 레일 밑에 깔린다.
             · 위   — 검색줄·칩줄(py-3 + 44 + 여백)을 피해 74px 부터. `top-3` 이면 **검색창을 덮는다.**
             2026-08-23 에 왼쪽만 고치고 위를 잊어 두 번 겹쳤다. 둘은 같이 봐야 한다. */
          className="glass glass-thick pop absolute bottom-3 left-[76px] top-[74px] z-20 flex flex-col overflow-hidden rounded-panel"
        >
          <div className="flex min-h-0 flex-1 flex-col pt-3">
            {panelBody ??
              (selected ? (
                <SchoolDetail p={selected} sido={sido} statYear={pack?.meta.statYear ?? null} onBack={() => setSelected(null)} actions={panelActions} />
              ) : (
                pack && (
                  <SchoolList
                    sido={sido} visible={visible} groups={groupsInView} grouped={grouped}
                    meta={pack.meta} onSelect={goTo} onGroupPick={goGroup} actions={panelActions}
                  />
                )
              ))}
          </div>
        </aside>
      )}

      {/*
        길찾기 상세 — **학교 상세 칸 오른쪽에 붙는 두 번째 칸** (2026-08-23 사장님 · §12-110).
        ⛔ 자리를 손으로 잰다 — 레일(76) + 상세 칸(PANEL_W) + 사이 여백(10).
           `left-[76px]` 처럼 굳은 값으로 적어 두면 상세 칸 폭을 바꿀 때 겹친다.
        ⛔ 위는 `top-[74px]` 로 검색·칩 줄을 피한다. 상세 칸과 **같은 값**이어야 나란해 보인다.
        ⛔ 넓은 화면에서만 뜬다. 폰에서는 길찾기 칸 안에서 접었다 편다(commute.tsx 의 `lg:hidden`).
        ⛔ 아래로 끝까지 늘이지 않는다 — 구간이 셋이면 빈 칸이 길어진다. 내용만큼만 서고
           길면 그 안에서 구른다(`max-h`).
      */}
      {wide && panelOpen && routeDetail && (
        <aside
          aria-label="길찾기 상세"
          style={{ left: 76 + PANEL_W + 10, width: 336 }}
          className="glass glass-thick pop absolute top-[74px] z-20 flex max-h-[calc(100%-88px)] flex-col overflow-hidden rounded-panel pt-3"
        >
          <RouteDetailPanel d={routeDetail} />
        </aside>
      )}

      {/* 칸이 닫혀 있을 때 다시 여는 자리. 몇 교가 화면에 있는지 여기서 본다 */}
      {wide && !panelOpen && (
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className="glass-2 absolute bottom-4 left-[76px] z-20 flex h-11 items-center gap-2 rounded-full pl-4 pr-4 text-sm font-semibold active:opacity-80"
        >
          <List size={16} className="text-ink3" aria-hidden />
          목록 <span className="tabular-nums">{grouped ? groupsInView.length : visible.length}</span>
        </button>
      )}

      {/* 도서는 작은 창으로 따로 — 울릉도·독도를 지도 귀퉁이에 그리는 것과 같다.
          ⛔ 폰에서는 안 그린다. 아래 시트(z-20)가 그 자리를 덮어 **보이는데 안 눌린다**(§11-4).
             시트를 유리로 바꾼 뒤로는 유령처럼 비치기까지 한다. 폰에서 도서 학교는
             「겹쳐보기 → 도서 지역」을 켜면 본 지도에 그대로 뜬다. */}
      {wide && islandFeatures.length > 0 && (
        <IslandInset features={islandFeatures} sido={sido} onSelect={setSelected} />
      )}

      {/*
        비교 판 — ⛔ **화면 가운데**다. 왼쪽 칸이 아니라 지도를 덮는다(§12-144).
        ⛔ 꾸러미에서 찾지 못한 학교는 뺀다 — 관심목록에는 있는데 지금 고른 시·도에는 없는
           학교가 그렇다(경기 목록을 열어 두고 인천 학교를 담아 둔 경우).
        ⛔ 하나도 못 찾으면 아예 안 연다. 빈 판을 띄우고 「없습니다」를 적지 않는다.
      */}
      {comparePins.length > 0 && pack && (
        <ComparePanel
          pins={comparePins}
          sido={sido}
          onClose={() => setCompare([])}
          onPick={(p) => {
            const f = pack.schools.features.find((x) => x.properties.k === p.k);
            setCompare([]);
            goTo(p);
            const currentMap = map.current;
            if (f && currentMap) currentMap.morph(toLatLng(f.geometry.coordinates), Math.max(currentMap.getZoom(), ZOOM_NAME));
          }}
        />
      )}

      {/* 폰 — 목록은 아래 시트에 든다 */}
      {!wide && pack && (
        <SchoolSheet
          sido={sido} visible={visible} groups={groupsInView} grouped={grouped}
          selected={selected} meta={pack.meta} onSelect={goTo} onGroupPick={goGroup}
          onClose={() => setSelected(null)}
          override={panelBody}
          overrideKey={panel}
        />
      )}
    </div>
  );
}

function Fail({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <h1 className="text-lg font-bold">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </main>
  );
}
