"use client";

/**
 * 관심목록 — 담을 때 **왜 담았는지**를 5축으로 한 번 더 받는다.
 *
 * ⛔ **하트다.** 2026-08-23 사장님 — 「핀고정 빼고 여기에 관심목록에 담는 걸 추가해줘.
 *    하트를 추가해줘. **이제부터 하트가 관심목록이야.** 아래 관심목록에 담기 버튼은 지우고」.
 *    자리는 **학교 상세의 머리줄**이다(전에는 칸 맨 아래의 가로 단추였다).
 *    ⛔ 머리줄에 두는 것이 중요하다 — 아래에 두면 통근·별점을 다 지나쳐 내려가야 보였다.
 *    ⛔ 레일(dock)의 하트와 **같은 말**을 쓴다 — 거기도 「관심목록」이다(§12-126).
 * ⛔ 별점과 **다른 표**에 쌓는다. 「가 봤다(별점)」와 「가고 싶다(관심)」는 다른 값이라
 *    한 평균에 섞으면 둘 다 틀린다. 소문으로 담은 사람과 실제로 겪은 사람을 갈라야 한다.
 * ⛔ 사유는 안 골라도 담긴다. 담는 것 자체가 신호다 — 물음이 문턱이 되면 아무도 안 담는다.
 * ⛔ 실패를 화면이 버리지 않는다(§11-2).
 */

import { useCallback, useEffect, useState } from "react";
import { Heart, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Portal } from "@/components/portal";
import { ensureGuest, isGuest } from "@/lib/auth/anon";
import { AXES } from "@/lib/ratings";
import { toast } from "@/lib/toast";
import { notifyWatch } from "@/lib/watch-signal";

/**
 * 「예상 총 가산점」은 **경기·인천 모두 「점」으로 받는다**(2026-08-22 사장님 — 「경기도도 점수던데」).
 *
 * ⛔ 고시문의 셈법과는 다르다 — 경기는 원문이 가산을 **년·월**로 세고(월수까지 계산·소수점 버림)
 *    인천은 **점**으로 센다. 그래도 교사들끼리 오가는 말은 양쪽 다 「가산점」이라 그 말로 받는다.
 *    저장은 한 칸(`watchlist.bonus`)이고, 시·도별로 갈라 볼 때는 학교(std_code)가 시·도를 정한다.
 */
const BONUS_UNIT = "점";

