"use client";

/**
 * 학교를 누르면 뜨는 설문.  근거 = docs/DESIGN.md §6 · §9
 *
 * 흐름 — **한 화면에 물음 하나.** 「다음」으로 넘어가고 「뒤로」로 돌아온다.
 *   ① 근무 이력        (아무도 안 남긴 학교면 「남긴 사람 없음」)
 *   ② 근무 시작 · 근무 끝
 *   ③ 간 방법          (고르면 바로 다음으로 넘어간다)
 *   ④ 별점 (선택) — 오각형에서 눌러 채운다
 *
 * ⛔ 물음을 한 화면에 쌓지 않는다. 쌓으면 알약이 한 자리에 몰려 무엇을 고르는 칸인지 안 보인다.
 *    연도처럼 고를 것이 많은 물음은 알약을 펴 두지 않고 **드롭다운**으로 접는다.
 * ⛔ 건너뛰기를 늘 열어 둔다. 막으면 지도를 보러 온 사람이 되돌아 나간다.
 * ⛔ 별점은 **선택**이다. 근무 이력만 남겨도 「몇 명이 거쳐 갔나」로 쓸모가 있다.
 * ⛔ 실패를 화면이 버리지 않는다(§11-2). 못 넣었으면 넣은 척하지 않는다.
 *
 * 겉면 — 지도 위에 뜨므로 단색으로 덮지 않는다. 큰 판은 `glass glass-thick`,
 *   판 안쪽 칸은 `bg-fill`. ⛔ 안쪽 칸에 유리를 또 겹치지 않는다(글자가 안 읽힌다).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { ensureGuest, isGuest } from "@/lib/auth/anon";
import { AXES, AXIS_KEYS, schoolYearNow, unlockDate, type AxisKey } from "@/lib/ratings";
import { Pentagon } from "@/components/pentagon";
import { Portal } from "@/components/portal";
import { toast } from "@/lib/toast";

/** 그 학교에 간 방법. ⛔ 표시만 한다 — 평균을 가르지 않는다. */
const ROUTES = ["정기", "비정기", "신규발령", "기간제", "그 밖"] as const;
const ROUTE_HINT: Partial<Record<(typeof ROUTES)[number], string>> = { 비정기: "복직 등" };

type Step = "ask" | "when" | "route" | "stars" | "done";

/** 묻는 차례. 온보딩은 「지금 계신 학교」라 ①을 건너뛰고 "when" 부터 선다. */
const FLOW: Step[] = ["ask", "when", "route", "stars"];

/**
 * 고를 수 있는 최근 연도 — 10년치.
 * ⛔ 폰에서 숫자 자판을 열고 네 자리를 치는 것보다 눌러 고르는 게 훨씬 빠르다.
 */
const RECENT = 10;

/** 그 이전 연도를 직접 넣겠다는 표시. 연도 숫자와 섞이지 않게 문자열로 둔다. */
const OLDER = "older";
const STILL = "still";

/**
 * ⛔ 올해 값은 숫자 대신 **「현재 근무중」** 이라고 적는다.
 *    올해 간 사람은 당연히 지금 그 학교에 있으므로, 연도를 보여 주고 또 물으면 두 번 묻는 꼴이다.
 *    그보다 앞선 해를 고른 사람에게만 「지금도 있나」를 묻는다.
 */

/**
 * 펼침을 누른 단추 아래에 앉힌다. **대화상자가 잘라내지 못하게 화면 기준(fixed)으로 놓는다.**
 * ⛔ `left`·`top` 으로 옮긴다. `transform` 은 펼침 애니메이션(.pop)이 쓰고 있어서 여기서 건드리면 지워진다.
 * (components/map/map-controls.tsx 의 필터 칩과 같은 방식이다)
 */
const place = (btn: HTMLElement | null) => (el: HTMLDivElement | null) => {
  if (!el || !btn) return;
  const b = btn.getBoundingClientRect();
  const M = 8;
  el.style.top = `${Math.max(M, Math.min(b.bottom + M, window.innerHeight - el.offsetHeight - M))}px`;
  el.style.left = `${Math.max(M, Math.min(b.left, window.innerWidth - el.offsetWidth - M))}px`;
};

