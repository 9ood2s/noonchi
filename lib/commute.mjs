/**
 * 통근 소요시간 — 격자 · 시간대 · 두 API 호출 (docs/DESIGN.md §12-54 ~ 57)
 *
 * ⛔ **`.mjs` 인 까닭** — 셀프체크(`scripts/selftest-commute.mjs`)가 빌드 없이 그대로 부른다.
 *    전보년수 규칙(`lib/transfer.mjs`)과 같은 방식이다.
 * ⛔ 여기서 키를 읽지 않는다. 부르는 쪽(서버 라우트)이 넘긴다 — 그래야 브라우저에 안 섞인다.
 */

/**
 * 500m 격자.
 *
 * ⛔ 위도와 경도의 「1도」가 다르다. 위도 1도는 어디서나 약 111km 지만
 *    경도 1도는 `111km × cos(위도)` 라 위도 37.5°(경기·인천)에서 약 88km 다.
 *    그래서 나누는 값이 다르다 — 하나로 쓰면 격자가 남북으로 길쭉해진다.
 * ⛔ 다른 시·도로 넓힐 때 이 값을 다시 본다. 제주(33°)는 경도 1도가 93km 라 3% 어긋난다.
 */
export const GRID_LAT = 0.0045; // 약 500m
export const GRID_LNG = 0.00568; // 약 500m (위도 37.5° 기준)

/** 집 좌표를 격자로 뭉갠다. ⛔ 원본 좌표는 여기서 끝이다 — 어디에도 남기지 않는다. */
export function toGrid(lat, lng) {
  return { gy: Math.round(lat / GRID_LAT), gx: Math.round(lng / GRID_LNG) };
}

/** 격자 한 칸의 한가운데. 실제로 길을 잴 때 쓰는 좌표다 */
export function gridCenter(gy, gx) {
  return { lat: gy * GRID_LAT, lng: gx * GRID_LNG };
}

/**
 * 시각을 30분 단위로 반올림한다. `"08:20"` → 510(08:30).
 * ⛔ 같은 시각끼리 값을 나눠 쓰려는 것이다(§12-56). 15분으로 잘게 쪼개면 캐시가 두 배로 흩어진다.
 * ⛔ 자정을 넘기지 않는다 — 23:50 은 24:00 이 아니라 0 시로 돈다.
 */
export function toSlot(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return (Math.round((h * 60 + mi) / 30) * 30) % 1440;
}

/** 510 → "08:30" */
export const slotLabel = (slot) =>
  `${String(Math.floor(slot / 60)).padStart(2, '0')}:${String(slot % 60).padStart(2, '0')}`;

/** 밀리초·초를 분으로. ⛔ 올림한다 — 21.4분을 21분이라 하면 늘 모자란 쪽으로 틀린다 */
const toMin = (v, unit) => Math.max(1, Math.ceil(v / (unit === 'ms' ? 60000 : 60)));

/**
 * 자동차 — 네이버 클라우드 Directions 5.
 * ⛔ **한 번에 세 경로**를 받는다(2026-08-23 · §12-103). 넷을 넣으면 400 이다.
 *    실측 — 빠른길 29분/22.0km · 편한길 33분/21.2km · 무료우선 34분/18.8km.
 *    **호출은 한 번**이라 쿼터가 안 는다(§12-99).
 * ⛔ **통행료만 낸다**(2026-08-23 사장님). 연료비·택시비는 응답에 오지만 안 쓴다 —
 *    「1종 휘발유 차량 기준」이라 경유·전기차에는 틀린 값이다(§12-54 를 여기까지만 뒤집었다).
 * ⛔ HTTP 200 이라고 성공이 아니다. 본문의 `code` 가 0 이어야 길을 찾은 것이다.
 */
const CAR_OPTIONS = [
  { key: 'trafast', label: '빠른길' },
  { key: 'tracomfort', label: '편한길' },
  { key: 'traavoidtoll', label: '무료우선' },
];

