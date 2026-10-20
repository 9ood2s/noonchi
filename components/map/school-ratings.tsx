"use client";

/**
 * 학교 상세에 붙는 별점 — **읽는 쪽**.  근거 = docs/DESIGN.md §6
 *
 * ⛔ 여기서는 오각형을 쓰지 않는다. 오각형은 **넣을 때**만 쓴다(누르기 쉬우니까).
 *    읽을 때는 구글 지도 리뷰처럼 **높은 평가부터 낮은 평가 순**으로 줄을 세운다 —
 *    처음 보는 그림을 해독하게 하지 않고, 무엇이 좋고 무엇이 나쁜지 한 줄에 읽힌다.
 *
 * ⛔ 공공데이터와 갈라 보여준다(CLAUDE.md §2). **갈라 두는 것은 자리로 한다** — 별점은 표 밖의 딴 칸이다.
 * ⛔⛔ **표본수를 적지 않는다**(2026-08-24 사장님 — 「한명이라도 평가하면 그대로 내보내.
 *    그리고 몇명이 평가했는지는 표기하지 말고」). 문턱을 없앤 것과 **한 벌**이다 —
 *    문턱이 없는 채로 「표본 1」을 적으면 그 한 사람이 누구인지 좁혀진다.
 * ⛔ **아무도 안 남겼으면 「아직 평가가 없습니다」다.** 「자료가 부족하다」가 아니다 —
 *    부족은 「있는데 모자라다」로 읽히고, 지금은 **없는 것**이다.
 * ⛔ 실패를 화면이 버리지 않는다(§11-2).
 * ⛔ 유리 패널 **안쪽** 칸이다 — 여기에 glass/glass-2 를 또 붙이지 않는다.
 *    유리 위에 유리를 겹치면 실효 불투명이 올라가 글자가 안 읽힌다.
 *    채움은 bg-fill · bg-fill-2, 구분선은 border-divider 까지만 쓴다.
 */

import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { AXES, ratingsOf, type AxisKey, type RatingAvg, type RatingByYear } from "@/lib/ratings";

type Got = { avg: RatingAvg | null; byYear: RatingByYear[]; history: number; error: string | null };

