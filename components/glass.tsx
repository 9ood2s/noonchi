/**
 * M 시안의 부품 — 유리 카드 · 값 알약 · 고른 알약 (`docs/DESIGN.md §12-52`, 「UI 시안」)
 *
 * 지도(`/map`)는 이 언어로 이미 만들어져 있고, `/` 와 `/calc` 가 뒤늦게 따라온다.
 * 세 화면이 같은 부품을 쓰게 여기 한 곳에 둔다(CLAUDE.md §11-3).
 *
 * M 이 지키는 규칙 다섯 — 디자인 시스템 아트보드에 적힌 그대로다.
 *   1. 글자를 유리로 만들지 않는다. 유리는 틀에만, 글자·숫자는 불투명 고대비로.
 *   2. 지도 말풍선에는 흐림을 걸지 않는다(여기서는 해당 없음).
 *   3. **벽에 붙이지 않는다.** 카드는 사방으로 띄운다 — 떠 있음이 이 시스템의 뼈대다.
 *   4. 강조색은 하나. 파랑은 **고른 것과 결과에만**. 그 밖의 색은 데이터가 쓰는 색이다.
 *   5. 유리 뒤에는 빛이 있어야 한다 — `globals.css` 가 `html` 에 그라데이션을 깐다.
 *
 * ⛔ **`--key` 와 `--key-fill` 을 하나로 쓰지 않는다.** key 는 선·글자에 쓰는 파랑이고,
 *    key-fill 은 흰 글자를 얹는 채움이라 더 진하다. 하나로 쓰면 대비가 3:1 아래로 내려간다.
 */

import type { ReactNode } from "react";

/** 유리 카드 하나. ⛔ 벽에 붙이지 않는다 — 바깥 여백은 화면이 준다 */
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass rounded-panel p-4 ${className}`}>{children}</section>;
}

/** 카드 머리줄 — 왼쪽에 이름, 오른쪽에 곁들이는 것 하나 */
export function CardHead({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex min-h-6 items-center gap-2">
      <h2 className="text-[13.5px] font-bold tracking-[-0.01em]">{children}</h2>
      {aside && <span className="ml-auto">{aside}</span>}
    </div>
  );
}

/**
 * 값 알약 — 라벨 하나에 숫자 하나. 카드 안에 놓는다.
 * ⛔ 숫자는 늘 `tabular-nums` 다. 값이 바뀔 때 자릿수가 흔들리면 줄이 덜컹거린다.
 */
export function Stat({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone?: "up" | "down";
}) {
  return (
    <div className="min-w-0 rounded-card bg-fill px-3 py-2.5">
      <p className="truncate text-[12px] font-medium text-ink3">{label}</p>
      <p className="mt-1 flex items-baseline gap-0.5">
        <span className="text-[22px] font-bold leading-none tracking-[-0.03em] tabular-nums">{value}</span>
        {unit && <span className="text-[12px] font-medium text-ink3">{unit}</span>}
      </p>
      {sub && (
        <p
          className={`mt-1 truncate text-[11.5px] tabular-nums ${
            tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink3"
          }`}
        >
          {sub}
        </p>
      )}
    </div>
  );
}

/**
 * 고른 알약. ⛔ 고른 것만 파랑으로 채운다(규칙 4).
 * ⛔ 높이 44px — 손가락이 닿는 최소치다(CLAUDE.md §11-4).
 */
export function Chip({
  on,
  children,
  className = "",
  ...rest
}: { on?: boolean; children: ReactNode } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`flex h-11 shrink-0 items-center rounded-full px-4 text-[13.5px] font-semibold active:opacity-80 ${
        on ? "bg-[var(--key-fill)] text-white" : "glass-2 text-ink2"
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 출처 한 줄 — 화면 맨 아래. 얇은 유리라 그림자를 뺀다 */
export function Source({ children }: { children: ReactNode }) {
  return (
    <p className="glass-2 mt-3 rounded-chip px-3.5 py-2.5 text-[11.5px] leading-relaxed text-ink3 shadow-none">
      {children}
    </p>
  );
}

/**
 * 숫자 칸 — 라벨 12/500 · 높이 44px · `tabular-nums`.
 * ⛔ 계산기 둘(경기·인천)이 같은 칸을 쓴다. 한 곳에 둔다(CLAUDE.md §11-3).
 * ⛔ 상한은 **못 넘게 막는 것**이지 조용히 자르는 것이 아니다 — 화면의 수와 셈하는 수가 늘 같다.
 */
export function NumField({
  label,
  value,
  onChange,
  max,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  max: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink3">{label}</span>
      <input
        type="number"
        inputMode={step ? "decimal" : "numeric"}
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Math.min(max, Number(e.target.value) || 0)))}
        className="h-11 w-full rounded-card border border-divider bg-fill px-3.5 text-base tabular-nums outline-none focus:border-key"
      />
    </label>
  );
}
