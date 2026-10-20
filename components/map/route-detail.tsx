"use client";

/**
 * 길찾기 상세 — 옆 칸 (docs/DESIGN.md §12-110)
 *
 * 2026-08-23 사장님 — 「상세보기는 패널옆에 닫을수 있는 새로운 패널을 열거나 패널을 옆으로
 * 확장해서 보여줘야 가독성이 좋지」. 그래서 넓은 화면에서는 학교 상세 칸 **오른쪽에**
 * 칸을 하나 더 세우고, 폰에서는 예전처럼 길찾기 칸 안에서 접었다 편다.
 *
 * ⛔ **지도 화면을 안 떠난다**(2026-08-23 사장님). 새 주소로 가지 않고 지도 위에 얹는다.
 * ⛔ 수단 색은 지도에 그리는 선과 **같아야 한다**(§12-101-4). 그래서 `bgOf` 를 여기서 내보내
 *    길찾기 칸·막대 그래프·이 칸이 **한 곳**을 본다 — 세 곳에 따로 적으면 하나만 고치게 된다(§11-3).
 */

import { Footprints, TrainFront, TramFront, X } from "lucide-react";
import { closeRouteDetail, type RouteDetail } from "@/lib/route-line";

/** 미터를 사람이 읽는 글자로 — 1,300m 는 「1.3km」다 */
export const 거리 = (m: number | null) => (m == null ? "" : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

/** 수단마다 아이콘을 가른다 — 글자를 안 읽어도 무엇인지 보인다 */
export function StepIcon({ kind, size = 13 }: { kind: string; size?: number }) {
  if (kind === "지하철") return <TrainFront size={size} aria-hidden />;
  if (kind === "도보") return <Footprints size={size} aria-hidden />;
  return <TramFront size={size} aria-hidden />;
}

/** 구간 색 — 지도에 그리는 선과 같은 색이어야 눈이 잇는다(§12-101-4) */
const KIND_BG: Record<string, string> = {
  도보: "var(--ink3)",
  지하철: "#2f9e93",
  자동차: "var(--key-fill)",
};
export const bgOf = (kind: string) => KIND_BG[kind] ?? "#c2571f";

/**
 * 옆 칸의 속 — 감싸는 `<aside>` 는 map-screen 이 그린다(자리와 유리는 거기가 안다).
 */
export function RouteDetailPanel({ d }: { d: RouteDetail }) {
  return (
    <>
      <div className="flex items-start gap-2 px-3.5">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold text-key">
            {d.label}
            <span className="font-medium text-ink3">
              {d.dir} · {d.mode}
            </span>
          </p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <b className="text-[26px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{d.min}분</b>
            {d.km != null && <span className="text-[13px] tabular-nums text-ink3">{d.km}km</span>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-ink3">
            {d.mode === "자동차" ? (
              <span>{d.toll ? `통행료 ${d.toll.toLocaleString()}원` : "통행료 없음"}</span>
            ) : (
              <>
                {d.transfers != null && <span>환승 {d.transfers}회</span>}
                {d.walk != null && <span>도보 {d.walk}분</span>}
              </>
            )}
            {d.at && <span>{d.at} 기준</span>}
          </p>
        </div>
        {/* ⛔ 44px 이다. 손가락이 닿는 최소치(§11-4) */}
        <button
          type="button"
          onClick={closeRouteDetail}
          aria-label="상세 닫기"
          className="-mr-1 flex size-11 shrink-0 items-center justify-center rounded-chip text-ink3 active:bg-fill"
        >
          <X size={17} strokeWidth={1.8} aria-hidden />
        </button>
      </div>

      {/*
        구간 목록. ⛔ **왼쪽에 세로 줄을 하나 세운다** — 환승이 네 번이면 어디까지가 한 번의
           탑승인지 글자만으로는 안 읽힌다. 줄 위의 점이 갈아타는 자리다.
        ⛔ 넘치면 이 칸 **안에서** 구른다(`overscroll-contain`). 그 뒤 지도가 같이 움직이면 안 된다.
      */}
      <ol className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain px-3.5 pb-3.5">
        {d.steps.map((s, i) => (
          <li key={i} className="relative flex gap-3 pb-3.5 last:pb-0">
            {/* 세로 줄 — 마지막 구간에는 안 그린다 */}
            {i < d.steps.length - 1 && (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 bottom-0 w-0.5 rounded-full opacity-45"
                style={{ background: bgOf(s.kind) }}
              />
            )}
            <span
              aria-hidden
              className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-white"
              style={{ background: bgOf(s.kind) }}
            >
              <StepIcon kind={s.kind} size={15} />
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="flex items-baseline gap-2">
                <b className="min-w-0 flex-1 truncate text-[14px] font-semibold">{s.label}</b>
                {s.min != null && (
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink3">{s.min}분</span>
                )}
              </span>
              {s.from && (
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink2">
                  {s.from}
                  {s.to && s.to !== s.from && (
                    <>
                      {" → "}
                      {s.to}
                    </>
                  )}
                </span>
              )}
              <span className="mt-0.5 block text-[11.5px] tabular-nums text-ink3">
                {[s.stops ? `${s.stops}개 정류장` : null, s.m != null ? 거리(s.m) : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}