export async function carRoutes(from, to, keyId, key) {
  const u = new URL('https://maps.apigw.ntruss.com/map-direction/v1/driving');
  u.searchParams.set('start', `${from.lng},${from.lat}`);
  u.searchParams.set('goal', `${to.lng},${to.lat}`);
  u.searchParams.set('option', CAR_OPTIONS.map((o) => o.key).join(':'));
  const r = await fetch(u, {
    headers: { 'x-ncp-apigw-api-key-id': keyId, 'x-ncp-apigw-api-key': key },
  });
  if (!r.ok) return [];
  const j = await r.json();
  if (j?.code !== 0) return [];
  const out = [];
  for (const { key: k, label } of CAR_OPTIONS) {
    const t = j?.route?.[k]?.[0];
    if (!t?.summary?.duration) continue;
    const s = t.summary;
    out.push({
      mode: '자동차',
      key: k,
      label,
      min: toMin(s.duration, 'ms'),
      km: s.distance == null ? null : Math.round(s.distance / 100) / 10,
      // ⛔ 통행료만. 차종·유가를 모르면 연료비·택시비는 틀린 값이다
      toll: s.tollFare == null ? null : Number(s.tollFare),
      path: thin(t.path),
    });
  }
  // ⛔ 같은 길이 두 이름으로 오기도 한다(빠른길 = 최적). 소요시간·거리가 같으면 하나만 남긴다
  const seen = new Set();
  const uniq = out.filter((x) => {
    const sig = `${x.min}/${x.km}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    return true;
  });
  return uniq.sort((a, b) => a.min - b.min);
}

/** 점을 솎는다 — 지도 축척에서 안 보이는 정밀도는 버린다.
 * ⛔ **처음과 끝은 반드시 남긴다.** 솎다가 끝점을 잃으면 선이 학교 앞에서 끊긴다. */
function thin(points, keep = 160) {
  if (!Array.isArray(points) || points.length <= keep) return points ?? null;
  const step = (points.length - 1) / (keep - 1);
  const out = [];
  for (let i = 0; i < keep; i++) out.push(points[Math.round(i * step)]);
  out[out.length - 1] = points[points.length - 1];
  return out;
}

/** 카카오가 적어 주는 수단 이름을 우리 말로. ⛔ 모르는 것은 지어내지 않고 그대로 둔다 */
const KIND = { BUS: '버스', SUBWAY: '지하철', WALKING: '도보', TRAIN: '기차', EXPRESSBUS: '고속버스' };

/** step 하나를 화면이 읽을 꼴로. 노선번호·타는 곳·내리는 곳을 남긴다 */
function toStep(st) {
  const pr = st?.properties ?? {};
  const stops = Array.isArray(pr.stops) ? pr.stops : [];
  const vehicles = Array.isArray(pr.vehicles) ? pr.vehicles : [];
  return {
    kind: KIND[pr.type] ?? pr.type ?? '이동',
    // 「간선 143」처럼. 여러 대가 서면 첫 번째만 적고 몇 대인지 덧붙인다
    label: vehicles.length
      ? `${vehicles[0].type ?? ''} ${vehicles[0].name ?? ''}`.trim() +
        (vehicles.length > 1 ? ` 외 ${vehicles.length - 1}` : '')
      : (KIND[pr.type] ?? '이동'),
    from: stops[0]?.name ?? null,
    to: stops.length > 1 ? stops[stops.length - 1].name : null,
    /** 그 구간에서 지나는 정류장 수 — 버스·지하철에서만 뜻이 있다 */
    stops: stops.length > 1 ? stops.length - 1 : null,
    min: pr.time ? toMin(pr.time, 's') : null,
    /** 그 구간 거리(m). 도보는 「1.3km」처럼 적어야 뜻이 있다 */
    m: pr.distance == null ? null : Number(pr.distance),
    points: thin(st?.path?.points, 60),
  };
}

/**
 * 대중교통 — 카카오 대중교통 길찾기.
 * ⛔ 돌려주는 경로가 **빠른 순이 아니다**(실제로 15개가 뒤섞여 온다). 정렬해서 쓴다.
 * ⛔ **버리지 않는다**(2026-08-23 사장님). 같은 한 번의 호출에서 오는 것이라 쿼터가 안 든다.
 *    다만 **다섯까지만** 낸다 — 열다섯을 다 내면 읽을 수가 없다.
 * ⛔ 요금은 응답에 없다. 대중교통은 통행료도 없다.
 */
export async function transitRoutes(from, to, key) {
  const u = new URL('https://dapi.kakao.com/v2/routing/publictraffic');
  u.searchParams.set('start_x', String(from.lng));
  u.searchParams.set('start_y', String(from.lat));
  u.searchParams.set('end_x', String(to.lng));
  u.searchParams.set('end_y', String(to.lat));
  const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` } });
  if (!r.ok) return [];
  const j = await r.json();
  const routes = (j?.routes ?? []).filter((x) => x?.properties?.totalTime > 0);
  if (!routes.length) return [];

  const sorted = [...routes].sort((a, b) => a.properties.totalTime - b.properties.totalTime);

  // 먼저 겹치는 것을 걷어내고 다섯만 남긴다
  const picked = [];
  const seen = new Set();
  for (const x of sorted) {
    if (picked.length >= 5) break;
    const steps = (x.steps ?? []).map(toStep).filter((v) => v.min || v.points);
    // ⛔ 같은 노선 조합이 여러 번 온다. 한 번만 낸다
    const sig = steps.map((v) => v.label).join('>');
    if (seen.has(sig)) continue;
    seen.add(sig);
    picked.push({ x, steps });
  }

  /**
   * 이름은 **무엇이 나은 길인지**로 붙인다 — 「경로 2」는 아무것도 안 말한다.
   * ⛔ **남긴 것들 안에서** 고른다. 겹쳐서 걷어낸 경로를 가리키면 그 이름이 아무 데도 안 붙는다
   *    (2026-08-23 에 실제로 그랬다 — 「최소환승」이 한 번도 안 나왔다).
   */
  const best = (fn) => picked.reduce((a, b) => (fn(b.x) < fn(a.x) ? b : a), picked[0]);
  const fewestWalk = picked.length > 1 ? best(walkSec) : null;
  const fewestHops = picked.length > 1 ? best((v) => v.properties.transfers ?? 9) : null;

  return picked.map(({ x, steps }, i) => ({
    mode: '대중교통',
    key: `t${i}`,
    label:
      i === 0
        ? '최적'
        : picked[i] === fewestHops && (x.properties.transfers ?? 9) < (picked[0].x.properties.transfers ?? 9)
          ? '최소환승'
          : picked[i] === fewestWalk && walkSec(x) < walkSec(picked[0].x)
            ? '최소도보'
            : `다른 길 ${i}`,
    min: toMin(x.properties.totalTime, 's'),
    km: x.properties.totalDistance == null ? null : Math.round(x.properties.totalDistance / 100) / 10,
    toll: null,
    transfers: x.properties.transfers ?? null,
    /** 걷는 시간(분) — 「도보 34분」처럼 요약에 쓴다 */
    walk: Math.round(walkSec(x) / 60),
    steps,
  }));
}

/** 그 경로에서 걷는 시간(초). 「최소도보」를 고를 때 쓴다 */
const walkSec = (x) =>
  (x.steps ?? []).reduce((a, st) => a + (st?.properties?.type === 'WALKING' ? (st.properties.time ?? 0) : 0), 0);
