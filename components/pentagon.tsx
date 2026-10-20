"use client";

/**
 * 오각형 별점 — 다섯 축을 한 그림에서 누르고, 한 그림으로 읽는다.
 *
 * 왜 오각형인가 — 별 25개를 하나씩 누르면 다섯 줄을 다 채우기 전에 그만둔다.
 * 오각형은 **모양 자체가 그 학교의 인상**이라, 다 채워야 뜻이 생기고 읽기도 한 번에 읽힌다.
 *
 * ⛔ 손가락으로 눌러야 한다(§11-4). 점을 하나하나 맞히게 하지 않고,
 *    **안쪽 아무 데나 누르면** 가장 가까운 축의 그 눈금이 잡힌다. 끌면 이어서 바뀐다.
 * ⛔ 숫자를 같이 낸다. 모양만 두면 4.2 인지 3.8 인지 못 읽는다.
 */

import { useCallback, useRef, useState } from "react";
import { AXES, type AxisKey } from "@/lib/ratings";

const R = 96;                 // 바깥 눈금까지 반지름
/**
 * 축 이름이 들어갈 바깥 여백.
 * ⛔ 가로를 세로보다 훨씬 넓게 준다 — 좌우 꼭짓점의 이름이 옆으로 뻗어서,
 *    같은 여백을 주면 「분위기」가 「분ᄋ」로, 「시설」이 「!」로 잘린다(실제로 잘렸다).
 */
const PAD_X = 74;
const PAD_Y = 34;
const W = (R + PAD_X) * 2;
const H = (R + PAD_Y) * 2;
const CX = W / 2;
const CY = H / 2;
const LEVELS = [1, 2, 3, 4, 5];

/** 축 i 의 각도(도). 맨 위에서 시작해 시계 방향. */
const angleOf = (i: number) => -90 + i * (360 / AXES.length);
const rad = (deg: number) => (deg * Math.PI) / 180;

function point(i: number, value: number, r = R) {
  const a = rad(angleOf(i));
  const d = (r * value) / 5;
  return [CX + d * Math.cos(a), CY + d * Math.sin(a)] as const;
}

const polygon = (values: number[], r = R) =>
  values.map((v, i) => point(i, v, r).join(",")).join(" ");

export function Pentagon({
  values,
  onChange,
  label,
}: {
  values: Partial<Record<AxisKey, number>>;
  /** 없으면 읽기 전용 */
  onChange?: (key: AxisKey, value: number) => void;
  label?: string;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const editable = !!onChange;

  const put = useCallback(
    (clientX: number, clientY: number) => {
      const el = svg.current;
      if (!el || !onChange) return;
      const box = el.getBoundingClientRect();
      // 화면 좌표를 그림 좌표로 되돌린다 (그림이 늘어나거나 줄어 있을 수 있다)
      const x = ((clientX - box.left) / box.width) * W;
      const y = ((clientY - box.top) / box.height) * H;
      const dx = x - CX;
      const dy = y - CY;

      const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
      const step = 360 / AXES.length;
      const i = ((Math.round((deg + 90) / step) % AXES.length) + AXES.length) % AXES.length;

      const dist = Math.hypot(dx, dy);
      const level = Math.max(1, Math.min(5, Math.round((dist / R) * 5)));
      onChange(AXES[i].key, level);
    },
    [onChange],
  );

  const shown = AXES.map((a) => values[a.key] ?? 0);
  const filled = shown.every((v) => v > 0);

  return (
    <div className="mx-auto w-full" style={{ maxWidth: W }}>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none select-none"
        role={editable ? "group" : "img"}
        aria-label={label ?? "다섯 축 별점"}
        onPointerDown={
          editable
            ? (e) => {
                (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
                setDragging(true);
                put(e.clientX, e.clientY);
              }
            : undefined
        }
        onPointerMove={editable ? (e) => dragging && put(e.clientX, e.clientY) : undefined}
        onPointerUp={editable ? () => setDragging(false) : undefined}
        onPointerCancel={editable ? () => setDragging(false) : undefined}
      >
        {/* 눈금 오각형 다섯 겹 */}
        {LEVELS.map((l) => (
          <polygon
            key={l}
            points={polygon(AXES.map(() => l))}
            className="fill-none stroke-line"
            strokeWidth={l === 5 ? 1.5 : 1}
          />
        ))}
        {/* 가운데에서 뻗는 축 */}
        {AXES.map((a, i) => (
          <line key={a.key} x1={CX} y1={CY} x2={point(i, 5)[0]} y2={point(i, 5)[1]} className="stroke-line" strokeWidth={1} />
        ))}

        {/* 지금 값 */}
        {shown.some((v) => v > 0) && (
          <polygon
            points={polygon(shown.map((v) => v || 0.15))}
            className="fill-foreground/15 stroke-foreground"
            strokeWidth={2}
            strokeLinejoin="round"
          />
        )}

        {/* 꼭짓점 */}
        {AXES.map((a, i) => {
          const v = values[a.key];
          if (!v) return null;
          const [x, y] = point(i, v);
          return <circle key={a.key} cx={x} cy={y} r={4} className="fill-foreground" />;
        })}

        {/* 축 이름 + 값 */}
        {AXES.map((a, i) => {
          const [x, y] = point(i, 5, R + 22);
          const v = values[a.key];
          return (
            <text
              key={a.key}
              x={x}
              y={y}
              textAnchor={Math.abs(x - CX) < 6 ? "middle" : x > CX ? "start" : "end"}
              dominantBaseline={y < CY - 6 ? "auto" : y > CY + 6 ? "hanging" : "middle"}
              className="fill-current text-[11px]"
            >
              <tspan className={v ? "font-medium" : "opacity-55"}>{a.label}</tspan>
              {v != null && (
                <tspan className="font-bold" dx="4">
                  {Number.isInteger(v) ? v : v.toFixed(1)}
                </tspan>
              )}
            </text>
          );
        })}
      </svg>

      {/* ⛔ 그림만으로는 못 누르는 사람이 있다. 축마다 버튼을 따로 둔다(키보드·보조기기) */}
      {editable && (
        <ul className="sr-only">
          {AXES.map((a) => (
            <li key={a.key}>
              {LEVELS.map((v) => (
                <button key={v} type="button" aria-label={`${a.label} ${v}점`} onClick={() => onChange!(a.key, v)}>
                  {v}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}

      {editable && !filled && (
        <p className="mt-1 text-center text-xs text-muted">
          <span className="tabular-nums">{shown.filter((v) => v > 0).length}</span> / {AXES.length}
        </p>
      )}
    </div>
  );
}
