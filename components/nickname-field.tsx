"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { toast } from "@/lib/toast";

/**
 * **닉네임 정하기 · 바꾸기** (`docs/DESIGN.md §12-145`)
 *
 * 사장님(2026-08-23) — 「앞으로 리뷰나 이런 기능을 달 수도 있으니 사용자 닉네임 수정도
 * 가능하도록 해주고 **중복체크도** 달고」.
 *
 * ⛔ **적는 것을 조용히 자르지 않는다**(CLAUDE.md §11-1). 13자를 적으면 12자로 잘라 저장하는 대신
 *    **저장을 막고 무엇이 틀렸는지 말한다.** 잘라 두면 사람은 자기가 적은 이름이 남은 줄 안다.
 * ⛔ **확인은 서버가 한 번에 한다**(`nickname_check`). 화면에서 중복을 세면 RLS 가 남의 줄을
 *    가려서 늘 「없음」이 나오고, 「쓸 수 있습니다」를 보여준 뒤 저장에서 튕긴다.
 * ⛔ **잡아 둔 이름 목록을 화면에 복사하지 않는다**(§12-147). 두 곳에 두면 한쪽만 고치는
 *    사고가 난다(§11-3) — 그래서 서버가 「모양」·「예약」·「중복」·「됨」 넷 중 하나로 답한다.
 * ⛔ **미리보기를 믿고 끝내지 않는다.** 두 사람이 같은 순간에 같은 이름을 넣으면 확인은 둘 다
 *    통과시킨다. 마지막으로 가르는 것은 표의 유일 색인이고, 그게 튕기면 그 말을 그대로 낸다.
 * ⛔ **저장은 쓸 수 있는 것이 확실할 때만 눌린다** — 주소 설정과 같은 규칙이다(§12-134).
 * ⛔ 실패를 삼키지 않는다(§11-2) — 답에 담겨 오는 실패와 **던져지는** 실패를 둘 다 받는다.
 *    ⚠️ Supabase 질의는 `Promise` 가 아니라 **thenable** 이라 `.catch(...)` 를 못 단다.
 *       그래서 `try{}catch{}` 로 받는다 — 안 감싸면 요청이 끊겼을 때 화면이 그대로 멈춘다.
 */

/** 표의 check 와 **같은 모양**이어야 한다. 다르면 화면은 통과시키고 서버가 튕긴다 */
const SHAPE = /^[가-힣a-zA-Z0-9_]{2,12}$/;

type Look = "빔" | "모양틀림" | "확인중" | "쓸수있음" | "이미있음" | "잡아둔이름" | "지금이름";