/** 고르는 줄 하나 — 44px 이상. 손가락으로 눌러야 한다(§11-4) */
function Row({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3 text-left text-sm active:bg-fill"
    >
      <span className="min-w-0 flex-1">{children}</span>
      {on ? <Check size={16} className="shrink-0 text-key" aria-hidden /> : <span className="w-4 shrink-0" aria-hidden />}
    </button>
  );
}

/**
 * 드롭다운 하나 — 닫혀 있을 때 「무엇을 고르는 칸인지(라벨) + 지금 고른 값」을 보여준다.
 * ⛔ 여는 단추에는 유리를 안 쓴다. 이미 유리 판 안이라 겹치면 글자가 안 읽힌다 — `bg-fill` 로 둔다.
 */
function Select({
  label, value, items, picked, onPick, width = "w-44",
}: {
  label: string;
  /** 닫혀 있을 때 칸에 적는 값 */
  value: string;
  items: { key: string; label: string }[];
  picked: string;
  onPick: (key: string) => void;
  width?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex h-11 w-full items-center gap-2 rounded-chip bg-fill pl-3.5 pr-3 active:bg-fill-2 ${
          open ? "ring-2 ring-key" : ""
        }`}
      >
        <span className="shrink-0 text-[11.5px] font-medium text-ink3">{label}</span>
        <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold tabular-nums">{value}</span>
        <ChevronDown size={15} className={`shrink-0 text-ink3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {/* ⛔ 펼침은 대화상자 **밖(body)** 에 그린다. 대화상자에 걸린 흐림(backdrop-filter)이
          그 안의 `fixed` 자리를 대화상자 기준으로 바꿔 버려서, 안에 두면 화면 좌표가 어긋나고
          `overflow-y-auto` 에 잘린다. 밖으로 내면 화면 기준 좌표가 그대로 산다.
          ⛔ 그래도 리액트 트리에서는 이 자리의 자식이라 클릭이 대화상자까지만 올라간다(뒤가 안 닫힌다). */}
      {open && createPortal(
        <>
          {/* 바깥을 누르면 닫힌다. 폰에서 손가락으로 닫을 자리가 있어야 한다 */}
          <button type="button" aria-label="닫기" onClick={() => setOpen(false)} className="fixed inset-0 z-60 cursor-default" />
          <div
            ref={place(btn.current)}
            className={`glass glass-thick pop fixed z-60 max-h-[60vh] overflow-y-auto overscroll-contain rounded-panel p-2 ${width}`}
          >
            {items.map((it) => (
              <Row key={it.key} on={picked === it.key} onClick={() => { onPick(it.key); setOpen(false); }}>
                {it.label}
              </Row>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

export function SchoolSurvey({
  stdCode, name, rated, onClose, start = "ask", frame = true,
}: {
  stdCode: string;
  name: string;
  /** 이 학교에 별점을 남긴 사람 수. 0 이면 「처음」 */
  rated: number;
  onClose: () => void;
  /** 온보딩은 「지금 계신 학교」라 근무 여부를 다시 묻지 않는다 */
  start?: Step;
  /** 겉 상자(덮개·모서리)를 여기서 그릴지. 온보딩은 제 상자를 이미 갖고 있다 */
  frame?: boolean;
}) {
  const thisYear = schoolYearNow();
  const RECENT_YEARS = Array.from({ length: RECENT }, (_, i) => thisYear - i);

  const [step, setStep] = useState<Step>(start);
  /** 최근 10년보다 오래됐나 — 그때만 숫자를 직접 받는다 */
  const [older, setOlder] = useState(false);
  const [startedYear, setStartedYear] = useState(thisYear);
  const [still, setStill] = useState(true);
  const [endedYear, setEndedYear] = useState(thisYear);
  const [route, setRoute] = useState<(typeof ROUTES)[number] | null>(null);
  const [scores, setScores] = useState<Partial<Record<AxisKey, number>>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  /*
   * ⛔ **「이 학교 다시 묻지 않기」를 걷어냈다**(2026-08-23 사장님 — 「이게 의미가 있을까?
   *    그냥 강제하는 것도 아니고 평가 결과도 저장되는디. **학교 탭 누를때마다 뜨는 것도 아니고**」).
   *    맞는 지적이다 — 이 창은 「평가 남기기」를 눌러야만 뜬다. **누르지 않으면 안 뜬다.**
   *    안 뜨는 것을 「다시 묻지 않기」로 또 끄게 하는 것은 아무것도 안 막으면서 칸만 하나 늘린 것이었다.
   * ⛔ `lib/ask-again.ts` 도 같이 지웠다 — 이 상자 하나만 쓰던 것이라 남기면 죽은 코드가 된다.
   */
  /**
   * **열자마자 막혔는지 본다** (2026-08-23 사장님 — 「별점을 이미 남겼으면 **근무 경험 남기기
   * 단계에서부터 락을 걸어야지.** 설문다하고나서 남겼다 그러면 좀 그렇잖아」).
   *
   * ⛔ 전에는 **저장할 때에야** 알았다. 근무 시작 연도 · 간 방법 · 별점 다섯을 다 찍고 나서
   *    「이미 남기셨습니다」가 떴다 — 사람이 한 일을 통째로 버리게 한다.
   * ⛔ **확인하려고 손님 열쇠를 새로 받지 않는다.** 열쇠가 없으면 남긴 것도 없다.
   *    그냥 둘러보는 사람에게 계정을 만들지 않는다는 규칙(`lib/auth/anon.ts`)이 그대로다.
   * ⛔ **판정은 표가 한다.** 이건 헛걸음을 줄이는 미리보기라, 못 읽으면 그냥 진행시킨다 —
   *    막아 두면 멀쩡한 사람이 못 남긴다. 그때는 예전처럼 저장에서 걸린다.
   */
  const [locked, setLocked] = useState<null | "석장참">(null);
  /**
   * 올해 이 학교에 이미 남겼나 — 남겼으면 **고치는 것**이다(2026-08-23 사장님 「평가만 수정하기로」).
   * ⛔ 전에는 잠갔다. 잠금이 막는 것은 「자기 표 한 장을 바꾸는 것」인데 1인 1표라 그건 한 표고,
   *    잠가서 생기는 손해는 **잘못 찍은 값이 1년 내내 평균에 남는 것**이었다(§12-149).
   */
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = authClient();
        const { data: me } = await supabase.auth.getUser();
        if (!me.user) return;
        const [mineRes, yearRes] = await Promise.all([
          supabase
            .from("ratings")
            // ⛔ 축 이름을 손으로 적지 않는다 — 축을 늘리면 여기만 옛 목록으로 남는다(§11-3).
            //    실제로 2026-08-23 에 「접근성」을 더할 때 이 줄 하나가 뒤처져 있었다.
            .select(AXIS_KEYS.join(", "))
            .eq("std_code", stdCode)
            .eq("school_year", thisYear)
            .maybeSingle(),
          supabase
            .from("ratings")
            .select("std_code", { count: "exact", head: true })
            .eq("school_year", thisYear),
        ]);
        if (!alive) return;
        if (mineRes.data) {
          // ⛔ 옛 값을 채워 둔다. 빈 별을 다시 찍게 하면 「고치기」가 아니라 「처음부터」다
          const was = mineRes.data as unknown as Record<string, number>;
          setScores(Object.fromEntries(AXES.map((a) => [a.key, was[a.key]])) as Partial<Record<AxisKey, number>>);
          setEditing(true);
          setStep("stars");
        } else if ((yearRes.count ?? 0) >= 3) {
          setLocked("석장참");
        }
      } catch {
        // 미리보기라 조용히 둔다 — 막힌 사람은 저장에서 걸리고, 안 막힌 사람은 그대로 남긴다
      }
    })();
    return () => { alive = false; };
  }, [stdCode, thisYear]);

  /** 답하지 않고 나갈 때. 켜 뒀으면 이 학교를 다시 안 권한다 */
  const leave = useCallback(() => {
    onClose();
  }, [onClose]);

  const filled = AXES.filter((a) => scores[a.key]).length;
  const allStars = filled === AXES.length;

  /** 지금 몇 번째인지 — 시작 지점부터 센다 */
  const steps = FLOW.slice(Math.max(0, FLOW.indexOf(start)));
  const at = steps.indexOf(step);

  const save = useCallback(
    async (withStars: boolean) => {
      setBusy(true);
      setFailed(null);

      const guest = await ensureGuest();
      if (!isGuest(guest)) {
        setFailed(guest.error);
        setBusy(false);
        return;
      }

      const row: Record<string, unknown> = {
        user_id: guest.id,
        std_code: stdCode,
        started_year: startedYear,
        ended_year: still ? null : endedYear,
        route,
      };
      if (withStars) for (const a of AXES) row[a.key] = scores[a.key];

      // ⛔ 실패는 두 꼴로 온다 — 서버가 답하거나, 요청이 끊겨 던진다(§11-2)
      let error: { message?: string; code?: string } | null = null;
      try {
        /**
         * ⛔ 고치는 중이면 **별점만** 바꾼다(사장님 「평가만 수정하기로」).
         *    근무 시작 연도·간 방법은 사실이라 고치는 화면에서 다시 묻지 않는다.
         * ⛔ 뼈대(누가·어느 학교·어느 학년도)는 표의 트리거가 옛 값으로 되돌린다 —
         *    화면이 뭘 보내든 안 바뀐다.
         */
        const q = authClient().from("ratings");
        const r = editing
          ? await q
              .update(Object.fromEntries(AXES.map((a) => [a.key, scores[a.key]])))
              .eq("std_code", stdCode)
              .eq("school_year", thisYear)
          : await q.insert(row);
        error = r.error;
      } catch (e: unknown) {
        error = { message: e instanceof Error ? e.message : String(e) };
      }

      setBusy(false);
      if (error) {
        if (error.code === "23505") setFailed("이 학교는 이미 남기셨습니다");
        else if (error.message?.includes("최대 3개 학교")) setFailed(error.message);
        else setFailed(error.message ?? "저장하지 못했습니다");
        return;
      }
      setStep("done");
      toast(editing ? "평가를 고쳤습니다" : "평가를 남겼습니다");
    },
    [stdCode, startedYear, still, endedYear, route, scores, thisYear, editing],
  );

  /** 연도 드롭다운에 세울 것들 — 최근 10년 + 「그 이전」 */
  /** 전입연도 — 최근 10년을 담고, 그보다 오래면 직접 넣는다 */
  const inItems = [
    ...RECENT_YEARS.map((y) => ({ key: String(y), label: String(y) })),
    { key: OLDER, label: "그 이전" },
  ];
  const inPicked = older ? OLDER : String(startedYear);

  /**
   * 전출연도 — 「현재 근무 중」과 **전입연도부터 올해까지**.
   * ⛔ 전입보다 앞선 해를 고를 수 있게 두지 않는다. 목록에서 아예 뺀다 —
   *    막고 나서 알리는 것보다 애초에 없는 편이 짧다.
   * ⛔ **전입연도부터 올라가는 차례로 적는다.** 전입에서 2021을 고른 사람이 전출을 열었을 때
   *    2026이 먼저 나오면 방금 고른 값과 이어지지 않아 「또 처음부터 고르라는 건가」로 읽힌다.
   * ⛔ 전입 목록에는 「현재 근무 중」을 안 넣는다 — 그 말이 두 칸에 다 있으면 무엇을 묻는지 흐려진다.
   */
  const outItems = [
    { key: STILL, label: "현재 근무 중" },
    ...Array.from({ length: Math.max(0, thisYear - startedYear + 1) }, (_, i) => startedYear + i).map((y) => ({
      key: String(y),
      label: String(y),
    })),
  ];
  const outPicked = still ? STILL : String(endedYear);

  const body = (
    <>
        {frame && (
          <div className="flex items-start gap-3">
            <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">{name}</h2>
            <button type="button" onClick={step === "ask" ? leave : onClose} aria-label="닫기" className="-mr-1 -mt-1 p-2 text-ink3 active:opacity-60">
              <X size={20} aria-hidden />
            </button>
          </div>
        )}

        {/* 지금 몇 번째인지 — 점으로만 보인다. ⛔ 문장으로 설명하지 않는다 */}
        {at >= 0 && (
          <div className="mt-3 flex items-center gap-2">
            {at > 0 ? (
              <button
                type="button" onClick={() => setStep(steps[at - 1])} aria-label="뒤로"
                className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-chip text-ink3 active:bg-fill"
              >
                <ChevronLeft size={20} aria-hidden />
              </button>
            ) : (
              <span className="size-11 shrink-0" aria-hidden />
            )}
            <span role="img" aria-label={`${at + 1} / ${steps.length}`} className="flex flex-1 items-center justify-center gap-1.5">
              {steps.map((s, i) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all ${i === at ? "w-5 bg-foreground" : "w-1.5 bg-fill-2"}`}
                  aria-hidden
                />
              ))}
            </span>
            <span className="size-11 shrink-0" aria-hidden />
          </div>
        )}

        {/* ⛔ 막혔으면 **묻지 않는다.** 물어 놓고 마지막에 튕기는 것이 사장님이 짚은 자리다 */}
        {locked && (
          <>
            {/* ⛔ 「남긴 사람 없음」을 안 적는다(2026-08-23 사장님 「남긴 사람 없음 삭제」).
                아무도 안 남긴 학교가 대부분인데, 그 줄이 **처음 온 사람에게 빈 곳이라고 알리는 꼴**이다.
                셋 이상일 때만 값이 되므로(§6) 0을 굳이 말할 까닭이 없다. */}
            {rated > 0 && <p className="mt-1 text-sm text-ink3 tabular-nums">남긴 사람 {rated}명</p>}
            <p className="mt-4 rounded-card border border-line px-3.5 py-3 text-sm leading-relaxed">
              한 학년도에 세 곳까지 남깁니다 · {unlockDate(thisYear)}에 다시 남깁니다
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 min-h-11 w-full rounded-card bg-fill text-sm active:bg-fill-2"
            >
              닫기
            </button>
          </>
        )}

        {!locked && step === "ask" && (
          <>
            {rated > 0 && <p className="mt-1 text-sm text-ink3 tabular-nums">남긴 사람 {rated}명</p>}
            <p className="mt-4 text-base font-medium">이 학교 근무 이력</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setStep("when")} className="min-h-11 rounded-card bg-foreground py-3 text-sm font-medium text-background active:opacity-70">
                있다
              </button>
              <button type="button" onClick={leave} className="min-h-11 rounded-card bg-fill py-3 text-sm active:bg-fill-2">
                없다
              </button>
            </div>

            <button type="button" onClick={leave} className="mt-3 min-h-11 w-full py-2 text-sm text-ink3 active:opacity-60">
              건너뛰기
            </button>
          </>
        )}

        {!locked && step === "when" && (
          <>
            {/* ⛔ 숫자를 타이핑하게 하지 않는다 — 폰에서 숫자 자판을 열고 네 자리를 치는 것보다
                눌러 고르는 게 훨씬 빠르다. 최근 10년을 드롭다운에 담고, 그보다 오래면 직접 넣는다.
                ⛔ **전입과 전출을 한 줄에 나란히 둔다**(2026-08-22 사장님). 전에는 시작만 드롭다운이고
                   끝은 「현재 근무 중」 알약 + 숫자 칸이라, 무엇을 묻는 칸인지 한눈에 안 보였다.
                   교사가 쓰는 말 그대로 전입·전출이다(CLAUDE.md §4). */}
            <p className="mt-4 text-base font-medium">근무 기간</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  label="전입" value={String(startedYear)} items={inItems} picked={inPicked} width="w-44"
                  onPick={(k) => {
                    if (k === OLDER) { setOlder(true); return; }
                    setOlder(false);
                    const y = Number(k);
                    setStartedYear(y);
                    // ⛔ 전출이 전입보다 앞선 채로 남지 않게 끌어올린다
                    if (!still && endedYear < y) setEndedYear(y);
                  }}
                />
              </div>
              <span className="shrink-0 text-sm text-ink3" aria-hidden>~</span>
              <div className="min-w-0 flex-1">
                <Select
                  label="전출" value={still ? "현재 근무 중" : String(endedYear)} items={outItems} picked={outPicked} width="w-44"
                  onPick={(k) => {
                    if (k === STILL) { setStill(true); return; }
                    setStill(false);
                    setEndedYear(Number(k));
                  }}
                />
              </div>
            </div>

            {older && (
              <input
                type="number" inputMode="numeric" min={1980} max={thisYear - RECENT}
                value={startedYear}
                onChange={(e) => setStartedYear(Number(e.target.value) || RECENT_YEARS[RECENT_YEARS.length - 1])}
                aria-label="전입 연도"
                className="mt-2 h-11 w-28 rounded-chip bg-fill px-3 text-base tabular-nums outline-none focus:ring-2 focus:ring-key"
              />
            )}

            <button
              type="button" onClick={() => setStep("route")}
              className="mt-6 min-h-11 w-full rounded-card bg-foreground py-3.5 text-base font-medium text-background active:opacity-70"
            >
              다음
            </button>
          </>
        )}

        {!locked && step === "route" && (
          <>
            {/* 다섯뿐이라 알약으로 둔다 — 한 화면에 이 물음 하나만 서 있어 몰려 보이지 않고,
                다섯을 한눈에 견줘 고르는 편이 접었다 펴는 것보다 빠르다.
                ⛔ 고르면 바로 다음으로 넘어간다. 되돌리려면 「뒤로」로 온다. */}
            <p className="mt-4 text-base font-medium">간 방법</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {ROUTES.map((r) => (
                <button
                  key={r} type="button" onClick={() => { setRoute(r); setStep("stars"); }} aria-pressed={route === r}
                  className={`min-h-11 rounded-chip px-4 text-sm active:opacity-70 ${
                    route === r ? "bg-foreground text-background" : "bg-fill"
                  }`}
                >
                  {r}
                  {ROUTE_HINT[r] && <span className="ml-1 text-xs opacity-70">{ROUTE_HINT[r]}</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {!locked && step === "stars" && (
          <>
            <div className="mt-3 flex items-baseline justify-between">
              <p className="text-base font-medium">별점</p>
              <p className="text-xs text-ink3 tabular-nums">{filled} / {AXES.length} · 1 나쁨 · 5 좋음</p>
            </div>
            <div className="mt-1">
              <Pentagon values={scores} onChange={(k, v) => setScores((p) => ({ ...p, [k]: v }))} label={`${name} 별점 고르기`} />
            </div>

            {/* ⛔ 「제출 뒤 수정 — 2027년 3월 1일 부터」를 지웠다(2026-08-23 사장님).
                **틀린 말이 되어 있었다** — 2026-08-23 에 잠금을 풀어서(§12-149) 지금은 언제든 고친다.
                고칠 수 있다는 말은 다 남긴 뒤(`done`)에 한 번 적는 것으로 족하다. */}

            <button
              type="button" onClick={() => save(true)} disabled={!allStars || busy}
              className="mt-3 min-h-11 w-full rounded-card bg-foreground py-3.5 text-base font-medium text-background active:opacity-70 disabled:opacity-40"
            >
              {busy ? "보내는 중" : "제출"}
            </button>
            <button type="button" onClick={() => save(false)} disabled={busy} className="mt-2 min-h-11 w-full py-2 text-sm text-ink3 active:opacity-60">
              별점 없이 남기기
            </button>
          </>
        )}

        {/* ⛔ 실패를 화면이 버리지 않는다(§11-2). 어느 단계에서 났든 여기 한 자리에 남는다 */}
        {failed && step !== "done" && (
          <p role="alert" className="mt-3 rounded-chip border border-up px-3 py-2.5 text-sm text-up">{failed}</p>
        )}

        {step === "done" && (
          <>
            <p className="mt-4 text-base font-medium">남겼습니다</p>
            {/* ⛔ 「…까지 두 곳 더 남길 수 있습니다」를 지웠다(2026-08-23 사장님).
                남은 개수를 세어 알리는 것은 **더 남기라고 미는 말**이다. 남긴 사람에게 할 말이 아니다. */}
            {editing && <p className="mt-1.5 text-sm text-ink3">언제든 다시 고칠 수 있습니다</p>}
            <button type="button" onClick={onClose} className="mt-5 min-h-11 w-full rounded-card bg-fill py-3 text-sm active:bg-fill-2">
              닫기
            </button>
          </>
        )}
    </>
  );

  if (!frame) return body;

  // ⛔ Portal 로 <body> 아래에 건다. 이 대화상자는 **유리 패널 안에서** 불린다 —
  //    유리(backdrop-filter) 안의 fixed 는 화면이 아니라 그 유리 칸을 기준으로 잡혀 갇힌다.
  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          role="dialog"
          aria-label={`${name} 설문`}
          onClick={(e) => e.stopPropagation()}
          className="glass glass-modal max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-panel p-5 sm:rounded-panel"
        >
          {body}
        </div>
      </div>
    </Portal>
  );
}
