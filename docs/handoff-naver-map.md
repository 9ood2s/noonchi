# 인계 — 지도를 네이버 Dynamic Map 으로 옮기기 ✅ **끝났다 (2026-08-23)**

> ⭐ **이 이사는 끝났다.** 다른 세션이 할 일로 적어 뒀는데, 같은 날 같은 세션에서 다 했다.
> 결과는 `docs/DESIGN.md §12-111`. 아래 본문은 **그때 무엇을 보고 정했는지의 기록**으로 남긴다.
>
> ## 끝내고 남은 것 — 다음 세션이 볼 것
>
> | 무엇 | 누가 | 왜 |
> |---|---|---|
> | ✅ ~~NCP 콘솔에서 도메인을 등록한다~~ | 사장님 | **끝났다(2026-08-23).** `supaclass` Application 의 **Web 서비스 URL** 이 원인이었다 — `Web Dynamic Map` 은 이미 켜져 있었고 거기에 `supaclass.co`·`supapad.co` 만 들어 있었다. `localhost:3000` · `noonchi-five.vercel.app` · `noonchi-9ood2s-projects.vercel.app` · `noonchischool.com` 을 넣으니 네 도메인 전부 통과한다. ⛔ **`www.` 는 넣을 필요가 없다** — NCP 가 도메인 단위로 보아 `noonchischool.com` 하나가 `www` 까지 덮는다(넣으면 「입력값을 확인해 주세요」로 거부된다). ⛔ **최대 10개**이고 지금 6개다 — `supaclass.co`·`supapad.co` 는 그쪽 것이니 **지우지 마라** |
> | ⛔ **「스크립트가 200 이면 키가 맞다」로 판정하지 마라** | (배운 것) | 2026-08-23 에 그렇게 판정했다가 틀렸다. `maps.js` 는 **아무에게나 200 으로 온다.** 진짜 인증은 지도가 뜰 때 `oapi.map.naver.com/v3/auth?ncpKeyId=…&url=…` 로 따로 간다. **키를 확인하려면 그 주소를 불러야 한다** |
> | **배율 손맞춤값을 다시 잡는다** | 다음 세션 | `ZOOM_SPLIT = 10`(이 아래는 지원청 묶음) · `ZOOM_NAME = 12.5`(이 위는 학교 이름)는 **MapLibre 기준으로 손으로 맞춘 값**이다. 네이버에서 같은 숫자가 같은 넓이를 뜻하지 않는다. **눈으로 보고 다시 잡아야 한다** |
> | **어두운 지도를 만든다** | 사장님 + 다음 세션 | 네이버 기본에는 어두운 지도가 없다. 콘솔 Style Editor 로 밝은 것·어두운 것 둘을 만들어 발행하면 id 가 나온다 → `.env.local` 과 Vercel 의 `NEXT_PUBLIC_NCP_MAP_STYLE_LIGHT` / `_DARK` 에 넣으면 끝이다(자리는 `lib/naver-map.ts` 의 `MAP_STYLE` 에 잡아 뒀다). **넣기 전까지는 어두운 화면에서도 밝은 지도가 뜬다** |
> | `NEXT_PUBLIC_VWORLD_API_KEY` 를 지운다 | 사장님 | 코드에서 안 쓴다. Vercel 과 `.env.local` 에 아직 남아 있다. 급하지 않다 |
>
> ⛔ **밟아 본 함정 하나 더** — `tsconfig` 의 `incremental: true` 때문에 `npx tsc --noEmit` 이
> **옛 오류를 그대로 다시 낸다.** 타입 꾸러미를 새로 넣었는데 계속 「Cannot find name」이 나와서
> 한참 쫓았다. `tsconfig.tsbuildinfo` 와 `.next/cache/.tsbuildinfo` 를 지우면 사라진다.
>
> ⛔ **대중교통은 이 이사와 별개로 닫혔다**(`DESIGN.md §12-112`). 아래 1-1 이 「카카오뿐이다」로
> 적어 둔 그것인데, 사장님이 **비용 때문에 닫기로 정했다.** `lib/features.ts` 한 줄이다.

---

