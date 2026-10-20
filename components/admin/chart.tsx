"use client";

/**
 * 운영 화면이 쓰는 그림 둘 — 세로 막대(때·날짜별)와 가로 막대(순위)
 *
 * ⛔ **새 패키지를 안 쓴다**(2026-08-24 사장님 out of scope). 그려 주는 라이브러리를 붙이는 대신
 *    `div` 의 높이·너비 백분율로 그린다. SVG 를 쓰면 폭이 바뀔 때 둥근 끝이 찌그러지는데,
 *    HTML 상자는 어느 폭에서도 모서리가 그대로다.
 *
 * ⛔⛔ **값을 호버 뒤에 숨기지 않는다**(CLAUDE.md §11-4). 마우스는 지나가기만 해도 값을 주지만
 *    **손가락은 누르기 전까지 아무 신호가 없다.** 그래서 막대는 **단추**이고, 누르면 위 머리줄에
 *    그 값이 뜬다. 처음에는 마지막 칸이 골라져 있어 아무것도 안 눌러도 숫자 하나는 늘 보인다.
 *
 * ⛔ **세로축을 둘로 쪼개지 않는다.** 방문자와 신규가입은 자릿수가 달라서 한 그림에 겹치면
 *    작은 쪽이 바닥에 붙어 안 보이거나, 두 축을 그려 서로 다른 눈금을 같은 높이로 읽게 만든다.
 *    **그림을 나란히 여러 장 두는 쪽**을 쓴다 — 같은 가로축(날짜)을 공유하므로 눈이 저절로 맞춘다.
 *
 * ⛔ **색은 하나다**(시안 M 규칙 4 · `components/glass.tsx`). 계열이 하나뿐이라 범례가 필요 없고,
 *    무엇을 재는 그림인지는 머리줄이 적는다. 글자는 색을 입지 않는다 — 늘 글자 토큰이다.
 */

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/** 막대 하나가 가리키는 것 */
export type Bar = {
  /** 가로축에 적는 짧은 말 — 「8. 24.」 · 「14시」 */
  label: string;
  /** 골랐을 때 머리줄에 적는 온전한 말 — 「8월 24일」 */
  full: string;
  value: number;
};

/**
 * 세로 막대.
 *
 * ⛔ **0인 칸을 빼지 않는다.** 값이 있는 날만 그리면 가로 간격이 거짓말을 한다 —
 *    사흘 쉬었다 온 날이 바로 다음 날처럼 붙어 보인다. 0은 0 높이로 그대로 둔다.
 * ⛔ 눈금선을 긋지 않는다. 최댓값 하나를 오른쪽 위에 적는 것으로 갈음한다 —
 *    막대가 60개까지 가는 좁은 칸에서 가로줄은 읽는 것을 돕지 못하고 밀도만 올린다.
 */
export function BarChart({
  title,
  unit,
  bars,
  /** 값이 0인 칸도 아주 얇게 그린다. 눌러야 하는 자리가 사라지지 않게 */
  minTrack = true,
}: {
  title: string;
  unit: string;
  bars: Bar[];
  minTrack?: boolean;
}) {
  /** 고른 칸. ⛔ 처음에는 **마지막 칸**이다 — 가장 최근이 사람이 제일 먼저 보고 싶은 값이다 */
  const [at, setAt] = useState<number | null>(null);
  const i = at != null && at < bars.length ? at : bars.length - 1;
  const picked = bars[i];
  const max = Math.max(1, ...bars.map((b) => b.value));

  if (!bars.length) return null;

  return (
    <div className="min-w-0">
      <div className="flex min-h-6 items-baseline gap-2">
        <h3 className="text-[12px] font-medium text-ink3">{title}</h3>
        <span className="ml-auto text-[11.5px] tabular-nums text-ink3">최다 {max.toLocaleString("ko-KR")}</span>
      </div>

      {/* 고른 칸의 값 — ⛔ 그림 **위**에 둔다. 아래에 두면 막대를 누른 손가락이 그 줄을 가린다 */}
      <div className="mt-0.5 flex items-center gap-1.5">
        <p className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="text-[19px] font-bold leading-none tracking-[-0.03em] tabular-nums">
            {picked.value.toLocaleString("ko-KR")}
          </span>
          <span className="text-[12px] font-medium text-ink3">{unit}</span>
          <span className="truncate text-[12px] text-ink3">· {picked.full}</span>
        </p>

        {/*
          ⛔⛔ **막대만으로는 폰에서 못 고른다**(CLAUDE.md §11-4). 60칸이면 390px 폭에서
             막대 하나가 **6px** 이다 — 손가락은 그보다 훨씬 굵다. 24칸(시간대)도 15px 밖에 안 된다.
             그래서 **44px 짜리 이동 단추**를 함께 둔다. 막대를 눌러 대충 고르고 이것으로 맞춘다.
          ⛔ 막대를 없애고 이것만 두지는 않는다 — 넓은 화면에서는 바로 누르는 편이 빠르다.
        */}
        <span className="flex shrink-0">
          {([["prev", -1, ChevronLeft], ["next", 1, ChevronRight]] as const).map(([name, step, Icon]) => {
            const to = i + step;
            const can = to >= 0 && to < bars.length;
            return (
              <button
                key={name}
                type="button"
                disabled={!can}
                onClick={() => setAt(to)}
                aria-label={step < 0 ? "앞 칸" : "뒤 칸"}
                className="flex size-11 items-center justify-center rounded-full text-ink2 active:bg-fill disabled:opacity-25"
              >
                <Icon size={17} strokeWidth={2} aria-hidden />
              </button>
            );
          })}
        </span>
      </div>

      {/*
        ⛔ 막대 사이를 띄운다. 붙여 두면 이웃한 두 칸이 한 덩어리로 읽힌다.
        ⛔ **칸이 많아지면 틈을 1px 로 줄인다.** 60칸에 2px 씩 주면 틈이 118px 이라
           폰(390px)에서 막대가 4px 도 안 남는다 — 그림이 아니라 실오라기가 된다.
      */}
      <div className={`mt-2 flex h-24 items-end ${bars.length > 30 ? "gap-px" : "gap-0.5"}`}>
        {bars.map((b, k) => {
          const h = (b.value / max) * 100;
          const on = k === i;
          return (
            <button
              key={b.label + k}
              type="button"
              onClick={() => setAt(k)}
              aria-label={`${b.full} ${b.value.toLocaleString("ko-KR")}${unit}`}
              aria-pressed={on}
              /* ⛔ 단추가 칸 높이를 다 차지한다 — 낮은 막대도 누를 자리가 있어야 한다(§11-4).
                 막대 자체는 그 안에서 아래에 붙는다. */
              className="group flex h-full min-w-0 flex-1 flex-col justify-end"
            >
              <span
                /* 둥근 끝 4px — 바닥에는 붙어 있어야 하므로 위쪽만 둥글린다 */
                className={`block w-full rounded-t-[4px] transition-[background-color] ${
                  on ? "bg-[var(--key-fill)]" : "bg-[var(--key)]/45 group-active:bg-[var(--key)]/70"
                }`}
                style={{ height: `${minTrack ? Math.max(h, 2) : h}%` }}
              />
            </button>
          );
        })}
      </div>

      {/* 가로축 — ⛔ 칸마다 적지 않는다. 60개면 글자가 겹쳐 아무것도 안 읽힌다. 양 끝과 고른 것만 */}
      <div className="mt-1 flex items-baseline justify-between text-[11px] tabular-nums text-ink3">
        <span>{bars[0].label}</span>
        <span className="font-semibold text-ink2">{picked.label}</span>
        <span>{bars[bars.length - 1].label}</span>
      </div>
    </div>
  );
}

