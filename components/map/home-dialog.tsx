"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { Portal } from "@/components/portal";
import { SLOTS, outAt, writeHome, type Home } from "@/lib/home";
import { toast } from "@/lib/toast";

/**
 * **주소 설정** — 도로명 주소를 적고 **후보에서 골라** 저장한다 (§12-134).
 *
 * ⛔ 이름이 「집 정하기」였다(2026-08-23 사장님 — 「'집 정하기'는 뭔 병신 같은 단어임 ㅋㅋ
 *    주소 설정으로 바꿔」). 화면 어디서도 「집 정하기」라 부르지 않는다.
 * ⛔ **적은 것을 곧바로 저장하지 않는다.** 전에는 맨 앞 후보를 말없이 골라 저장해서,
 *    같은 이름의 길이 여럿이면 엉뚱한 데가 집이 되고도 사람은 몰랐다.
 *    이제 **고르기 전에는 저장 단추가 안 눌린다** (사장님 — 「저장하기는 모든게 선택이
 *    문제없이 마무리되었을 때 누르는게 저장하기니까」).
 * ⛔ **「그 주소를 찾지 못했습니다」는 하나도 안 걸렸을 때만** 낸다 — 찾는 중이거나
 *    아직 안 적었을 때 띄우면, 잘 되고 있는데 틀렸다고 말하는 꼴이다.
 * ⛔ 주소는 서버가 격자로 바꿔 주고, 우리는 격자만 든다.
 */
type Cand = { gy: number; gx: number; label: string; sub: string };

