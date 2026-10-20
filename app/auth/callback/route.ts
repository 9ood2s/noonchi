import { NextResponse, type NextRequest } from "next/server";
import { authRoute, safeNext, siteOrigin } from "@/lib/auth/route";

/**
 * 구글 로그인의 끝 — Supabase 가 제공자와 왕복을 마치고 `code` 를 들려 여기로 보낸다.
 * 그 `code` 를 세션으로 바꾸는 것이 이 자리의 전부다.
 *
 * (네이버는 Supabase 가 제공자로 갖고 있지 않아 `/auth/naver/callback` 이 따로 있다.)
 *
 * ⛔ 돌아갈 곳은 **우리 화면 안만** 받는다(`safeNext`). 전에는 받은 값을 그대로 넘겨서
 *    `?next=https://…` 를 붙이면 우리 주소로 시작한 로그인이 남의 사이트에서 끝났다.
 * ⛔ 세션 쿠키는 `apply` 로 응답에 직접 얹는다(`lib/auth/route.ts` 주석).
 * ⛔ **실패해도 화면을 갈아치우지 않는다** — 지도로 보내면서 `?login=1&error=…` 를 달면
 *    `components/login-gate.tsx` 가 그것을 읽어 지도 위 모달에서 까닭을 말한다(§12-144).
 */
export async function GET(request: NextRequest) {
  const origin = siteOrigin(request);
  const params = request.nextUrl.searchParams;
  const next = safeNext(params.get("next"));

  // 제공자가 거절했거나 사람이 동의 화면에서 취소했다.
  // ⛔ `error_code` 를 먼저 쓴다 — 그것만이 값이 고정돼 화면이 한국말로 바꿀 수 있다.
  const denied = params.get("error_code") || params.get("error") || params.get("error_description");
  if (denied) return NextResponse.redirect(new URL(`/map?login=1&error=${encodeURIComponent(denied)}`, origin));

  const code = params.get("code");
  if (!code) return NextResponse.redirect(new URL("/map?login=1&error=code", origin));

  const { supabase, apply } = authRoute(request);
  const { error } = await supabase.auth
    .exchangeCodeForSession(code)
    .catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }));

  // ⛔ 실패하면 조용히 홈으로 보내지 않는다. 무엇이 잘못됐는지 로그인 화면이 말한다.
  if (error)
    return NextResponse.redirect(new URL(`/map?login=1&error=${encodeURIComponent(error.message)}`, origin));

  return apply(NextResponse.redirect(new URL(next, origin)));
}
