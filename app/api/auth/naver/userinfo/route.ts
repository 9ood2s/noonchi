import { NextResponse } from "next/server";

/**
 * 네이버 로그인용 **userinfo 중계** — Supabase 커스텀 제공자(`custom:naver`)의 UserInfo URL 이 이 주소다.
 *
 * ⛔ **왜 있나.** Supabase 커스텀 제공자는 프로필 응답을 **맨 위층 표준 항목**(sub·email·email_verified·
 *    name·picture)에서만 읽는다. 네이버 프로필(`openapi.naver.com/v1/nid/me`)은
 *    `{resultcode, message, response:{id, email, name, …}}` 로 전부 `response` 아래에 있어
 *    그대로 꽂으면 「Error getting user email」 로 실패한다. 그래서 한 번 거쳐 평평하게 펴 준다.
 *
 * 흐름 — Supabase 가 `Authorization: Bearer <네이버 토큰>` 으로 이 주소를 부른다 →
 *        같은 헤더로 네이버를 부른다 → 이름만 바꿔 돌려준다.
 *
 * ⛔ **여기엔 비밀이 없다.** 토큰 교환도 client_secret 보관도 Supabase 가 한다. 우리 DB 도 쿠키도 안 본다.
 *    남이 자기 네이버 토큰으로 불러 봐야 자기 프로필이 나올 뿐이다.
 * ⛔ **`email_verified` 를 붙이는 것이 핵심 한 줄이다.** Supabase 는 제공자가 확인했다고 표시한
 *    메일 주소만 같은 사람으로 합친다. 안 붙이면 구글로 가입한 사람이 네이버로 들어올 때
 *    **메일이 빈 새 계정**이 하나 더 생기고, 나중에 이어 붙이려 해도 막힌다.
 *    네이버 기본 메일은 네이버 우편함이거나 네이버가 확인한 바깥 주소다.
 * ⛔ **콘솔에서 메일 주소를 「필수 제공」으로** 잡아야 항상 온다.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NAVER_ME = "https://openapi.naver.com/v1/nid/me";
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/i.test(auth))
    return NextResponse.json({ error: "missing_token" }, { status: 401, headers: NO_STORE });

  let res: Response;
  try {
    res = await fetch(NAVER_ME, { headers: { Authorization: auth }, cache: "no-store" });
  } catch {
    return NextResponse.json({ error: "upstream_unreachable" }, { status: 502, headers: NO_STORE });
  }
  // ⛔ 네이버가 거절하면 그대로 실패시킨다. 본문을 꾸며 성공인 척하지 않는다(CLAUDE.md §11-2).
  if (!res.ok)
    return NextResponse.json({ error: "naver_rejected", status: res.status }, { status: 401, headers: NO_STORE });

  let body: { resultcode?: string; response?: Record<string, unknown> } = {};
  try {
    body = (await res.json()) as typeof body;
  } catch {
    // 아래 검사에서 걸러진다
  }

  const me = body.response ?? {};
  const sub = typeof me.id === "string" && me.id ? me.id : null;
  if (body.resultcode !== "00" || !sub)
    return NextResponse.json({ error: "naver_profile_invalid" }, { status: 401, headers: NO_STORE });

  const email = typeof me.email === "string" && me.email.includes("@") ? me.email.toLowerCase() : null;
  const name = (typeof me.name === "string" && me.name) || (typeof me.nickname === "string" && me.nickname) || null;

  // ⛔ 받은 것 중에서도 **쓰는 것만** 넘긴다. 성별·나이·생일·전화는 콘솔에서 아예 안 받고, 와도 안 넘긴다.
  return NextResponse.json(
    { sub, ...(email ? { email, email_verified: true } : {}), ...(name ? { name } : {}) },
    { status: 200, headers: NO_STORE }
  );
}
