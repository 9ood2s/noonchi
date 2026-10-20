/**
 * 손님으로 담아 둔 것을 **회원 계정으로 옮긴다** (`docs/DESIGN.md §12-170`)
 *
 * 사장님(2026-08-24) — 손님으로 쓰다가 구글로 들어가려는데 그 계정이 이미 있어서 잇기가 막혔고,
 * 다시 로그인하니 들어가지긴 했는데 — 「**기존에 즐겨찾기 해둔건 다 날아갔넹**」.
 *
 * ⛔ **실제로 날아간 것은 아니다** — 손님 계정 줄에 그대로 남아 있다. 다만 **닿을 길이 없다.**
 *    손님 세션이 끝나면 그 계정으로 다시 들어갈 방법이 없기 때문이다.
 * ⭐ 그래서 **떠나기 전에 들고 나온다.** 손님으로 로그인돼 있는 동안 자기 줄을 읽어
 *    이 기기에 적어 두고, 회원으로 들어온 뒤에 그 사람 이름으로 다시 담는다.
 *
 * ⛔ **서버 문을 새로 열지 않는다.** 「손님 아이디를 주면 그 줄을 옮겨 준다」는 문을 만들면
 *    남의 손님 아이디를 적어 **남이 담아 둔 것을 제 목록으로 가져갈 수 있다.**
 *    여기서는 **본인이 본 것을 본인이 다시 담는 것**이라 그 구멍이 아예 없다.
 * ⛔ 옮기는 것은 **관심목록뿐**이다. 별점은 한 사람 한 학교 한 번이라(§6) 옮기면 회원이
 *    이미 남긴 것과 부딪히고, 「가 봤다」는 평가라 계정이 바뀌면 뜻이 흐려진다.
 * ⛔ 이 기기에만 적는다. 서버로 안 보낸다.
 */

import { authClient } from "@/lib/auth/client";

const KEY = "noonchi.carry.watchlist";

type Row = { std_code: string; considering: boolean; reasons: string[]; bonus: number | null };

/**
 * 손님으로 담아 둔 것을 **이 기기에 적어 둔다.** 손님을 떠나기 직전에 부른다.
 * ⛔ 손님이 아니면 아무 일도 안 한다 — 회원 것을 적어 두면 다음 로그인 때 남의 계정에 들어간다.
 * ⛔ 실패해도 로그인을 막지 않는다. 다만 삼키지 않는다(§11-2).
 */
export async function stashGuestWatchlist(): Promise<number> {
  try {
    const supabase = authClient();
    const { data: me } = await supabase.auth.getUser();
    if (!me.user?.is_anonymous) return 0;
    const { data, error } = await supabase
      .from("watchlist")
      .select("std_code, considering, reasons, bonus");
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    if (rows.length === 0) return 0;
    localStorage.setItem(KEY, JSON.stringify(rows));
    return rows.length;
  } catch (e) {
    console.error("[관심목록 옮기기] 적어 두지 못했습니다", e);
    return 0;
  }
}

/** 적어 둔 것이 몇 곳인가. 화면이 「N곳은 따라오지 않습니다」를 적을 때 쓴다 */
export function stashedCount(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return 0;
    const rows = JSON.parse(raw) as Row[];
    return Array.isArray(rows) ? rows.length : 0;
  } catch {
    return 0;
  }
}

/**
 * 회원으로 들어온 뒤 **다시 담는다.** 로그인 상태가 바뀔 때 부른다.
 *
 * ⛔ **이미 담긴 것은 건너뛴다** — 같은 학교를 두 번 담을 수 없다(표가 막는다).
 * ⛔ **상한(9곳)에 닿으면 거기서 멈춘다.** 표의 방아쇠가 막으므로 한 줄씩 넣고 실패를 센다.
 *    조용히 자르지 않는다 — 몇 곳이 못 들어갔는지 돌려준다(§11-1).
 * ⛔ 적어 둔 것은 **한 번 쓰고 지운다.** 안 지우면 다음에 또 담긴다.
 */
export async function carryOverWatchlist(): Promise<{ moved: number; left: number } | null> {
  let rows: Row[];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    rows = JSON.parse(raw) as Row[];
    if (!Array.isArray(rows) || rows.length === 0) {
      localStorage.removeItem(KEY);
      return null;
    }
  } catch {
    localStorage.removeItem(KEY);
    return null;
  }

  try {
    const supabase = authClient();
    const { data: me } = await supabase.auth.getUser();
    // ⛔ 회원일 때만 옮긴다. 손님이면 그대로 둔다 — 아직 떠나지 않은 것이다
    if (!me.user || me.user.is_anonymous) return null;

    const { data: had } = await supabase.from("watchlist").select("std_code");
    const already = new Set(((had ?? []) as { std_code: string }[]).map((r) => r.std_code));

    let moved = 0;
    let left = 0;
    for (const r of rows) {
      if (already.has(r.std_code)) continue;
      const { error } = await supabase.from("watchlist").insert({
        user_id: me.user.id,
        std_code: r.std_code,
        considering: r.considering,
        reasons: r.reasons ?? [],
        bonus: r.bonus,
      });
      if (error) left += 1;
      else moved += 1;
    }
    localStorage.removeItem(KEY);
    return { moved, left };
  } catch (e) {
    // ⛔ 지우지 않는다 — 다음 기회에 다시 시도한다
    console.error("[관심목록 옮기기]", e);
    return null;
  }
}