export function HomeDialog({ now, onClose }: { now: Home | null; onClose: () => void }) {
  const [q, setQ] = useState(now?.label ?? "");
  const [at, setAt] = useState(now?.at ?? "07:30");
  // ⛔ 퇴근은 **따로** 받는다(2026-08-23 사장님). 같은 시간대로 재면 아침 교통을 뒤집은 값이다.
  const [atOut, setAtOut] = useState(now ? outAt(now) : "17:00");
  /** 찾아 온 후보들. `null` = 아직 안 찾아봤다 (빈 배열 = 찾았는데 없다 — 둘은 다른 상태다) */
  const [cands, setCands] = useState<Cand[] | null>(null);
  /** 고른 후보. ⛔ 이것이 있어야 저장이 눌린다 */
  const [picked, setPicked] = useState<Cand | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * 적는 대로 찾는다.
   * ⛔ **글자마다 부르지 않는다** — 350ms 쉬면 그때 한 번 부른다. 안 그러면 「안양시…」
   *    열 글자에 열 번을 부르고, 그게 다 남의 쿼터다.
   * ⛔ 이미 고른 뒤에 글자를 고치면 **고른 것을 놓는다.** 안 놓으면 화면에는 새 주소가
   *    적혀 있는데 저장되는 것은 아까 고른 옛 주소다.
   * ⛔ 늦게 온 답이 최신 답을 덮지 않게 **버려진 요청은 결과를 안 쓴다**(`alive`).
   * ⛔ 실패를 삼키지 않는다(§11-2) — 끊긴 것과 「없다」는 다른 말로 적는다.
   */
  useEffect(() => {
    const term = q.trim();
    setPicked(null);
    if (term.length < 2) {
      setCands(null);
      setFailed(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setBusy(true);
      setFailed(null);
      try {
        const r = await fetch("/api/home", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ q: term }),
        });
        const j = (await r.json()) as { ok?: boolean; items?: Cand[]; error?: string };
        if (!alive) return;
        if (j?.ok && Array.isArray(j.items)) setCands(j.items);
        else if (r.status === 404) setCands([]);
        else {
          setCands(null);
          setFailed(j?.error ?? "주소를 찾지 못했습니다");
        }
      } catch {
        // ⛔ 요청이 끊기면 위에 닿지도 못한다. 여기서 잡는다(§11-2)
        if (alive) {
          setCands(null);
          setFailed("주소를 찾지 못했습니다");
        }
      } finally {
        if (alive) setBusy(false);
      }
    }, 350);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const save = useCallback(() => {
    if (!picked) return;
    writeHome({ label: picked.label, gy: picked.gy, gx: picked.gx, at, atOut });
    onClose();
    // ⛔ 판이 닫히면서 아무 말이 없었다 — 저장됐는지 알 길이 없다(§12-159)
    toast("집 주소를 저장했습니다");
  }, [picked, at, atOut, onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div
          role="dialog"
          aria-label="거주지역"
          onClick={(e) => e.stopPropagation()}
          className="glass glass-modal max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-panel p-5 sm:rounded-panel"
        >
          {/*
            ⛔ **닫기 단추를 둔다**(2026-08-23 사장님 — 「주소설정에 닫기 버튼이 없음」).
               막을 눌러도 닫히긴 했지만 **그것은 보이지 않는 길**이다 — 폰에서는 판이
               화면을 거의 다 덮어 누를 막이 얼마 없고, 아는 사람만 아는 조작이 된다.
            ⛔ 44px 이다(§11-4). 음수 여백은 아이콘이 제목 줄에 맞춰 앉게 한 값이다.
          */}
          <div className="flex items-start gap-3">
            <h2 className="min-w-0 flex-1 text-lg font-bold tracking-tight">거주지역</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="닫기"
              className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center rounded-chip text-ink3 active:bg-fill active:opacity-60"
            >
              <X size={20} aria-hidden />
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-[11.5px] font-medium text-ink3">주소</span>
            <div className="mt-1 flex items-center gap-2 rounded-card border border-divider bg-fill px-3">
              <MapPin size={16} className="shrink-0 text-ink3" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                /**
                 * ⭐ **방향키와 엔터로 고른다**(2026-08-23 사장님 — 「드롭다운으로 해야 방향키로
                 *    선택하고 엔터로 입력 깔끔하게 딱 되지 않음?」). 학교 고르기와 같은 조작이다.
                 * ⛔ `preventDefault` 를 꼭 건다 — 안 걸면 위·아래 키가 글자 맨 앞·맨 뒤로 커서를 옮긴다.
                 * ⛔ 엔터는 **고르기만** 한다. 바로 저장하지 않는다 — 저장은 고른 것이 확실해진
                 *    뒤에 누르는 것이다(§12-134 사장님 「저장하기는 모든게 선택이 문제없이
                 *    마무리되었을 때 누르는게 저장하기니까」).
                 */
                onKeyDown={(e) => {
                  const list = cands ?? [];
                  if (!list.length) return;
                  const now = list.findIndex(
                    (c) => picked?.label === c.label && picked?.gy === c.gy && picked?.gx === c.gx
                  );
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setPicked(list[Math.min(now + 1, list.length - 1)]);
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setPicked(list[Math.max(now - 1, 0)]);
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    if (now < 0) setPicked(list[0]);
                  }
                }}
                placeholder="도로명 주소를 입력해주세요."
                className="h-11 w-full bg-transparent text-base outline-none placeholder:text-ink3"
                aria-label="거주지역"
                autoComplete="off"
              />
            </div>
          </label>

          {/*
            후보 목록 — ⛔ **고르는 것이 이 화면의 일이다.**
            ⛔ 고른 줄은 **채워서** 알린다. 테두리만 바꾸면 폰에서 안 보인다.
            ⛔ 한 줄 44px 이다(§11-4).
            ⛔ 도로명과 지번을 같이 적는다 — 같은 도로명이 여럿일 때 지번이 갈라 준다.
          */}
          {/* ⛔ **높이가 고정이다**(2026-08-23 사장님 — 「검색할 때 창 크기는 변하지 않게」).
              비어 있어도 자리를 지킨다 — 글자 한 자마다 판이 아래위로 뛰지 않게. */}
          <div className="mt-2 h-56 overflow-y-auto overscroll-contain rounded-card border border-divider">
            {cands != null && cands.length > 0 ? (
            <ul>
              {cands.map((c) => {
                const on = picked?.label === c.label && picked?.gy === c.gy && picked?.gx === c.gx;
                return (
                  <li key={`${c.label}/${c.gy}/${c.gx}`} className="border-b border-divider last:border-0">
                    <button
                      type="button"
                      onClick={() => setPicked(c)}
                      aria-pressed={on}
                      className={`flex min-h-11 w-full flex-col items-start justify-center gap-0.5 px-3 py-2 text-left active:opacity-70 ${
                        on ? "bg-[var(--key-fill)] text-white" : "bg-fill"
                      }`}
                    >
                      <span className="text-sm">{c.label}</span>
                      {c.sub && (
                        <span className={`text-[11.5px] ${on ? "opacity-80" : "text-ink3"}`}>{c.sub}</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            ) : (
              /* ⛔ 「찾는 중」과 「없다」는 다른 말이다. 찾는 중에 「없다」를 띄우면 거짓말이 된다 */
              <p role={!busy && cands != null ? "alert" : undefined} className="px-3 py-2.5 text-xs text-ink3">
                {busy ? "주소를 찾는 중" : cands != null ? "그 주소를 찾지 못했습니다" : ""}
              </p>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            {/* ⛔ 둘을 따로 받는다 — 아침 교통을 뒤집은 값은 퇴근길이 아니다 */}
            <label className="block">
              <span className="text-[11.5px] font-medium text-ink3">출근 기준</span>
              <select
                value={at}
                onChange={(e) => setAt(e.target.value)}
                aria-label="출근 기준 시간대"
                className="mt-1 h-11 w-full rounded-card border border-divider bg-fill px-3 text-base tabular-nums outline-none"
              >
                {SLOTS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11.5px] font-medium text-ink3">퇴근 기준</span>
              <select
                value={atOut}
                onChange={(e) => setAtOut(e.target.value)}
                aria-label="퇴근 기준 시간대"
                className="mt-1 h-11 w-full rounded-card border border-divider bg-fill px-3 text-base tabular-nums outline-none"
              >
                {SLOTS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>

          {/*
            ⛔ 무엇이 남는지는 적는다 — 주소를 서버에 맡긴다고 오해하게 두지 않는다.
            ⛔ 다만 **「500m 격자」는 개발자 말이다**(2026-08-23 사장님 — 「이건 개발자용 이잖음」 ·
               CLAUDE.md §3 내부 용어 노출 금지). 교사에게 격자는 아무 뜻이 없다.
               하는 일은 그대로고(§12-57) **말만** 바꿨다 — 「동네 정도까지만」.
          */}
          <p className="mt-3 text-xs leading-relaxed text-ink3">
            주소는 이 기기에만 저장됩니다 · 서버로는 동네 정도까지만 갑니다
          </p>

          {failed && (
            <p role="alert" className="mt-3 rounded-chip border border-up px-3 py-2.5 text-sm text-up">
              {failed}
            </p>
          )}

          {/*
            ⛔ **고른 것이 있어야 눌린다**(2026-08-23 사장님 — 「저장하기는 모든게 선택이
               문제없이 마무리되었을 때 누르는게 저장하기니까」). 적기만 하고 누르면
               무엇이 저장되는지 사람이 모르는 채로 저장된다.
            ⛔ 무엇을 저장하는지 **단추에 적는다** — 목록이 길어 고른 줄이 화면 밖으로 밀려도
               여기서 확인된다.
          */}
          <button
            type="button"
            onClick={save}
            disabled={!picked}
            className="mt-4 min-h-11 w-full truncate rounded-card bg-foreground px-4 py-3.5 text-base font-medium text-background active:opacity-70 disabled:opacity-40"
          >
            {picked ? `${picked.label} 저장하기` : "저장하기"}
          </button>

          {now && (
            <button
              type="button"
              onClick={() => {
                writeHome(null);
                onClose();
              }}
              className="mt-1 min-h-11 w-full text-sm text-ink3 active:opacity-60"
            >
              거주지역 지우기
            </button>
          )}
        </div>
      </div>
    </Portal>
  );
}
