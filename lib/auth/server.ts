import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 로그인한 사람으로 Supabase 를 부른다.
 *
 * ⛔ 공개 데이터를 읽는 `lib/supabase.ts` 와 다르다. 그쪽은 익명이고 이쪽은 쿠키의 세션을 쓴다.
 *    쓰기(별점·TO 제보·모의지원)는 반드시 이쪽으로 한다 — RLS 가 auth.uid() 를 본다.
 */
export async function authServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          // 서버 컴포넌트에서는 쿠키를 못 쓴다. 그 자리는 미들웨어가 맡는다.
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {}
        },
      },
    }
  );
}

/** 지금 로그인한 사람. 없으면 null. */
export async function currentUser() {
  const supabase = await authServer();
  const { data, error } = await supabase.auth.getUser();
  // ⛔ 실패를 삼키지 않는다. 다만 "로그인 안 함" 도 여기로 오므로 던지지는 않는다.
  if (error) return null;
  return data.user ?? null;
}

/**
 * 로그인한 **사람**. ⛔ 손님(익명 로그인)은 `null` 이다.
 *
 * ⛔ **이걸 안 갈라서 사고가 났다**(2026-08-23). 로그인 화면이 `currentUser()` 로만 보고
 *    「이미 로그인돼 있습니다」를 띄웠는데, 별점·관심목록을 한 번이라도 쓴 사람은
 *    손님 열쇠(`lib/auth/anon.ts`)를 이미 갖고 있다. 그래서 **구글 단추가 영영 안 보였다** —
 *    화면에는 「(빈칸)로 로그인돼 있습니다」만 떴다. 손님은 메일 주소가 없어서다.
 * ⛔ **손님은 로그인이 아니다.** 익명은 아무나 몇 개든 만들 수 있어 1인 1표의 근거가 못 된다.
 *    가르는 자리를 여기 하나로 모은다 — 화면마다 `is_anonymous` 를 따로 보면 또 빠뜨린다(§11-3).
 */
export async function currentMember() {
  const user = await currentUser();
  return user && !user.is_anonymous ? user : null;
}
