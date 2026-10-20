"use client";

/**
 * 대화상자를 `<body>` 바로 아래로 옮긴다.
 *
 * ⛔ **유리 안에서는 `position: fixed` 가 화면이 아니라 그 유리 칸을 기준으로 잡힌다.**
 *    `backdrop-filter` 가 걸린 요소는 그 안의 fixed 요소에게 「화면」 노릇을 한다(containing block).
 *    실제로 아래 시트를 유리로 바꾼 뒤 설문 대화상자가 **시트 안에 갇혀** 화면 아래 절반만 덮었고,
 *    뒤를 어둡게 하는 막도 시트 크기만큼만 깔렸다.
 * ⛔ 서버 그림에는 안 넣는다 — `document` 가 없다. 붙은 뒤에 옮긴다.
 */

import { createPortal } from "react-dom";
import { useClientReady } from "@/lib/client-ready";

export function Portal({ children }: { children: React.ReactNode }) {
  const on = useClientReady();
  return on ? createPortal(children, document.body) : null;
}
