/**
 * **인사구역 고시를 아직 안 읽은 시·도**에 붙는 한 줄.
 *
 * 왜 — 사장님(2026-08-23) 「다른 모든 지역 학교들도 api에서 받아올 수 있는 데이터들은 …
 * 때려넣자. 그뒤에 사람들에게 제보를 받거나 문서를 받아서 단계적으로 채워나가고
 * **공지를 띄우는 방식**으로 운영하면 될 것 같음.」 그 공지가 이것이다.
 *
 * ⛔ **말을 여기 한 곳에만 둔다.** 지도 · 학교 상세 · 지원청 목록 · 시·도 입구가 다 이것을 쓴다.
 *    화면마다 따로 적으면 한쪽만 고쳐져 서로 다른 말을 하게 된다(CLAUDE.md §11-3).
 * ⛔ **왜 없는지를 적는다.** 「인사구역 없음」이라고만 쓰면 「구역이 없는 학교」로 읽힌다.
 *    없는 것은 구역이 아니라 우리가 읽은 고시문이다.
 * ⛔ 이모지를 쓰지 않는다. 아이콘은 lucide-react (CLAUDE.md §3).
 */
import { Info } from "lucide-react";
import { ReportButton } from "@/components/report-button";

/** 공지 문구. ⛔ 화면이 저마다 다시 쓰지 않게 여기서 낸다. */
export const AREA_PENDING = {
  title: "인사구역 준비 중",
  body: "학교 정보만 공개. 인사구역 · 급지 · 지역가산 · 모의지원은 교육청 고시 원문을 읽은 시·도에만 있다",
  ruled: "지금 열려 있는 곳 — 경기 · 인천",
} as const;

/** 학교 상세·지원청 목록에 넣는 판. */
export function AreaNotice({ sido, className = "" }: { sido?: string; className?: string }) {
  return (
    <div className={`flex gap-2 rounded-card border border-divider px-3 py-2.5 ${className}`}>
      <Info size={15} strokeWidth={1.8} className="mt-px shrink-0 text-ink3" aria-hidden />
      <div className="min-w-0">
        <p className="text-[13px] font-bold tracking-[-0.01em]">{AREA_PENDING.title}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink3">{AREA_PENDING.body}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-ink3">{AREA_PENDING.ruled}</p>
        {/*
          ⛔ 공지만 세우고 **받는 길을 안 두면** 「단계적으로 채워나간다」가 말뿐이 된다
             (2026-08-23 사장님). 고시문이 있는 사람이 바로 여기서 보낼 수 있어야 한다.
        */}
        <ReportButton
          kind="doc"
          sido={sido}
          label={sido ? `${sido} 고시문 제보` : "고시문 제보"}
          variant="quiet"
          className="-ml-1 mt-1"
        />
      </div>
    </div>
  );
}

/**
 * 지도 범례 자리에 들어가는 **한 줄짜리**.
 * ⛔ 지도는 자리가 좁다. 판을 그대로 얹으면 지도를 덮는다 — 제목 한 줄만 낸다.
 */
export function AreaNoticeLine() {
  return (
    <p className="flex items-center gap-1.5 text-[11.5px] text-ink3">
      <Info size={13} strokeWidth={1.8} className="shrink-0" aria-hidden />
      {AREA_PENDING.title}
    </p>
  );
}
