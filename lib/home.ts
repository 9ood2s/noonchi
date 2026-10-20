/**
 * 집 — **브라우저에만** 둔다. (docs/DESIGN.md §12-57)
 *
 * ⛔ 서버로 보내지 않는다. 서버가 아는 것은 통근 시간을 물을 때 넘어가는 **격자 한 칸**뿐이고,
 *    그 격자가 누구의 것인지는 어디에도 안 적힌다.
 * ⛔ **정확한 좌표를 담지 않는다.** 서버가 주소를 격자로 바꿔 주고, 우리는 그 격자만 든다.
 *    기기를 잃어버려도 「어느 동네쯤」까지만 나온다.
 * ⛔ 그리는 도중에 읽지 않는다 — localStorage 는 브라우저에만 있어 서버 그림과 어긋난다.
 */

import { gridCenter } from "@/lib/commute.mjs";

const KEY = "runaway.home";

export type Home = {
  /** 화면에 적는 이름. 내 기기에만 있다 */
  label: string;
  /** 500m 격자 */
  gy: number;
  gx: number;
  /**
   * 출근 기준 시간대 "07:30". 30분 단위.
   * ⛔ **도착 시각이 아니라 출발 시각이다.** 학교는 08:30 까지 가야 하므로 그 한 시간 전이
   *    기본이다(2026-08-23 사장님 — 「08:30 도착해야만 하는 시간이여」).
   * ⛔ 「등교」가 아니다 — 등교는 학생이 하는 것이다(CLAUDE.md §4).
   */
  at: string;
  /**
   * 퇴근 기준 시간대 "17:00" (2026-08-23 사장님 「시간대도 퇴근 시간대 제공」).
   * ⛔ 출근과 **따로** 받는다. 같은 시간대로 재면 퇴근길이 아니라 아침 교통을 뒤집은 값이다.
   * ⛔ 옛 기기에는 이 값이 없다 — 없으면 「17:00」으로 본다.
   */
  atOut?: string;
};

/** 퇴근 기준 시간대. 옛 기기 호환 — 없으면 17:00 */
export const outAt = (h: Pick<Home, "atOut">) => h.atOut ?? "17:00";

export const CHANGED = "runaway:home";

export function readHome(): Home | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<Home>;
    if (typeof v.gy !== "number" || typeof v.gx !== "number" || typeof v.at !== "string") return null;
    return { label: String(v.label ?? ""), gy: v.gy, gx: v.gx, at: v.at };
  } catch {
    return null;
  }
}

export function writeHome(h: Home | null): void {
  if (typeof window === "undefined") return;
  try {
    if (h) localStorage.setItem(KEY, JSON.stringify(h));
    else localStorage.removeItem(KEY);
  } catch {}
  // 화면 여러 곳이 이 값을 든다. 바꾼 것을 알려야 그 자리에서 다시 읽는다.
  window.dispatchEvent(new CustomEvent(CHANGED));
}

/**
 * 격자 한 칸의 한가운데 좌표. 통근을 물을 때 이 값을 보낸다.
 * ⛔ 격자 계산은 `lib/commute.mjs` 한 곳에 있다. 여기에 같은 숫자를 또 적지 않는다 —
 *    한쪽만 바뀌면 브라우저가 보낸 점이 다른 칸으로 떨어져 캐시가 조용히 갈라진다(§11-3).
 */
export const homePoint = (h: Home) => gridCenter(h.gy, h.gx) as { lat: number; lng: number };

/** 고를 수 있는 시간대 — 30분 단위 하루치 */
export const SLOTS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor((i * 30) / 60)).padStart(2, "0")}:${String((i * 30) % 60).padStart(2, "0")}`,
);
