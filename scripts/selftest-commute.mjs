#!/usr/bin/env node
/**
 * 통근 셀프체크 — 격자와 시간대 계산만 본다(바깥을 부르지 않는다).
 * ⛔ API 호출은 여기 안 넣는다. 셀프체크는 인터넷 없이도 돌아야 한다.
 */
import { GRID_LAT, GRID_LNG, gridCenter, slotLabel, toGrid, toSlot } from '../lib/commute.mjs';

let bad = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    bad++;
    console.error(`  ✗ ${name}\n     받음 ${JSON.stringify(got)}\n     원함 ${JSON.stringify(want)}`);
  }
};

// ── 시간대 — 30분으로 반올림 ────────────────────────────────────────
eq('08:30 그대로', toSlot('08:30'), 510);
eq('08:20 → 08:30', toSlot('08:20'), 510);
eq('08:14 → 08:00', toSlot('08:14'), 480);
eq('8:05 (한 자리 시)', toSlot('8:05'), 480);
eq('00:00', toSlot('00:00'), 0);
// ⛔ 자정을 넘기지 않는다 — 23:50 은 24:00(1440)이 아니라 0 으로 돈다
eq('23:50 → 자정으로 돈다', toSlot('23:50'), 0);
eq('23:44 → 23:30', toSlot('23:44'), 1410);
eq('말이 안 되는 시각', toSlot('25:00'), null);
eq('분이 60 이상', toSlot('08:75'), null);
eq('빈 값', toSlot(''), null);
eq('510 을 다시 글자로', slotLabel(510), '08:30');
eq('0 을 다시 글자로', slotLabel(0), '00:00');

// ── 격자 — 500m ────────────────────────────────────────────────────
// 공개된 장소(서울시청)를 사용하는 합성 위치 테스트다.
const 시청 = { lat: 37.5665, lng: 126.9780 };
const g = toGrid(시청.lat, 시청.lng);
eq('공개 장소 격자', g, { gy: Math.round(37.5665 / GRID_LAT), gx: Math.round(126.9780 / GRID_LNG) });

// ⛔ 같은 칸 안에서 움직이면 같은 값이 나와야 한다 — 그래야 캐시를 나눠 쓴다.
//    ⛔ 「원래 자리에서 0.4칸」이 아니라 **칸 한가운데에서** 재야 한다. 반올림 경계는
//       한가운데가 아니라 ±0.5칸 자리에 있어서, 원래 자리가 경계 가까이면 0.4칸만 움직여도 넘어간다.
const c = gridCenter(g.gy, g.gx);
for (const [dy, dx] of [[0.45, 0.45], [-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45]]) {
  eq(
    `칸 한가운데에서 ${dy}·${dx}칸 움직여도 같은 격자`,
    toGrid(c.lat + GRID_LAT * dy, c.lng + GRID_LNG * dx),
    g,
  );
}

// 한 칸을 넘으면 다른 칸이다
eq('한 칸 넘으면 다른 격자', toGrid(c.lat + GRID_LAT * 1.2, c.lng).gy === g.gy, false);

// 격자 한가운데는 원래 자리에서 250m 안쪽이다 (위도 1도 ≈ 111km)
const dLat = Math.abs(c.lat - 시청.lat) * 111000;
const dLng = Math.abs(c.lng - 시청.lng) * 111000 * Math.cos((37.5 * Math.PI) / 180);
eq('격자 한가운데까지 250m 안쪽', dLat < 260 && dLng < 260, true);

// ⛔ 500m 격자가 정말 500m 인지 — 위도·경도 각각 재 본다
const 한칸_남북 = GRID_LAT * 111000;
const 한칸_동서 = GRID_LNG * 111000 * Math.cos((37.5 * Math.PI) / 180);
eq('격자 남북 길이 450~550m', 한칸_남북 > 450 && 한칸_남북 < 550, true);
eq('격자 동서 길이 450~550m', 한칸_동서 > 450 && 한칸_동서 < 550, true);

const total = 21;
if (bad) {
  console.error(`통근 셀프체크 — ${bad}개 실패`);
  process.exit(1);
}
console.log(`통근 셀프체크 — ${total}개 통과`);
