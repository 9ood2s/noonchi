"use client";

import { useCallback, useEffect, useState } from "react";
import { stashGuestWatchlist } from "@/lib/auth/carry";
import { X } from "lucide-react";
import { Portal } from "@/components/portal";
import { LoginForm } from "@/components/login-form";
import { LOGIN_EVENT, hereAsNext } from "@/lib/login-gate";
import { authClient } from "@/lib/auth/client";

/**
 * **로그인 · 가입 모달** — 지도를 열어 둔 채로 연다 (§12-144).
 *
 * `app/layout.tsx` 에 하나만 달려 있다. 여는 사람은 `openLogin()` 만 부르고 이것을 모른다.
 *
 * ⛔ **손님(익명)은 로그인이 아니다.** 별점 한 번 남긴 사람은 이미 손님 열쇠를 갖고 있어서,
 *    「로그인했나」를 사용자 유무로만 보면 **구글 단추가 영영 안 뜬다**(2026-08-23 실제로 그랬다).
 * ⛔ **닫는 길을 셋 둔다** — ✕ · 어두운 막 누르기 · Esc. 폰에서는 ✕ 가 유일한 길이라 44px 다.
 * ⛔ **로그인 실패는 여기서 말한다.** `/auth/callback` 이 실패하면 `?login=1&error=…` 를 달고
 *    지도로 보내고, 그것을 이 부품이 읽어 띄운다 — 화면을 갈아치우지 않는다.
 */

/** 되돌아온 까닭을 사람 말로 바꾼다. ⛔ 모르는 값은 그대로 보여준다 — 삼키지 않는다(§11-2) */
function reason(code: string): string {
  if (code === "code") return "돌아오는 길이 올바르지 않습니다.";
  if (code === "access_denied") return "동의 화면에서 취소했습니다.";
  if (code === "provider_email_needs_verification") return "메일 주소 확인이 끝나지 않았습니다.";
  if (code === "identity_already_exists") return "그 계정은 이미 따로 쓰이고 있어 잇지 못했습니다.";
  if (code === "bad_oauth_state") return "시간이 지나 끊겼습니다. 다시 눌러 주세요.";
  return code;
}

export function LoginGate() {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /**
   * 손님으로 담아 둔 것을 몇 곳 들고 나왔나(`lib/auth/carry.ts`).
   * ⛔ **승격이 막힌 그 순간에 적어 둔다** — 그 뒤에는 손님 계정에 닿을 길이 없다.
   */
  const [carried, setCarried] = useState(0);
  useEffect(() => {
    if (failed !== "identity_already_exists") return;
    void stashGuestWatchlist().then(setCarried);
  }, [failed]);
  const [mine, setMine] = useState<string | null>(null);
  const [next, setNext] = useState("/");

  const close = useCallback(() => {
    setOpen(false);
    setFailed(null);
  }, []);

  // 누가 열라고 하면 연다. ⛔ 열 때마다 돌아올 곳을 새로 잡는다 — 지도는 늘 움직인다
  useEffect(() => {
    const onOpen = () => {
      setNext(hereAsNext());
      setFailed(null);
      setOpen(true);
    };
    window.addEventListener(LOGIN_EVENT, onOpen);
    return () => window.removeEventListener(LOGIN_EVENT, onOpen);
  }, []);

  /**
   * 주소에 `?login=1` 이 붙어 오면(로그인 화면·콜백 실패에서 넘어온 것) 바로 연다.
   * ⛔ `useSearchParams` 를 쓰지 않는다 — 그것을 쓰면 이 부품이 든 **모든 화면**이
   *    Suspense 를 요구해서 정적 생성이 깨진다(`lib/panel.ts` 가 같은 까닭으로 피했다).
   * ⛔ 읽고 나서 주소에서 지운다. 안 지우면 새로고침할 때마다 다시 뜬다.
   */
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("login") !== "1") return;
    const err = url.searchParams.get("error");
    url.searchParams.delete("login");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
    setNext(url.pathname + url.search);
    setFailed(err);
    setOpen(true);
  }, []);

  // 열려 있는 동안만 본다. ⛔ 손님(익명)은 로그인이 아니라 `null` 로 둔다
  useEffect(() => {
    if (!open) return;
    let alive = true;
    authClient()
      .auth.getUser()
      .then(({ data }) => {
        if (alive) setMine(data.user && !data.user.is_anonymous ? (data.user.email ?? null) : null);
      })
      .catch(() => {
        if (alive) setMine(null);
      });
    return () => {
      alive = false;
    };
  }, [open]);

  // Esc 로 닫는다
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;

  return (
    <Portal>
      {/* ⛔ 막을 눌러도 닫힌다. 안쪽 누름이 막까지 올라가지 않게 카드에서 멈춘다 */}
      <div
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/45 p-4"
        onClick={close}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="로그인 · 가입"
          onClick={(e) => e.stopPropagation()}
          className="glass-modal w-full max-w-sm rounded-panel p-5"
        >
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold tracking-tight">로그인 · 가입</h2>
              <p className="mt-0.5 text-[13px] text-ink3">별점 · TO 제보 · 관심목록 · 길찾기</p>
            </div>
            {/* ⛔ 44px 이다 — 폰에서 이것이 닫는 유일한 길이다(CLAUDE.md §11-4) */}
            <button
              type="button"
              onClick={close}
              aria-label="닫기"
              className="-mr-1.5 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-chip active:bg-fill"
            >
              <X size={18} strokeWidth={2} className="text-ink3" aria-hidden />
            </button>
          </div>

          {failed && (
            <p role="alert" className="mt-3 rounded-card border border-line px-3 py-2.5 text-[13px] leading-relaxed">
              로그인이 끝나지 않았습니다. {reason(failed)}
              {/* ⛔ **무엇이 어떻게 되는지 적는다**(2026-08-24 사장님 — 「기존에 즐겨찾기 해둔건
                  다 날아갔넹」). 전에는 같은 단추를 다시 누르라고만 했고, 그러면 손님으로
                  담아 둔 것이 손님 계정에 남아 **닿을 길이 없어졌다**(§11-2 가 뒤집힌 자리다).
                  이제는 떠나기 전에 이 기기에 적어 두고, 들어온 뒤에 다시 담는다(`lib/auth/carry.ts`). */}
              {failed === "identity_already_exists" && carried > 0 && (
                <>
                  <br />
                  담아 두신 <b className="tabular-nums">{carried}</b>곳은 그 계정으로 옮겨 드립니다.
                </>
              )}
            </p>
          )}

          {mine ? (
            <p className="mt-4 rounded-card border border-line px-3 py-2.5 text-[13px]">
              <span className="font-medium">{mine}</span> 로 로그인돼 있습니다.
            </p>
          ) : (
            /**
             * ⛔ 승격이 막혔으면(`identity_already_exists`) **잇기를 다시 시도하지 않는다** —
             *    몇 번을 눌러도 같은 자리에서 막힌다. 그 계정으로 그냥 들어가게 `plain` 을 준다.
             *    담아 둔 것은 손님 계정에 남는데, 그걸 안 알리고 넘기면 「사라졌다」가 된다(§11-2).
             */
            <LoginForm next={next} plain={failed === "identity_already_exists"} />
          )}
        </div>
      </div>
    </Portal>
  );
}
