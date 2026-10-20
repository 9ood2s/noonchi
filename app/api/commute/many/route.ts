/**
 * 여러 학교의 **저장해 둔 통근 값**을 한 번에 읽는다. (docs/DESIGN.md §12-144)
 *
 * 관심목록은 학교가 아홉이라, 한 곳씩 물으면 화면 하나를 여는 데 요청이 아홉 번 나간다.
 * 여기는 그것을 한 번으로 줄인다.
 *
 * ⛔ **바깥을 안 부른다.** 네이버도 카카오도 여기서는 안 부른다 — 저장된 것만 읽는다.
 *    새로 찾는 것은 `../route.ts` 한 곳뿐이고, 그쪽은 로그인을 본다(§12-136).
 *    이 길이 바깥을 부르면 「목록 열기 = 아홉 번 호출」이 되어 아끼려던 것을 도로 태운다.
 * ⛔ **집 좌표를 그대로 두지 않는다.** 받자마자 500m 격자로 뭉갠다 — 위 route.ts 와 같은 규칙이다.
 * ⛔ **학교 좌표를 받지 않는다.** 표준학교코드만 받는다.
 * ⛔ 열람은 무인증이다(CLAUDE.md §13). 저장된 값을 읽는 것뿐이라 로그인을 안 본다.
 */

import { createClient } from "@supabase/supabase-js";
import { toGrid, toSlot } from "@/lib/commute.mjs";

/** 찾은 지 이만큼 지나면 없는 것으로 본다. `../route.ts` 의 STALE_DAYS 와 같은 값이어야 한다 */
const STALE_DAYS = 90;

/**
 * 한 번에 물을 수 있는 학교 수.
 * ⛔ **조용히 자르는 상한이 아니다**(§11-1) — 넘으면 **거절**한다. 관심목록이 9곳이라
 *    9를 넘길 일이 없고, 넘겨서 오는 것은 우리 화면이 아니다.
 */
const MAX = 9;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const reader = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;

export async function POST(req: Request) {
  let body: { lat?: number; lng?: number; codes?: unknown; at?: string; dir?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "본문을 읽지 못했습니다" }, { status: 400 });
  }

  const { lat, lng, at } = body;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng))
    return Response.json({ ok: false, error: "집 좌표가 없습니다" }, { status: 400 });
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132)
    return Response.json({ ok: false, error: "집 좌표가 범위 밖입니다" }, { status: 400 });

  const codes = Array.isArray(body.codes) ? body.codes.filter((c): c is string => typeof c === "string") : [];
  if (!codes.length) return Response.json({ ok: true, found: {} });
  if (codes.length > MAX)
    return Response.json({ ok: false, error: `학교는 ${MAX}곳까지 물을 수 있습니다` }, { status: 400 });
  if (codes.some((c) => !/^\d{5,12}$/.test(c)))
    return Response.json({ ok: false, error: "학교를 찾지 못했습니다" }, { status: 400 });

  const slot = toSlot(at ?? "");
  if (slot == null) return Response.json({ ok: false, error: "시각이 올바르지 않습니다" }, { status: 400 });

  const dir = body.dir === "퇴근" ? "퇴근" : "출근";
  const { gy, gx } = toGrid(lat, lng);

  if (!reader) return Response.json({ ok: false, error: "저장한 것을 못 읽었습니다" }, { status: 503 });

  const { data, error } = await reader
    .from("commute")
    .select("std_code, car_min, transit_min, measured_at, routes")
    .eq("grid_y", gy)
    .eq("grid_x", gx)
    .eq("at_min", slot)
    .eq("dir", dir)
    .in("std_code", codes);

  // ⛔ 실패를 삼키지 않는다(§11-2). 빈 목록으로 답하면 화면이 「아직 안 찾았다」로 읽는다
  if (error) return Response.json({ ok: false, error: "저장한 것을 못 읽었습니다" }, { status: 502 });

  /**
   * ⛔ **오래된 줄은 없는 것으로 본다.** 석 달 전 값을 오늘 값처럼 나란히 놓으면
   *    비교 판에서 그 학교만 유리하거나 불리해 보인다 — 견주는 화면에서 가장 나쁜 거짓말이다.
   */
  const found: Record<string, { car: number | null; transit: number | null; measuredAt: string; km: number | null; toll: number | null }> = {};
  for (const r of data ?? []) {
    const age = (Date.now() - new Date(r.measured_at).getTime()) / 86400000;
    if (age >= STALE_DAYS) continue;
    // 거리·통행료는 경로 목록 안에 있다. 가장 빠른 자동차 경로의 것을 쓴다
    const car = ((r.routes as { mode?: string; km?: number; toll?: number }[] | null) ?? []).find(
      (x) => x.mode === "자동차",
    );
    found[r.std_code as string] = {
      car: r.car_min,
      transit: r.transit_min,
      measuredAt: r.measured_at,
      km: car?.km ?? null,
      toll: car?.toll ?? null,
    };
  }

  return Response.json({ ok: true, found });
}
