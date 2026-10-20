"use client";

/**
 * 처음 온 사람에게 한 번 뜨는 위저드.  근거 = docs/DESIGN.md §6 · §9
 *
 * 왜 — 지금 계신 학교 하나만 받아도 자료가 그만큼 쌓인다. 지도만 보고 나가면 아무것도 안 남는다.
 *
 * ⛔ 건너뛰기를 크게 열어 둔다. 막으면 지도 보러 온 사람이 되돌아 나간다.
 *    한 번 닫으면 다시 안 띄운다 — 볼 때마다 뜨면 그게 이 서비스의 인상이 된다.
 * ⛔ 서버로 뭘 보내기 전에는 손님 열쇠도 안 받는다. 그냥 둘러보는 사람에게 계정을 만들지 않는다.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useSchoolIndex, type FoundSchool } from "@/lib/school-index";
import { SchoolSurvey } from "@/components/school-survey";

const SEEN = "runaway.onboarded";

function subscribeSeen(notify: () => void) {
  window.addEventListener("storage", notify);
  return () => window.removeEventListener("storage", notify);
}
function readSeen() {
  try { return !!localStorage.getItem(SEEN); }
  catch { return true; }
}
const serverSeen = () => true;

export function Onboarding() {
  const router = useRouter();
  const seen = useSyncExternalStore(subscribeSeen, readSeen, serverSeen);
  const [closed, setClosed] = useState(false);
  const open = !seen && !closed;
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<FoundSchool | null>(null);



  /**
   * 학교 목록은 **열었을 때만** 받는다. 찾는 자리는 `lib/school-index.ts` 한 곳이다 —
   * 학교 고르기(`components/school-picker.tsx`)가 같은 것을 쓴다(§11-3).
   */
  const { found, failed } = useSchoolIndex(open, q);

  const close = useCallback(() => {
    try {
      localStorage.setItem(SEEN, "1");
    } catch {}
    setClosed(true);
    // ⛔ 인천 학교를 남겼는데 지도가 경기로 열리면 방금 한 일이 안 보인다.
    //    고른 시·도로 지도를 연다.
    if (picked) router.push(`/map?sido=${encodeURIComponent(picked.sido)}`);
  }, [picked, router]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={close}>
      {/* ⛔ 판을 단색으로 덮지 않는다 — glass(흐림·테두리·그림자) + glass-thick(진하기 0.84/0.86).
          그림자는 glass 가 이미 준다(shadow-2xl 을 또 얹지 않는다).
          ⛔ 안쪽 칸(검색칸·결과 목록)에 유리를 또 붙이지 않는다 — 겹치면 글자가 안 읽힌다. */}
      <div
        role="dialog"
        aria-label="처음 오셨나요"
        onClick={(e) => e.stopPropagation()}
        className="glass glass-modal max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-panel p-5 sm:rounded-panel"
      >
        <div className="flex items-start gap-3">
          <h2 className="min-w-0 flex-1 text-lg font-bold tracking-tight">
            {picked ? picked.name : "지금 계신 학교"}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="닫기"
            className="-mr-2 -mt-2 flex min-h-11 min-w-11 items-center justify-center text-ink3 active:opacity-60"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {picked ? (
          <SchoolSurvey
            stdCode={picked.code}
            name={picked.name}
            rated={0}
            start="when"
            frame={false}
            onClose={close}
          />
        ) : (
          <>
            <p className="mt-2 text-sm leading-relaxed text-ink3">
              한 학교만 남겨 주시면 그만큼 자료가 쌓입니다
            </p>

            <div className="mt-4 flex items-center gap-2 rounded-card border border-divider bg-fill px-3">
              <Search size={16} className="shrink-0 text-ink3" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="학교 이름"
                aria-label="학교 이름으로 찾기"
                autoFocus
                className="h-11 w-full bg-transparent text-base outline-none placeholder:text-ink3"
              />
            </div>

            {failed && <p role="alert" className="mt-3 text-sm text-up">{failed}</p>}

            {found.length > 0 && (
              <ul className="mt-2 max-h-64 divide-y divide-divider overflow-y-auto overscroll-contain rounded-card border border-divider">
                {found.map((hit) => (
                  <li key={hit.code}>
                    <button
                      type="button"
                      onClick={() => setPicked(hit)}
                      className="flex min-h-11 w-full items-center gap-3 px-3 py-3 text-left active:bg-fill"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{hit.name}</span>
                      {/* ⛔ 시·도를 함께 적는다 — 전국이 되면서 같은 이름이 여러 시·도에 있다 */}
                      <span className="shrink-0 text-xs text-ink3">{hit.sido} {hit.office}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button type="button" onClick={close} className="mt-4 min-h-11 w-full py-3 text-sm text-ink3 active:opacity-60">
              건너뛰기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
