"use client";

/**
 * 학교를 이름으로 찾는다 — **처음 화면 위저드와 학교 고르기가 같은 것을 쓴다**(CLAUDE.md §11-3).
 *
 * ⛔ 전에는 둘 다 `/map/data`(점 목록 전부)를 받아 훑었다. 경기·인천 1,637교일 때는 됐지만
 *    전국 6,236교가 되면서 **학교 하나 고르려고 몇 MB를 받는** 꼴이 됐다.
 *    지금은 네 칸짜리 색인(`/school-index`)만 받는다.
 * ⛔ 실패를 화면이 버리지 않는다 — 응답이 나쁜 경우와 요청이 끊긴 경우를 **둘 다** 받는다(§11-2).
 */
import { useEffect, useMemo, useState } from "react";
import type { Sido } from "@/lib/schools";

/** 색인 한 줄 = [표준학교코드, 정식 이름, 교육지원청, 시·도, (짧은 이름)] */
type Row = [string, string, string, string, string?];

export type FoundSchool = { code: string; name: string; office: string; sido: Sido };

/** ⛔ 열둘까지만 낸다. 「초」 한 글자에 수천 줄을 그리면 폰이 멈춘다 */
const LIMIT = 12;

export function useSchoolIndex(enabled: boolean, query: string) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || rows) return;
    let alive = true;
    fetch("/school-index")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`학교 목록을 못 받았습니다 (서버 ${r.status})`))))
      .then((j: { rows: Row[] }) => alive && setRows(j.rows))
      .catch((e: unknown) => alive && setFailed(e instanceof Error ? e.message : "학교 목록을 못 받았습니다"));
    return () => {
      alive = false;
    };
  }, [enabled, rows]);

  const found = useMemo<FoundSchool[]>(() => {
    const s = query.trim();
    if (!s || !rows) return [];
    const out: FoundSchool[] = [];
    for (const [code, name, office, sido, short] of rows) {
      if (!name.includes(s) && !(short ?? "").includes(s)) continue;
      out.push({ code, name, office, sido: sido as Sido });
      if (out.length === LIMIT) break;
    }
    return out;
  }, [query, rows]);

  return { found, failed, ready: rows != null };
}
