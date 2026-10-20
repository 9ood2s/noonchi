/**
 * 현재 소속교 — 읽고 쓰는 한 곳 (`docs/DESIGN.md §12-148`)
 *
 * ⛔ **잠금을 풀었다**(§12-149 · 2026-08-23 사장님 「그냥 제한 풀어」). 중간발령(9월 1일자·
 *    결원 보충)으로 옮긴 사람이 그 해 내내 남의 관내 지도를 보고 있었다. 잠가서 막는 것은
 *    아무것도 없었다 — 지도는 이미 아무 지원청이나 필터로 볼 수 있다.
 * ⛔ **학년도를 화면이 보내지 않는다.** 브라우저 시계는 틀릴 수 있고, 틀린 해를 보내면
 *    엉뚱한 줄을 만든다. 서버 함수(`set_home_school`)가 센다.
 */

import { authClient } from "@/lib/auth/client";

/**
 * 지금 학년도. 3월 1일에 바뀐다.
 * ⛔ 표의 트리거와 **같은 셈**이어야 한다. 다르면 화면은 「바꿀 수 있다」는데 표가 튕긴다.
 * ⚠️ 브라우저 시계라 서버와 다를 수 있다. 그래서 **판정은 표에 맡기고** 이 값은 말할 때만 쓴다.
 */
export function schoolYear(now = new Date()): number {
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  return seoul.getMonth() + 1 >= 3 ? seoul.getFullYear() : seoul.getFullYear() - 1;
}

export type HomeSchool = { std_code: string; school_year: number };

/** 올해 정해 둔 소속교. 없으면 `null`. ⛔ 실패는 던진다 — 부르는 쪽이 화면에 낸다(§11-2) */
export async function readHomeSchool(): Promise<HomeSchool | null> {
  const supabase = authClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me.user || me.user.is_anonymous) return null;

  const { data, error } = await supabase
    .from("home_schools")
    .select("std_code, school_year")
    .eq("school_year", schoolYear())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as HomeSchool | null) ?? null;
}

/**
 * 소속교를 정하거나 **바꾼다.**
 * ⛔ 표에 직접 넣지 않는다 — 쓰는 문은 `set_home_school` 하나다(§11-3). 학년도를 서버가
 *    세므로 브라우저 시계가 틀려도 엉뚱한 줄이 안 생긴다.
 */
export async function saveHomeSchool(stdCode: string): Promise<{ ok: true } | { error: string }> {
  try {
    const { error } = await authClient().rpc("set_home_school", { want: stdCode });
    if (error) return { error: readable(error.message) };
    return { ok: true };
  } catch (e: unknown) {
    // ⛔ Supabase 질의는 thenable 이라 `.catch` 를 못 단다. 끊긴 요청은 여기서 받는다
    return { error: readable(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * 올해 소속교를 **지운다** (2026-08-23 사장님 — 「소속교도 거주지역처럼 입력한 것을 지울 수 있게」).
 *
 * ⛔ 표에 직접 `delete` 하지 않는다 — 표에는 읽기 정책 하나뿐이고 쓰는 문은 함수다(§11-3).
 *    학년도도 서버가 센다. 브라우저 시계가 틀리면 엉뚱한 해를 지운다.
 * ⛔ 없는 것을 지우는 것은 오류가 아니다 — 아무 일도 안 일어난다.
 */
export async function clearHomeSchool(): Promise<{ ok: true } | { error: string }> {
  try {
    const { error } = await authClient().rpc("clear_home_school");
    if (error) return { error: readable(error.message) };
    return { ok: true };
  } catch (e: unknown) {
    // ⛔ Supabase 질의는 thenable 이라 `.catch` 를 못 단다. 끊긴 요청은 여기서 받는다
    return { error: readable(e instanceof Error ? e.message : String(e)) };
  }
}

/**
 * 서버 말을 사람 말로. ⛔ **버리지 않는다**(§11-2) — 바꾸는 것은 문구뿐이다.
 *
 * 비로그인은 `anon` 역할이고 `set_home_school`·`clear_home_school` 은 `authenticated` 에게만
 * 열려 있어 PostgreSQL 이 `permission denied for function set_home_school` 을 그대로 돌려준다.
 * 화면을 막아 두었어도(마이페이지·온보딩) 이 줄이 마지막 그물이다.
 *
 * ⛔ 쓰는 문 **둘 다** 이것을 지난다(§11-3). 한쪽만 붙이면 지우기에서 영어가 그대로 뜬다.
 */
function readable(message: string): string {
  return /permission denied/i.test(message) ? "로그인이 필요합니다" : message;
}
