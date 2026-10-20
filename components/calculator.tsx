"use client";

/**
 * 경기 전보년수 계산기 — M 시안(`docs/DESIGN.md §12-52`)으로 맞췄다(2026-08-22).
 * ⛔ **계산은 한 줄도 안 건드렸다.** 규칙은 `lib/transfer.mjs` 한 곳에 있고
 *    `npm run selftest:transfer` 가 지킨다. 여기는 생김새만이다.
 * ⛔ 결과 카드는 **맨 위에 둔다.** 입력하는 대로 바뀌는 값이라, 시안처럼 아래에 두면
 *    폰에서 입력하는 동안 답이 화면 밖으로 나간다.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { transferYears, toMonths, label, MIN_MONTHS } from "@/lib/transfer.mjs";
import { areaLabel } from "@/lib/areas.mjs";
import { Card, CardHead, Chip, NumField } from "@/components/glass";

export type Pick = { name: string; city: string | null; office: string; area: string; areaGrade: string | null };

const AWARDS = ["없음", "교육감", "장관", "총리이상"] as const;

export function Calculator({ schools }: { schools: Pick[] }) {
  const [q, setQ] = useState("");
  const [school, setSchool] = useState<Pick | null>(null);
  const [manualArea, setManualArea] = useState<string>("갑");
  const [more, setMore] = useState(false);
  /**
    * ⛔ **기본값을 지어내지 않는다.** 전에는 `serviceY: 3` 이 박혀 있어서 아무것도 안 넣었는데
    *    「전보년수 3년」이 답처럼 떠 있었다(2026-08-23 사장님이 짚었다).
    *    0부터 시작하고, 넣기 전에는 숫자 대신 「—」를 둔다.
    */
  const [f, setF] = useState({
    serviceY: 0, serviceM: 0,
    headY: 0, grade6Y: 0,
    couple: false, threeChildren: false, twoInfants: false,
    award: "없음" as (typeof AWARDS)[number],
    smallSchool: false, headExcluded: false,
    circuitY: 0, inclusiveY: 0, combinedY: 0, centerY: 0,
    innovation: "none" as "none" | "before2017" | "from2017", innovationY: 0,
    practiceY: 0, multiculturalY: 0, nulbomY: 0,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  const hits = useMemo(() => {
    const s = q.trim();
    if (!s) return [];
    return schools.filter((x) => x.name.includes(s) || (x.city ?? "").includes(s)).slice(0, 8);
  }, [q, schools]);

  /** 현임교 근무년수를 넣기 전에는 답이 없다 — 가산만으로는 전보년수가 아니다 */
  const entered = f.serviceY > 0 || f.serviceM > 0;

  const area = school?.area ?? manualArea;
  const areaGrade = school?.areaGrade ?? null;

  const r = useMemo(
    () =>
      transferYears({
        area, areaGrade, smallSchool: f.smallSchool,
        serviceMonths: toMonths(f.serviceY, f.serviceM),
        headTeacherMonths: toMonths(f.headY), headTeacherExcluded: f.headExcluded,
        grade6Months: toMonths(f.grade6Y),
        circuitMonths: toMonths(f.circuitY), inclusiveMonths: toMonths(f.inclusiveY),
        combinedClassMonths: toMonths(f.combinedY), centerMonths: toMonths(f.centerY),
        innovationSchool: f.innovation, innovationMonths: toMonths(f.innovationY),
        practiceSchoolMonths: toMonths(f.practiceY), multiculturalMonths: toMonths(f.multiculturalY),
        nulbomMonths: toMonths(f.nulbomY),
        coupleOfficials: f.couple, threeChildren: f.threeChildren, twoInfants: f.twoInfants,
        award: f.award,
      }),
    [area, areaGrade, f]
  );

  return (
    <div>
      {/* 결과 — 이 화면이 답하려는 것 하나. 파랑으로 채우고 가장 크게 (M 규칙 4) */}
      <section className="rounded-panel border border-white/40 bg-[var(--key-fill)] p-5 text-white shadow-[var(--glass-shadow-2)]">
        <p className="text-[12px] font-semibold text-white/90">전보년수</p>
        <p className="mt-1.5 text-[44px] font-extrabold leading-none tracking-[-0.04em] tabular-nums">
          {entered ? label(r.months) : "—"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <span className="rounded-card bg-[rgb(3_20_50/0.26)] px-3 py-2.5">
            <span className="block text-[11.5px] font-semibold text-white/90">현임교</span>
            <b className="mt-0.5 block text-[16px] font-bold tabular-nums">{entered ? label(r.base) : "—"}</b>
          </span>
          <span className="rounded-card bg-[rgb(3_20_50/0.26)] px-3 py-2.5">
            <span className="block text-[11.5px] font-semibold text-white/90">가산년수</span>
            <b className="mt-0.5 block text-[16px] font-bold tabular-nums">{label(r.addMonths)}</b>
          </span>
        </div>
        {school && <p className="mt-3 text-[12px] font-semibold text-white/90">{areaLabel(area, areaGrade)}</p>}
        {entered && !r.canApply && (
          <p role="alert" className="mt-3 rounded-chip bg-[rgb(3_20_50/0.3)] px-3 py-2 text-[12.5px]">
            현임교 {label(MIN_MONTHS)} 이상부터 내신할 수 있습니다
          </p>
        )}
      </section>

      {/* 현임교 */}
      <Card className="mt-3">
        <CardHead>현임교</CardHead>
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
                    <span className="ml-auto text-[12px] font-semibold tabular-nums text-ink2">{areaLabel(s.area, s.areaGrade)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!school && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              {["갑", "을", "병"].map((a) => (
                <Chip key={a} on={manualArea === a} onClick={() => setManualArea(a)}>
                  {a}구역
                </Chip>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* 근무년수 */}
      <Card className="mt-3">
        <CardHead>현임교 근무년수</CardHead>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumField label="년" value={f.serviceY} onChange={(v) => set("serviceY", v)} max={40} />
          <NumField label="월" value={f.serviceM} onChange={(v) => set("serviceM", v)} max={11} />
          <NumField label="부장교사 (년)" value={f.headY} onChange={(v) => set("headY", v)} max={40} />
          <NumField label="6학년 담임 (년)" value={f.grade6Y} onChange={(v) => set("grade6Y", v)} max={40} />
        </div>
      </Card>

      {/* 가산년수 */}
      <Card className="mt-3">
        <CardHead aside={<b className="text-[14px] font-bold tabular-nums">{label(r.addMonths)}</b>}>가산년수</CardHead>

        <div className="mt-3 flex flex-wrap gap-2">
          <Chip on={f.couple} onClick={() => set("couple", !f.couple)}>부부공무원</Chip>
          <Chip on={f.threeChildren} onClick={() => set("threeChildren", !f.threeChildren)}>세 자녀 이상</Chip>
          <Chip on={f.twoInfants} onClick={() => set("twoInfants", !f.twoInfants)}>영유아 2명</Chip>
          <Chip on={f.smallSchool} onClick={() => set("smallSchool", !f.smallSchool)}>5학급 이하·분교장</Chip>
        </div>

        <p className="mt-4 text-[12px] font-medium text-ink3">표창</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {AWARDS.map((a) => (
            <Chip key={a} on={f.award === a} onClick={() => set("award", a)}>{a}</Chip>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMore(!more)}
          aria-expanded={more}
          className="mt-4 flex min-h-11 w-full items-center justify-between rounded-card border border-divider bg-fill px-3.5 text-[13.5px] font-semibold active:opacity-70"
        >
          <span>그 밖의 가산</span>
          <ChevronDown size={18} strokeWidth={1.7} className={more ? "rotate-180" : ""} aria-hidden />
        </button>

        {more && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <NumField label="순회담당 (년)" value={f.circuitY} onChange={(v) => set("circuitY", v)} max={40} />
            <NumField label="통합학급 (년)" value={f.inclusiveY} onChange={(v) => set("inclusiveY", v)} max={40} />
            <NumField label="복식학급 (년)" value={f.combinedY} onChange={(v) => set("combinedY", v)} max={40} />
            <NumField label="특수·Wee센터 (년)" value={f.centerY} onChange={(v) => set("centerY", v)} max={40} />
            <NumField label="교육실습학교 (년)" value={f.practiceY} onChange={(v) => set("practiceY", v)} max={40} />
            <NumField label="다문화 특별학급 (년)" value={f.multiculturalY} onChange={(v) => set("multiculturalY", v)} max={40} />
            <NumField label="늘봄전담실장 (년)" value={f.nulbomY} onChange={(v) => set("nulbomY", v)} max={40} />
            <NumField label="혁신학교 (년)" value={f.innovationY} onChange={(v) => set("innovationY", v)} max={40} />
            <div className="col-span-2 flex flex-wrap gap-2">
              {(["none", "before2017", "from2017"] as const).map((k) => (
                <Chip key={k} on={f.innovation === k} onClick={() => set("innovation", k)}>
                  {k === "none" ? "혁신학교 아님" : k === "before2017" ? "2017 이전 지정" : "2017부터 지정"}
                </Chip>
              ))}
              <Chip on={f.headExcluded} onClick={() => set("headExcluded", !f.headExcluded)}>지역승진가산점 대상교</Chip>
            </div>
          </div>
        )}
      </Card>

      {/* 가산 내역 */}
      <Card className="mt-3">
        <CardHead>가산 내역</CardHead>
        {r.parts.length === 0 ? (
          <p className="mt-2.5 text-[13.5px] text-ink3">가산 없음</p>
        ) : (
          <ul className="mt-3">
            {r.parts.map((p) => (
              <li key={p.label} className="flex items-baseline gap-2 border-b border-divider py-2.5 text-[13.5px]">
                <span>{p.label}</span>
                {p.note && <span className="text-[12px] text-ink3">{p.note}</span>}
                {p.altLabel && <span className="text-[12px] tabular-nums text-ink3">{p.altLabel}</span>}
                <span className="ml-auto font-semibold tabular-nums">{label(p.months)}</span>
              </li>
            ))}
            <li className="flex items-baseline gap-2 py-2.5 text-[13.5px] font-bold">
              <span>가산년수</span>
              <span className="ml-auto tabular-nums">{label(r.addMonths)}</span>
            </li>
          </ul>
        )}
      </Card>
    </div>
  );
}