## 0. 왜 옮기나 — 그리고 ⛔ 내가 틀린 근거로 반대했었다

`DESIGN.md §12-53` 에 이렇게 적혀 있었다.

> **MapLibre + VWorld 를 그대로 둔다.** 네이버 지도 SDK 로 갈아끼우지 않는다 —
> 지도 코드가 1,478줄이고, **과금이 지도 로드 수에 비례**해 광고 수익 모델과 부딪힌다.

⛔ **뒷부분이 틀렸다.** 무료 이용량을 모르는 채로 적었다. 2026-08-23 에 사장님이 요금표를
보내 주셔서 확인했다 — **Dynamic Map 은 월 6,000,000건이 무료**이고 초과분이 0.1원이다.
하루 20만 로드다. 3만 명이 하루 여섯 번씩 열어도 무료 안이다. **과금은 반대 근거가 못 된다.**

옮기면 한꺼번에 풀리는 것들 —

| 지금 | 옮기면 |
|---|---|
| **VWorld WMS 가 502 를 쏟는다** (2026-08-23 5분에 297건 — `postmortems.md`) | 배경 지도는 네이버가 준다 |
| **「지도 화질이 후지다」** (사장님, 2026-08-21 · 두 번 지적) | 네이버 지도 그대로다 |
| **VWorld 상업 이용 조건을 아직 확인 못 했다** (§12 열린 것 ㉘) | 배경 지도 쪽 물음이 사라진다 |
| **VWorld 운영 키·도메인 등록** (㉙) | 네이버 쪽 등록 하나로 갈음 |

## 1. ⛔ 옮겨도 안 풀리는 것 넷 — 먼저 알고 시작해라

1. **대중교통 길찾기는 여전히 카카오뿐이다.** 네이버 Directions 5·15 는 **자동차만**이다
   (눌러서 확인했다 — `option=transit`·`bus` 는 「unknown」, `/v1/transit` 은 404).
   문서의 「대중교통 레이어」는 **Mobile SDK(Android·iOS) 전용**이고, 그것도 **노선을 그려 주는 것**이지
   길을 찾아 주는 것이 아니다. 카카오 하루 1,000건 벽은 그대로다(`BACKLOG` ⑪ · §12-106).
2. ~~행정구역 경계 레이어가 네이버에 없다~~ → **없어졌다.** 그날 저녁에 경계를 통째로 걷어냈다
   (사장님 「행정구역 경계 필요없어」 · `DESIGN.md §12-109`). `app/map/bnd/**` 도 지웠다.
   ⭐ **그래서 VWorld 를 전부 지울 수 있다.** 아래 4-6 과 5 의 확인 목록을 그렇게 고쳐 뒀다.
3. ⛔ **키가 브라우저로 나간다.** Web Dynamic Map 은 스크립트 주소에 `ncpKeyId` 를 넣는다.
   §12-53 이 적어 둔 「서버에서만 부르므로 키가 브라우저에 안 나가고 도메인 등록도 필요 없다」는
   이점이 **사라진다.** 방어책은 VWorld 와 같다 — **콘솔에서 도메인을 등록**한다.
4. ~~VWorld 키는 계속 필요하다~~ → **아니다.** 배경 지도를 네이버로 옮기면 `VWORLD_KEY` 는
   **아무 데도 안 쓰인다.** 이사가 끝나면 `.env.local` 과 Vercel 에서 지우고, 열린 것 ㉘·㉙
   (상업 이용 조건 · 운영 키)도 함께 닫는다.

## 2. 무엇이 걸려 있나 — 실측

```
components/map/map-screen.tsx    996줄   ← 이사의 거의 전부
components/map/island-inset.tsx  132줄   ← 작은 지도 하나 더 (도서 창)
lib/map.ts                       280줄   ← 색·라벨·필터. **렌더러와 무관하다. 안 건드린다**
                                          단 VWORLD_LAYER·vworldTiles 는 이사 뒤 지운다
```
⛔ `app/map/bnd/**`(경계 타일 중계 112줄)는 **이미 지웠다.** 찾지 마라.

