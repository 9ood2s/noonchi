"use client";

/**
 * **제보 단추** — 사장님(2026-08-23) 「제보라는 버튼을 **곳곳에 배치**」.
 *
 * ⛔ 이 부품은 창을 모른다. `openReport()` 만 부른다 — 받는 쪽은 `components/report-dialog.tsx`
 *    하나뿐이고 `app/layout.tsx` 에 달려 있다(`login-gate` · `toast` 와 같은 방식).
 *    그래서 **어느 화면 어느 자리에든** 놓아도 된다.
 * ⛔ **`"use client"` 가 붙어 있어도 가볍다.** 지도 뭉치를 안 끌어온다 — 학교별 정적 화면이
 *    이것을 쓰는데 거기서 지도를 딸려 오게 하면 검색으로 들어온 사람이 글 대신 지도를 받는다
 *    (`components/area-badge.tsx` 의 주석과 같은 까닭).
 * ⛔ 44px 이다(§11-4).
 */

import { MessageSquarePlus } from "lucide-react";
import { openReport, type ReportKind } from "@/lib/report";

export function ReportButton({
  kind,
  stdCode,
  schoolName,
  sido,
  label = "제보",
  variant = "line",
  className = "",
}: {
  /** 창을 열 때 미리 골라 둘 갈래 */
  kind?: ReportKind;
  /** 그 학교 이야기면 표준학교코드를 함께 보낸다 */
  stdCode?: string;
  /** 창에 적어 줄 학교 이름 */
  schoolName?: string;
  /** 그 시·도 이야기면 시·도 이름을 함께 보낸다 (「인사구역 준비 중」 공지) */
  sido?: string;
  label?: string;
  /** `line` 테두리만 · `quiet` 글자만 (좁은 자리) */
  variant?: "line" | "quiet";
  className?: string;
}) {
  const look =
    variant === "quiet"
      ? "gap-1 text-[12.5px] font-semibold text-ink2 px-1"
      : "gap-1.5 rounded-card border border-divider px-3 text-[13.5px] font-semibold text-ink2";

  return (
    <button
      type="button"
      onClick={() => openReport({ kind, stdCode, schoolName, sido })}
      className={`inline-flex min-h-11 items-center justify-center active:opacity-60 ${look} ${className}`}
    >
      <MessageSquarePlus size={15} strokeWidth={1.8} aria-hidden />
      {label}
    </button>
  );
}
