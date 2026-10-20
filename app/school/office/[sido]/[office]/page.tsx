import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Map } from "lucide-react";
import { SIDOS, YEAR, hasAreas, newestStatYear, officesOf, schoolsOfOffice, sourceOf, type Sido } from "@/lib/schools";
import { perClass } from "@/lib/schools";
import { officePath, officeTitle, schoolPath } from "@/lib/site";
import { AreaBadge } from "@/components/area-badge";
import { Card } from "@/components/glass";
import { AreaNotice } from "@/components/area-notice";
import { ReportButton } from "@/components/report-button";

/**
 * 교육지원청 하나의 학교 목록.  `/school/office/<시도>/<지원청>`
 *
 * ⛔ **전보가 도는 단위가 교육지원청이다**(CLAUDE.md §4 — 교사가 쓰는 말 그대로).
 *    관내 전보에서만 학교를 고를 수 있으므로(§7), 학교를 견주는 자리도 지원청 안이다.
 * ⛔ 이 화면이 학교 화면 1,637장을 잇는 길이다. 사이트맵만으로는 모자라다 —
 *    검색은 링크를 따라 다니면서 그 화면이 얼마나 중요한지를 잰다.
 * ⛔ 새 지역을 열어도 이 파일은 안 고친다. `generateStaticParams` 가 `SIDOS`(lib/sido.mjs)를 따라간다.
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const per = await Promise.all(
    SIDOS.map(async (sido) => (await officesOf(sido)).map((office) => ({ sido, office })))
  );
  return per.flat();
}

const asSido = (v: string): Sido | null => ((SIDOS as string[]).includes(v) ? (v as Sido) : null);

export async function generateMetadata({ params }: PageProps<"/school/office/[sido]/[office]">): Promise<Metadata> {
  const { sido: raw, office } = await params;
  const sido = asSido(decodeURIComponent(raw));
  if (!sido) return {};
  const name = decodeURIComponent(office);
  const schools = await schoolsOfOffice(sido, name);
  if (schools.length === 0) return {};

  return {
    title: `${officeTitle(name)} 초등 ${schools.length}교`,
    description: `${sido} ${officeTitle(name)} ${YEAR}학년도 초등 ${schools.length}교 · 학생수 · 학급수 · 인사구역 · 급지`,
    alternates: { canonical: officePath(sido, name) },
  };
}

export default async function OfficePage({ params }: PageProps<"/school/office/[sido]/[office]">) {
  const { sido: raw, office } = await params;
  const sido = asSido(decodeURIComponent(raw));
  if (!sido) notFound();
  const name = decodeURIComponent(office);
  /**
   * ⛔ **코드 없는 학교를 목록에서 빼지 않는다.** 표준학교마다 화면을 낼 수는 없지만
   *    **있는 학교를 없는 것처럼 적으면 안 된다** — 충남교육청은 학교가 그 한 곳뿐이라
   *    빼는 순간 지원청 화면 자체가 404 가 되고, 그 주소는 사이트맵에 실려 나간다.
   *    링크만 안 걸고 줄은 그대로 둔다(아래 `Row`).
   */
  const schools = await schoolsOfOffice(sido, name);
  if (schools.length === 0) notFound();

  const rows = [...schools].sort((a, b) => (a.city ?? "").localeCompare(b.city ?? "", "ko") || a.name.localeCompare(b.name, "ko"));
  const source = sourceOf(sido, await newestStatYear(sido));

  return (
    <main className="mx-auto w-full max-w-2xl px-3 pb-10">
      {/* ⛔ 길잡이 줄도 44px 을 채운다(CLAUDE.md §11-4) */}
      <nav className="flex items-center gap-1.5 pl-14 text-[12.5px] text-ink3">
        <Link href="/school" className="flex min-h-11 items-center active:opacity-60">
          학교
        </Link>
        <span aria-hidden>·</span>
        <span>{sido}</span>
      </nav>

      <header className="flex items-start gap-2 px-1 pb-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-[21px] font-extrabold tracking-[-0.03em]">{officeTitle(name)}</h1>
          <p className="mt-1 text-[12.5px] text-ink3 tabular-nums">
            {sido} 초등 · {YEAR}학년도 · {rows.length}교
          </p>
        </div>
        <Link
          href={`/map?sido=${encodeURIComponent(sido)}&office=${encodeURIComponent(name)}`}
          className="glass-2 flex h-11 shrink-0 items-center gap-1.5 rounded-full pl-4 pr-3.5 text-[13.5px] font-semibold text-key active:opacity-80"
        >
          <Map size={16} strokeWidth={1.7} aria-hidden />
          지도
        </Link>
      </header>

      <Card>
        <ul className="divide-y divide-divider">
          {rows.map((s) => {
            const per = perClass(s);
            const inner = (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{s.officialName ?? s.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink3 tabular-nums">
                    {[s.city, s.classes != null ? `${s.classes}학급` : null, per != null ? `학급당 ${per.toFixed(1)}명` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <AreaBadge sido={sido} area={s.area} grade={s.areaGrade} />
              </>
            );
            return (
              <li key={s.stdCode ?? `${s.city}-${s.name}`}>
                {/* ⛔ 표준학교코드가 없으면 **링크를 안 건다.** 걸면 404 로 가는 길을 만드는 것이다 */}
                {s.stdCode ? (
                  <Link href={schoolPath(s.stdCode)} className="flex min-h-11 items-center gap-3 py-2.5 active:opacity-60">
                    {inner}
                  </Link>
                ) : (
                  <span className="flex min-h-11 items-center gap-3 py-2.5">{inner}</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* 인사구역 고시를 아직 안 읽은 시·도 — 왜 구역 배지가 없는지 여기서 한 번 말한다 */}
      {!hasAreas(sido) && <AreaNotice sido={sido} className="mt-3" />}

      <div className="mt-3 px-1">
        <ReportButton kind="error" label="이 지원청 정보 제보" />
      </div>

      <footer className="mt-3 px-1 text-[11.5px] leading-relaxed text-ink3">
        <p>{source.title}</p>
        <p>{source.revision}</p>
      </footer>
    </main>
  );
}
