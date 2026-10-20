"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, LogOut } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { openLogin } from "@/lib/login-gate";

/**
 * 로그인 · 로그아웃 **한 줄**. 레일의 계정 펼침 안에 든다(`components/app-rail.tsx`).
 *
 * ⛔ 로그인 상태를 브라우저에서 본다. 서버에서 보면 이 부품이 든 **모든 화면이 동적**이 되어
 *    홈이 검색에 안 잡힌다(CLAUDE.md §13 — 수익이 광고다).
 * ⛔ 로그인 여부를 판단하는 곳은 여기 하나다. 메뉴가 따로 판단하지 않는다(§11-3).
 * ⛔ **손님(익명 로그인)은 로그인이 아니다.** 별점을 한 번 남긴 사람은 이미 손님 열쇠를 갖고
 *    있어서, 사용자가 있나만 보면 그 사람에게 영영 「로그인」이 안 뜬다(2026-08-23 실제로 그랬다).
 * ⛔ **눌러도 화면을 갈아치우지 않는다** — 지도 위 모달을 연다(§12-144).
 */
export function AuthRow({ onDone }: { onDone?: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = authClient();
    /** 손님(익명)은 없는 셈 친다 — 메일 주소가 없어서 1인 1표의 근거가 못 된다 */
    const mailOf = (u: { email?: string | null; is_anonymous?: boolean } | null | undefined) =>
      u && !u.is_anonymous ? (u.email ?? null) : null;

    supabase.auth
      .getUser()
      .then(({ data }) => setEmail(mailOf(data.user)))
      .catch(() => setEmail(null))
      .finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) =>
      setEmail(mailOf(session?.user))
    );
    return () => sub.subscription.unsubscribe();
  }, []);

  // ⛔ 자리를 비워 둔다. 없애면 아직 모를 때와 알았을 때 메뉴 높이가 달라져 줄이 튄다.
  const cls = "flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3 text-left text-sm active:bg-fill";
  if (!ready) return <span className="block min-h-11" aria-hidden />;

  if (!email)
    return (
      <button
        type="button"
        onClick={() => {
          onDone?.();
          openLogin();
        }}
        className={cls}
      >
        <LogIn size={16} className="shrink-0 text-ink3" aria-hidden />
        로그인 · 가입
      </button>
    );

  return (
    <button
      type="button"
      onClick={async () => {
        await authClient().auth.signOut();
        onDone?.();
        router.refresh();
      }}
      className={cls}
    >
      <LogOut size={16} className="shrink-0 text-ink3" aria-hidden />
      <span className="min-w-0 flex-1 truncate">로그아웃</span>
      <span className="shrink-0 truncate text-xs text-ink3">{email}</span>
    </button>
  );
}
