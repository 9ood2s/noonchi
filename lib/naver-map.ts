/**
 * 네이버 지도(Web Dynamic Map) 스크립트를 한 번만 받아 온다 (docs/handoff-naver-map.md)
 *
 * ⛔ **키가 브라우저로 나간다.** 이것은 실수가 아니라 이 상품의 생김새다 — 스크립트 주소에
 *    `ncpKeyId` 를 넣어야 지도가 뜬다. VWorld 를 쓸 때는 서버가 타일을 지나 보내서 키를 감쌌지만,
 *    네이버는 브라우저가 직접 타일을 받는다. 감쌀 방법이 없다.
 *    ⚠️ **그래서 콘솔에서 도메인을 잠가야 한다.** 안 잠그면 남이 우리 이용량을 태울 수 있다.
 *
 * ⛔ **「스크립트가 200 으로 오면 키가 맞다」가 아니다.** 2026-08-23 에 그렇게 판정했다가 틀렸다 —
 *    `maps.js` 는 **아무에게나 200 으로 온다.** 진짜 인증은 지도가 뜰 때
 *    `https://oapi.map.naver.com/v3/auth?ncpKeyId=…&url=…` 로 따로 간다.
 *    키가 맞는지 보려면 **그 주소를 불러야 한다.** 안 맞으면 이렇게 온다 —
 *      {"error":{"errorCode":"200","message":"Authentication Failed",
 *                "details":"Invalid authentication information."}}
 *    그리고 화면에는 지도 대신 「네이버 지도 Open API 인증이 실패했습니다」가 깔린다.
 *    ⛔ 서버 전용 키(`NCP_MAPS_KEY` — Directions 의 비밀키)는 **절대 여기로 오면 안 된다.**
 *    APIGW 는 ID 와 비밀키 둘을 다 요구하므로, ID 만 나가는 것으로는 Directions 를 못 부른다.
 *
 * ⛔ ⭐ **`submodules=gl` 을 함부로 붙이지 않는다 — 붙이면 안드로이드에서 유리가 죽는다.**
 *    `gl` 은 지도를 **WebGL 캔버스**로 그리게 하는데, 크로미엄은 그 캔버스를
 *    별도 화면 층에 올려서 `backdrop-filter` 가 **그 층을 못 읽는다**(`DESIGN.md §12-118`).
 *    그래서 검색줄·필터 알약 뒤가 흐려지지 않고 지도 글자가 또렷하게 남는다.
 *    `gl` 을 빼면 기본 렌더러로 그리고, 거기서는 **흐림이 잘 걸린다**(2026-08-23 에 재서 확인했다).
 *
 *    ⛔ **맞바꾸는 것** — `customStyleId`(Style Editor 로 만든 어두운 지도)는 **GL 에서만** 먹는다.
 *       즉 **「어두운 지도」와 「안드로이드에서도 유리」는 함께 못 가진다.**
 *       그래서 여기서 **스타일 id 가 있을 때만** `gl` 을 붙인다 —
 *       어두운 지도를 만들어 넣는 순간 자동으로 GL 로 넘어가고, 그때 유리는 사파리 전용이 된다.
 *       (그 값어치는 그때 사장님이 정하신다. 지금은 스타일 id 가 없으니 유리를 고른 셈이다.)
 *
 * ⛔ **두 번 받지 않는다.** 이 화면에는 지도가 둘이다(본 지도 · 도서 창).
 *    받는 중이면 같은 약속을 돌려주고, 실패하면 다음에 다시 받을 수 있게 지운다.
 */

/**
 * 배경 지도 스타일 — Style Editor 로 만들어 발행한 「My Style ID」.
 *
 * ⛔ **네이버 기본 지도에는 어두운 것이 없다.** MapLibre + VWorld 를 쓸 때는 VWorld 가
 *    밝은/어두운 타일 두 벌을 줘서 그냥 갈아 끼웠는데, 네이버는 **직접 만들어야 한다** —
 *    콘솔의 Style Editor 에서 밝은 것·어두운 것 둘을 만들어 발행하면 id 가 나온다.
 * ⛔ **아직 안 만들었으면 비워 둔다.** 없는 id 를 넣으면 지도가 통째로 회색이 된다.
 *    비어 있으면 네이버 기본(밝은) 지도로 뜬다 — 어두운 화면에서도 밝은 지도가 뜬다는 뜻이다.
 * ⛔ ⭐ **여기에 값을 넣으면 지도가 GL(WebGL)로 넘어가고, 그 순간 안드로이드에서 유리가 죽는다.**
 *    `customStyleId` 가 GL 에서만 먹기 때문이다. 아래 `loadNaverMaps` 가 그렇게 갈라 놓았다.
 *    **어두운 지도와 「안드로이드에서도 유리」는 함께 못 가진다** — 넣기 전에 값어치를 따진다.
 */
