/**
 * 집 주소 → **500m 격자**. (docs/DESIGN.md §12-57)
 *
 * 적은 주소로 **후보 목록**을 낸다. 고르는 일은 사람이 한다(§12-134).
 *
 * ⛔ **정확한 좌표를 돌려주지 않는다.** 격자만 낸다 —
 *    브라우저에도 안 남아야 「기기를 잃어버려도 어느 동네쯤까지만」이 지켜진다.
 * ⛔ **서버도 저장하지 않는다.** 받아서 바꿔 주고 끝이다. 로그에도 주소를 안 남긴다.
 * ⛔ 키는 서버에만 있다(`KAKAO_REST_KEY` 에 `NEXT_PUBLIC_` 을 안 붙였다).
 *
 * ⭐ **네이버(NCP Geocoding)가 아니라 카카오 로컬이다** (2026-08-23 · §12-135).
 *    네이버 지오코딩은 **건물번호까지 다 적어야** 답한다 — 실제로 재 보니
 *    「시민대로」는 0건, 「안양시 동안구 시민대로 133」은 2건이었다.
 *    그런데 사람이 주소를 적는 차례는 **도로명 먼저, 번호는 나중**이다.
 *    그 차례대로면 네이버는 다 적을 때까지 「그 주소를 찾지 못했습니다」만 낸다 —
 *    잘 적고 있는 사람에게 틀렸다고 말하는 꼴이다.
 *    카카오 로컬 주소 검색은 같은 「시민대로」에 **18건**을 낸다(재 보고 골랐다).
 * ⛔ 길찾기(모빌리티)와 **다른 쿼터**다. 대중교통을 닫은 까닭(하루 1,000건)은 여기 해당하지 않는다.
 *    ⚠️ 다만 콘솔에서 한 번 확인해 두는 편이 낫다(`docs/BACKLOG.md`).
 */

import { toGrid } from "@/lib/commute.mjs";

/** 한 번에 낼 후보 수. 손가락으로 훑을 만한 길이다 — 더 필요하면 주소를 더 적는 편이 빠르다 */
const COUNT = 8;

type Doc = {
  x?: string;
  y?: string;
  address_name?: string;
  road_address?: { address_name?: string } | null;
  address?: { address_name?: string } | null;
};

export async function POST(req: Request) {
  let body: { q?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "본문을 읽지 못했습니다" }, { status: 400 });
  }

  const q = (body.q ?? "").trim();
  if (q.length < 2 || q.length > 100)
    return Response.json({ ok: false, error: "주소를 적어 주십시오" }, { status: 400 });

  const key = process.env.KAKAO_REST_KEY;
  if (!key) return Response.json({ ok: false, error: "주소 열쇠가 없습니다" }, { status: 503 });

  const u = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  u.searchParams.set("query", q);
  u.searchParams.set("size", String(COUNT));

  let j: { documents?: Doc[] };
  try {
    const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` } });
    // ⛔ 실패를 삼키지 않는다. 다만 「없다」와 「못 물어봤다」는 다른 말로 적는다(§11-2)
    if (!r.ok) return Response.json({ ok: false, error: "주소를 찾지 못했습니다" }, { status: 502 });
    j = await r.json();
  } catch {
    return Response.json({ ok: false, error: "주소를 찾지 못했습니다" }, { status: 502 });
  }

  /**
   * ⛔ **후보에도 좌표를 안 실어 보낸다** — 격자만 낸다. 고르기 전이라고 다를 것이 없다.
   *    좌표를 실으면 그 응답이 곧 정밀 위치의 목록이 된다.
   * ⛔ 도로명이 있으면 도로명을 앞에 낸다. 지번만 있는 줄은 지번을 쓴다 —
   *    카카오는 둘 중 하나가 `null` 인 줄을 그대로 준다.
   * ⛔ 좌표가 숫자가 아닌 줄은 버린다. 격자로 못 바꾸는 줄을 목록에 두면 고른 순간 깨진다.
   */
  const items = (j.documents ?? [])
    .map((d) => {
      const road = d.road_address?.address_name ?? "";
      const jibun = d.address?.address_name ?? d.address_name ?? "";
      const lat = Number(d.y);
      const lng = Number(d.x);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const { gy, gx } = toGrid(lat, lng);
      return { gy, gx, label: road || jibun, sub: road ? jibun : "" };
    })
    .filter((v): v is { gy: number; gx: number; label: string; sub: string } => !!v && !!v.label);

  if (!items.length) return Response.json({ ok: false, error: "그 주소를 찾지 못했습니다" }, { status: 404 });

  return Response.json({ ok: true, items });
}
