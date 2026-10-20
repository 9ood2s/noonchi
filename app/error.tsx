"use client";

/**
 * 렌더가 던졌을 때 뜨는 화면 (CLAUDE.md §11-2 · BACKLOG ①)
 *
 * ⛔ **이게 없으면 Next 기본 화면이 페이지를 통째로 갈아치운다.**
 *    2026-08-22 지도에서 훅 순서 결함이 났을 때 실제로 그랬다 —
 *    map-screen 이 준비해 둔 「지도를 띄울 수 없습니다」는 한 번도 안 그려지고
 *    화면이 갈렸다. 실패를 알리려던 코드가 실패에 같이 쓸려 나간 꼴이었다.
 *
 * ⛔ **`reset` 이 아니라 `retry` 다**(Next 16.3 에서 stable 이 됐다).
 *    `reset` 은 다시 받아오지 않고 상태만 지운다 — 서버에서 못 받아 던진 경우
 *    같은 실패가 그대로 다시 난다. 문서가 「대개 retry 를 쓴다」고 못박아 뒀다.
 *    `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`
 *
 * ⚠️ 여기가 못 받는 것 둘 — 위쪽 `app/layout.tsx` 자체가 던지는 경우와
 *    서버 렌더가 아닌 곳(이벤트 핸들러·비동기)에서 던지는 경우다.
 *    앞은 `app/global-error.tsx` 가 받는다(아직 없다).
 */

import { useEffect } from "react";
import Link from "next/link";
import { House, RotateCw, TriangleAlert } from "lucide-react";

export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  /* ⛔ 삼키지 않는다 — 콘솔에 남겨야 무엇이 터졌는지 따라갈 수 있다(§11-2) */
  useEffect(() => {
    console.error("[화면 오류]", error);
  }, [error]);

  /**
   * 운영 빌드에서는 서버가 던진 오류의 문구가 브라우저로 안 온다(민감한 값이 새는 것을 막는다).
   * 대신 `digest` 가 서버 기록과 짝을 이룬다. 그래서 개발일 때만 문구를 보여준다.
   */
  const detail = process.env.NODE_ENV === "production" ? null : error.message;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
      <div className="glass-2 rounded-[var(--radius-card)] p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-up">
          <TriangleAlert aria-hidden size={16} strokeWidth={2.2} />
          화면을 그리지 못했습니다
        </p>

        {detail && (
          <p className="mt-3 font-mono text-xs leading-relaxed break-all text-muted">{detail}</p>
        )}
        {error.digest && (
          <p className="mt-3 text-xs text-muted">
            오류 번호 <span className="font-mono">{error.digest}</span>
          </p>
        )}

        {/* ⛔ 둘 다 늘 보인다. 호버 뒤에 숨기지 않는다(§11-4) — 폰에서 영영 못 누른다.
            ⛔ 높이 44px 은 손가락이 닿는 최소치다. */}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => retry()}
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-[var(--radius-chip)] bg-[var(--key-fill)] px-4 text-sm font-semibold text-white active:scale-[0.98]"
          >
            <RotateCw aria-hidden size={15} strokeWidth={2.2} />
            다시 시도
          </button>
          <Link
            href="/"
            className="flex h-11 items-center justify-center gap-2 rounded-[var(--radius-chip)] bg-fill px-4 text-sm font-semibold active:scale-[0.98]"
          >
            <House aria-hidden size={15} strokeWidth={2.2} />
            처음으로
          </Link>
        </div>
      </div>
    </main>
  );
}
