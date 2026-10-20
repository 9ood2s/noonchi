"use client";

/**
 * 운영 화면 — 사용자 패턴 · 학교 순위 · 회원 · 제보 (`/admin`)
 *
 * 사장님(2026-08-24) — 「noonchischool.com의 사용자 패턴과 방문자수, 활동내역, 신규가입자 등을
 * 보고 고객 패턴을 연구할 수 있는 pm용 관리 페이지」.
 *
 * ⛔ **화면에서 가는 길을 내지 않는다.** 메뉴(`components/app-rail.tsx`)에 이 화면으로 가는 줄이
 *    없다 — 주소를 아는 사람만 연다(`/calc` 가 §12-73 에서 쓰는 방식과 같다).
 *    ⛔ 그것이 자물쇠는 아니다. 자물쇠는 DB 에 있다 — 뷰마다 `where public.is_staff()` 가
 *       걸려 있어서 주소를 알아도 남은 한 줄도 못 받는다. 여기 화면은 **무엇을 그릴지**만 정한다.
 *
 * ⛔ **서버에서 로그인 상태를 보지 않는다**(CLAUDE.md §13). 서버에서 보면 이 화면이 동적이 되는데,
 *    그럴 까닭이 없다 — 브라우저가 자기 열쇠로 보면 된다(`components/auth-button.tsx` 와 같은 방식).
 *
 * ⛔ **훅을 조건부 `return` 아래에 두지 않는다**(가드 ④). 전부 맨 위에 있다.
 */

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { NoonchiWordmark } from "@/components/brand/noonchi-wordmark";
import { NeedLogin } from "@/components/need-login";
import { StaffBadge } from "@/components/staff-badge";
import { whoAmI, type Who } from "@/lib/admin";
import {
  MembersPanel, RatingsPanel, ReportsPanel, SchoolsPanel, SummaryPanel,
} from "@/components/admin/panels";

const TABS = ["요약", "학교", "평가", "회원", "제보"] as const;
type Tab = (typeof TABS)[number];

export function AdminConsole() {
  const [who, setWho] = useState<Who | null>(null);
  const [tab, setTab] = useState<Tab>("요약");

  useEffect(() => {
    void (async () => setWho(await whoAmI()))();
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-3 pb-10">
      {/* 머리줄 — 왼쪽 위 44px 은 떠 있는 메뉴 단추 자리다. 비워 둔다 */}
      <header className="flex min-h-11 items-center gap-2 py-3 pl-14">
        <NoonchiWordmark height={24} />
        <span className="flex items-center gap-1 rounded-full border border-divider bg-fill px-2.5 py-1 text-[11.5px] font-semibold text-ink2">
          <ShieldCheck size={12} strokeWidth={2} aria-hidden />
          운영
        </span>
        {who?.staff && who.label && <StaffBadge label={who.label} />}
      </header>

      {/* ⛔ 자리를 비워 둔다. 없애면 아직 모를 때와 알았을 때 높이가 달라져 화면이 튄다 */}
      {!who && <p className="px-1 py-3 text-[13px] text-ink3">확인 중</p>}

      {who && !who.staff && (
        <section className="glass mt-2.5 rounded-panel p-3.5">
          {/*
            ⛔ **까닭을 갈라 적는다.** 로그인을 안 한 것과, 로그인했는데 운영이 아닌 것은
               다음에 할 일이 다르다 — 앞은 들어오면 되고 뒤는 여기서 할 일이 없다.
            ⛔ 손님(익명 열쇠)은 `email` 이 `null` 이라 앞쪽으로 간다. 맞다 — 손님은 운영이 될 수 없다.
          */}
          {who.email ? (
            <>
              <p className="text-[13.5px] font-semibold">운영 권한이 없습니다</p>
              <p className="mt-1 text-[12.5px] text-ink3">{who.email}</p>
            </>
          ) : (
            <NeedLogin what="운영 화면" />
          )}
          {who.error && <p className="mt-2 text-[12px] text-ink3">{who.error}</p>}
        </section>
      )}

      {who?.staff && (
        <>
          {/*
            칸 고르기 — ⛔ **위에 붙여 둔다.** 목록이 길어지면 아래로 내려간 상태에서
            다른 칸으로 옮길 길이 없어져, 매번 맨 위로 올라와야 한다.
            ⛔ 44px 이다(§11-4).
          */}
          <nav className="glass-2 sticky top-2 z-10 flex gap-1 overflow-x-auto rounded-full p-1">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tab === t}
                onClick={() => setTab(t)}
                className={`flex h-11 flex-1 shrink-0 items-center justify-center rounded-full px-4 text-[13.5px] font-semibold active:opacity-80 ${
                  tab === t ? "bg-[var(--key-fill)] text-white" : "text-ink2"
                }`}
              >
                {t}
              </button>
            ))}
          </nav>

          {/*
            ⛔ **고른 칸만 그린다.** 다섯을 다 그려 놓고 숨기면 열지도 않은 칸이 서버를 부른다.
            ⛔ 칸을 옮기면 그 칸이 처음부터 다시 받는다 — 오래 열어 둔 화면이 옛 수치를 들고 있지 않게.
          */}
          {tab === "요약" && <SummaryPanel />}
          {tab === "학교" && <SchoolsPanel />}
          {tab === "평가" && <RatingsPanel />}
          {tab === "회원" && <MembersPanel />}
          {tab === "제보" && <ReportsPanel />}
        </>
      )}
    </main>
  );
}