⭐ **안 건드리는 것** — `lib/map.ts`(색·라벨·필터 판정) · `/map/data` · `/map/views` ·
`map-controls.tsx`(필터) · `map-layers.tsx` · `map-legend.tsx` · `school-panel.tsx` ·
`school-sheet.tsx` · `panel-views.tsx` · `commute.tsx`.
이것들은 지도 라이브러리를 모른다. **이사는 두 파일이다.**

### 지금 쓰는 MapLibre API 는 이게 전부다

| 하는 일 | MapLibre | 네이버 Web Dynamic Map |
|---|---|---|
| 지도 만들기 | `new lib.Map({ container, style, center, zoom })` | `new naver.maps.Map(el, { center, zoom })` |
| 배경 지도 | style 에 raster source(VWorld WMTS) | **기본 제공.** 스타일은 Map Style Editor 로 만들어 `customStyleId` |
| 말풍선(HTML) | `new lib.Marker({ element, anchor }).setLngLat().addTo(m)` | `new naver.maps.Marker({ position, icon: { content } , map })` |
| 화면 다 그림 | `m.on("moveend", …)` | `naver.maps.Event.addListener(map, "idle", …)` |
| 준비됨 | `m.on("load", …)` | `naver.maps.Event.once(map, "init", …)` |
| 보이는 범위 | `m.getBounds()` | `map.getBounds()` |
| 배율 | `m.getZoom()` | `map.getZoom()` |
| 옮기기 | `m.easeTo({ center, zoom })` | `map.morph(latlng, zoom)` / `map.panTo()` |
| 범위 맞추기 | `m.fitBounds([[w,s],[e,n]], { padding })` | `map.fitBounds(bounds, { padding })` |
| 크기 다시 재기 | `m.resize()` | `naver.maps.Event.trigger(map, "resize")` |
| 경로선 | `addSource("route") + addLayer ×2` | `new naver.maps.Polyline({ path, strokeColor, strokeWeight })` |
| 줌 단추 | `new lib.NavigationControl()` | `zoomControl: true` (옵션) |
| ~~경계 켜고 끄기~~ | ~~`setLayoutProperty`~~ | **없어졌다**(위 1-2) |

⚠️ **클래스 이름은 반드시 개발 가이드로 대조해라.** 위 표는 문서 목록에서 확인한 것이라
세부 서명(인자 모양)까지는 안 맞을 수 있다 —
<https://navermaps.github.io/maps.js.ncp/docs/index.html>

## 3. ⛔ 반드시 밟을 함정 넷

1. ⛔ **좌표 순서가 뒤집힌다.** 우리 데이터는 GeoJSON 이라 **`[경도, 위도]`** 이고,
   네이버는 **`new naver.maps.LatLng(위도, 경도)`** 로 **위도가 먼저**다.
   뒤집으면 학교가 **바다에 뜨거나 아예 안 보인다.** 오류는 안 난다.
   → 바꾸는 자리를 **함수 하나로** 만들어 두고 거기서만 뒤집어라.
2. ⛔ **배율 체계가 다르다.** 지금 `ZOOM_SPLIT = 10`(이 아래는 지원청 묶음) ·
   `ZOOM_NAME = 12.5`(이 위는 학교 이름) 는 **MapLibre 기준으로 손으로 맞춘 값**이다.
   네이버에서 같은 숫자가 같은 넓이를 뜻하지 않는다. **눈으로 다시 잡아야 한다.**
3. ⛔ **말풍선은 1,600개다.** 지금은 **보이는 것만 그리고**(뷰포트 컬링) 화면이 안 움직였으면
   다시 안 그린다(§12-105 — 그걸 안 했더니 번쩍였다). 네이버로 옮겨도 **그 두 가지를 그대로 가져가라.**
   Marker 를 전부 만들어 두고 지도에 맡기면 폰에서 멈춘다.
4. ⛔ **`.maplibregl-*` 를 겨눈 CSS 가 `globals.css` 에 있다.** 조작 단추 자리·색·크기와
   말풍선 규칙이다. 셀렉터를 네이버 것으로 바꿔야 하고, **특이도를 한 겹 올려 두어라** —
   남의 CSS 가 뒤에 실려 우리 규칙이 통째로 진 적이 두 번 있다(`postmortems.md`).