export function WatchButton({ stdCode, name }: { stdCode: string; name: string; sido: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [asking, setAsking] = useState(false);
  const [considering, setConsidering] = useState(true);
  const [reasons, setReasons] = useState<string[]>([]);
  /** 예상 총 가산점. ⛔ 문자열로 든다 — 숫자로 두면 빈 칸과 0 을 못 가른다 */
  const [bonus, setBonus] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // 이미 담았나. ⛔ 손님 열쇠가 없으면 만들지 않는다 — 둘러보기만 하는 사람에게 계정을 안 만든다.
  useEffect(() => {
    let alive = true;
    (async () => {
      const supabase = authClient();
      const { data: me } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      if (!me.user) return alive && setSaved(false);
      const { data } = await supabase.from("watchlist").select("std_code").eq("std_code", stdCode).maybeSingle();
      if (alive) setSaved(!!data);
    })();
    return () => { alive = false; };
  }, [stdCode]);

  const remove = useCallback(async () => {
    setBusy(true);
    try {
      const { error } = await authClient().from("watchlist").delete().eq("std_code", stdCode);
      if (error) throw new Error(error.message);
      setSaved(false);
      /**
       * ⛔ **뺄 때는 판이 안 떠 있다.** 그래서 `failed` 를 적어도 **아무 데도 안 그려졌다** —
       *    빼기가 실패하면 하트만 그대로인 채 아무 말이 없었다(§11-2 가 뒤집힌 자리다).
       *    잘된 것도 안 된 것도 토스트로 말한다(§12-159).
       */
      toast("관심목록에서 뺐습니다");
      notifyWatch(stdCode, false);
    } catch (e: unknown) {
      const m = e instanceof Error ? e.message : "빼지 못했습니다";
      setFailed(m);
      toast("관심목록에서 빼지 못했습니다", "fail");
    }
    setBusy(false);
  }, [stdCode]);

  const save = useCallback(async () => {
    setBusy(true);
    setFailed(null);

    const guest = await ensureGuest();
    if (!isGuest(guest)) {
      setFailed(guest.error);
      setBusy(false);
      return;
    }

    // ⛔ 상한으로 조용히 자르지 않는다(§11-1). 벗어나면 알리고 멈춘다 — 잘라 저장하면 들어간 줄 안다.
    const n = bonus.trim() === "" ? null : Number(bonus);
    if (n != null && (Number.isNaN(n) || n < 0 || n > 99)) {
      setBusy(false);
      return setFailed("가산점은 0에서 99 사이 숫자입니다");
    }

    let error: { message?: string } | null = null;
    try {
      const r = await authClient()
        .from("watchlist")
        .insert({ user_id: guest.id, std_code: stdCode, considering, reasons, bonus: n });
      error = r.error;
    } catch (e: unknown) {
      error = { message: e instanceof Error ? e.message : String(e) };
    }

    setBusy(false);
    if (error) {
      setFailed(error.message ?? "담지 못했습니다");
      // ⛔ 판이 떠 있으므로 그 자리에도 적는다. 토스트는 사라지고 판은 남는다(§12-159)
      toast("관심목록에 담지 못했습니다", "fail");
      return;
    }
    setSaved(true);
    setAsking(false);
    toast("관심목록에 담았습니다");
    // 지도 말풍선의 숫자를 그 자리에서 +1 한다 (§12-158)
    notifyWatch(stdCode, true);
  }, [stdCode, considering, reasons, bonus]);

  const toggle = (r: string) =>
    setReasons((p) => (p.includes(r) ? p.filter((x) => x !== r) : [...p, r]));

  return (
    <>
      {/*
        ⛔ **44px 이다**(§11-4). 아이콘은 19px 이지만 손가락이 닿는 자리는 44px 를 채운다 —
           머리줄의 다른 단추(36px)보다 크다. 이것이 이 칸에서 사람이 실제로 누르는 것이다.
        ⛔ 담긴 것은 **채워서** 알린다. 테두리만 바꾸면 폰에서 안 보인다.
        ⛔ 아직 담겼는지 모르는 동안(`saved === null`)은 못 누른다 — 그 사이에 누르면
           담은 것을 다시 담으려 든다.
        ⛔ 빼는 것은 바로 빠지고, 담는 것은 사유를 묻는 판이 뜬다(사유는 안 골라도 담긴다).
      */}
      <button
        type="button"
        onClick={() => (saved ? remove() : setAsking(true))}
        disabled={busy || saved === null}
        aria-pressed={!!saved}
        aria-label={saved ? `${name} 관심목록에서 빼기` : `${name} 관심목록에 담기`}
        className={`flex size-11 shrink-0 items-center justify-center rounded-full active:bg-fill disabled:opacity-40 ${
          saved ? "text-key" : "text-ink3"
        }`}
      >
        <Heart size={19} strokeWidth={1.8} className={saved ? "fill-current" : ""} aria-hidden />
      </button>

      {/* ⛔ Portal 로 <body> 아래에 건다. 이 단추는 **유리 패널 안에서** 쓰인다 —
          유리(backdrop-filter) 안의 fixed 는 화면이 아니라 그 유리 칸을 기준으로 잡혀 갇힌다. */}
      {asking && (
        <Portal>
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setAsking(false)}>
          {/* 지도 위에 뜨는 판이라 진한 유리(glass + glass-thick)로 둔다 — 단색으로 덮지 않는다.
              그림자·테두리는 .glass 가 이미 준다(shadow-2xl 을 따로 주지 않는다). */}
          <div
            role="dialog"
            aria-label={`${name} 관심목록`}
            onClick={(e) => e.stopPropagation()}
            className="glass glass-modal max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-panel p-5 sm:rounded-panel"
          >
            <div className="flex items-start gap-3">
              <h2 className="min-w-0 flex-1 truncate text-lg font-bold tracking-tight">{name}</h2>
              {/* 손가락으로 누르는 것이라 44px 을 지킨다. 음수 여백은 아이콘이 전과 같은 자리에 오게 맞춘 값이다 */}
              <button
                type="button"
                onClick={() => setAsking(false)}
                aria-label="닫기"
                className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center rounded-chip text-ink3 active:bg-fill active:opacity-60"
              >
                <X size={20} aria-hidden />
              </button>
            </div>

            <p className="mt-4 text-base font-medium">다음 이동 때 고려</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[true, false].map((v) => (
                <button
                  key={String(v)}
                  type="button"
                  onClick={() => setConsidering(v)}
                  aria-pressed={considering === v}
                  className={`min-h-11 rounded-card border py-3 text-sm active:opacity-70 ${
                    considering === v ? "border-foreground bg-foreground text-background" : "border-divider bg-fill"
                  }`}
                >
                  {v ? "네" : "그냥 봐 두는 중"}
                </button>
              ))}
            </div>

            <p className="mt-5 text-base font-medium">관심 사유</p>
            <p className="mt-1 text-xs text-ink3">여러 개 · 안 골라도 담깁니다</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {AXES.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => toggle(a.label)}
                  aria-pressed={reasons.includes(a.label)}
                  className={`flex min-h-11 items-center rounded-full border px-3.5 text-sm active:opacity-70 ${
                    reasons.includes(a.label) ? "border-foreground bg-foreground text-background" : "border-divider bg-fill"
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>

            {/* ⛔ 이 값은 **사람**에 붙는 값이라 학교마다 다시 묻는 것이 군더더기로 보일 수 있다.
                그래도 여기서 받는 것은, 이 자리가 「옮길 의향」을 받는 유일한 자리이고
                「이 학교를 원하는 사람들의 가산점 분포」가 모의지원이 필요로 하는 값이기 때문이다. */}
            <p className="mt-5 text-base font-medium">예상 총 가산점</p>
            <p className="mt-1 text-xs text-ink3">모르면 비워 둡니다</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                value={bonus}
                onChange={(e) => setBonus(e.target.value)}
                inputMode="decimal"
                placeholder="0"
                aria-label={`예상 총 가산점 (${BONUS_UNIT})`}
                className="min-h-11 w-28 rounded-card border border-divider bg-fill px-3 text-base tabular-nums outline-none focus:border-key"
              />
              <span className="text-sm text-ink3">{BONUS_UNIT}</span>
            </div>

            {failed && <p role="alert" className="mt-4 rounded-chip border border-up px-3 py-2.5 text-sm text-up">{failed}</p>}

            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="mt-5 min-h-11 w-full rounded-card bg-foreground py-3.5 text-base font-medium text-background active:opacity-70 disabled:opacity-40"
            >
              {busy ? "담는 중" : "담기"}
            </button>
          </div>
        </div>
        </Portal>
      )}
    </>
  );
}