export const MAP_STYLE = {
  light: process.env.NEXT_PUBLIC_NCP_MAP_STYLE_LIGHT ?? "",
  dark: process.env.NEXT_PUBLIC_NCP_MAP_STYLE_DARK ?? "",
};

const SRC = "https://oapi.map.naver.com/openapi/v3/maps.js";

let pending: Promise<typeof naver.maps> | null = null;

export function loadNaverMaps(): Promise<typeof naver.maps> {
  if (typeof window === "undefined") return Promise.reject(new Error("브라우저에서만 받는다"));
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (pending) return pending;

  const id = process.env.NEXT_PUBLIC_NCP_MAPS_CLIENT_ID;
  if (!id) return Promise.reject(new Error("NEXT_PUBLIC_NCP_MAPS_CLIENT_ID 가 없다"));

  pending = new Promise((ok, no) => {
    const el = document.createElement("script");
    // ⛔ 위 주석을 보라 — `gl` 은 어두운 지도를 만들어 넣었을 때만 붙는다
    const gl = MAP_STYLE.light || MAP_STYLE.dark ? "&submodules=gl" : "";
    el.src = `${SRC}?ncpKeyId=${encodeURIComponent(id)}${gl}`;
    el.async = true;
    el.onload = () => {
      if (window.naver?.maps) ok(window.naver.maps);
      else {
        pending = null;
        no(new Error("스크립트는 받았는데 naver.maps 가 없다"));
      }
    };
    el.onerror = () => {
      // ⛔ 지워야 다음에 다시 받는다. 안 지우면 한 번 실패한 뒤로 영영 안 뜬다
      pending = null;
      no(new Error("네이버 지도 스크립트를 못 받았다"));
    };
    document.head.appendChild(el);
  });
  return pending;
}

/**
 * GeoJSON 좌표를 네이버 좌표로.
 *
 * ⛔ **여기서만 뒤집는다.** 우리 데이터는 GeoJSON 이라 `[경도, 위도]` 이고
 *    네이버는 `LatLng(위도, 경도)` 로 **위도가 먼저**다. 뒤집으면 학교가 바다에 뜨거나
 *    아예 안 보이는데 **오류는 안 난다.** 바꾸는 자리를 하나로 모아 두는 것이 유일한 방어다.
 */
export function toLatLng(lngLat: [number, number]): naver.maps.LatLng {
  return new window.naver!.maps.LatLng(lngLat[1], lngLat[0]);
}

/** 좌표 목록을 감싸는 범위. ⛔ 빈 목록이면 `null` — 빈 범위를 넘기면 지도가 엉뚱한 데로 간다 */
export function boundsOf(pts: [number, number][]): naver.maps.LatLngBounds | null {
  if (!pts.length) return null;
  const b = new window.naver!.maps.LatLngBounds(toLatLng(pts[0]), toLatLng(pts[0]));
  for (const p of pts) b.extend(toLatLng(p));
  return b;
}


/**
 * 지도를 옮기되 **화면의 한쪽으로 비켜 놓는다** — MapLibre 의 `easeTo({ offset })` 자리다.
 *
 * ⛔ 네이버에는 그 옵션이 없다. `panTo`·`morph` 는 늘 **한가운데**에 놓는다.
 *    그대로 두면 고른 학교가 **왼쪽 상세 칸 뒤에 숨는다**(폰에서는 아래 시트 뒤에).
 * 그래서 중심을 픽셀만큼 되민 좌표를 직접 잰다.
 * ⛔ 위도는 메르카토르라 픽셀당 도(度)가 위아래로 조금씩 다르다. 여기서 미는 거리는
 *    화면 절반 안쪽이라 그 오차가 눈에 안 보인다 — **정확도가 아니라 가림 방지**가 목적이다.
 *
 * @param dx 오른쪽으로 밀 픽셀 (양수면 학교가 가운데보다 오른쪽에 온다)
 * @param dy 아래로 밀 픽셀 (음수면 학교가 가운데보다 위에 온다)
 */
export function morphWithOffset(
  m: naver.maps.Map,
  lngLat: [number, number],
  zoom: number,
  dx: number,
  dy: number,
) {
  const nv = window.naver!.maps;
  const b = m.getBounds() as naver.maps.LatLngBounds;
  const size = m.getSize();
  // 목표 배율에서의 픽셀당 도 — 배율이 1 오르면 픽셀당 도는 절반이 된다
  const scale = Math.pow(2, m.getZoom() - zoom);
  const perX = size.width ? ((b.east() - b.west()) / size.width) * scale : 0;
  const perY = size.height ? ((b.north() - b.south()) / size.height) * scale : 0;
  m.morph(new nv.LatLng(lngLat[1] + dy * perY, lngLat[0] - dx * perX), zoom);
}
