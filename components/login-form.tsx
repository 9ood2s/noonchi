"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth/client";

/**
 * 로그인 · 가입 — **지금 열려 있는 문은 구글 하나다.**
 *
 * 2026-08-23 사장님 — 「루트는 네이버, 구글 로그인. **이메일 가입은 없음**」 · 「**일단 구글만 얹어놔**」.
 * 그래서 가입과 로그인이 갈라지지 않는다. 처음 누른 사람은 계정이 생기고 그 뒤로는 들어온다.
 *
 * ⛔ **네이버는 배선만 깔고 단추를 감춰 뒀다.** 켜는 것은 아래 `NAVER_LIVE` 한 줄이다.
 *    감추는 까닭 = 네이버 로그인은 **검수를 통과해야** 아무나 쓸 수 있고, 그 전에는 콘솔
 *    「멤버관리」에 적어 둔 아이디만 들어온다. 안 열리는 문을 문처럼 그려 두면 교사가
 *    그걸 먼저 누르고 네이버 오류 화면을 본다.
 * ⛔ **두 길이 같은 길이다.** 네이버도 Supabase 커스텀 제공자(`custom:naver`)로 붙는다 —
 *    우리가 OAuth 왕복을 직접 하지 않는다(`app/api/auth/naver/userinfo/route.ts` 주석).
 * ⭐ **손님으로 쓰던 사람은 계정을 새로 만들지 않고 올린다**(`linkIdentity` · §12-146).
 *    2026-08-23 사장님 — 「익명으로 쓰다가 회원으로 오는 사람도 있을 텐데」 ·
 *    「어차피 **회원이 추가해서 의미있게 관리하는 데이터가 관심학교 목록**이잖음」.
 *    새 계정을 만들면 그 관심목록이 손님 계정에 남아 **로그인한 순간 텅 빈 화면**이 된다.
 *    ⛔ 그 구글 계정이 **이미 다른 계정에 붙어 있으면** 승격은 막힌다(`identity_already_exists`).
 *       그때는 `plain` 으로 다시 눌러 그 계정으로 그냥 들어간다 — `components/login-gate.tsx` 가 묻는다.
 * ⛔ **브랜드 표시는 lucide 에 없다.** 아이콘은 lucide 로 쓴다는 규칙(CLAUDE.md §3)의 예외가
 *    여기 하나다 — 구글 G 와 네이버 N 은 그 회사의 표시라 다른 그림으로 바꿔 그릴 수 없다.
 * ⛔ 단추는 **48px** 다. 이것이 가입으로 가는 유일한 문이라 손가락이 빗나가면 안 된다(§11-4).
 */

/** ⛔ 네이버 검수를 통과한 날 `true` 로 바꾼다. 다른 파일은 손댈 것이 없다 */
const NAVER_LIVE = false;

const BUTTON =
  "flex min-h-12 w-full items-center justify-center gap-2.5 rounded-card text-[15px] font-semibold active:opacity-80 disabled:opacity-50";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

function NaverMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden focusable="false">
      <path d="M13.5615 10.7143L6.14648 0H0V20H6.43848V9.28571L13.8535 20H20V0H13.5615V10.7143Z" fill="currentColor" />
    </svg>
  );
}

export function LoginForm({
  next = "/",
  plain,
}: {
  next?: string;
  /** 손님 승격을 **시도하지 않는다**. 승격이 막힌 뒤 「그 계정으로 그냥 로그인」에 쓴다 */
  plain?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const start = async (provider: "google" | "custom:naver") => {
    setBusy(provider);
    setFailed(null);
    const back = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

    const supabase = authClient();
    const options = {
      redirectTo: back,
      // 계정을 여럿 쓰는 사람이 고를 수 있게. ⛔ 구글에만 있는 값이라 네이버에는 안 보낸다.
      ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
    };

    /**
     * 손님 열쇠를 들고 있나. ⛔ 들고 있으면 **새 계정을 만들지 않고 그 계정을 올린다** —
     * 담아 둔 관심목록이 그대로 따라온다(§12-146).
     * ⛔ 못 읽으면 손님이 아닌 것으로 본다. 승격을 못 하는 것이지 로그인을 막을 일은 아니다.
     */
    const { data: now } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    const promote = !plain && !!now?.user?.is_anonymous;

    // ⛔ 실패는 두 꼴로 온다 — 답에 담겨 오거나 던져진다. 둘 다 받는다(CLAUDE.md §11-2).
    const { error } = await (
      promote
        ? supabase.auth.linkIdentity({ provider, options })
        : supabase.auth.signInWithOAuth({ provider, options })
    ).catch((e: unknown) => ({ error: { message: e instanceof Error ? e.message : String(e) } }));

    if (error) {
      setBusy(null);
      // ⛔ 조용히 보통 로그인으로 떨어뜨리지 않는다. 그러면 담아 둔 것이 소리 없이 사라진다(§11-2)
      setFailed(
        promote && /manual linking|manual_linking/i.test(error.message)
          ? "계정 잇기가 아직 켜지지 않았습니다"
          : error.message
      );
    }
  };

  return (
    <div className="mt-6 flex flex-col gap-2.5">
      <button
        type="button"
        onClick={() => start("google")}
        disabled={busy !== null}
        className={`${BUTTON} border border-line bg-background`}
      >
        <GoogleMark />
        {busy === "google" ? "여는 중" : "구글로 시작"}
      </button>

      {NAVER_LIVE && (
        <button
          type="button"
          onClick={() => start("custom:naver")}
          disabled={busy !== null}
          className={`${BUTTON} bg-[#03C75A] text-white`}
        >
          <NaverMark />
          {busy === "custom:naver" ? "여는 중" : "네이버로 시작"}
        </button>
      )}

      {failed && (
        <p role="alert" className="mt-1 text-sm text-up">
          {failed}
        </p>
      )}
    </div>
  );
}
