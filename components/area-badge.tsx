/**
 * 인사구역·급지 배지 — 색 하나에 글자 하나.
 *
 * ⛔ **`"use client"` 를 붙이지 않는다.** 지도 상세(브라우저)와 학교별 정적 화면(빌드 때)이
 *    **같은 배지를 쓴다.** 여기에 붙이면 정적 화면이 지도 부품 뭉치를 통째로 끌고 온다
 *    — 검색으로 들어온 사람이 받아야 할 것은 글이지 지도가 아니다.
 * ⛔ 색은 `lib/map.ts` 의 팔레트다. 여기서 새로 고르지 않는다(CLAUDE.md §11-3).
 */
import { areaColor, fullLabel } from "@/lib/map";
import type { Sido } from "@/lib/schools";

/**
 * ⛔ **인사구역이 없는 시·도에서는 아무것도 안 그린다.** 고시 원문을 아직 안 읽은 곳이라
 *    적을 값이 없다. 「없음」이나 「?」 배지를 다는 것은 「구역이 없는 학교」로 읽혀 틀린 말이 된다.
 *    왜 비었는지는 화면이 한 번만 말한다(`components/area-notice.tsx`).
 */
export function AreaBadge({
  sido, area, grade, big,
}: {
  sido: Sido;
  area: string | null;
  grade: string | null;
  big?: boolean;
}) {
  const label = fullLabel(sido, area, grade);
  if (!label) return null;
  return (
    <span
      style={{ background: areaColor(sido, area, grade) }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
        big ? "min-w-11 px-2.5 py-1.5 text-sm" : "min-w-9 px-2 py-1 text-xs"
      }`}
    >
      {label}
    </span>
  );
}
