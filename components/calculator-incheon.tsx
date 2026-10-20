"use client";

/**
 * 인천 전보 순위 점수 — M 시안(`docs/DESIGN.md §12-52`)으로 맞췄다(2026-08-22).
 * ⛔ **계산은 한 줄도 안 건드렸다.** 규칙은 `lib/transfer-incheon.mjs` 한 곳에 있고
 *    `npm run selftest:incheon` 이 지킨다. 여기는 생김새만이다.
 */

import { useMemo, useState } from "react";
import { transferScore, toMonths, score, ratingPointInMonths } from "@/lib/transfer-incheon.mjs";
import { incheonGradeLabel } from "@/lib/areas.mjs";
import { Card, CardHead, NumField } from "@/components/glass";

export type Pick = { name: string; city: string | null; office: string; area: string; areaGrade: string | null };

export function CalculatorIncheon({ schools }: { schools: Pick[] }) {
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<Pick | null>(null);
  const [f, setF] = useState({
    cityY: 10, cityM: 0,
    officeY: 4, officeM: 0,
    sameY: 2, sameM: 0,
    step: 25,
    districtBonus: 0,   // 지원청 세부기준 가산점 — 우리가 규칙을 모르니 교사가 직접 넣는다
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const hits = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return schools.filter((x) => x.name.includes(s) || (x.city ?? "").includes(s)).slice(0, 8);
  }, [q, schools]);

  const r = useMemo(
    () =>
      transferScore({
        cityMonths: toMonths(f.cityY, f.cityM),
        officeMonths: toMonths(f.officeY, f.officeM),
        sameSchoolMonths: toMonths(f.sameY, f.sameM),
        step: f.step,
        rating: null,   // ⛔ 교사가 알 수 없는 값이라 묻지 않는다 — 늘 범위로 낸다
        districtBonus: f.districtBonus,
      }),
    [f]
  );

  return (
    <div>
      {/*
        결과 — 파랑으로 채운다(M 규칙 4).
        ⛔ 이 점수는 **교육지원청간(청간) 전보** 순위다 — 시 기준 제11조 ②.
           같은 지원청 안(관내) 전보는 산식이 아예 다르다(지원청 세부기준 — 근무성적 조정점 50% + 가산점).
           무엇을 재는 점수인지 안 적으면 관내 점수로 읽힌다(2026-08-21 사장님 지적).
      */}
      <section className="rounded-panel border border-white/40 bg-[var(--key-fill)] p-5 text-white shadow-[var(--glass-shadow-2)]">
        <p className="text-[12px] font-semibold text-white/90">교육지원청간 전보 순위 점수</p>
        {/* ⛔ 늘 범위다. 근무성적(최대 10점)을 교사가 알 수 없어 한 점으로 못 찍는다 */}
        <p className="mt-1.5 text-[40px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
          {score(r.min)}<span className="mx-1.5 text-[24px] font-semibold text-white/70">~</span>{score(r.max)}
          <span className="ml-1 text-[20px] font-bold">점</span>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <span className="rounded-card bg-[rgb(3_20_50/0.26)] px-3 py-2.5">
            <span className="block text-[11.5px] font-semibold text-white/90">근속 · 호봉</span>
            <b className="mt-0.5 block text-[16px] font-bold tabular-nums">{score(r.known)}점</b>
          </span>
          <span className="rounded-card bg-[rgb(3_20_50/0.26)] px-3 py-2.5">
            <span className="block text-[11.5px] font-semibold text-white/90">근무성적</span>
            <b className="mt-0.5 block text-[16px] font-bold tabular-nums">0~10점</b>
          </span>
        </div>
        {school && <p className="mt-3 text-[12px] font-semibold text-white/90">{incheonGradeLabel(school.areaGrade)}</p>}
        {!r.canApply && (
          <p role="alert" className="mt-3 rounded-chip bg-[rgb(3_20_50/0.3)] px-3 py-2 text-[12.5px]">
            동일교 1년 이상부터 교육지원청간 전보를 낼 수 있습니다
          </p>
        )}
        {/*
          ⛔ 청간 전보에서는 **학교를 고르지 못한다** — 관내 인사가 끝난 뒤 남은 자리에
             휴복직 → 청간이동 → 신규 순으로 배정된다(2026-08-21 사장님).
             여기서 학교를 고르는 것은 **급지를 보려는 것**이지 그 학교로 간다는 뜻이 아니다.
        */}
        <p className="mt-3 text-[11.5px] leading-relaxed text-white/80">
          청간 전보는 지원청까지만 고른다 · 학교는 남은 자리로 배정
        </p>
        <p className="mt-1 text-[11.5px] leading-relaxed text-white/80">
          같은 지원청 안 전보는 산식이 다르다 — 근무성적 조정점 50% + 지원청 가산점
        </p>
      </section>

      {/* 현임교 */}
      <Card className="mt-3">
        <CardHead>현임교 · 급지</CardHead>
        <div className="mt-3">
          <input
            value={school ? `${school.name} · ${school.city}` : q}
            onChange={(e) => { setSchool(null); setQ(e.target.value); }}
            placeholder="학교 이름"
            className="h-11 w-full rounded-card border border-divider bg-fill px-3.5 text-base outline-none focus:border-key"
          />
          {!school && hits.length > 0 && (
            <ul className="glass glass-thick mt-2 overflow-hidden rounded-card">
              {hits.map((s) => (
                <li key={`${s.city}-${s.name}`} className="border-b border-divider last:border-0">
                  <button
                    type="button"
                    onClick={() => { setSchool(s); setQ(""); }}
                    className="flex min-h-11 w-full items-center gap-2 px-3.5 py-2 text-left active:bg-fill"
                  >
                    <span className="text-[15px] font-bold tracking-[-0.02em]">{s.name}</span>
                    <span className="text-[12px] text-ink3">{s.city} · {s.office}</span>
                    <span className="ml-auto text-[12px] font-semibold tabular-nums text-ink2">{incheonGradeLabel(s.areaGrade)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      {/* 근속 · 호봉 */}
      <Card className="mt-3">
        <CardHead>근속 · 호봉</CardHead>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumField label="인천시교육청 근속 (년)" value={f.cityY} onChange={(v) => set("cityY", v)} max={45} />
          <NumField label="인천시교육청 근속 (월)" value={f.cityM} onChange={(v) => set("cityM", v)} max={11} />
          <NumField label="지금 지원청 근속 (년)" value={f.officeY} onChange={(v) => set("officeY", v)} max={45} />
          <NumField label="지금 지원청 근속 (월)" value={f.officeM} onChange={(v) => set("officeM", v)} max={11} />
          <NumField label="동일교 근무 (년)" value={f.sameY} onChange={(v) => set("sameY", v)} max={45} />
          <NumField label="동일교 근무 (월)" value={f.sameM} onChange={(v) => set("sameM", v)} max={11} />
          <NumField label="호봉 (1월 1일 현재)" value={f.step} onChange={(v) => set("step", v)} max={45} />
        </div>
      </Card>

      {/* ⛔ 지원청 세부기준 가산점은 우리가 원문을 못 가졌다. 없는 규칙을 지어내지 않고 직접 받는다.
          무엇이 빠졌는지도 함께 적는다 — 안 적으면 이 점수가 전부인 줄 안다. */}
      <Card className="mt-3">
        <CardHead>교육지원청 가산점</CardHead>
        <div className="mt-3">
          <NumField
            label="점"
            value={f.districtBonus}
            onChange={(v) => set("districtBonus", v)}
            max={50}
            step={0.01}
          />
        </div>
        <dl className="mt-4 border-t border-divider pt-3.5 text-[12px] text-ink3">
          <dt className="font-semibold text-foreground">이 계산에 안 들어간 것</dt>
          <dd className="mt-1 leading-relaxed">
            학년부장 · 통합학급 · 그 밖 지원청 가산점 — 인천은 시교육청 기준(제24·25조)이
            급지 지정 · 동일교 근무기간 · 가산점을 교육지원청 세부기준으로 넘긴다
          </dd>
          <dt className="mt-3 font-semibold text-foreground">근무성적은 묻지 않습니다</dt>
          <dd className="mt-1 leading-relaxed tabular-nums">
            교사 본인이 알 수 없는 값이다 · 조정점 1점 = 근속 {ratingPointInMonths(1)}달 ·
            평정점 1점(조정점 10점) = 근속 {ratingPointInMonths(10)}달
          </dd>
        </dl>
      </Card>

      {/* ⛔ **근무성적은 묻지 않는다.** 교사 개인이 알 수 없는 값이다(2026-08-21 사장님).
          교사들끼리 이야기가 되는 값은 가산점이다. 그래서 점수는 늘 **범위**로 낸다 —
          근무성적 최종 조정점 0~100 이 만드는 폭(0~10점)만큼이다.
          ⛔ 규칙에서 뺀 것이 아니다. `lib/transfer-incheon.mjs` 는 그대로 100점 척도로 셈한다. */}

      {/* 점수 내역 */}
      <Card className="mt-3">
        <CardHead>점수 내역</CardHead>
        <ul className="mt-3">
          {r.parts.map((p) => (
            <li key={p.label} className="flex items-baseline gap-2 border-b border-divider py-2.5 text-[13.5px]">
              <span>{p.label}</span>
              {p.note && <span className="text-[12px] text-ink3">{p.note}</span>}
              <span className="ml-auto font-semibold tabular-nums">{score(p.hundredths)}</span>
            </li>
          ))}
          <li className="flex items-baseline gap-2 py-2.5 text-[13.5px] font-bold">
            <span>합계</span>
            <span className="ml-auto tabular-nums">{score(r.min)} ~ {score(r.max)}</span>
          </li>
        </ul>
        <p className="mt-3 text-[12px] leading-relaxed text-ink3">
          동점이면 생년월일이 빠른 순입니다. 인천은 지역가산이 없고 인사구역은 근무연한만 가릅니다.
        </p>
      </Card>
    </div>
  );
}