/** 순위 한 줄 */
export type Rank = {
  key: string;
  name: string;
  /** 이름 아래 옅게 적는 곳 — 「경기 수원 · 수원」 */
  sub?: string | null;
  value: number;
  /** 오른쪽에 곁들이는 짧은 값 — 「관심 2」 */
  tail?: string | null;
};

/**
 * 가로 막대 순위.
 *
 * ⛔ **막대 길이는 1등을 100으로 잡는다.** 전체 합계로 잡으면 1등이 3%짜리 실오라기가 되어
 *    순위가 안 읽힌다 — 이 그림이 답하는 것은 「전체의 몇 %인가」가 아니라 「어디가 앞서나」다.
 * ⛔ 숫자를 막대 안에 넣지 않는다. 짧은 막대에서는 글자가 밖으로 삐져나가거나 잘린다.
 *    오른쪽에 자리를 따로 잡아 **모든 줄의 숫자가 같은 세로선에** 서게 한다.
 */
export function RankBars({
  rows,
  unit,
  onPick,
}: {
  rows: Rank[];
  unit: string;
  /** 줄을 누르면 부르는 것. 없으면 줄이 단추가 아니다 */
  onPick?: (key: string) => void;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ol className="mt-1">
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="w-6 shrink-0 text-right text-[12px] font-semibold tabular-nums text-ink3">{i + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold tracking-[-0.01em]">
                  {r.name}
                </span>
                <span className="shrink-0 text-[13px] font-bold tabular-nums">
                  {r.value.toLocaleString("ko-KR")}
                  <span className="ml-0.5 text-[11px] font-medium text-ink3">{unit}</span>
                </span>
              </span>
              {/* 막대 — 둥근 끝 4px. ⛔ 바탕 홈을 함께 그린다. 홈이 없으면 짧은 막대가 허공에 뜬 것처럼 보인다 */}
              <span className="mt-1 block h-[6px] w-full overflow-hidden rounded-full bg-fill">
                <span
                  className="block h-full rounded-full bg-[var(--key-fill)]"
                  style={{ width: `${Math.max((r.value / max) * 100, 3)}%` }}
                />
              </span>
              {(r.sub || r.tail) && (
                <span className="mt-1 flex items-baseline gap-1.5 text-[11.5px] text-ink3">
                  <span className="min-w-0 flex-1 truncate">{r.sub ?? ""}</span>
                  {r.tail && <span className="shrink-0 tabular-nums">{r.tail}</span>}
                </span>
              )}
            </span>
          </>
        );

        return (
          <li key={r.key} className="border-b border-divider last:border-0">
            {onPick ? (
              /* ⛔ 44px 을 채운다(§11-4). 줄 안에 든 것이 그보다 낮아도 누를 자리는 그만큼 준다 */
              <button
                type="button"
                onClick={() => onPick(r.key)}
                className="flex min-h-11 w-full items-start gap-2.5 py-2.5 text-left active:opacity-60"
              >
                {inner}
              </button>
            ) : (
              <div className="flex min-h-11 items-start gap-2.5 py-2.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
