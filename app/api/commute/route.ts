/**
 * 통근 소요시간 — 집 격자에서 학교까지 자동차·대중교통이 몇 분인가.
 * (docs/DESIGN.md §12-54 · 55 · 56 · 57)
 *
 * ⛔ **집 좌표를 그대로 두지 않는다.** 받자마자 500m 격자로 뭉개고, 그 뒤로는 격자만 쓴다.
 *    저장도 로그도 격자다. 이 서버는 누가 어디 사는지 끝까지 모른다.
 * ⛔ **학교 좌표를 클라이언트에게서 받지 않는다.** 표준학교코드만 받아 서버가 찾는다 —
 *    좌표를 받으면 아무 데나 찍어 남의 쿼터를 태울 수 있다.
 * ⛔ **키는 서버에만 있다.** NCP·카카오 키에 `NEXT_PUBLIC_` 을 붙이지 않았다(§12-55-2).
 * ⛔ **새로 재는 것은 로그인한 사람만**이다(§12-136). 재 둔 값을 읽는 것은 그대로 무인증이다.
 * ⛔ 두 API 모두 **출발 시각을 못 받는다**(§12-55-1). 그래서 「그 시간대에 실제로 재서 남긴다」다 —
 *    지금 부른 값이 곧 「지금 시간대」의 값이고, 다른 시간대 값은 그 시간에 누군가 부를 때 쌓인다.
 */

import { createClient } from "@supabase/supabase-js";
import { currentMember } from "@/lib/auth/server";
import { schoolByCode } from "@/lib/schools";
import { carRoutes, gridCenter, toGrid, toSlot, transitRoutes } from "@/lib/commute.mjs";
import { TRANSIT_ON } from "@/lib/features";

/** 잰 지 이만큼 지나면 다시 잰다. 길과 노선은 자주 안 바뀌지만 석 달 전 값을 오늘 값처럼 내면 안 된다 */
const STALE_DAYS = 90;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
/**
 * ⛔ 캐시에 **쓰는 것**만 이 열쇠가 필요하다. 표에 anon 쓰기 정책을 안 만들었기 때문이다 —
 *    열어 두면 아무나 「강남까지 3분」을 심을 수 있고 화면은 그걸 확신을 갖고 보여준다.
 *    이 열쇠가 없으면 **읽기만 하고 안 쓴다.** 화면은 그대로 돌지만 매번 바깥을 부른다.
 */
/**
 * 한 사람이 **일주일에 새로 잴 수 있는 횟수** (2026-08-23 사장님 · §12-152).
 * ⛔ 재 둔 값을 읽는 것은 여기 안 든다 — 돈이 드는 것은 바깥을 부르는 일뿐이다.
 * ⛔ 주는 **월요일에 시작한다**(서울 기준). 굴러가는 7일로 하면 언제 풀리는지 사람이 모른다.
 */
const WEEK_CAP = 20;

const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const reader = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false } }) : null;
const writer = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

