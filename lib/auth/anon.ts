"use client";

/**
 * 비회원으로 쓰기 — **익명 로그인**.  근거 = docs/DESIGN.md §9
 *
 * 화면에는 아무것도 안 보인다. 로그인 창도, 메일 입력도, 「로그인됨」 표시도 없다.
 * 브라우저가 처음 무언가를 남길 때 조용히 손님 열쇠를 하나 받아 두고, 그 뒤로 그 열쇠로 쓴다.
 * 서버가 아는 것은 "누구인지는 모르지만 아까 그 사람인지는 안다" 뿐이다.
 *
 * ⛔ 브라우저에 우리가 번호를 적어 두는 방식(기기 식별자)을 쓰지 않는다. 그 번호는 누구나 바꿀 수 있어
 *    한 사람이 한 학교에 수백 번 넣을 수 있다. 표본이 적을 때는 그 한 사람이 학교 값을 통째로 만든다.
 *    익명 로그인은 **서버가 발급하고 서명**해서, 1인 1표·3개교 상한·잠금이 그대로 걸린다.
 *
 * ⛔ 실패를 삼키지 않는다(§11-2). 익명 로그인이 꺼져 있으면 조용히 넘어가지 않고 까닭을 돌려준다.
 */

import { authClient } from "./client";

export type Guest = { id: string } | { error: string };

/** 지금 열쇠가 있으면 그대로, 없으면 하나 받는다. */
export async function ensureGuest(): Promise<Guest> {
  const supabase = authClient();

  try {
    const { data } = await supabase.auth.getUser();
    if (data.user) return { id: data.user.id };
  } catch {
    // 열쇠가 없거나 만료됐다 — 아래에서 새로 받는다
  }

  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      if (error.message?.includes("Anonymous sign-ins are disabled")) {
        return { error: "익명 로그인이 꺼져 있습니다. Supabase 대시보드에서 켜야 합니다" };
      }
      return { error: error.message };
    }
    if (!data.user) return { error: "손님 열쇠를 못 받았습니다" };
    return { id: data.user.id };
  } catch (e: unknown) {
    return { error: e instanceof Error ? e.message : "손님 열쇠를 못 받았습니다" };
  }
}

export const isGuest = (g: Guest): g is { id: string } => "id" in g;