export function SchoolRatings({ stdCode, onSurvey }: { stdCode: string | null; onSurvey: (rated: number) => void }) {
  const [result, setResult] = useState<{ stdCode: string; got: Got } | null>(null);
  const got = result?.stdCode === stdCode ? result.got : null;
  const [openYears, setOpenYears] = useState(false);
  useEffect(() => {
    if (!stdCode) return;
    let alive = true;
    ratingsOf(stdCode)
      .then((r) => alive && setResult({ stdCode, got: r }))
      .catch((e: unknown) => alive && setResult({ stdCode, got: { avg: null, byYear: [], history: 0, error: e instanceof Error ? e.message : "별점을 못 읽었습니다" } }));
    return () => { alive = false; };
  }, [stdCode]);

  if (!stdCode) return null;

  /**
   * 구글 지도 리뷰처럼 높은 것부터. 좋은 게 뭐고 나쁜 게 뭔지 한눈에 갈린다.
   * ⛔ **값이 없는 축(`null`)은 맨 뒤로 보낸다.** 접근성처럼 나중에 생긴 축은 옛 별점에 값이 없다.
   *    `-1` 로 견주면(점수는 1~5) 없는 축이 늘 꼴찌가 되고, 있는 축끼리의 순서는 그대로다.
   */
  const score = (r: RatingAvg, k: AxisKey) => r[k] ?? -1;
  const ranked = got?.avg
    ? [...AXES].sort((a, b) => score(got.avg!, b.key as AxisKey) - score(got.avg!, a.key as AxisKey))
    : [];

  return (
    <section className="mt-4 rounded-card border border-divider p-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-sm font-bold">별점</h3>
        {/* ⛔ 「교사 입력」이라는 딱지를 안 붙인다(2026-08-23 사장님 — 「교사 입력 이런것도」).
            공공데이터와 갈라 두는 것은 **자리**로 한다(§2) — 별점은 표 밖에 따로 선 칸이다.
            ⛔ **표본수도 안 적는다**(2026-08-24 사장님). 전에 여기 「표본 N」이 있었다 —
               문턱을 없앤 지금 그 수를 적으면 한 사람짜리 평균이 그대로 드러난다. */}
      </div>

      {got?.error && <p className="mt-2 text-xs text-up">{got.error}</p>}

      {/* ⛔ **없다는 것만 적는다**(2026-08-24 사장님 — 「평가가 없는 학교는 그냥 평가가 아직 없다고
          띄워주고」). 문턱이 없으므로 여기 오는 것은 **정말로 아무도 안 남긴 학교**뿐이다 —
          「부족하다」로 적으면 있는데 모자란 것처럼 읽힌다. */}
      {got && !got.error && !got.avg && (
        <p className="mt-2 text-xs text-ink3">아직 평가가 없습니다</p>
      )}

      {got?.avg && (
        <>
          <ul className="mt-2.5 space-y-2">
            {ranked.map((a) => {
              const v = got.avg![a.key as AxisKey];
              return (
                <li key={a.key} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-xs">{a.label}</span>
                  {/* ⛔ 값이 없으면 막대를 안 채우고 숫자 자리에 「—」를 둔다.
                      ⛔ 0으로 채우지 않는다 — 0점을 준 것과 안 고른 것은 다르다(§11-1 의 결). */}
                  <span className="h-2 min-w-0 flex-1 rounded-full bg-fill-2" aria-hidden>
                    {v != null && (
                      <span
                        className="block h-full rounded-full bg-foreground"
                        style={{ width: `${Math.max(4, Math.min(100, ((v - 1) / 4) * 100))}%` }}
                      />
                    )}
                  </span>
                  <span className="w-8 shrink-0 text-right text-xs font-medium tabular-nums">
                    {v == null ? <span className="text-ink3">—</span> : v.toFixed(1)}
                  </span>
                </li>
              );
            })}
          </ul>

          {got.byYear.length > 0 ? (
            <>
              <button
                type="button"
                onClick={() => setOpenYears((v) => !v)}
                aria-expanded={openYears}
                className="mt-2.5 text-xs text-ink3 underline active:opacity-60"
              >
                근무 시작 연도별 {got.byYear.length}칸
              </button>
              {openYears && (
                <ul className="mt-1.5 divide-y divide-divider border-t border-divider text-xs">
                  {got.byYear.map((y) => (
                    <li key={y.started_year} className="flex items-center gap-2 py-1.5 tabular-nums">
                      <span className="w-12 shrink-0 text-ink3">{y.started_year}년</span>
                      {AXES.map((a) => {
                        const v = y[a.key as AxisKey];
                        return (
                          <span key={a.key} className="flex-1 text-center">
                            {v == null ? <span className="text-ink3">—</span> : v.toFixed(1)}
                          </span>
                        );
                      })}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            /* ⛔ 문턱이 없으므로 평균이 있으면 연도별도 반드시 한 칸은 있다.
               그래도 자리를 남긴다 — 뷰가 바뀌어 안 올 때 화면이 조용히 비지 않게. */
            <p className="mt-2.5 text-xs text-ink3">연도별 — 아직 평가가 없습니다</p>
          )}
        </>
      )}

      {/* ⛔ 「다시 묻지 않기」를 걷어내서 갈래가 하나가 됐다(2026-08-23 사장님 · `school-survey.tsx`).
          전에는 그 상자를 켜 둔 학교에서만 작은 글씨로 권했는데, 상자 자체가 없어졌다. */}
      <button
        type="button"
        onClick={() => onSurvey(got?.avg?.n ?? got?.history ?? 0)}
        className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-card border border-divider bg-fill py-2.5 text-sm font-medium active:opacity-70"
      >
        <Star size={14} aria-hidden />
        {(got?.history ?? 0) === 0 ? "첫 번째 평가 남기기" : "근무 경험 남기기"}
      </button>
    </section>
  );
}
