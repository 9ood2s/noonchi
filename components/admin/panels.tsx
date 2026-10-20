"use client";

/**
 * 운영 화면의 다섯 칸 — 요약 · 학교 · 평가 · 회원 · 제보
 *
 * ⛔ **칸마다 자기 것을 자기가 받는다.** 화면이 열릴 때 여섯 곳을 한꺼번에 받으면
 *    회원 목록을 볼 생각이 없는 사람도 그것을 기다린다. 칸을 열 때 그 칸 것만 받는다.
 * ⛔ **실패를 화면이 버리지 않는다**(§11-2). 못 읽으면 「없습니다」가 아니라 **까닭을 적는다** —
 *    둘을 같은 그림으로 그리면 서버가 죽어도 화면은 평온해 보인다.
 * ⛔ **훅은 전부 맨 위에 둔다**(가드 ④). 조건부 `return` 아래에 훅을 두면 순서가 어긋난다.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, RotateCw, Search, Send } from "lucide-react";
import { Stat } from "@/components/glass";
import { StaffBadge } from "@/components/staff-badge";
import { BarChart, RankBars, type Bar } from "@/components/admin/chart";
import { toast } from "@/lib/toast";
import { REPORT_LABEL, type ReportKind } from "@/lib/report";
import { AXES } from "@/lib/ratings";
import { mapPath } from "@/lib/site";
import {
  ago, answerReport, n, readActivity, readDaily, readHourly, readMembers, readOverview,
  readReports, readSchoolRank, readSchoolRatings, shortDay, stamp,
  type Activity, type AdminReport, type Daily, type Hourly, type Member, type Overview,
  type SchoolRank, type SchoolRating,
} from "@/lib/admin";

/** 못 읽었을 때 그 자리에 적는 한 줄. ⛔ 빈 목록과 다르게 생겼어야 한다 */
function Failed({ why }: { why: string }) {
  return (
    <p className="flex items-start gap-1.5 rounded-card border border-divider bg-fill px-3 py-2.5 text-[12.5px] text-ink2">
      <AlertCircle size={14} strokeWidth={1.8} className="mt-[2px] shrink-0 text-up" aria-hidden />
      <span className="min-w-0">못 읽었습니다 · {why}</span>
    </p>
  );
}

/** 받는 중 · 빈 목록 — 둘을 가른다 */
const Waiting = () => <p className="px-1 py-3 text-[13px] text-ink3">받는 중</p>;
const Empty = ({ what }: { what: string }) => <p className="px-1 py-3 text-[13px] text-ink3">{what}이 아직 없습니다</p>;

/** 칸 머리줄 */
function Head({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex min-h-6 items-baseline gap-2">
      <h2 className="text-[13.5px] font-bold tracking-[-0.01em]">{children}</h2>
      {aside && <span className="ml-auto text-[11.5px] tabular-nums text-ink3">{aside}</span>}
    </div>
  );
}

/** 유리 판 하나 */
function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`glass mt-2.5 rounded-panel p-3.5 ${className}`}>{children}</section>;
}

/** 찾는 줄. ⛔ 44px 이다(§11-4) */
function Find({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="mt-2 flex min-h-11 items-center gap-2 rounded-card border border-divider bg-fill px-3">
      <Search size={15} strokeWidth={1.8} className="shrink-0 text-ink3" aria-hidden />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-ink3"
      />
    </label>
  );
}

