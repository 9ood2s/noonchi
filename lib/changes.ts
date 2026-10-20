import fs from "node:fs";
import path from "node:path";
import { regionBonus } from "@/lib/areas.mjs";

/**
 * 해마다 바뀐 인사구역. `npm run areas:diff` 가 낸 파일을 읽기만 한다.
 * ⛔ 같은 계산을 화면에서 또 하지 않는다 — 한 곳에서 내고 화면은 읽는다(CLAUDE.md §11-3).
 */
export type Move = {
  city: string;
  school: string;
  from: string;
  to: string;
  fromArea: string;
  fromGrade: string | null;
  toArea: string;
  toGrade: string | null;
};

export type Changes = {
  counts: { from: number; to: number; moved: number; opened: number; gone: number };
  moved: Move[];
  opened: { city: string; school: string; area: string }[];
};

let cache: Changes | null = null;

export function changes(): Changes {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data/derived/gyeonggi-2026-2027-changes.json");
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Changes;
  // ⛔ 타입 단언은 거짓말을 할 수 있다. 실제로 한 번 어긋난 적이 있어(가산이 빈 칸으로 나왔다) 확인한다.
  const bad = parsed.moved.find((m) => !m.fromArea || !m.toArea || !m.from || !m.to);
  if (bad) throw new Error(`${path.basename(file)} 의 꼴이 다르다: ${JSON.stringify(bad)}. npm run areas:diff 를 다시 돌린다.`);
  cache = parsed;
  return cache;
}

/** 같은 이동끼리 묶는다. "을 → 갑" 26곳 처럼 */
export function groupedMoves() {
  const map = new Map<string, Move[]>();
  for (const m of changes().moved) {
    const k = `${m.from}|${m.to}`;
    (map.get(k) ?? map.set(k, []).get(k)!).push(m);
  }
  return [...map.entries()]
    .map(([k, list]) => {
      const [from, to] = k.split("|");
      const a = list[0];
      const bonusFrom = regionBonus(a.fromArea, a.fromGrade);
      const bonusTo = regionBonus(a.toArea, a.toGrade);
      return { from, to, list, bonusFrom, bonusTo, diff: bonusTo.percent - bonusFrom.percent };
    })
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.list.length - a.list.length);
}

/** 정기전보일까지 남은 날. 매년 3월 1일이다(경기 제8조 ②). */
export function daysToTransfer(now = new Date()) {
  const year = now.getMonth() >= 2 ? now.getFullYear() + 1 : now.getFullYear();
  const target = new Date(Date.UTC(year, 2, 1));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return { year, days: Math.round((target.getTime() - today.getTime()) / 86400000) };
}
