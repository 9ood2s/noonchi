/**
 * **운영 쪽 표** — 「개발자」처럼 진짜를 증명하는 한 조각 (`docs/DESIGN.md §12-147`)
 *
 * 잡아 둔 이름(닉네임에 「개발자」를 못 넣게 막는 것)과 **한 벌**이다 — 아무나 못 짓게 막고,
 * 진짜에게는 표를 준다. 둘 중 하나만 있으면 뜻이 없다.
 *
 * ⛔ **누가 다는지는 화면이 정하지 않는다.** `staff` 표에 쓰기 정책이 하나도 없어서
 *    서버만 넣을 수 있다. 화면은 받은 것을 그리기만 한다.
 * ⛔ 이모지를 쓰지 않는다(CLAUDE.md §3). 글자와 테두리로만 만든다.
 */
export function StaffBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-chip border border-key px-1.5 py-0.5 text-[11px] font-semibold text-key">
      {label}
    </span>
  );
}
