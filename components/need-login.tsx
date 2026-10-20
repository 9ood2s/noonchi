"use client";

/**
 * **로그인·가입으로 가는 자리** — 한 곳에 모아 둔다.
 *
 * 2026-08-23 사장님 — 「가입경로로 가는 버튼도 같이. **가입 배선 깔자**」.
 * 로그인이 필요한 자리가 넷이다(길찾기 · 경로 저장 · 관심목록 · 내 정보).
 * 넷이 저마다 다른 말과 다른 모양으로 알리면, 같은 문 앞에 선 사람이 매번 다른 안내를 받는다.
 *
 * ⛔ **막다른 곳으로 두지 않는다.** 「로그인이 필요합니다」만 적고 길을 안 내면 사람은 거기서 멈춘다.
 * ⛔ **한 줄과 단추뿐이다**(2026-08-23 사장님 — 「그냥 그 버튼과 기능만 넣어줘」).
 * ⛔ **화면을 갈아치우지 않는다**(2026-08-23 사장님 — 「회원가입과 로그인 모두 지도창 위의
 *    모달에서 진행하면 좋겠음」 · §12-144). 전에는 `/login` 으로 넘어가서 **보던 학교를 잃었다** —
 *    돌아올 곳을 주소에 들려 보내는 것으로 메우고 있었는데, 애초에 떠나지 않으면 될 일이었다.
 */

import { LogIn } from "lucide-react";
import { openLogin } from "@/lib/login-gate";
import { josa } from "@/lib/josa";

export function NeedLogin({
  what,
  compact,
}: {
  /** 무엇이 막혔나 — 「길찾기」 · 「관심목록」 */
  what: string;
  /** 칸 안에 끼워 넣는 작은 꼴 (길찾기 칸처럼 이미 좁은 자리) */
  compact?: boolean;
}) {
  return (
    <div className={compact ? "mt-2 rounded-chip border border-key px-2.5 py-2.5" : "px-4 py-3"}>
      {/* ⛔ 조사를 손으로 박지 않는다 — 앞말이 무엇이 올지 모른다.
          2026-08-23 사장님이 「**닉네임는** 로그인이 필요합니다」를 화면에서 보셨다(`lib/josa.ts`). */}
      <p className={`text-ink2 ${compact ? "text-xs" : "text-[13.5px]"}`}>
        {what}
        {josa(what, "은는")} 로그인이 필요합니다
      </p>
      {/* ⛔ 44px 이다(§11-4). 이것이 가입으로 가는 유일한 문이라 작게 두지 않는다 */}
      <button
        type="button"
        onClick={openLogin}
        className={`flex min-h-11 w-full items-center justify-center gap-1.5 rounded-card bg-[var(--key-fill)] font-semibold text-white active:opacity-80 ${
          compact ? "mt-2 text-[13px]" : "mt-3 text-sm"
        }`}
      >
        <LogIn size={15} strokeWidth={2} aria-hidden />
        로그인 · 가입
      </button>
    </div>
  );
}