/** 고르는 알약 줄 */
function Picks<T extends string>({ now, all, onPick }: { now: T; all: readonly T[]; onPick: (v: T) => void }) {
  return (
    <div className="mt-2 flex gap-1.5 overflow-x-auto">
      {all.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={now === v}
          onClick={() => onPick(v)}
          className={`flex h-11 shrink-0 items-center rounded-full px-3.5 text-[13px] font-semibold active:opacity-80 ${
            now === v ? "bg-[var(--key-fill)] text-white" : "border border-divider bg-fill text-ink2"
          }`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

// ── ① 요약 ──────────────────────────────────────────────────────────────────

const readSummary = () => Promise.all([readOverview(), readDaily(), readHourly(), readActivity()]);

export function SummaryPanel() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [daily, setDaily] = useState<Daily[]>([]);
  const [hourly, setHourly] = useState<Hourly[]>([]);
  const [acts, setActs] = useState<Activity[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** 다시 받는 중인가. ⛔ 두 번 눌러 두 번 부르지 않게 잠근다 */
  const [again, setAgain] = useState(false);

  const receive = useCallback(([o, d, h, a]: Awaited<ReturnType<typeof readSummary>>) => {
    setWhy(o.error ?? d.error ?? h.error ?? a.error ?? null);
    setOv(o.row);
    setDaily(d.rows);
    setHourly(h.rows);
    setActs(a.rows);
    setReady(true);
  }, []);
  const load = useCallback(async () => {
    setAgain(true);
    receive(await readSummary());
    setAgain(false);
  }, [receive]);

  useEffect(() => {
    let alive = true;
    void readSummary().then((result) => { if (alive) receive(result); });
    return () => { alive = false; };
  }, [receive]);

  /**
   * 막대로 옮긴다.
   * ⛔ **앞쪽의 아무 일도 없던 날들을 잘라낸다** — 60칸 중 56칸이 0이면 그림이 아니라 빈 줄이다.
   *    다만 **가운데의 0은 그대로 둔다**(첫 값이 있는 날부터 오늘까지 통째로). 그래야 쉰 날이 보인다.
   */
  const [visitBars, signupBars] = useMemo(() => {
    const from = daily.findIndex((d) => d.viewers > 0 || d.signups > 0 || d.ratings > 0 || d.watches > 0);
    const live = from < 0 ? daily.slice(-14) : daily.slice(from);
    const toBar = (pick: (d: Daily) => number): Bar[] =>
      live.map((d) => ({ label: shortDay(d.day), full: d.day.replace(/^\d+-0?(\d+)-0?(\d+)$/, "$1월 $2일"), value: pick(d) }));
    return [toBar((d) => d.viewers), toBar((d) => d.signups)];
  }, [daily]);

  const hourBars = useMemo<Bar[]>(
    () => hourly.map((h) => ({ label: `${h.hour}시`, full: `${h.hour}시대`, value: h.opens })),
    [hourly]
  );

  if (!ready) return <Waiting />;

  return (
    <>
      {why && <Panel><Failed why={why} /></Panel>}

      <Panel>
        <Head aside={
          <button
            type="button"
            onClick={() => void load()}
            disabled={again}
            className="flex min-h-11 items-center gap-1 px-1 text-[12px] font-semibold text-ink2 active:opacity-60 disabled:opacity-40"
          >
            <RotateCw size={13} strokeWidth={2} aria-hidden />
            다시 받기
          </button>
        }>
          지금까지
        </Head>
        {ov ? (
          <>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Stat label="회원" value={n(ov.members)} unit="명" sub={`실계정 ${n(ov.membersNamed)} · 손님 ${n(ov.membersGuest)}`} />
              <Stat label="오늘 가입" value={n(ov.signupsToday)} unit="명" sub={`7일 ${n(ov.signups7d)} · 30일 ${n(ov.signups30d)}`} />
              <Stat label="오늘 방문" value={n(ov.viewersToday)} unit="명" sub={`7일 ${n(ov.viewers7d)} · 누적 ${n(ov.viewersTotal)}`} />
              <Stat label="오늘 학교 열람" value={n(ov.opensToday)} unit="번" sub={`누적 ${n(ov.opensTotal)}번`} />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Stat label="본 학교" value={n(ov.schoolsSeen)} unit="곳" sub="한 번이라도 열린 학교" />
              <Stat label="별점" value={n(ov.ratings)} unit="건" sub={`${n(ov.ratedSchools)}곳 · ${n(ov.raters)}명이 남김`} />
              <Stat label="관심목록" value={n(ov.watches)} unit="건" sub={`${n(ov.watchers)}명이 담음`} />
              <Stat label="제보" value={n(ov.reports)} unit="건" sub={ov.reportsNew ? `안 읽은 것 ${n(ov.reportsNew)}` : "안 읽은 것 없음"} tone={ov.reportsNew ? "up" : undefined} />
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Stat label="소속교 정함" value={n(ov.homeSchools)} unit="명" sub="올해 기준" />
              <Stat label="경로 저장" value={n(ov.savedRoutes)} unit="건" sub="통근 길찾기" />
              <Stat label="다시 온 사람" value={n(ov.membersReturned)} unit="명" sub="가입 다음 날 이후 재방문" />
              <Stat
                label="가입 대비 방문"
                value={ov.members ? `${Math.round((ov.viewersTotal / ov.members) * 10) / 10}` : "—"}
                unit="배"
                sub="방문자는 가입 없이도 센다"
              />
            </div>
            {/* ⛔ 「방문자」가 무엇을 세는 값인지 화면이 스스로 적는다 — 안 적으면 전체 방문으로 읽힌다 */}
            <p className="mt-2 rounded-chip bg-fill px-3 py-2 text-[11.5px] leading-relaxed text-ink3">
              방문자 = <b className="font-semibold text-ink2">학교를 한 번이라도 연 사람</b>(브라우저 하나에 하루 한 번).
              홈·지도만 보고 나간 사람은 안 듭니다.
            </p>
          </>
        ) : (
          !why && <Empty what="수치" />
        )}
      </Panel>

      {/* ⛔ 두 그림을 한 축에 겹치지 않는다 — 방문자와 가입은 자릿수가 다르다. 나란히 둔다 */}
      <Panel>
        <Head>날짜별</Head>
        <div className="mt-1 grid gap-4 sm:grid-cols-2">
          <BarChart title="학교를 연 사람" unit="명" bars={visitBars} />
          <BarChart title="새로 가입한 사람" unit="명" bars={signupBars} />
        </div>
      </Panel>

      <Panel>
        <Head aside="서울 시각">언제 오나</Head>
        <BarChart title="시간대별 학교 열람" unit="번" bars={hourBars} />
      </Panel>

      <Panel>
        <Head aside={acts.length ? `최근 ${acts.length}건` : undefined}>활동 내역</Head>
        {/* ⛔ **누가 했는지는 안 낸다**(2026-08-24 확인 ③). 무엇이·언제·어느 학교에 셋뿐이다 */}
        <p className="mt-1 text-[11.5px] text-ink3">누가 남겼는지는 내지 않습니다 — 학교와 때만 봅니다</p>
        {acts.length === 0 ? (
          !why && <Empty what="활동" />
        ) : (
          <ul className="mt-1.5">
            {acts.map((a, i) => (
              <li key={a.kind + a.at + i} className="flex min-h-11 items-center gap-2 border-b border-divider py-2 last:border-0">
                <span className="w-11 shrink-0 rounded-chip bg-fill px-1.5 py-1 text-center text-[11px] font-semibold text-ink2">
                  {a.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">
                  {a.school ?? <span className="text-ink3">—</span>}
                  {a.sido && <span className="text-ink3"> · {a.sido}</span>}
                </span>
                {a.guest && <span className="shrink-0 text-[11px] text-ink3">손님</span>}
                <span className="shrink-0 text-[11.5px] tabular-nums text-ink3">{ago(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}

// ── ② 학교 순위 ─────────────────────────────────────────────────────────────

const RANK_BY = ["누적", "7일", "오늘", "관심"] as const;
type RankBy = (typeof RANK_BY)[number];

export function SchoolsPanel() {
  const [rows, setRows] = useState<SchoolRank[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [by, setBy] = useState<RankBy>("누적");
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await readSchoolRank();
      setWhy(r.error);
      setRows(r.rows);
      setReady(true);
    })();
  }, []);

  const shown = useMemo(() => {
    const pick = (s: SchoolRank) =>
      by === "7일" ? s.viewers7d : by === "오늘" ? s.viewersToday : by === "관심" ? s.watches : s.viewersTotal;
    const key = q.trim();
    return rows
      .filter((s) => !key || `${s.name ?? ""}${s.sido ?? ""}${s.city ?? ""}${s.office ?? ""}`.includes(key))
      .map((s) => ({ s, v: pick(s) }))
      // ⛔ 0인 학교는 그 줄에서 뺀다 — 「오늘」로 고르면 오늘 안 열린 학교가 900줄 따라온다
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v || b.s.viewersTotal - a.s.viewersTotal)
      .slice(0, 100);
  }, [rows, by, q]);

  if (!ready) return <Waiting />;

  return (
    <Panel>
      <Head aside={rows.length ? `열린 학교 ${n(rows.length)}곳` : undefined}>학교 순위</Head>
      {why && <div className="mt-2"><Failed why={why} /></div>}
      <Picks now={by} all={RANK_BY} onPick={setBy} />
      <Find value={q} onChange={setQ} placeholder="학교 · 시·도 · 지원청" />

      {shown.length === 0 ? (
        !why && <Empty what="그 조건에 맞는 학교" />
      ) : (
        <>
          <p className="mt-2 text-[11.5px] text-ink3">
            {by === "관심" ? "관심목록에 담은 사람" : "학교를 연 사람"} 순 · 위에서 {shown.length}곳
          </p>
          <RankBars
            unit={by === "관심" ? "명" : "명"}
            rows={shown.map(({ s, v }) => ({
              key: s.stdCode,
              name: s.name ?? s.stdCode,
              sub: [s.sido, s.city, s.office && `${s.office}지원청`].filter(Boolean).join(" · ") || null,
              value: v,
              tail: [
                s.watches ? `관심 ${s.watches}` : null,
                s.ratingsN ? `별점 ${s.ratingsN}건 ${s.score ?? "—"}` : null,
              ].filter(Boolean).join(" · ") || null,
            }))}
            /** 누르면 지도에서 그 학교를 연다 — 운영이 본 것을 바로 확인할 수 있게 */
            onPick={(code) => {
              const s = rows.find((r) => r.stdCode === code);
              if (s?.sido) window.open(mapPath(s.sido, code), "_blank", "noopener");
            }}
          />
        </>
      )}
    </Panel>
  );
}

// ── ③ 학교별 평가 ───────────────────────────────────────────────────────────

export function RatingsPanel() {
  const [rows, setRows] = useState<SchoolRating[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await readSchoolRatings();
      setWhy(r.error);
      setRows(r.rows);
      setReady(true);
    })();
  }, []);

  const shown = useMemo(() => {
    const key = q.trim();
    return rows.filter((s) => !key || `${s.name ?? ""}${s.sido ?? ""}${s.city ?? ""}${s.office ?? ""}`.includes(key));
  }, [rows, q]);

  if (!ready) return <Waiting />;

  return (
    <Panel>
      <Head aside={rows.length ? `${n(rows.length)}곳` : undefined}>학교별 평가</Head>
      {why && <div className="mt-2"><Failed why={why} /></div>}
      {/* ⛔ **표본수를 내는 곳은 이제 여기뿐이다**(2026-08-24 · §12-173).
          교사 화면은 한 명이 남겨도 평균을 내되 **몇 명인지는 안 적는다** — 운영은 그걸 봐야 한다 */}
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink3">
        표본수는 <b className="font-semibold text-ink2">이 화면에서만</b> 보입니다 —
        교사 화면은 한 명이 남겨도 평균을 내되 몇 명인지는 안 적습니다
      </p>
      <Find value={q} onChange={setQ} placeholder="학교 · 시·도 · 지원청" />

      {shown.length === 0 ? (
        !why && <Empty what="별점" />
      ) : (
        <ul className="mt-2">
          {shown.map((s) => (
            <li key={s.stdCode} className="border-b border-divider py-2.5 last:border-0">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em]">
                  {s.name ?? s.stdCode}
                </span>
                {/* ⛔ 표본이 적은 줄을 옅게 둔다 — 「1건짜리 평균」을 한눈에 가리기 위해서다.
                    ⛔ 「교사 화면에는 안 뜸」을 뗐다(2026-08-24) — 이제 거기도 1건부터 뜬다 */}
                <span className={`shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  s.n < 3 ? "bg-fill-2 text-ink3" : "bg-fill text-ink2"
                }`}>
                  표본 {s.n}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[11.5px] text-ink3">
                {[s.sido, s.city, s.office && `${s.office}지원청`].filter(Boolean).join(" · ")}
                {s.viewers > 0 && ` · 연 사람 ${n(s.viewers)}명`}
                {s.firstYear && ` · 근무 ${s.firstYear}~${s.lastYear}`}
              </p>
              {/* 여섯 축 — ⛔ `AXES` 를 그대로 돈다. 축을 늘려도 이 화면은 안 고친다(§11-3) */}
              <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                {AXES.map((ax) => {
                  const v = s[ax.key];
                  return (
                    <div key={ax.key} className="rounded-chip bg-fill px-2 py-1.5">
                      <p className="truncate text-[10.5px] font-medium text-ink3">{ax.label}</p>
                      <p className="mt-0.5 text-[15px] font-bold leading-none tabular-nums">
                        {v == null ? <span className="text-ink3">—</span> : v.toFixed(2)}
                      </p>
                      {/* 5점 만점 눈금 — 숫자만 있으면 3.17이 높은지 낮은지 안 잡힌다 */}
                      <span className="mt-1 block h-[4px] w-full overflow-hidden rounded-full bg-fill-2">
                        <span
                          className="block h-full rounded-full bg-[var(--key-fill)]"
                          style={{ width: v == null ? "0%" : `${(v / 5) * 100}%` }}
                        />
                      </span>
                    </div>
                  );
                })}
              </div>
              {s.nAccess < s.n && (
                /* ⛔ 접근성은 2026-08-23 에 생긴 축이라 그 전 별점에는 없다. 표본이 다르다고 적는다 */
                <p className="mt-1 text-[11px] text-ink3">접근성만 표본 {s.nAccess} — 2026년 8월 23일에 생긴 축입니다</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── ④ 회원 ──────────────────────────────────────────────────────────────────

const WHO = ["전체", "실계정", "손님", "활동함"] as const;
type WhoPick = (typeof WHO)[number];

export function MembersPanel() {
  const [rows, setRows] = useState<Member[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pick, setPick] = useState<WhoPick>("전체");
  const [q, setQ] = useState("");

  useEffect(() => {
    void (async () => {
      const r = await readMembers();
      setWhy(r.error);
      setRows(r.rows);
      setReady(true);
    })();
  }, []);

  const shown = useMemo(() => {
    const key = q.trim();
    return rows.filter((m) => {
      if (pick === "실계정" && m.guest) return false;
      if (pick === "손님" && !m.guest) return false;
      if (pick === "활동함" && !(m.ratings || m.watches || m.reports || m.savedRoutes)) return false;
      if (!key) return true;
      return `${m.nickname ?? ""}${m.email ?? ""}${m.homeSchool ?? ""}`.includes(key);
    });
  }, [rows, pick, q]);

  if (!ready) return <Waiting />;

  return (
    <Panel>
      <Head aside={rows.length ? `${n(rows.length)}명` : undefined}>회원</Head>
      {why && <div className="mt-2"><Failed why={why} /></div>}
      {/* ⛔ **조회만 하는 곳이라고 적는다.** 지우는 단추가 없는 것이 실수가 아니라 정한 것이다 */}
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink3">
        보기만 합니다 · 메일은 앞 두 글자만 남깁니다 · 지우기·바꾸기는 여기에 두지 않습니다
      </p>
      <Picks now={pick} all={WHO} onPick={setPick} />
      <Find value={q} onChange={setQ} placeholder="닉네임 · 메일 · 소속교" />

      {shown.length === 0 ? (
        !why && <Empty what="그 조건에 맞는 회원" />
      ) : (
        <ul className="mt-2">
          {shown.map((m) => (
            <li key={m.userId} className="border-b border-divider py-2.5 last:border-0">
              <div className="flex items-baseline gap-1.5">
                <span className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em]">
                  {m.nickname ?? <span className="font-normal text-ink3">닉네임 없음</span>}
                </span>
                {m.staff && m.staffLabel && <StaffBadge label={m.staffLabel} />}
                {m.guest && (
                  <span className="shrink-0 rounded-chip bg-fill-2 px-1.5 py-0.5 text-[10.5px] font-semibold text-ink3">
                    손님
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-ink3">{ago(m.joinedAt)} 가입</span>
              </div>

              <p className="mt-0.5 truncate text-[12px] text-ink3">
                {m.email ?? "메일 없음"}
                {!m.guest && ` · ${m.provider}`}
                {m.homeSchool && ` · ${m.homeSchool}`}
              </p>

              {/* 활동 — ⛔ 0은 옅게. 있는 것과 없는 것이 한눈에 갈려야 한다 */}
              <p className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11.5px] tabular-nums">
                {([["별점", m.ratings], ["관심", m.watches], ["제보", m.reports], ["경로", m.savedRoutes]] as const).map(
                  ([label, v]) => (
                    <span key={label} className={v ? "text-ink2" : "text-ink3 opacity-50"}>
                      {label} {v}
                    </span>
                  )
                )}
                <span className="text-ink3">마지막 활동 {ago(m.lastActAt)}</span>
                <span className="text-ink3">마지막 로그인 {ago(m.lastSignInAt)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ── ⑤ 제보 ──────────────────────────────────────────────────────────────────

const KINDS = ["전체", "안 읽음", "오류 수정", "예상 TO", "인사 관련 문서"] as const;
type KindPick = (typeof KINDS)[number];

export function ReportsPanel() {
  const [rows, setRows] = useState<AdminReport[]>([]);
  const [why, setWhy] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [pick, setPick] = useState<KindPick>("전체");
  /** 지금 답장을 쓰고 있는 제보와 그 글 */
  const [at, setAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  /** 못 보냈으면 그 까닭을 그 줄에 남긴다(§11-2) */
  const [sendFailed, setSendFailed] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await readReports();
    setWhy(r.error);
    setRows(r.rows);
    setReady(true);
  }, []);

  useEffect(() => {
    let alive = true;
    void readReports().then((r) => {
      if (!alive) return;
      setWhy(r.error);
      setRows(r.rows);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const shown = useMemo(() => {
    if (pick === "전체") return rows;
    if (pick === "안 읽음") return rows.filter((r) => r.status !== "done");
    return rows.filter((r) => REPORT_LABEL[r.kind as ReportKind] === pick);
  }, [rows, pick]);

  /** 답장을 달고 처리 상태를 옮긴다. ⛔ 실패를 화면이 버리지 않는다(§11-2) */
  const answer = async (id: string, done: boolean) => {
    setSending(true);
    setSendFailed(null);
    const r = await answerReport(id, text, done);
    setSending(false);
    if ("error" in r) {
      setSendFailed(r.error);
      return toast("답장을 못 보냈습니다", "fail");
    }
    setAt(null);
    setText("");
    toast(done ? "반영으로 넘겼습니다" : "답장을 달았습니다");
    await load();
  };

  if (!ready) return <Waiting />;

  return (
    <Panel>
      <Head aside={rows.length ? `${n(rows.length)}건` : undefined}>받은 제보</Head>
      {why && <div className="mt-2"><Failed why={why} /></div>}
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink3">
        오류 수정 · 예상 TO · 인사 관련 문서 · 답장은 보낸 사람의 마이페이지에 뜹니다
      </p>
      <Picks now={pick} all={KINDS} onPick={setPick} />

      {shown.length === 0 ? (
        !why && <Empty what="제보" />
      ) : (
        <ul className="mt-2">
          {shown.map((r) => (
            <li key={r.id} className="border-b border-divider py-2.5 last:border-0">
              <div className="flex items-baseline gap-1.5">
                <span className="shrink-0 rounded-chip bg-fill px-1.5 py-0.5 text-[11px] font-semibold text-ink2">
                  {REPORT_LABEL[r.kind as ReportKind] ?? r.kind}
                </span>
                {r.status === "done" && (
                  <span className="shrink-0 rounded-chip border border-key px-1.5 py-0.5 text-[10.5px] font-semibold text-key">
                    반영
                  </span>
                )}
                <span className="ml-auto shrink-0 text-[11.5px] tabular-nums text-ink3">{stamp(r.createdAt)}</span>
              </div>

              <p className="mt-1 whitespace-pre-wrap break-words text-[13.5px] leading-relaxed">{r.body}</p>

              <p className="mt-1 truncate text-[11.5px] text-ink3">
                {[r.nickname, r.email, r.school, r.sido, r.page, r.files ? `파일 ${r.files}개` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>

              {r.reply && (
                <p className="mt-1.5 rounded-card bg-fill px-2.5 py-2 text-[12.5px] leading-relaxed text-ink2">
                  <b className="font-semibold">답장</b> · {r.reply}
                </p>
              )}

              {at === r.id ? (
                <div className="mt-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    aria-label="답장"
                    rows={3}
                    className="w-full rounded-card border border-divider bg-fill px-3 py-2 text-[14px] outline-none focus:border-key"
                  />
                  {sendFailed && <div className="mt-1.5"><Failed why={sendFailed} /></div>}
                  <div className="mt-1.5 flex gap-1.5">
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void answer(r.id, false)}
                      className="flex min-h-11 flex-1 items-center justify-center rounded-card border border-divider bg-fill-2 text-[13px] font-semibold active:opacity-70 disabled:opacity-40"
                    >
                      답장만
                    </button>
                    <button
                      type="button"
                      disabled={sending}
                      onClick={() => void answer(r.id, true)}
                      className="flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-card bg-[var(--key-fill)] text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-40"
                    >
                      <Send size={14} strokeWidth={2} aria-hidden />
                      답장 · 반영
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAt(null); setSendFailed(null); }}
                      className="min-h-11 shrink-0 px-3 text-[13px] text-ink3 active:opacity-60"
                    >
                      그만두기
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => { setAt(r.id); setText(r.reply ?? ""); setSendFailed(null); }}
                  className="mt-1.5 flex min-h-11 items-center text-[13px] font-semibold text-key active:opacity-60"
                >
                  {r.reply ? "답장 고치기" : "답장 달기"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
