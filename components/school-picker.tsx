"use client";

/**
 * **학교를 이름으로 찾아 고른다** — 온보딩과 마이페이지가 같은 것을 쓴다 (§11-3).
 *
 * `components/onboarding.tsx` 안에 있던 검색을 빼내 부품으로 만들었다. 두 곳에서 각자
 * 만들면 한쪽만 고치는 사고가 난다 — 실제로 그 파일은 지금 아무 데서도 안 불린다.
 *
 * ⛔ **학교 목록은 열었을 때만 받는다.** 지도 데이터(`/map/data`)를 그대로 쓴다.
 * ⛔ **실패를 삼키지 않는다**(§11-2). 목록을 못 받으면 그 자리에 까닭을 적는다.
 * ⛔ 줄은 44px 다 — 손가락으로 고른다(§11-4).
 *
 * ⛔ **창 크기가 바뀌지 않는다**(2026-08-23 사장님 — 「소속교든 주소든 검색할 때 **창 크기는
 *    변하지 않게.** 텍스트 입력할때마다 왔다갔다해서 정신사나워」). 결과 칸을 **늘 같은 높이로**
 *    두고 그 안에서만 바뀐다.
 * ⭐ **방향키와 엔터로 고른다**(사장님 — 「드롭다운으로 해야 방향키로 선택하고 엔터로 입력
 *    깔끔하게 딱 되지 않음?」). 목록을 띄우는 진짜 드롭다운은 **모달 밖으로 잘려서** 안 된다 —
 *    판이 `overflow-y-auto` 라 떠 있는 것을 잘라 먹는다. 그래서 자리는 고정으로 두고
 *    **키 조작만** 드롭다운처럼 만들었다.
 * ⛔ **손가락은 방향키가 없다.** 줄을 그대로 눌러도 골라진다 — 키보드는 곁들임이다(§11-4).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useSchoolIndex } from "@/lib/school-index";
import type { Sido } from "@/lib/schools";

export type PickedSchool = { stdCode: string; name: string; office: string; sido: Sido };

export function SchoolPicker({
  onPick,
  placeholder = "학교 이름",
  autoFocus,
}: {
  onPick: (s: PickedSchool) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  /** 방향키가 짚고 있는 줄 */
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * ⛔ 찾는 자리는 `lib/school-index.ts` 한 곳이다 — 처음 화면 위저드가 같은 것을 쓴다(§11-3).
   *    전에는 이 화면과 위저드가 저마다 `/map/data` 를 받아 훑었다.
   */
  const { found, failed, ready } = useSchoolIndex(true, q);

  // ⛔ 글자를 고치면 맨 위로 돌아간다. 안 그러면 세 번째 줄을 짚은 채 목록이 통째로 바뀐다
  useEffect(() => setActive(0), [q]);

  // 짚은 줄이 안 보이면 그리로 굴린다 — 방향키로 내려가는데 화면이 안 따라오면 못 쓴다
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const take = (i: number) => {
    const hit = found[i];
    if (!hit) return;
    onPick({ stdCode: hit.code, name: hit.name, office: hit.office, sido: hit.sido });
  };

  return (
    <div>
      <div className="flex items-center gap-2 rounded-card border border-divider bg-fill px-3">
        <Search size={16} className="shrink-0 text-ink3" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (!found.length) return;
            // ⛔ `preventDefault` 를 꼭 건다. 안 걸면 위·아래 키가 글자 맨 앞·맨 뒤로 커서를 옮긴다
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, found.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              take(active);
            }
          }}
          placeholder={placeholder}
          aria-label="학교 이름으로 찾기"
          role="combobox"
          aria-expanded={found.length > 0}
          aria-controls="school-picker-list"
          aria-activedescendant={found.length ? `school-picker-${active}` : undefined}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          className="h-11 w-full bg-transparent text-base outline-none placeholder:text-ink3"
        />
      </div>

      {/* ⛔ **높이가 고정이다.** 비어 있어도 자리를 지킨다 — 그래야 창이 안 뛴다 */}
      <div className="mt-2 h-56 overflow-y-auto overscroll-contain rounded-card border border-divider">
        {failed ? (
          <p role="alert" className="px-3 py-2.5 text-[13px] text-up">
            {failed}
          </p>
        ) : found.length > 0 ? (
          <ul ref={listRef} id="school-picker-list" role="listbox" className="divide-y divide-divider">
            {found.map((hit, i) => (
              <li key={hit.code} id={`school-picker-${i}`} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  // ⛔ 마우스가 지나가도 짚은 줄을 옮긴다. 방향키와 마우스가 서로 다른 줄을 짚으면 헷갈린다
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick({ stdCode: hit.code, name: hit.name, office: hit.office, sido: hit.sido })}
                  className={`flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-left ${
                    i === active ? "bg-fill-2" : "active:bg-fill"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-[14px]">{hit.name}</span>
                  {/* ⛔ 시·도를 함께 적는다 — 전국이 되면서 「부평」 같은 이름이 여러 시·도에 있다 */}
                  <span className="shrink-0 text-[12px] text-ink3">{hit.sido} {hit.office}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          /* ⛔ 「찾지 못했습니다」는 **두 글자 넘게 적었는데** 하나도 없을 때만. 적는 도중에 띄우면
             잘 되고 있는 사람에게 틀렸다고 말하는 꼴이다(§12-134 와 같은 규칙) */
          <p className="px-3 py-2.5 text-[13px] text-ink3">
            {!ready ? "학교 목록을 받는 중" : q.trim().length >= 2 ? "그 이름의 학교를 찾지 못했습니다" : ""}
          </p>
        )}
      </div>
    </div>
  );
}
