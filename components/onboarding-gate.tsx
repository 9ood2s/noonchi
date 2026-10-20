"use client";

/**
 * **가입 직후 한 번 — 닉네임 · 소속교 · 거주지역** (`docs/DESIGN.md §12-148`)
 *
 * 사장님(2026-08-23) — 「처음 가입 후 온보딩에서 **닉네임, 주소 설정(옵션)** … 현재 소속교도
 * 거기서 놓고 관리해야지 … **소속교는 필수**야」 · 「**닉네임도 필수**」 ·
 * 「**현재소속교를 받아놔야 처음 열었을때 본인 관내 지도가 딱 뜨지**」.
 *
 * ⛔ **손님(익명)에게는 안 뜬다.** 손님은 계정이 아니라 열쇠일 뿐이라 받아 둘 자리가 없다.
 * ⛔ **닫는 단추가 없다.** 닉네임과 소속교는 필수라 건너뛸 수 없다 — 거주지역만 건너뛴다.
 *    ⚠️ 그래서 **로그인 자체가 무거워진다.** 이탈이 보이면 「나중에 하기」를 열 자리는
 *    거주지역 칸이 이미 만들어 두었다(`skip`).
 * ⛔ **끝나면 그 사람 관내로 지도를 연다**(`?sido=…&office=…`). 소속교를 받는 까닭이 그것이다.
 * ⛔ **다 채운 사람에게는 다시 안 뜬다.** 「봤다」를 브라우저에 적어 두는 것이 아니라
 *    **표에 값이 있나**로 가린다 — 기기를 바꿔도 같아야 한다.
 */

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { Portal } from "@/components/portal";
import { NicknameField } from "@/components/nickname-field";
import { SchoolPicker, type PickedSchool } from "@/components/school-picker";
import { HomeDialog } from "@/components/map/home-dialog";
import { authClient } from "@/lib/auth/client";
import { readHomeSchool, saveHomeSchool } from "@/lib/home-school";
import { readHome } from "@/lib/home";
import { josa } from "@/lib/josa";

type Step = "닉네임" | "소속교" | "거주지역";

