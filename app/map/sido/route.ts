/**
 * 시·도마다 말풍선 하나 — **처음 들어온 사람이 지역을 고르는 자리**.  GET /map/sido
 *
 * 사장님(2026-08-23) — 「초기에 들어오면 딱 그 광역시도 교육청이 지도에 마커로 떠있어야 하는거
 * 아님? 그래서 그거 누르면 지역이 자동으로 설정되도록. **경기도부터 맨날 잡혀있으면 사람들
 * 기분 나쁠 듯 ㅎㅎ**」.
 *
 * ⛔⛔ **자리는 「시·도교육청」이다.** 처음에 내가 「그 시·도 학교들의 한가운데」로 잡았다가
 *    사장님이 화면을 보고 짚으셨다 — 「시도 중심이 아닌데. **경기는 수원. 인천은 구월동.
 *    서울은 서울시청** 뭐 이게 되야지. 서울은 양주, 인천은 바다위, 세종은 천안, 경기는
 *    이천 여주까지 가고」. 한가운데는 교육청이 있는 자리가 아니고, 거기서 겹침을 풀겠다고
 *    또 밀어내니 **바다 위에 찍혔다.** 두 번 틀렸다.
 * ⛔ **좌표를 손으로 적지 않는다.** 각 교육청의 **공개된 도로명 주소**를 적고 지오코딩으로 받는다
 *    (`scripts/geocode-sido-offices.mjs` → `data/derived/sido-offices.json`).
 *    주소는 사람이 눈으로 확인할 수 있지만 좌표는 못 한다.
 * ⛔ **교육청은 이사하지 않는다.** 화면이 켜질 때마다 바깥을 부를 값이 아니라 파일로 둔다.
 * ⛔ **학교 수는 DB 에서 센다** — 그것은 해마다 바뀐다. 자리만 파일에서 온다.
 * ⛔ **지원청은 여기서 다루지 않는다**(2026-08-23 사장님 — 「지원청까지 맞출 필요는 없다」).
 *    이 화면이 하는 일은 **시·도 하나를 고르는 것**뿐이다.
 */

import { db } from "@/lib/supabase";
import { LEVELS, SIDOS, YEAR } from "@/lib/schools";
import offices from "@/data/derived/sido-offices.json";

export const revalidate = 86400;

/** PostgREST 가 한 번에 주는 최대 행수. ⛔ `.limit()` 을 걸어도 여기서 조용히 끊긴다 */
const PAGE = 1000;

/** 세는 데 필요한 것은 시·도 하나다. ⛔ 좌표는 안 받는다 — 자리는 파일에서 온다 */
type Row = { sido: string };

export type SidoPin = { sido: string; n: number; lat: number; lng: number };

export async function GET() {
  const got: Row[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await db
      .from("personnel_areas")
      .select("sido", { count: "exact" })
      .eq("school_year", YEAR)
      .in("level", LEVELS as unknown as string[])
      .eq("closed", false)
      .is("opens_year", null)
      .range(from, from + PAGE - 1);
    // ⛔ 삼키지 않는다(§11-2). 다만 지도는 이 값 없이도 돌아야 하므로 빈 목록을 낸다
    if (error) {
      console.error("[시·도]", error.message);
      return Response.json({ ok: false, error: error.message, sidos: [] }, { status: 200 });
    }
    if (count != null) total = count;
    const page = (data ?? []) as Row[];
    got.push(...page);
    if (page.length < PAGE) break;
  }
  // ⛔ 조용히 모자란 채로 넘어가지 않는다 — 이 저장소에서 다섯 번 났다
  if (total != null && got.length !== total) {
    console.error("[시·도] 다 못 읽었다", { total, got: got.length });
  }

  /**
   * 학교 수만 센다. ⛔ **자리는 안 센다** — 교육청 좌표는 파일에 있다(위 머리주석).
   *    도서까지 다 센다. 그 섬에도 학교가 있고 개수는 사실이다.
   */
  const count = new Map<string, number>();
  for (const r of got) count.set(r.sido, (count.get(r.sido) ?? 0) + 1);

  const table = (offices as { offices: Record<string, { lat: number; lng: number; addr: string }> }).offices;
  const sidos: SidoPin[] = [];
  const missing: string[] = [];
  for (const s of SIDOS) {
    const at = table[s];
    // ⛔ 자리를 모르는 시·도는 안 낸다. 짐작으로 찍지 않는다 — 바다 위에 찍혔던 그 자리다
    if (!at) {
      missing.push(s);
      continue;
    }
    sidos.push({ sido: s, n: count.get(s) ?? 0, lat: at.lat, lng: at.lng });
  }
  // ⛔ 조용히 빠뜨리지 않는다 — 빠진 시·도는 고를 길이 아예 없어진다
  if (missing.length) console.error("[시·도] 교육청 자리를 모른다", missing.join(" · "));

  return Response.json({ ok: true, sidos });
}
