"use client";

/**
 * 토스트를 받아 그리는 유일한 자리 (`lib/toast.ts` · `docs/DESIGN.md §12-159`)
 *
 * ⛔ **`app/layout.tsx` 에 하나만 단다.** 화면마다 달면 겹쳐 뜨고, 지도 안에 달면
 *    유리(backdrop-filter) 칸 안의 `fixed` 가 **그 칸을 기준으로 잡혀 갇힌다**
 *    (`watch-button.tsx` 가 Portal 을 쓴 것과 같은 함정이다).
 * ⛔ **여러 줄을 쌓지 않고 마지막 하나만 보여준다.** 담고 빼기를 빠르게 누르면 줄이 쌓여
 *    화면 아래가 막힌다. 새 것이 오면 앞엣것을 밀어낸다.
 * ⛔ **손가락을 안 먹는다**(`pointer-events-none`). 아래 시트 위에 뜨는데 그 자리를 먹으면
 *    2초 동안 시트를 못 누른다.
 * ⛔ 폰의 아래 시트를 피해 **위쪽**에 띄우지 않는다 — 위는 검색줄·칩줄이 쓴다.
 *    아래에서 `bottom` 여백을 넉넉히(safe-area 포함) 준다.
 */

import { useEffect, useRef, useState } from "react";
import { Check, TriangleAlert } from "lucide-react";
import { TOAST_EVENT, type ToastDetail } from "@/lib/toast";

/** 2초. ⛔ 더 짧으면 못 읽고, 더 길면 다음 동작을 가린다 */
const LIVE = 2000;

export function Toast() {
  const [now, setNow] = useState<(ToastDetail & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<ToastDetail>).detail;
      if (!d?.text) return;
      // ⛔ 앞엣것의 시계를 반드시 끈다. 안 끄면 새 줄이 앞엣것의 시계에 걸려 일찍 사라진다
      if (timer.current) clearTimeout(timer.current);
      setNow({ ...d, id: ++seq.current });
      timer.current = setTimeout(() => setNow(null), LIVE);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => {
      window.removeEventListener(TOAST_EVENT, on);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!now) return null;

  const Icon = now.kind === "fail" ? TriangleAlert : Check;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+24px)] z-[60] flex justify-center px-4"
      role="status"
      aria-live="polite"
    >
      {/* ⛔ 애니메이션은 뜨는 것 하나뿐이다. 사라질 때까지 넣으면 상태를 하나 더 들고 있어야 한다 */}
      <span
        key={now.id}
        className="toast-pop flex max-w-full items-center gap-2 rounded-full bg-[var(--ink-strip)] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-lg"
      >
        <Icon size={15} strokeWidth={2.2} className={now.kind === "fail" ? "text-up" : ""} aria-hidden />
        <span className="min-w-0 truncate">{now.text}</span>
      </span>
    </div>
  );
}