## 4. 순서

1. **콘솔에서 Application 등록** — Web Dynamic Map 을 켜고 **도메인을 등록**한다
   (`noonchi-9ood2s-projects.vercel.app` 과 나중의 `noonchischool.com`).
   ⛔ 대표 계정이어야 무료 이용량이 간다(FAQ 2829). 지금 NCP 키를 만든 그 계정인지 확인해라.
2. **`NEXT_PUBLIC_NCP_MAPS_CLIENT_ID`** 를 `.env.local` 과 Vercel 에 넣는다.
   ⛔ 지금 있는 `NCP_MAPS_KEY_ID`·`NCP_MAPS_KEY` 는 **서버 전용(Directions·Geocoding)** 이라 다른 것이다.
   섞지 마라 — 서버 키를 브라우저로 내보내면 안 된다.
3. **`island-inset.tsx` 부터 옮긴다.** 132줄이고 말풍선만 있다. 여기서 좌표 뒤집기와
   배율을 잡아 보고 그 감각을 본 지도에 쓴다.
4. **`map-screen.tsx`** — 지도 만들기 → 말풍선 → 이벤트 → 경로선 → 경계 순으로.
5. **배경 지도 스타일** — Map Style Editor 로 밝은/어두운 둘을 만들어 발행하고
   `components/theme-toggle.tsx` 의 `runaway:theme` 신호에 맞춰 갈아 끼운다(지금 VWorld 를 그렇게 쓴다).
6. ⭐ **VWorld 를 통째로 걷어낸다.** `lib/map.ts` 의 `VWORLD_LAYER`·`vworldTiles`·
   `VWORLD_ATTRIBUTION`, `map-screen.tsx` 의 `vworld` source·layer 와 밝기 갈아끼우기(`swap`),
   `.env.local`·Vercel 의 `VWORLD_KEY` 까지 전부다. 남길 것이 없다(위 1-2·1-4).
   ⛔ **저작자 표시는 네이버 것으로 갈아 끼운다** — 지우기만 하면 안 된다.

## 5. 끝났다고 하려면 눌러 봐야 하는 것

- [ ] 경기·인천을 갈아타도 말풍선이 다 뜬다 (1,367 · 270교)
- [ ] 멀리서 **지원청 묶음** → 가까이 **학교** → 더 가까이 **이름**까지 세 단계가 그대로다
- [ ] 필터를 걸면 말풍선이 줄고, **화면을 안 움직여도** 바로 반영된다(§12-105 의 그 함정)
- [ ] 학교를 눌러도 **주변이 번쩍이지 않는다**
- [ ] 고른 학교가 **이름이 펴지고 떠오르고 나머지가 흐려진다**(§12-93)
- [ ] 길찾기 경로선이 자동차/지하철/버스/도보 **색이 갈려** 그려지고, 학교를 갈아타면 지워진다
- [ ] 도서 창(왼쪽 아래)이 뜬다
- [ ] 밝기를 바꾸면 배경 지도도 바뀐다
- [ ] **폰(390)에서 손가락으로** 말풍선을 눌러 상세가 열린다(§11-4)
- [ ] 길찾기 경로선이 **누르자마자** 그려지고, 그 경로가 보이게 지도가 옮겨진다(§12-110-1)
- [ ] 길찾기 상세 옆 칸이 학교 상세 칸 **오른쪽에 나란히** 선다(§12-110)
- [ ] `VWorld` 라는 글자가 코드에 하나도 안 남았다 — `grep -rin vworld components lib app`
- [ ] `npm run verify` EXIT=0 · 가드 넷 그대로

## 6. 되돌릴 수 있게

⛔ **한 커밋에 다 담지 마라.** 배경 지도 → 말풍선 → 경로선 순으로 갈라 커밋해라.
이사 중에 난 사고와 원래 있던 결함을 가릴 수 있어야 한다.
⚠️ 2026-08-23 하루에 화면을 열 번 넘게 바꿨다. 이사 전에 **지금 것이 사장님 눈을 한 번 거쳤는지**
확인하고 시작해라 — 안 그러면 무엇이 새 버그인지 못 가린다.