export async function POST(req: Request) {
  let body: { lat?: number; lng?: number; stdCode?: string; at?: string; cacheOnly?: boolean; dir?: string; mode?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "본문을 읽지 못했습니다" }, { status: 400 });
  }

  const { lat, lng, stdCode, at } = body;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng))
    return Response.json({ ok: false, error: "집 좌표가 없습니다" }, { status: 400 });
  // 경기·인천을 넉넉히 감싸는 범위. 밖이면 우리가 답할 수 있는 곳이 아니다.
  if (lat < 33 || lat > 39 || lng < 124 || lng > 132)
    return Response.json({ ok: false, error: "집 좌표가 범위 밖입니다" }, { status: 400 });
  if (typeof stdCode !== "string" || !/^\d{5,12}$/.test(stdCode))
    return Response.json({ ok: false, error: "학교를 찾지 못했습니다" }, { status: 400 });

  const slot = toSlot(at ?? "");
  if (slot == null) return Response.json({ ok: false, error: "시각이 올바르지 않습니다" }, { status: 400 });

  /**
   * 방향 — 출근(집→학교)과 퇴근(학교→집)은 **다른 값**이다(2026-08-23 사장님 · §12-101).
   * ⛔ **「등교」가 아니다.** 등교는 학생이 하는 것이고 이 서비스의 사용자는 교사다(CLAUDE.md §4).
   * 일방통행·차선·버스 배차가 달라 시간이 같지 않다. 캐시도 따로 잡는다.
   */
  const dir = body.dir === "퇴근" ? "퇴근" : "출근";

  /**
   * 어느 수단을 잴까. ⛔ **고른 것만 부른다**(2026-08-23).
   *    전에는 「길찾기」 한 번에 자동차·대중교통을 **둘 다** 불렀다 — 자동차만 보려는
   *    사람도 카카오 쿼터를 태웠다. 카카오는 **하루 1,000건**이라 그게 바로 벽이다.
   *    네이버 Directions 5 는 **월 60,000건**(하루 2,000)이고 초과분은 5원에 살 수 있다.
   *    두 벽의 높이가 다르므로 **필요한 쪽만** 부른다.
   */
  /**
   * ⛔ **대중교통은 닫혀 있다**(`lib/features.ts` — 2026-08-23 사장님 「닫아둬」).
   *    닫혀 있으면 **무엇을 물어 오든 자동차로 본다.** 「대중교통을 재 달라」는 요청이
   *    바깥에서 곧장 들어와도 카카오를 안 부른다 — 화면만 감추면 주소창으로 뚫린다.
   */
  const asked = body.mode === "자동차" || body.mode === "대중교통" ? body.mode : null;
  const mode = TRANSIT_ON ? asked : "자동차";

  // ⛔ 여기서 원본 좌표가 끝난다. 아래로는 격자만 흐른다.
  const { gy, gx } = toGrid(lat, lng);

  // ── 이미 재 둔 값이 있나 ────────────────────────────────────────────
  /** 재 둔 줄. ⛔ 아래에서 **다른 수단의 경로를 지키려고** 다시 본다 */
  let cached: { routes?: unknown } | null = null;
  if (reader) {
    const { data } = await reader
      .from("commute")
      .select("car_min, transit_min, measured_at, routes")
      .eq("grid_y", gy)
      .eq("grid_x", gx)
      .eq("std_code", stdCode)
      .eq("at_min", slot)
      .eq("dir", dir)
      .maybeSingle();
    cached = data;
    if (data) {
      const age = (Date.now() - new Date(data.measured_at).getTime()) / 86400000;
      if (age < STALE_DAYS) {
        /**
         * ⛔ 옛 줄에는 `routes` 가 없다(칸이 뒤에 생겼다). 그때는 「아직 안 쟀다」로 본다 —
         *    소요시간만 있고 경로가 없으면 목록을 못 그린다.
         * ⛔ 수단을 골라 물었으면 **그 수단의 경로가 담겨 있어야** 캐시가 맞은 것이다 —
         *    자동차만 재 둔 줄로 대중교통을 답하면 「길이 없다」로 읽힌다.
         */
        const has = !mode || (Array.isArray(data.routes) && data.routes.some((r: { mode?: string }) => r.mode === mode));
        if (data.routes && has)
          return Response.json({
            ok: true,
            car: data.car_min,
            transit: data.transit_min,
            routes: data.routes,
            measuredAt: data.measured_at,
            fresh: false,
          });
      }
    }
  }

  /**
   * ⛔ **여기서 멈추는 길이 있다.** `cacheOnly` 면 바깥을 부르지 않고 「없다」로 답한다.
   *    학교를 누를 때마다 자동으로 재면 **호기심에 눌러 보는 사람 한 명이 쿼터를 다 태운다**
   *    (카카오 무료는 하루 1,000건 — 2026-08-23 사장님 「비용 오버임」).
   *    재는 것은 사람이 단추를 눌렀을 때만이다.
   */
  if (body.cacheOnly) return Response.json({ ok: true, cached: false });

  /**
   * ⛔ **여기서부터는 로그인한 사람만이다** (2026-08-23 사장님 — 「길찾기는 로그인이 필요한
   *    기능으로 바꿔주고」). 바깥(네이버)을 실제로 부르는 자리이고, 그것이 돈이다.
   * ⛔ **화면만 막지 않는다.** 단추를 감춰도 주소창으로 곧장 들어오면 그만이다 —
   *    대중교통을 닫을 때와 같은 까닭이다(위 `TRANSIT_ON` 주석).
   * ⛔ **손님(익명 로그인)은 안 된다.** 익명은 아무나 몇 개든 만들 수 있어 문이 없는 것과 같다.
   *    별점·관심목록이 손님을 받는 것과 갈린다 — 그쪽은 돈이 안 들고 이쪽은 든다.
   * ⛔ **재 둔 값을 읽는 길은 그대로 열려 있다**(위에서 이미 답하고 나갔다). 열람은 무인증이라는
   *    규칙(CLAUDE.md §13)이 깨지지 않는다 — 막은 것은 「새로 재는 것」 하나다.
   */
  const me = await currentMember();
  if (!me)
    return Response.json({ ok: false, error: "길찾기는 로그인이 필요합니다", needLogin: true }, { status: 401 });

  /**
   * ⛔ **한 사람이 일주일에 스무 번까지 잰다** (2026-08-23 사장님 — 「일주일 20건으로 가.
   *    하루만에 다 재지는 않을테니. 필요하면 네이버 가서 재겠지 뭐」 · §12-152).
   *
   * 까닭 — 네이버 Directions 는 월 6만 건이 무료고 그 뒤로 건당 5원이다. 그런데 관심목록은
   * 아홉 곳으로 막혀 있어도 **길찾기는 학교 상세에서 아무 학교나 누를 수 있어서**,
   * 한 사람이 1,600개를 훑으면 3,200건이다. 그런 사람 스물여섯이면 8만 건을 넘긴다 —
   * **비용을 만드는 것은 트래픽이 아니라 소수일 수 있다.** 악의가 없어도 일어난다.
   *
   * ⛔ **세는 자리가 여기다.** 위에서 캐시가 맞은 사람은 이미 답을 받고 나갔다 —
   *    재 둔 값을 읽는 것은 돈이 안 들어서 안 센다.
   * ⛔ **관심목록에서 빼도 안 줄어든다**(사장님 — 「관심목록에서 내리더라도 횟수는 리셋되지
   *    않게 조심하고」). 세는 것은 담은 개수가 아니라 **바깥을 부른 횟수**이고 누적이다.
   * ⛔ **세는 것과 판정하는 것이 한 문장이다**(`claim_commute`). 나누면 같은 사람이 동시에
   *    두 번 눌렀을 때 둘 다 통과한다.
   * ⛔ **못 세면 막지 않는다.** 열쇠가 없거나 표가 답을 안 하면 그냥 진행시킨다 —
   *    막아 두면 멀쩡한 사람이 길찾기를 통째로 못 쓴다.
   */
  if (writer) {
    // ⚠️ Supabase 질의는 `Promise` 가 아니라 thenable 이라 `.catch` 를 못 단다 — `try` 로 받는다
    let over = false;
    try {
      const { data: used, error } = await writer.rpc("claim_commute", { who: me.id, cap: WEEK_CAP });
      /**
       * ⛔ **못 셌다고 사람을 막지 않는다.** 여기서 막으면 표가 잠깐 답을 안 할 때
       *    멀쩡한 사람이 길찾기를 통째로 못 쓴다. 대신 **서버 기록에는 반드시 남긴다** —
       *    조용히 사라지면 상한이 언제부터 안 걸리고 있었는지 아무도 모른다.
       * ⛔ 사용자에게는 안 알린다. 그 사람 쪽에서는 **아무것도 실패하지 않았다** — 길찾기는
       *    그대로 된다. §11-2 가 막는 것은 「실패했는데 성공한 줄 아는 것」이지 이 자리가 아니다.
       */
      if (error) console.error("길찾기 사용량 확인 실패", error.message);
      else over = used == null;
    } catch (e: unknown) {
      console.error("길찾기 사용량 확인 실패", e instanceof Error ? e.message : String(e));
    }
    if (over)
      return Response.json(
        { ok: false, error: "지정된 사용횟수를 초과하셨습니다. 다음에 다시 시도하세요.", overQuota: true },
        { status: 429 },
      );
  }

  // ── 없으면 실제로 잰다 ──────────────────────────────────────────────
  const school = await schoolByCode(stdCode);
  if (!school?.lat || !school?.lng)
    return Response.json({ ok: false, error: "학교 좌표가 없습니다" }, { status: 404 });

  const ncpId = process.env.NCP_MAPS_KEY_ID;
  const ncpKey = process.env.NCP_MAPS_KEY;
  const kakao = process.env.KAKAO_REST_KEY;
  // ⛔ 대중교통이 닫혀 있으면 카카오 열쇠가 없어도 된다. 없다고 자동차까지 막지 않는다
  if (!ncpId || !ncpKey || (TRANSIT_ON && !kakao))
    return Response.json({ ok: false, error: "경로 열쇠가 없습니다" }, { status: 503 });

  const home = gridCenter(gy, gx);
  const dest = { lat: school.lat, lng: school.lng };
  // 퇴근은 학교에서 집으로다. 좌표를 뒤집는 것뿐이다.
  const [from, to] = dir === "퇴근" ? [dest, home] : [home, dest];

  // ⛔ 둘을 나란히 부른다. 하나가 실패해도 다른 하나는 낸다 — 둘 다 없을 때만 실패다.
  // ⛔ 고른 수단만 부른다. 안 고르면(옛 화면) 둘 다 부른다.
  // ⛔ 대중교통이 닫혀 있으면(`features.ts`) 카카오는 **아예 안 불린다** — 그게 닫아 둔 까닭이다.
  const [car, transit] = await Promise.all([
    mode === "대중교통" ? [] : carRoutes(from, to, ncpId, ncpKey).catch(() => []),
    !TRANSIT_ON || mode === "자동차" || !kakao ? [] : transitRoutes(from, to, kakao).catch(() => []),
  ]);

  const fresh = [...car, ...transit];
  if (fresh.length === 0)
    return Response.json({ ok: false, error: "경로를 찾지 못했습니다" }, { status: 502 });

  /**
   * 캐시에 이미 담긴 **다른 수단**의 경로는 지우지 않는다.
   * ⛔ 덮어쓰면 자동차를 재는 순간 재 둔 대중교통이 사라지고, 그걸 다시 재려고
   *    카카오를 또 부른다 — 아끼려던 것을 그 자리에서 도로 태운다.
   */
  const kept = mode
    ? ((cached?.routes as { mode?: string; min?: number }[] | null) ?? []).filter((r) => r.mode !== mode)
    : [];
  const routes = [...fresh, ...kept];

  // 화면 맨 위에 적는 두 숫자 — 각 수단에서 가장 빠른 것
  const carMin = routes.find((r) => r.mode === "자동차")?.min ?? null;
  const transitMin = routes.find((r) => r.mode === "대중교통")?.min ?? null;

  const measuredAt = new Date().toISOString();
  // ⛔ 남기지 못해도 답은 낸다. 캐시는 빠르게 하려는 것이지 답의 조건이 아니다.
  if (writer)
    await writer
      .from("commute")
      .upsert(
        {
          grid_y: gy, grid_x: gx, std_code: stdCode, at_min: slot, dir,
          car_min: carMin, transit_min: transitMin,
          routes,
          measured_at: measuredAt,
        },
        { onConflict: "grid_y,grid_x,std_code,at_min,dir" },
      )
      .then(({ error }) => error && console.error("통근 캐시 저장 실패", error.message));

  return Response.json({ ok: true, car: carMin, transit: transitMin, routes, measuredAt, fresh: true });
}
