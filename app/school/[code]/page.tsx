import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronDown, ExternalLink, Map } from "lucide-react";
import {
  SIDOS,
  YEAR,
  newestStatYear,
  sourceOf,
  schoolByCode,
  schoolCodesOf,
  schoolsOfOffice,
  warmIndex,
  type School,
  type Sido,
} from "@/lib/schools";
import { areaColor, mapLabel, pinOf } from "@/lib/map";
import { schoolFacts, type Cell } from "@/lib/school-facts";
import { SITE_URL, mapPath, officePath, officeTitle, schoolPath } from "@/lib/site";
import { AreaBadge } from "@/components/area-badge";
import { AreaNotice } from "@/components/area-notice";
import { ReportButton } from "@/components/report-button";
import { SchoolMap } from "@/components/school-map";

/**
 * 학교 한 곳의 정적 화면.  `/school/<표준학교코드>`
 *
 * ⭐ **왜 만드나** — 홈을 지도로 바꾸면서 검색에 잡히는 화면이 없어졌고(`DESIGN.md §12-98`),
 *    지도는 한 화면짜리라 세션당 1~2쪽밖에 안 나온다. 학교마다 화면이 생기면
 *    「○○초등학교 전보」로 검색에 잡히고 쪽수도 는다(§12-152 · §12-154).
 *
 * ⛔ **광고를 아직 안 붙인다.** 2026-08-23 사장님 — 「광고를 붙이는건 겸직허용이 떨어지고 나서야.
 *    9월 1일자로 새로운 교장이 오기 때문에 그 이후가 되어야 진행할 수 있어」.
 *    자리는 아래 `<footer>` 다음이다(§12-120). 그때 그 자리에만 넣으면 된다 — 화면은 안 고친다.
 *
 * ⛔ **전국으로 늘 것을 감안해 짰다**(2026-08-23 사장님). 이 화면이 지키는 것 셋 —
 *    ① 주소에 시·도·학교급을 안 담는다(`lib/site.ts` — 표준학교코드가 전국 유일값이다)
 *    ② 학교 하나를 그리려고 시·도를 통째로 읽지 않는다(`schoolByCode` 가 한 줄만 받는다)
 *    ③ 만들 목록은 `schoolCodesOf` 가 **코드 한 컬럼만** 받아 온다
 *    새 지역을 열 때 고칠 자리는 `lib/sido.mjs` 한 곳이고, 학교급은 `lib/schools.ts` 의 `LEVELS` 다.
 *    ⛔ 인사구역까지 여는 것은 별개다 — `SOURCES` 에 고시문을 적어야 구역·급지·모의지원이 붙는다.
 */

/**
 * ⛔ 목록에 없는 코드는 404 다(`dynamicParams = false`).
 *    열어 두면 아무 숫자나 주소에 넣어도 화면이 만들어져 **검색에 빈 화면이 쌓인다.**
 */
export const dynamicParams = false;

export async function generateStaticParams() {
  const per = await Promise.all(SIDOS.map((s) => schoolCodesOf(s)));
  return per.flat().map((code) => ({ code }));
}

/** 그 학교가 어느 시·도 것인지. 우리가 아는 시·도 목록과 맞춰 본다 */
const sidoOf = (s: School): Sido | null =>
  (SIDOS as string[]).includes(s.sido) ? (s.sido as Sido) : null;

const displayName = (s: School) => s.officialName ?? s.name;

async function load(code: string) {
  /**
   * ⛔ **빌드 때는 시·도를 한 번씩만 읽는다.** 이 줄이 없으면 화면 1,637장이 각각 한 줄씩
   *    받아 조회가 1,637번이 된다. 자세한 것은 `lib/schools.ts` 의 `warmIndex`.
   * ⭐ 전국으로 늘어 빌드가 버거워지면 `dynamicParams = true` 로 바꾸고 **이 줄만 지운다.**
   */
  await warmIndex();
  const school = await schoolByCode(code);
  if (!school || school.opensYear != null) return null;
  const sido = sidoOf(school);
  if (!sido) return null;
  return { school, sido };
}