export function OnboardingGate() {
  const router = useRouter();
  const [step, setStep] = useState<Step | null>(null);
  const [picked, setPicked] = useState<PickedSchool | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // DB 응답을 받은 뒤 갱신한다. 구독 해제 이후의 늦은 응답은 버린다.
  useEffect(() => {
    let alive = true;
    let generation = 0;
    const inspect = async (): Promise<Step | null> => {
      const supabase = authClient();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user || me.user.is_anonymous) return null;
      const { data: row } = await supabase.from("profiles").select("nickname").eq("id", me.user.id).maybeSingle();
      if (!row?.nickname) return "닉네임";
      return await readHomeSchool() ? null : "소속교";
    };
    const look = () => {
      const request = ++generation;
      void inspect().then((next) => { if (alive && request === generation) setStep(next); }).catch(() => {
        if (alive && request === generation) setStep(null);
      });
    };
    look();
    const { data: sub } = authClient().auth.onAuthStateChange(look);
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  /** 닉네임 칸은 저장되면 스스로 알리지 않는다 — 다시 보고 다음으로 넘긴다 */
  const afterNick = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const supabase = authClient();
      const { data: me } = await supabase.auth.getUser();
      const { data: row } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", me.user!.id)
        .maybeSingle();
      const name = (row?.nickname as string | null) ?? null;
      setBusy(false);
      if (!name) return setFailed("이름을 먼저 저장해 주십시오");
      setStep("소속교");
    } catch (e: unknown) {
      setBusy(false);
      setFailed(e instanceof Error ? e.message : String(e));
    }
  };

  const saveSchool = async () => {
    if (!picked) return;
    setBusy(true);
    setFailed(null);
    const r = await saveHomeSchool(picked.stdCode);
    setBusy(false);
    if ("error" in r) return setFailed(r.error);
    setStep("거주지역");
  };

  /** 끝. ⛔ 그 사람 관내로 지도를 연다 — 소속교를 받는 까닭이 그것이다 */
  const done = useCallback(() => {
    setStep(null);
    if (picked) {
      router.push(`/map?sido=${encodeURIComponent(picked.sido)}&office=${encodeURIComponent(picked.office)}`);
    }
  }, [picked, router]);

  if (!step) return null;

  return (
    <Portal>
      {/* ⛔ **두 판을 겹치지 않는다**(2026-08-23 사장님 — 「거주지역 설정 누르면 패널이 뒤에 묻힘」).
          주소 창을 열면 이 판은 **접는다.** 둘을 같이 띄우면 z 순서를 아무리 맞춰도
          뒤엣것이 반쯤 보여 어느 것을 눌러야 하는지 알 수 없다. */}
      <div hidden={asking} className="fixed inset-0 z-[320] flex items-center justify-center bg-black/50 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-label="처음 설정"
          className="glass-modal max-h-[92dvh] w-full max-w-sm overflow-y-auto rounded-panel p-5"
        >
          {/* 어디쯤 왔는지 — ⛔ 세 칸짜리 눈금 하나. 「1/3」 같은 글자를 또 적지 않는다 */}
          <span className="flex gap-[3px]" aria-hidden>
            {(["닉네임", "소속교", "거주지역"] as Step[]).map((s) => (
              <span
                key={s}
                className={`h-[4px] flex-1 rounded-full ${s === step ? "bg-[var(--key-fill)]" : "bg-fill-2"}`}
              />
            ))}
          </span>

          {step === "닉네임" && (
            <>
              <h2 className="mt-4 text-base font-bold tracking-tight">이름 정하기</h2>
              <NicknameField />
              <button
                type="button"
                onClick={afterNick}
                disabled={busy}
                className="mt-3 min-h-11 w-full rounded-card bg-[var(--key-fill)] text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                {busy ? "확인 중" : "다음"}
              </button>
            </>
          )}

          {step === "소속교" && (
            <>
              <h2 className="mt-4 text-base font-bold tracking-tight">현재 소속교</h2>
              <div className="mt-3">
                <SchoolPicker onPick={setPicked} placeholder="학교 이름" autoFocus />
              </div>

              {/* ⛔ 고르기 전에는 안 눌린다. 고른 것을 **단추에 적는다** — 무엇이 저장되는지
                  보이고, 줄이 하나 생겼다 사라지지 않아 창이 안 뛴다(§12-134 · §12-150) */}
              <button
                type="button"
                onClick={saveSchool}
                disabled={busy || !picked}
                className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-card bg-[var(--key-fill)] px-3 text-[14px] font-semibold text-white active:opacity-80 disabled:opacity-40"
              >
                {picked && !busy && <Check size={14} strokeWidth={2.2} className="shrink-0" aria-hidden />}
                <span className="min-w-0 truncate">
                  {busy ? "저장 중" : picked ? `${picked.name}${josa(picked.name, "으로로")} 정하기` : "학교를 고르십시오"}
                </span>
              </button>
            </>
          )}

          {step === "거주지역" && (
            <>
              <h2 className="mt-4 text-base font-bold tracking-tight">거주지역</h2>
              {/* ⛔ 이 두 줄은 지우지 않는다(2026-08-23 사장님) — 주소를 받는 화면에서
                  어디까지 나가는지를 밝히는 것은 안내문이 아니라 **약속**이다 */}
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink3">
                주소는 이 기기에만 저장됩니다 · 서버로는 동네 정도까지만 갑니다
              </p>

              <button
                type="button"
                onClick={() => setAsking(true)}
                className="mt-3 min-h-11 w-full rounded-card bg-[var(--key-fill)] text-[14px] font-semibold text-white active:opacity-80"
              >
                거주지역 설정
              </button>
              <button
                type="button"
                onClick={done}
                className="mt-1.5 min-h-11 w-full text-[13.5px] text-ink3 active:opacity-60"
              >
                건너뛰기
              </button>
            </>
          )}

          {failed && (
            <p role="alert" className="mt-2.5 text-[12.5px] text-up">
              {failed}
            </p>
          )}
        </div>
      </div>

      {/* ⛔ 주소를 받는 판은 **길찾기·마이페이지와 같은 부품**이다(§11-3). 여기서 또 만들지 않는다 */}
      {asking && (
        <HomeDialog
          now={readHome()}
          onClose={() => {
            setAsking(false);
            done();
          }}
        />
      )}
    </Portal>
  );
}
