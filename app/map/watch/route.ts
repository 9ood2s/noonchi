/**
 * 학교별 **관심목록에 담은 사람 수** — 캐시해서 낸다.  GET /map/watch
 *
 * 사장님(2026-08-23) — 「지금 1명, 2명 이렇게 표기하고 있잖아. 그걸 **관심목록에 추가한 숫자**로
 * 표기하는 거임. **하트랑 숫자 하나만** 띄워주면 됨」(`DESIGN.md §12-158`).
 *
 * ⛔ **`/map/views`(조회수)와 같은 방식이다**(§12-104) — 브라우저가 Supabase 를 곧바로 부르면
 *    지도를 여는 사람 한 명마다 집계가 한 번씩 돈다. 여기서 대신 받아 **2분 동안 캐시**한다.
 * ⛔ 낱개 줄은 안 나간다. 집계 뷰(`school_watch_counts`)만 읽는다 —
 *    누가 어느 학교를 담았는지가 새면 「어디로 옮기려는지」가 그대로 드러난다.
 * ⛔ 담고 빼는 그 순간은 화면이 스스로 ±1 한다. 2분 안에 남이 담은 것은 조금 늦게 보이는데,
 *    관심도를 가늠하는 값이라 그게 문제가 안 된다.
 */

import { db } from "@/lib/supabase";

/** 2분. ⛔ 더 짧게 두면 캐시가 하는 일이 없고, 더 길면 숫자가 굳은 것처럼 보인다 */
export const revalidate = 120;

export async function GET() {
  const { data, error } = await db.from("school_watch_counts").select("std_code, n");
  if (error) {
    // ⛔ 삼키지 않는다. 다만 지도는 이 숫자 없이도 돌아야 하므로 빈 값을 낸다(§11-2).
    console.error("[관심목록 수]", error.message);
    return Response.json({ ok: false, error: error.message, watch: {} }, { status: 200 });
  }
  const watch: Record<string, number> = {};
  for (const r of data ?? []) watch[r.std_code as string] = r.n as number;
  return Response.json({ ok: true, watch });
}
