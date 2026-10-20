import Link from "next/link";
import { ChevronRight, Map } from "lucide-react";
import { NoonchiWordmark } from "@/components/brand/noonchi-wordmark";
import { officesOf, schoolsOf, sourceOf, YEAR } from "@/lib/schools";
import { changes, daysToTransfer, groupedMoves } from "@/lib/changes";
import { areaLabel, regionBonus } from "@/lib/areas.mjs";
import { areaColor } from "@/lib/map";
import { Card, CardHead, Source, Stat } from "@/components/glass";

// 남은 날짜가 하루 단위로 바뀐다. 하루에 한 번 다시 만든다.
export const revalidate = 3600;

/**
 * 홈 — M 시안(`docs/DESIGN.md §12-52`)으로 맞췄다(2026-08-22).
 *
 * ⛔ **벽에 붙는 띠를 두지 않는다.** 전에는 검은 숫자 띠(`bg-ink-strip`)가 화면 폭을 다 먹고
 *    구역이 실선으로 갈렸다 — 지도 화면과 따로 놀았다. M 은 유리 카드가 바닥 빛 위에 떠 있는 것이다.
 * ⛔ **왼쪽 위를 비워 둔다.** 떠 있는 아이콘 레일(`components/app-rail.tsx`)이 거기 앉는다
 * — 넓은 화면은 폭 56px, 폰은 단추 하나 44px 이다.
 */
export default async function Home() {
  const schools = await schoolsOf("경기");
  const offices = await officesOf("경기");
  const source = sourceOf("경기");
  const c = changes();
  const moves = groupedMoves();
  const { year, days } = daysToTransfer();
  const head = moves[0];
  const delta = c.counts.to - c.counts.from;

  const byArea = schools.reduce<Record<string, number>>((m, s) => {
    // ⛔ 경기는 고시 원문을 읽어 둔 시·도라 구역이 늘 있다. 비면 적재가 깨진 것이므로 「?」로 드러낸다
    const k = areaLabel(s.area ?? "?", s.areaGrade);
    m[k] = (m[k] ?? 0) + 1;
    return m;
  }, {});

  return (
    <main className="mx-auto w-full max-w-2xl px-3 pb-8">
      {/* 머리줄 — 메뉴 단추 자리(왼쪽 12 + 44)를 비우고 그 옆에 선다 */}
      <header className="flex min-h-11 items-center gap-2 py-3 pl-14">
        <NoonchiWordmark height={24} />
        <span className="rounded-full border border-divider bg-fill px-2.5 py-1 text-[11.5px] font-semibold text-ink2">
          경기 초등
        </span>
        <Link
          href="/map"
          className="glass-2 ml-auto flex h-11 items-center gap-1.5 rounded-full pl-4 pr-3.5 text-[13.5px] font-semibold text-key active:opacity-80"
        >
          <Map size={16} strokeWidth={1.7} aria-hidden />
          지도
        </Link>
      </header>

      {/* 값 알약 셋 */}
      <Card>
        <div className="grid grid-cols-3 gap-2">
          <Stat
            label="경기 초등"
            value={c.counts.to.toLocaleString()}
            unit="교"
            sub={delta === 0 ? undefined : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}`}
            tone={delta > 0 ? "up" : delta < 0 ? "down" : undefined}
          />
          <Stat label="구역 바뀜" value={String(c.counts.moved)} unit="곳" sub={`${YEAR}학년도`} />
          <Stat label={`정기전보 ${year}.3.1`} value={`D-${days}`} sub="희망지 1곳" />
        </div>
      </Card>

      {/* 머릿기사 */}
      {head && (
        <Card className="mt-3">
          <p className="text-[12px] font-semibold text-up">{YEAR}학년도 인사구역</p>
          <h1 className="mt-2 text-[22px] font-bold leading-snug tracking-[-0.03em]">
            {head.from} → {head.to} {head.list.length}곳, 지역가산 {head.bonusFrom.label} → {head.bonusTo.label}
          </h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed text-ink3">
            신설교는 3년 이내 을구역이다. 유예가 끝나 갑으로 돌아가면 현임교 근무년수의 50%가 전보년수에서 빠진다.
          </p>
          <ul className="mt-3.5 space-y-2 text-[13.5px]">
            {moves.slice(1).map((g) => (
              <li key={`${g.from}-${g.to}`} className="flex gap-2">
                <span aria-hidden className="text-ink3">
                  ▸
                </span>
                <span>
                  {g.list
                    .slice(0, 4)
                    .map((m) => `${m.city} ${m.school}`)
                    .join(" · ")}
                  {g.list.length > 4 && ` 외 ${g.list.length - 4}곳`} {g.from} → {g.to},{" "}
                  <em className={`not-italic font-semibold ${g.diff > 0 ? "text-up" : "text-down"}`}>
                    지역가산 {g.bonusFrom.label} → {g.bonusTo.label}
                  </em>
                </span>
              </li>
            ))}
            <li className="flex gap-2">
              <span aria-hidden className="text-ink3">
                ▸
              </span>
              <span>
                새로 오른 학교 {c.counts.opened}곳 —{" "}
                {c.opened
                  .slice(0, 3)
                  .map((o) => `${o.city} ${o.school}`)
                  .join(" · ")}
              </span>
            </li>
          </ul>
        </Card>
      )}

      {/* 구역별 학교 수 — 점 색은 지도 말풍선이 쓰는 값 그대로다(lib/map.ts) */}
      <Card className="mt-3">
        <CardHead>인사구역</CardHead>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {Object.entries(byArea)
            .sort((a, b) => b[1] - a[1])
            .map(([area, n]) => {
              const [a, g] = [area[0], area.slice(2) || null];
              const bonus = regionBonus(a, g);
              return (
                <li key={area} className="flex items-center gap-2 rounded-card bg-fill px-3 py-2.5 text-[13.5px]">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: areaColor("경기", a, g) }}
                  />
                  <span className="font-semibold">{area}</span>
                  <span className="text-[12px] text-ink3">지역가산 {bonus.label}</span>
                  <span className="ml-auto font-semibold tabular-nums">{n.toLocaleString()}</span>
                </li>
              );
            })}
        </ul>
      </Card>

      {/* 지원청 */}
      <Card className="mt-3">
        <CardHead
          aside={
            <Link href="/map" className="flex items-center gap-0.5 text-[13px] font-semibold text-key active:opacity-70">
              학교 찾기
              <ChevronRight size={15} strokeWidth={1.7} aria-hidden />
            </Link>
          }
        >
          교육지원청 {offices.length}곳
        </CardHead>
        <ul className="mt-3 flex flex-wrap gap-2">
          {offices.map((o) => (
            <li key={o}>
              <Link
                href={`/map?sido=경기&office=${encodeURIComponent(o)}`}
                className="glass-2 flex h-11 items-center rounded-full px-4 text-[13.5px] font-semibold text-ink2 active:opacity-80"
              >
                {o}
              </Link>
            </li>
          ))}
        </ul>
      </Card>

      <Source>
        출처 · {source.title}
        <br />
        {source.revision}
      </Source>
    </main>
  );
}
