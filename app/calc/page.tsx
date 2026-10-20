import Link from "next/link";
import { schoolsOf, YEAR, sourceOf, RULED_SIDOS, type Sido } from "@/lib/schools";
import { Calculator } from "@/components/calculator";
import { CalculatorIncheon } from "@/components/calculator-incheon";
import { Source } from "@/components/glass";
import { NoonchiWordmark } from "@/components/brand/noonchi-wordmark";

export const metadata = { title: "계산기" };
export const revalidate = 3600;

/**
 * 전보년수 계산기 — M 시안(`docs/DESIGN.md §12-52`)으로 맞췄다(2026-08-22).
 *
 * ⛔ **화면에서 길은 끊겨 있다**(§12-73, 2026-08-21 사장님 「일단은 빼놓자」).
 *    메뉴에 이 화면으로 가는 줄이 없다. 주소로는 열리고 규칙·셀프체크도 그대로 돈다.
 * ⛔ 왼쪽 위 44px 은 떠 있는 메뉴 단추 자리다. 비워 둔다.
 */
export default async function Calc({ searchParams }: PageProps<"/calc">) {
  const sp = await searchParams;
  /**
   * ⛔ **계산기는 인사구역 고시 원문을 읽은 시·도에만 있다**(CLAUDE.md §7 — 점수 계산은 스위치가 아니다).
   *    학교 목록은 전국 17개 시·도가 다 열려 있지만, 산식은 시·도마다 다르다 —
   *    경기는 전보년수 순, 인천은 평정점 합계 순이고 지역가산이 아예 없다.
   *    그래서 여기서만 `RULED_SIDOS` 를 쓴다.
   */
  const sido: Sido = RULED_SIDOS.includes(sp.sido as Sido) ? (sp.sido as Sido) : "경기";
  const schools = (await schoolsOf(sido)).map((s) => {
    // ⛔ 여기 오는 시·도는 구역이 반드시 있다. 비어 있으면 적재가 깨진 것이라 **그 자리에서 멈춘다** —
    //    조용히 빼면 계산기 학교 목록에서 학교가 소리 없이 사라진다(CLAUDE.md §11-1).
    if (s.area == null) throw new Error(`인사구역이 비어 있다: ${sido} ${s.name}`);
    return { name: s.name, city: s.city, office: s.office, area: s.area, areaGrade: s.areaGrade };
  });
  const source = sourceOf(sido);

  return (
    <main className="mx-auto w-full max-w-2xl px-3 pb-8">
      <header className="flex min-h-11 items-center gap-2 py-3 pl-14">
        <NoonchiWordmark height={24} />
        {/* ⛔ 화면 이름은 「계산기」다(2026-08-23 사장님). 무엇을 셈하는지는 결과 카드가 적는다 —
            경기는 「전보년수」, 인천은 「교육지원청간 전보 순위 점수」로 서로 다르다. */}
        <span className="rounded-full border border-divider bg-fill px-2.5 py-1 text-[11.5px] font-semibold text-ink2">
          계산기
        </span>
        {/* 시·도는 주소로 가른다 — 고른 것만 파랑으로 채운다(M 규칙 4) */}
        <span className="ml-auto flex gap-1.5">
          {RULED_SIDOS.map((s) => (
            <Link
              key={s}
              href={`/calc?sido=${s}`}
              aria-current={sido === s ? "true" : undefined}
              className={`flex h-11 items-center rounded-full px-4 text-[13.5px] font-semibold active:opacity-80 ${
                sido === s ? "bg-[var(--key-fill)] text-white" : "glass-2 text-ink2"
              }`}
            >
              {s}
            </Link>
          ))}
        </span>
      </header>

      {sido === "경기" ? <Calculator schools={schools} /> : <CalculatorIncheon schools={schools} />}

      <Source>
        {sido} · 초등 · {YEAR}학년도
        <br />
        출처 · {source.title}
        <br />
        {source.revision}
      </Source>
    </main>
  );
}
