"use client";

/**
 * **내 자리로** — 레이어 단추 아래 크로스헤어 (`docs/DESIGN.md §12-168`)
 *
 * 사장님(2026-08-24) — 「레이어 밑에 그 지도앱에 있는 내위치? 크로스헤어 같은 아이콘 있잖아.
 * 거기다 놓고 **내가 저장한 학교로 다시 이동**하도록 해줘. **학교가 1순위. 학교가 없다면 주거지.**
 * 둘다 없다면 토스트 '설정된 소속교와 주거지가 없습니다.' 하나 띄워줘.
 * 그럼 **회원가입의 사유가 하나 생기겠지**」.
 *
 * ⛔ **지도앱의 「내 위치」와 다르다.** 우리는 GPS 를 안 쓴다 — 교사가 보는 것은
 *    지금 서 있는 자리가 아니라 **소속교**다. 아이콘만 그 자리의 관례를 따른다.
 * ⛔ **차례가 뜻이다** — 소속교가 1순위. 소속교는 로그인해야 있고 주거지는 이 기기에만 있다.
 *    둘 다 없으면 **그때 알린다**(미리 안내문을 깔지 않는다 · CLAUDE.md §3).
 * ⛔ 실패를 삼키지 않는다(§11-2) — 소속교를 못 읽으면 주거지로 넘어가되 콘솔에 남긴다.
 */

import { useCallback, useState } from "react";
import { LocateFixed, Loader2 } from "lucide-react";
import { db } from "@/lib/supabase";
import { readHomeSchool } from "@/lib/home-school";
import { homePoint, readHome } from "@/lib/home";
import { toast } from "@/lib/toast";

export type GoTarget =
  | { kind: "school"; stdCode: string; sido: string; lat: number; lng: number }
  | { kind: "home"; lat: number; lng: number };

export function GoMine({ onGo }: { onGo: (t: GoTarget) => void }) {
  const [busy, setBusy] = useState(false);

  const go = useCallback(async () => {
    setBusy(true);
    try {
      /**
       * ① 소속교. ⛔ 좌표와 시·도를 **표에서 받아 온다** — 저장해 둔 것은 표준학교코드뿐이고,
       *    그 학교가 지금 보고 있는 시·도가 아닐 수 있다(중간발령으로 옮긴 사람).
       */
      let mine: Awaited<ReturnType<typeof readHomeSchool>> = null;
      try {
        mine = await readHomeSchool();
      } catch (e) {
        // 못 읽어도 주거지로 넘어간다. 다만 조용히 넘어가지 않는다
        console.error("[내 자리] 소속교", e);
      }
      if (mine?.std_code) {
        const { data, error } = await db
          .from("personnel_areas")
          .select("sido, lat, lng")
          .eq("std_code", mine.std_code)
          .not("lat", "is", null)
          .limit(1)
          .maybeSingle();
        if (error) console.error("[내 자리] 학교 좌표", error.message);
        const at = data as { sido: string; lat: number; lng: number } | null;
        if (at) {
          onGo({ kind: "school", stdCode: mine.std_code, sido: at.sido, lat: at.lat, lng: at.lng });
          return;
        }
      }

      // ② 주거지. ⛔ 이 기기에만 있는 값이다(`lib/home.ts`) — 로그인과 상관없다
      const home = readHome();
      if (home) {
        const p = homePoint(home);
        onGo({ kind: "home", lat: p.lat, lng: p.lng });
        return;
      }

      // ③ 둘 다 없다. ⛔ 사장님이 못박은 문구 그대로다
      toast("설정된 소속교와 주거지가 없습니다.", "fail");
    } finally {
      setBusy(false);
    }
  }, [onGo]);

  return (
    /**
     * ⛔ 자리는 **레이어 단추 바로 아래**다. 레이어가 넓은 화면 `top-3` · 폰 `top-[120px]` 이라
     *    그 높이에 단추(44) + 사이(8) 를 더한다. 레이어 쪽 값을 바꾸면 여기도 같이 바꾼다(§11-3).
     * ⛔ 44px 을 채운다(§11-4).
     */
    <div className="pointer-events-auto absolute right-3 top-[172px] z-40 lg:top-[64px]">
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        aria-label="내 소속교로"
        className="glass-2 flex size-11 items-center justify-center rounded-[15px] text-ink3 active:opacity-80 disabled:opacity-50"
      >
        {busy ? (
          <Loader2 size={18} className="animate-spin" aria-hidden />
        ) : (
          <LocateFixed size={18} strokeWidth={1.7} aria-hidden />
        )}
      </button>
    </div>
  );
}
