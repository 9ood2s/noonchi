import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * 세션 토큰을 갱신한다.
 *
 * ⛔ 서버 컴포넌트는 쿠키를 못 쓴다. 여기서 갱신하지 않으면 토큰이 만료된 뒤
 *    로그인한 사람이 조용히 로그아웃된 것처럼 보인다.
 * 열람은 무인증이므로(DESIGN.md §9-1) 여기서 아무도 막지 않는다. 토큰만 새로 받는다.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of list) response.cookies.set(name, value, options);
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  /**
   * 정적 파일과 이미지는 건드리지 않는다.
   *
   * ⛔ **검색이 읽는 화면도 뺀다**(`/school/*` · 사이트맵 · robots). 그 화면들은 빌드 때 다 만들어 두는
   *    공공데이터라 **로그인한 사람인지 알 필요가 없는데**, 여기를 지나면 요청마다 Supabase 에
   *    토큰을 물으러 간다. 학교가 전국으로 늘면 검색 로봇 한 번 돌 때마다 그 왕복이 2만 번이고,
   *    첫 응답이 늦어지는 것은 검색 순위에 그대로 손해다.
   * ⛔ 로그인이 깨지지 않는다 — 머리줄은 브라우저에서 상태를 본다(CLAUDE.md §13) 토큰 갱신도
   *    브라우저 쪽 클라이언트가 따로 한다. 여기서 하는 것은 **서버 컴포넌트를 위한** 갱신이고,
   *    이 화면들에는 그런 것이 없다.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|school|sitemap|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