export async function generateMetadata({ params }: PageProps<"/school/[code]">): Promise<Metadata> {
  const { code } = await params;
  const found = await load(code);
  if (!found) return {};
  const { school, sido } = found;

  const pin = pinOf(school);
  const { cells } = schoolFacts(sido, pin);
  /**
   * ⛔ `cells[0]` 을 집지 않는다. 인사구역이 없는 시·도는 그 칸이 아예 없어서
   *    첫 칸이 「학급당 학생수」가 된다 — 제목이 「○○초 · 학급당 학생수」로 나간다.
   *    이름으로 찾고, 없으면 소재지를 쓴다.
   */
  const zoneCell = cells.find((c) => c.k === "인사구역" || c.k === "급지");
  const zone = zoneCell && typeof zoneCell.v === "string" ? `${zoneCell.k} ${zoneCell.v}` : null;
  const name = displayName(school);
  const where = [school.city, officeTitle(school.office)].filter(Boolean).join(" · ");

  /**
   * ⛔ **제목에 학교 이름을 앞세운다.** 검색은 앞쪽 글자를 무겁게 본다.
   *    바깥 틀(`app/layout.tsx`)이 뒤에 「· 교사 전보 정보」를 붙인다.
   * ⛔ 설명을 지어내지 않는다 — 우리가 가진 값을 그대로 늘어놓는다(CLAUDE.md §3).
   */
  const desc = [
    `${name} ${YEAR}학년도${zone ? ` ${zone}` : ""}`,
    where,
    school.students != null ? `학생 ${school.students.toLocaleString()}명` : null,
    school.classes != null ? `${school.classes}학급` : null,
    school.teachers != null ? `교원 ${school.teachers}명` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    title: `${name} · ${zone ?? `${sido} ${officeTitle(school.office)}`}`,
    description: desc,
    /** ⛔ 대표 주소를 못박는다 — 같은 화면이 두 주소로 열리면 검색이 둘 다 깎는다 */
    alternates: { canonical: schoolPath(code) },
    openGraph: { title: `${name} · ${sido} ${officeTitle(school.office)}`, description: desc, type: "article" },
  };
}

