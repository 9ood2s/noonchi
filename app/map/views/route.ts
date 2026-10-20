/**
 * 오늘 학교별 조회수 — **캐시해서 낸다** (`docs/DESIGN.md §12-104`)
 *
 * ⚠️ **2026-08-23 부터 화면이 이것을 안 읽는다.** 말풍선 배지가 조회수에서
 *    **관심목록에 담은 수**로 바뀌었다(§12-158 · `/map/watch`).
 * ⛔ **그래도 안 지운다.** 세는 쪽(`/api/view`)은 그대로 돌고 있고, 이것이 그 값을 보는 유일한 길이다.
 *    조회수는 우리가 가진 유일한 「관심도」 기록이라 지우면 그날부터 아무것도 안 남는다.
 *
 * 사장님(2026-08-23) — 「몇만명 단위의 사람들이 보더라도 안정적으로 돌아가야 함」 ·
 * 「**실시간으로 올라가는 「그림」은 만들되, 실제 데이터를 실시간으로 빡쎄게 끌어다가
 * 던져줄 필요는 없다**」.
 *
 * ⛔ **전에는 브라우저가 Supabase 를 곧바로 불렀다.** 그러면 지도를 여는 사람 **한 명마다**
 *    오늘치 전체를 훑는 집계가 한 번씩 돈다. 3만 명이면 3만 번이다.
 * → 이 경로가 대신 받아 **2분 동안 캐시**한다. 사람이 몇이든 DB 는 2분에 한 번만 훑는다.
 *    CDN 이 그 답을 나눠 준다.
 * ⛔ **화면은 여전히 실시간처럼 보인다** — 학교를 누르면 그 숫자만 브라우저에서 +1 한다.
 *    2분 안에 남이 올린 것은 조금 늦게 보이는데, 관심도를 가늠하는 값이라 그게 문제가 안 된다.
 * ⛔ 낱개 줄은 안 나간다. 집계 뷰만 읽는다 — 누가 어느 학교를 봤는지가 새면 안 된다.
 */

import { db } from "@/lib/supabase";

/** 2분. ⛔ 더 짧게 두면 캐시가 하는 일이 없고, 더 길면 숫자가 굳은 것처럼 보인다 */
export const revalidate = 120;

export async function GET() {
  const { data, error } = await db.from("school_views_today").select("std_code, n");
  if (error) {
    // ⛔ 삼키지 않는다. 다만 지도는 조회수 없이도 돌아야 하므로 빈 값을 낸다(§11-2).
    console.error("[조회수]", error.message);
    return Response.json({ ok: false, error: error.message, views: {} }, { status: 200 });
  }
  const views: Record<string, number> = {};
  for (const r of data ?? []) views[r.std_code as string] = r.n as number;
  return Response.json({ ok: true, views });
}
