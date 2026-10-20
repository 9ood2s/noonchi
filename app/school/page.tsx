import type { Metadata } from "next";
import Link from "next/link";
import { SIDOS, YEAR, hasAreas, newestStatYear, officesOf, schoolsOf, sourceOf } from "@/lib/schools";
import { officePath } from "@/lib/site";
import { Card } from "@/components/glass";
import { AreaNotice } from "@/components/area-notice";
import { ReportButton } from "@/components/report-button";

/**
 * 정적 화면의 입구 — 시·도 → 교육지원청.  `/school`
 *
 * ⛔ **학교를 여기 다 늘어놓지 않는다.** 지금은 1,637교라 한 장에도 들어가지만
 *    전국이 되면 2만교다(2026-08-23 사장님 — 「앞으로 추가해야할 전국의 학교들이 겁나 많음」).
 *    시·도 → 지원청 → 학교 **세 단**으로 두면 전국이 되어도 단이 안 늘고 시·도 수만 는다.
 * ⛔ 새 지역을 열 때 여기 손댈 것이 없다 — `lib/sido.mjs` 에 줄이 늘면 따라 는다.
 *    인사구역까지 있는 시·도인지는 `hasAreas` 가 가른다. 없으면 그 자리에 공지가 선다.
 */
export const metadata: Metadata = {
  title: "학교 목록",
  description: `전국 ${SIDOS.length}개 시·도 초등 ${YEAR}학년도 교육지원청별 학교 목록 · 학생수 · 학급수 · 인사구역`,
  alternates: { canonical: "/school" },
};

export default async function SchoolIndex() {
  const blocks = await Promise.all(
    SIDOS.map(async (sido) => {
      const schools = await schoolsOf(sido);
      const offices = await officesOf(sido);
      const count = new Map<string, number>();
      for (const s of schools) count.set(s.office, (count.get(s.office) ?? 0) + 1);
      // ⛔ 고시문이 없는 시·도는 공시 연도가 곧 기준일이다 — 출처가 빈 칸으로 나가지 않게(§2)
      const source = sourceOf(sido, await newestStatYear(sido));
      return {
        sido, source, pending: !hasAreas(sido),
        total: schools.length, offices: offices.map((o) => ({ o, n: count.get(o) ?? 0 })),
      };
    })
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-3 pb-10">
      <header className="min-h-11 py-3 pl-14">
        <h1 className="text-[21px] font-extrabold tracking-[-0.03em]">학교 목록</h1>
        <p className="mt-1 text-[12.5px] text-ink3 tabular-nums">
          {YEAR}학년도 · {blocks.reduce((n, b) => n + b.total, 0).toLocaleString()}교
        </p>
      </header>

      {blocks.map((b) => (
        <Card key={b.sido} className="mt-3">
          <div className="flex min-h-6 items-baseline gap-2">
            <h2 className="text-[13.5px] font-bold tracking-[-0.01em]">{b.sido} 초등</h2>
            <p className="ml-auto text-[11.5px] text-ink3 tabular-nums">{b.total.toLocaleString()}교</p>
          </div>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 sm:grid-cols-3">
            {b.offices.map(({ o, n }) => (
              <li key={o}>
                <Link
                  href={officePath(b.sido, o)}
                  className="flex min-h-11 items-center gap-2 py-1 active:opacity-60"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{o}</span>
                  <span className="shrink-0 text-xs text-ink3 tabular-nums">{n}</span>
                </Link>
              </li>
            ))}
          </ul>
          {b.pending && <AreaNotice sido={b.sido} className="mt-3" />}
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink3">{b.source.title}</p>
          <p className="text-[11.5px] text-ink3">{b.source.revision}</p>
        </Card>
      ))}

      {/* ⛔ 입구에도 둔다 — 어느 시·도를 보다가도 바로 보낼 수 있어야 한다(§12-161) */}
      <div className="mt-3 px-1">
        <ReportButton kind="doc" label="우리 지원청 고시문 제보" />
      </div>
    </main>
  );
}