export default async function SchoolPage({ params }: PageProps<"/school/[code]">) {
  const { code } = await params;
  const found = await load(code);
  if (!found) notFound();
  const { school, sido } = found;

  const newest = await newestStatYear(sido);
  /**
   * ⛔ 지도가 하는 것과 **같은 손질**을 거쳐 표를 만든다(`app/map/data/route.ts`).
   *    올해 공시면 연도를 지운다 — 늘 붙어 있는 별표는 아무 말도 안 한다(§12-142).
   */
  const pin = pinOf(school);
  const { cells, oldYear, note, gradePending, areaPending } = schoolFacts(sido, {
    ...pin,
    sy: pin.sy != null && pin.sy < newest ? pin.sy : null,
  });

  const name = displayName(school);
  const source = sourceOf(sido, newest);
  /** 좌표가 없으면 지도 띠를 아예 안 그린다 — 빈 회색 띠는 「고장났다」로 읽힌다 */
  const hasMap = school.lat != null && school.lng != null;

  /**
   * 같은 교육지원청의 다른 학교 — **화면끼리 잇는다.**
   * ⛔ 사이트맵만으로는 모자라다. 검색은 링크를 따라 다니면서 「이 화면이 얼마나 중요한가」를 잰다.
   *    어디서도 안 걸린 화면은 사이트맵에 있어도 뒤로 밀린다.
   * ⛔ 스물로 끊는다 — 지원청 하나에 백 곳이 넘는 데가 있어 다 늘어놓으면 이 화면이 목록이 된다.
   *    끊었다는 사실은 「지원청 전체」 링크로 알린다(조용히 자르지 않는다).
   */
  const siblings = (await schoolsOfOffice(sido, school.office))
    .filter((s) => s.stdCode && s.stdCode !== school.stdCode)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  /**
   * 검색이 읽는 구조화 데이터.
   * ⛔ **화면에 없는 것을 여기 적지 않는다.** 우리가 가진 공공데이터만 담는다.
   */
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "School",
    name,
    url: `${SITE_URL}${schoolPath(code)}`,
    identifier: code,
    address: {
      "@type": "PostalAddress",
      addressCountry: "KR",
      addressRegion: sido,
      ...(school.city ? { addressLocality: school.city } : {}),
    },
    ...(school.homepage ? { sameAs: [school.homepage] } : {}),
    ...(school.lat != null && school.lng != null
      ? { geo: { "@type": "GeoCoordinates", latitude: school.lat, longitude: school.lng } }
      : {}),
  };

  return (
    <main className="pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/*
        지도 띠 — **이 화면이 문서가 아니라 지도 서비스임을 한눈에 알리는 자리다**
        (2026-08-23 사장님 — 「문서처럼 생긴게 마음에 안듦」 · 「앱과 같은 모양새라면 상관없음」).
        ⛔ 좌표가 없는 학교는 **아무것도 안 그린다** — 빈 회색 띠는 「지도가 고장났다」로 읽힌다.
           그때는 아래 유리 판이 위로 올라와 자리를 메운다.
        ⛔ 높이를 `vh` 로만 두지 않는다. 폰에서 너무 낮고 큰 화면에서 너무 커진다.
      */}
      {hasMap && (
        <div className="relative h-[38vh] max-h-[360px] min-h-[220px] w-full overflow-hidden">
          <SchoolMap
            lat={school.lat!}
            lng={school.lng!}
            name={name}
            label={mapLabel(sido, school.area, school.areaGrade)}
            color={areaColor(sido, school.area, school.areaGrade)}
          />
        </div>
      )}

      {/*
        유리 판 — **지도 아래 모서리를 덮고 올라온다.** 지도 위에 떠 있는 우리 패널과 같은 결이다
        (`map-screen.tsx` 의 왼쪽 칸 · 폰 아래 시트가 `.glass .glass-thick` 인 것과 같다).
        ⛔ 길잡이 줄(`학교 · 경기 수원`)을 맨 위에 두지 않는다 — 그 한 줄이 화면을 문서로 만든다.
           같은 링크는 아래 「지원청」 판이 들고 있다.
      */}
      <div className={`mx-auto w-full max-w-2xl px-3 ${hasMap ? "-mt-7" : "pt-3"}`}>
        <section className="glass glass-thick relative rounded-panel p-4">
          <header className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="text-[21px] font-extrabold tracking-[-0.03em]">{name}</h1>
              <p className="mt-1 text-[12.5px] text-ink3">
                {[sido, school.city, officeTitle(school.office)].filter(Boolean).join(" · ")}
                {school.branches.length > 0 && ` · 분교장 ${school.branches.length}`}
              </p>
            </div>
            <AreaBadge sido={sido} area={school.area} grade={school.areaGrade} big />
          </header>

          {/* 인사구역 고시를 아직 안 읽은 시·도 — 배지·구역 칸이 왜 없는지 여기서 말한다 */}
          {areaPending && <AreaNotice sido={sido} className="mt-3" />}

          {/* 공공데이터 — 교사 입력과 갈라 표시한다(CLAUDE.md §2) */}
          <div className="mt-3 flex min-h-6 items-baseline gap-2">
            {/* ⛔ 구역이 없는 시·도에서는 「인사」라 적지 않는다 — 표에 인사 값이 한 칸도 없다 */}
            <h2 className="text-[13.5px] font-bold tracking-[-0.01em]">
              {YEAR}학년도 {areaPending ? "학교 정보" : "인사"}
            </h2>
            <p className="ml-auto text-[11.5px] text-ink3">{source.revision}</p>
          </div>
          <dl className="mt-2 grid grid-cols-2 overflow-hidden rounded-card border border-divider *:border-divider [&>*:nth-child(n+3)]:border-t [&>*:nth-child(2n)]:border-l">
            {cells.map((c, i) => (
              <Fact key={c.k} cell={c} wide={cells.length % 2 === 1 && i === cells.length - 1} />
            ))}
          </dl>

          {/* 학년별 학생수 — 막대는 그 학교 안에서만 견준다(§12-138) */}
          {school.studentsByGrade && school.studentsByGrade.length === 6 && (
            <div className="mt-3">
              <p className="text-xs text-ink3">학년별 학생수</p>
              <ol className="mt-1.5 flex items-end gap-1">
                {school.studentsByGrade.map((n, i) => {
                  const top = Math.max(...school.studentsByGrade!);
                  return (
                    <li key={i} className="flex flex-1 flex-col items-center gap-1">
                      <span className="text-[11px] font-semibold tabular-nums">{n}</span>
                      <span
                        className="w-full rounded-[3px] bg-[var(--key-fill)]"
                        style={{ height: `${top > 0 ? Math.max(3, Math.round((n / top) * 34)) : 3}px` }}
                        aria-hidden
                      />
                      <span className="text-[11px] tabular-nums text-ink3">{i + 1}</span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {/* ⛔ 별표를 달았으면 그 뜻을 그 자리에 적는다. 별표만 있고 풀이가 없으면 겁만 준다 */}
          {oldYear && <p className="mt-2 text-xs text-ink3">* {oldYear}년 공시</p>}
          {note && <p className="mt-2 text-xs leading-relaxed text-ink3">{note}</p>}
          {gradePending && <p className="mt-2 text-xs leading-relaxed text-ink3">{gradePending}</p>}

          {/*
            ⛔ **여기가 이 화면의 목적지다.** 검색으로 들어온 사람을 앱으로 들인다 —
               별점·통근·관심목록은 전부 지도 쪽에 있고, 여기 옮겨 오면 로그인이 필요해져
               이 화면이 동적이 되고 검색에 안 잡힌다.
          */}
          <Link
            href={mapPath(sido, code)}
            className="mt-3 flex h-11 items-center justify-center gap-1.5 rounded-full bg-[var(--key-fill)] text-[13.5px] font-semibold text-white active:opacity-80"
          >
            <Map size={16} strokeWidth={1.7} aria-hidden />
            지도에서 보기
          </Link>
        </section>

        {/*
          같은 교육지원청의 다른 학교 — **접어 둔다.**
          ⛔ 펴 두면 학교 백 줄이 깔려 화면이 목록집이 된다(2026-08-23 사장님 「문서처럼 생긴게」).
          ⛔ 그렇다고 빼지는 않는다 — 검색은 링크를 따라다니며 이 화면이 얼마나 중요한지를 재고,
             접힌 `<details>` 안의 링크도 HTML 에 그대로 있어 다 따라간다.
          ⛔ 스물로 끊는다. 끊었다는 사실은 「지원청 전체」 링크로 알린다(조용히 자르지 않는다).
        */}
        {siblings.length > 0 && (
          <details className="glass mt-3 rounded-panel px-4 py-1">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 select-none">
              <span className="text-[13.5px] font-bold tracking-[-0.01em]">{officeTitle(school.office)}</span>
              <span className="text-[11.5px] text-ink3 tabular-nums">{siblings.length + 1}교</span>
              <ChevronDown size={15} strokeWidth={1.8} className="ml-auto text-ink3" aria-hidden />
            </summary>
            <ul className="divide-y divide-divider pb-2">
              {siblings.slice(0, 20).map((s) => (
                <li key={s.stdCode}>
                  <Link
                    href={schoolPath(s.stdCode!)}
                    className="flex min-h-11 items-center gap-3 py-2 text-left active:opacity-60"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.officialName ?? s.name}</span>
                    <AreaBadge sido={sido} area={s.area} grade={s.areaGrade} />
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={officePath(sido, school.office)}
              className="flex min-h-11 items-center gap-1 text-[13px] font-semibold text-key active:opacity-60"
            >
              {officeTitle(school.office)} 학교 전체
            </Link>
          </details>
        )}

        {/*
          제보 — ⛔ **학교 화면마다 둔다.** 값이 틀린 것을 아는 사람은 그 학교 교사이고,
          그 사람이 지금 보고 있는 화면이 여기다. 누르면 이 학교가 함께 실려 간다.
        */}
        <div className="mt-3 flex flex-wrap gap-1.5 px-1">
          <ReportButton kind="error" stdCode={code} schoolName={name} label="값이 틀렸다" />
          <ReportButton kind="to" stdCode={code} schoolName={name} label="예상 TO 제보" />
        </div>

        {/*
          출처 — 접어 둔다(§12-120). ⛔ 없애지는 않는다: 공공데이터는 출처와 기준일을 함께 낸다(§2).
          ⭐ **광고 자리는 이 `<footer>` 다음이다.** 겸직허용이 떨어진 뒤에 넣는다(§12-155).
        */}
        <footer className="mt-3 px-1">
          <details className="text-xs leading-relaxed text-ink3">
            <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 select-none">
              자료 출처
              <ChevronDown size={13} strokeWidth={1.8} aria-hidden />
            </summary>
            <div className="mt-1">
              {sido === "인천" && <p>급지 · 교육지원청 교육공무원인사관리세부기준 [별표1] · 2026. 8. 7. 고시</p>}
              <p className={sido === "인천" ? "mt-1.5" : ""}>
                {/* ⛔ 고시문이 없는 시·도는 앞말을 안 붙인다 — 「인사구역 · 나이스 개방포털…」이 되면 거짓말이다 */}
                {areaPending ? "" : `${sido === "인천" ? "전보 기준" : "인사구역"} · `}
                {source.title}
              </p>
              <p className="mt-0.5">{source.revision}</p>
              <p className="mt-1.5">학생 수 · 학교알리미 공시</p>
              <p className="mt-0.5">학급 수 · 나이스 개방포털</p>
            </div>
          </details>
        </footer>
      </div>
    </main>
  );
}

function Fact({ cell, wide }: { cell: Cell; wide?: boolean }) {
  return (
    <div className={`px-3 py-2.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-ink3">{cell.k}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">
        {typeof cell.v === "string" ? (
          cell.v
        ) : (
          /* ⛔ 44px 을 채운다(CLAUDE.md §11-4). 칸 안이라 -my 로 줄 높이는 그대로 둔다 */
          <a
            href={cell.v.href}
            target="_blank"
            rel="noreferrer"
            className="-my-1.5 inline-flex min-h-11 items-center gap-1 text-key active:opacity-60"
          >
            바로가기
            <ExternalLink size={13} strokeWidth={2} aria-hidden />
          </a>
        )}
      </dd>
    </div>
  );
}