export function NicknameField() {
  const [now, setNow] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [look, setLook] = useState<Look>("빔");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // 지금 이름을 읽어 온다. ⛔ 못 읽어도 칸은 뜬다 — 처음 정하는 사람과 구분이 안 될 뿐이다
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const supabase = authClient();
        const { data } = await supabase.auth.getUser();
        if (!data.user) return;
        const { data: row } = await supabase
          .from("profiles")
          .select("nickname")
          .eq("id", data.user.id)
          .maybeSingle();
        if (!alive) return;
        const mine = (row?.nickname as string | null) ?? null;
        setNow(mine);
        setText(mine ?? "");
      } catch {
        // 지금 이름을 못 읽었을 뿐이다. 칸은 뜨고 새로 정할 수 있다
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 적는 대로 확인한다.
   * ⛔ **글자마다 부르지 않는다** — 350ms 쉬면 그때 한 번 부른다.
   * ⛔ 늦게 온 답이 최신 답을 덮지 않게 **버려진 확인은 결과를 안 쓴다**(`alive`).
   */
  useEffect(() => {
    setSaved(false);
    setFailed(null);
    const want = text.trim();

    if (!want) return setLook("빔");
    if (want === now) return setLook("지금이름");
    if (!SHAPE.test(want)) return setLook("모양틀림");

    setLook("확인중");
    let alive = true;
    const timer = setTimeout(async () => {
      try {
        const { data, error } = await authClient().rpc("nickname_check", { want });
        if (!alive) return;
        // ⛔ 확인이 실패하면 「쓸 수 있다」로 넘기지 않는다. 넘기면 저장에서 튕긴다
        if (error) {
          setLook("모양틀림");
          setFailed(`이름을 확인하지 못했습니다. ${error.message}`);
          return;
        }
        setLook(data === "됨" ? "쓸수있음" : data === "중복" ? "이미있음" : data === "예약" ? "잡아둔이름" : "모양틀림");
      } catch (e: unknown) {
        if (!alive) return;
        setLook("모양틀림");
        setFailed(`이름을 확인하지 못했습니다. ${e instanceof Error ? e.message : String(e)}`);
      }
    }, 350);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [text, now]);

  const save = async () => {
    const want = text.trim();
    setBusy(true);
    setFailed(null);

    try {
      const supabase = authClient();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) {
        setBusy(false);
        return setFailed("로그인이 풀렸습니다");
      }

      const { error } = await supabase
        .from("profiles")
        .upsert({ id: me.user.id, nickname: want }, { onConflict: "id" });

      setBusy(false);
      if (error) {
        // ⛔ 표가 튕긴 까닭을 사람 말로 바꾼다. 못 알아보는 것은 그대로 보여준다
        if (error.code === "23505") {
          setLook("이미있음");
          return setFailed("이미 쓰는 이름입니다");
        }
        // ⛔ 모양과 잡아 둔 이름이 같은 번호로 온다 — 어느 쪽인지는 서버 확인이 이미 말했다
        if (error.code === "23514") {
          return setFailed(
            look === "잡아둔이름" ? "따로 잡아 둔 이름입니다" : "한글·영문·숫자·밑줄 2~12자만 됩니다"
          );
        }
        return setFailed(error.message);
      }

      setNow(want);
      setLook("지금이름");
      setSaved(true);
      toast("이름을 저장했습니다");
    } catch (e: unknown) {
      setBusy(false);
      setFailed(e instanceof Error ? e.message : String(e));
    }
  };

  const 말 =
    look === "모양틀림"
      ? "한글·영문·숫자·밑줄 2~12자"
      : look === "확인중"
        ? "확인 중"
        : look === "이미있음"
          ? "이미 쓰는 이름입니다"
          : look === "잡아둔이름"
            ? "따로 잡아 둔 이름입니다"
            : look === "쓸수있음"
              ? "쓸 수 있습니다"
              : null;

  return (
    <div className="mt-2 rounded-card border border-divider px-3.5 py-3">
      <p className="text-[12px] font-medium text-ink3">닉네임</p>

      <div className="mt-1.5 flex gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={now ?? "이름을 정하십시오"}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 rounded-chip border border-line bg-background px-2.5 text-[14px] outline-none focus:border-key"
          style={{ minHeight: 44 }}
        />
        {/* ⛔ 쓸 수 있는 것이 확실할 때만 눌린다(§12-134) */}
        <button
          type="button"
          onClick={save}
          disabled={busy || look !== "쓸수있음"}
          className="flex min-h-11 shrink-0 items-center rounded-chip bg-[var(--key-fill)] px-3.5 text-[13.5px] font-semibold text-white active:opacity-80 disabled:opacity-40"
        >
          {busy ? "저장 중" : "저장"}
        </button>
      </div>

      {말 && (
        <p className={`mt-1.5 text-[12px] ${look === "쓸수있음" || look === "확인중" ? "text-ink3" : "text-up"}`}>
          {말}
        </p>
      )}

      {saved && (
        <p className="mt-1.5 flex items-center gap-1 text-[12px] text-ink3">
          <Check size={13} strokeWidth={2.2} aria-hidden />
          저장했습니다
        </p>
      )}

      {failed && (
        <p role="alert" className="mt-1.5 text-[12px] text-up">
          {failed}
        </p>
      )}

      {!now && !말 && <p className="mt-1.5 text-[12px] text-ink3">아직 없습니다</p>}
    </div>
  );
}
