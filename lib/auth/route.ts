import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { resolveSiteOrigin } from "../deployment.mjs";
export { safeNext } from "../deployment.mjs";

/**
 * 라우트 핸들러(`app/auth/**`)에서 쓰는 Supabase — **세션 쿠키를 직접 응답에 얹는다.**
 *
 * ⛔ `lib/auth/server.ts` 와 다르다. 그쪽은 `next/headers` 의 쿠키 저장소에 쓰고,
 *    서버 컴포넌트에서는 그게 막혀 있어 `try{}catch{}` 로 삼킨다. 로그인을 **성립시키는**
 *    자리에서 그 삼킴이 일어나면 사람은 로그인한 줄 아는데 쿠키가 없다(CLAUDE.md §11-2).
 *    여기서는 받은 쿠키를 모아 두었다가 `apply(응답)` 으로 반드시 얹는다.
 */
export function authRoute(request: NextRequest) {
  const jar: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const one of list) jar.push(one as (typeof jar)[number]);
        },
      },
    }
  );

  /** 모아 둔 세션 쿠키를 응답에 얹는다. 넘김(redirect) 응답에도 그대로 붙는다. */
  const apply = <T extends NextResponse>(response: T): T => {
    for (const { name, value, options } of jar) response.cookies.set(name, value, options);
    return response;
  };

  return { supabase, apply };
}

/**
 * 이 서비스의 대표 주소. 네이버 콘솔에 등록한 Callback URL 과 **글자 하나까지 같아야** 한다.
 * 그래서 요청에서 짐작하기 전에 정해 둔 값을 먼저 본다(미리보기 배포는 호스트가 매번 달라진다).
 */
export function siteOrigin(request: NextRequest): string {
  return resolveSiteOrigin(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.VERCEL_URL,
    request.nextUrl.origin,
  );
}
