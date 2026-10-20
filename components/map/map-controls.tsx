"use client";

/**
 * 지도 조작 — 검색과 필터.
 *
 * ⛔ **검색창과 필터는 한 줄이다** — 검색이 왼쪽, 칩이 그 오른쪽으로 죽 이어진다.
 *    `flex-wrap` 을 걸면 폭이 좁을 때 칩이 둘째 줄로 접혀 지도를 두 줄만큼 가린다.
 *    접지 않고 **가로로 밀어서** 본다(`overflow-x-auto`).
 *    ⛔ 그러면 칩 펼침이 그 칸에 잘린다. 그렇다고 열릴 때만 `overflow-visible` 로 바꾸면
 *    **밀어 둔 자리가 처음으로 튄다**(스크롤 칸이 아니게 되면서 밀린 값이 사라진다).
 *    그래서 펼침은 칸 안에 두지 않고 **화면 기준(fixed)으로 놓고**, 누른 칩 아래에 손으로 앉힌다.
 *    오른쪽 끝 칩이면 화면 안으로 당겨 앉힌다 — 폰에서 341px 이 밖으로 나갔던 자리다.
 *
 * ⛔ **처음에 서 있는 칩은 「지역」 하나뿐이다.** 나머지는 그 옆 「+」 로 그때그때 꺼낸다.
 *    전에는 넷이 늘 서 있었는데, 안 쓰는 칩이 지도를 가렸다. 쓰는 사람마다 보는 값이 다르다.
 *
 * ⛔ **필터로 낼 수 있는 것은 우리가 확인할 수 있는 수치뿐이다**(CLAUDE.md §2).
 *    구역·급지·지원청·학급수·학급당 학생수는 공개 데이터라 낸다.
 *    평점은 교사 입력이라 표본이 없다 — 칸은 두되 **고를 수 없게 두고** 눌렀을 때 그 까닭을 적는다.
 *    ⛔ `disabled` 를 걸지 않는다. 크롬은 disabled 단추에 클릭을 안 보내서 **폰에서 까닭을 못 본다**(§11-4).
 *    `aria-disabled` 로 뜻만 알리고, 누르면 까닭이 뜨게 한다.
 *
 * ⛔ 고르는 줄은 44px 이상이다. 손가락으로 눌러야 한다(§11-4).
 */

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { SIDOS, hasAreas, type Sido } from "@/lib/schools";
import {
  fullLabel, gradeChoices, gradeLabel, zoneChoices,
  type Pin,
} from "@/lib/map";

/** 검색 — 필터 칩과 한 줄에 선다 */
export function MapSearch({
  sido, query, found, onQuery, onPick,
}: {
  sido: Sido;
  query: string;
  found: Pin[];
  onQuery: (q: string) => void;
  onPick: (p: Pin) => void;
}) {
  return (
    <div className="relative">
      <div className="glass-2 flex items-center gap-2.5 rounded-card px-4">
        <Search size={16} className="shrink-0 text-ink3" aria-hidden />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="학교 이름"
          className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink3"
          aria-label="학교 이름으로 찾기"
        />
        {/* ⛔ 지우개 자리는 **늘 비워 둔다.** 글자를 넣는 순간 단추가 생기면 입력 칸이 38px 줄어
            치고 있던 글자가 옆으로 밀린다(재 봤다 — 폭 260 → 222). 자리는 두고 단추만 넣고 뺀다. */}
        <span className="flex w-7 shrink-0 justify-end" aria-hidden={!query}>
          {query && (
            <button type="button" onClick={() => onQuery("")} aria-label="지우기" className="-mr-2 p-2 text-ink3 active:opacity-60">
              <X size={16} aria-hidden />
            </button>
          )}
        </span>
      </div>

      {/* ⛔ 목록은 **흐름에서 뺀다.** 흐름에 두면 목록이 자랄 때 아래 필터 칩을 밀어낸다
          (폰에서 칩이 296px 내려갔다). 검색창 아래에 얹어 목록만 아래로 자라게 한다.
          ⛔ 그리고 여기엔 펼침 애니메이션(.pop)을 붙이지 않는다 — 글자를 칠 때마다
             결과가 0이 됐다 다시 생기면서 애니메이션이 매번 다시 돌아 화면이 튄다. */}
      {found.length > 0 && (
        <ul className="glass glass-thick absolute inset-x-0 top-[calc(100%+8px)] z-20 max-h-72 overflow-y-auto overscroll-contain rounded-card py-1.5">
          {found.map((p) => (
            <li key={p.k ?? p.n}>
              <button
                type="button"
                onClick={() => onPick(p)}
                className="flex min-h-11 w-full items-center gap-3 px-3.5 py-2.5 text-left active:bg-fill"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{p.f ?? p.n}</span>
                <span className="shrink-0 text-xs text-ink3 tabular-nums">
                  {p.o} · {fullLabel(sido, p.a, p.g)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 필터 칩. **처음부터 다 서 있다**(2026-08-23 사장님 — 「필터를 하나하나 추가하는 방식은
 * 불편하다… 호갱노노처럼 필터를 그냥 다 띄워놔라」).
 * ⛔ 전에는 「지역」 하나만 서고 나머지는 「+」 로 꺼내 쓰게 했다. **꺼내 쓰는 쪽이 덜 불편할 거라는
 *    건 틀린 짐작이었다** — 처음 온 사람은 무엇을 고를 수 있는지조차 모른다.
 * 뺀 것을 다시 넣는 길만 「+」 에 남긴다. 순서가 곧 칩 차례이자 「+」 안의 차례다.
 */
export type FilterKey = "구역" | "급지" | "지원청" | "시군구" | "학급수";
/**
 * ⛔ **차례는 「넓은 것 → 좁은 것」이다** (2026-08-23 사장님이 정하셨다) —
 *    지역 → 지원청 → 시군구 → 구역 → 급지 → 학급수.
 *    앞의 셋은 **어디인가**(행정 단위가 점점 좁아진다), 뒤의 셋은 **어떤 학교인가**다.
 *    ⛔ 여기 차례가 곧 **칩이 서는 차례이자 「+」 안의 차례**다. 두 곳에 따로 적지 않는다.
 */
export const ADDABLE: { key: FilterKey; kind: "학교 고르기" }[] = [
  { key: "지원청", kind: "학교 고르기" },
  { key: "시군구", kind: "학교 고르기" },
  { key: "구역", kind: "학교 고르기" },
  { key: "급지", kind: "학교 고르기" },
  { key: "학급수", kind: "학교 고르기" },
];

/** 처음에 세워 두는 칩 — **전부**다. 시·도에 없는 것은 화면이 알아서 뺀다(인천엔 구역이 없다) */
export const ALL_FILTERS: FilterKey[] = ADDABLE.map((a) => a.key);

/**
 * 펼침을 누른 단추 아래에 앉힌다. **화면 밖으로 나가면 안으로 당긴다.**
 * ⛔ `left`·`top` 으로 옮긴다. `transform` 은 펼침 애니메이션(.pop)이 쓰고 있어서 여기서 건드리면 지워진다.
 */
const place = (el: HTMLDivElement | null, btn: HTMLElement | null) => {
  if (!el || !btn) return;
  const b = btn.getBoundingClientRect();
  const M = 8;
  el.style.top = `${b.bottom + M}px`;
  el.style.left = `${Math.max(M, Math.min(b.left, window.innerWidth - el.offsetWidth - M))}px`;
};

/** 필터 칩 하나 — 「무엇을 고르는 칸인지 + 지금 고른 값」을 늘 보여준다 */
function Chip({
  label, value, open, onOpen, onDrop, width, children,
}: {
  label: string;
  value: string;
  open: boolean;
  onOpen: () => void;
  /** 칩을 도로 넣는다. 「지역」은 못 뺀다 */
  onDrop?: () => void;
  width: string;
  children: React.ReactNode;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  return (
    // ⛔ `group` 은 마우스가 있는 화면에서만 뜻이 있다. 아래 ✕ 를 보라.
    <div className="group pointer-events-auto relative shrink-0">
      {/*
        ⛔ **높이 44px(h-11)는 안 줄인다** — 손가락이 닿는 최소치다(§11-4).
           2026-08-23 사장님 「버튼들 사이즈만 미세하게 조정하면 저렇게 잘리지 않고 들어갈 것 같은데」에
           맞춰 줄인 것은 **좌우 여백·사이 간격·글자 크기**뿐이다. 칩 하나가 약 14px 좁아진다.
      */}
      <button
        ref={btn}
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        className={`glass-2 flex h-11 items-center gap-1.5 rounded-full pl-3.5 active:opacity-80 ${
          onDrop ? "pr-9" : "pr-2.5"
        } ${open ? "ring-2 ring-key" : ""}`}
      >
        <span className="text-[11px] font-medium text-ink3">{label}</span>
        <span className="max-w-32 truncate text-[13px] font-semibold whitespace-nowrap">{value}</span>
        <ChevronDown size={14} className={`text-ink3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {/*
        칩을 바로 지우는 ✕ (2026-08-23 사장님 — 「호버했을 때 삭제 버튼이 나와서 바로 지울 수 있게」).
        ⛔ **폰에서는 늘 보인다.** 손가락에는 호버가 없어, 호버 뒤에 숨기면 영영 못 누른다(§11-4).
           그래서 `lg:` 안쪽에서만 숨긴다 — 마우스가 있는 화면에서만 깔끔해지고 폰은 늘 눌린다.
        ⛔ 가드 ③ 이 이 꼴(`opacity-0 … group-hover:opacity-`)을 센다. **일부러 늘린 것**이라
           베이스라인을 1 로 옮겼다(까닭은 커밋 메시지에 적었다).
        ⛔ 44px 를 다 주면 칩 글자를 덮는다. 칩 오른쪽 여백(pr-9)만큼만 차지하고 세로로는 꽉 채운다.
      */}
      {onDrop && (
        <button
          type="button"
          onClick={onDrop}
          aria-label={`${label} 필터 빼기`}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-full text-ink3 opacity-100 transition-opacity active:opacity-60 lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100"
        >
          <X size={14} aria-hidden />
        </button>
      )}

      {open && (
        <>
          {/* 바깥을 누르면 닫힌다. 폰에서 손가락으로 닫을 자리가 있어야 한다 */}
          <button type="button" aria-label="닫기" onClick={onOpen} className="fixed inset-0 z-10 cursor-default" />
          <div
            ref={(el) => place(el, btn.current)}
            className={`glass glass-thick pop fixed z-20 max-h-[70vh] overflow-y-auto overscroll-contain rounded-panel p-2 ${width}`}
          >
            {/* ⛔ 「빼기」 줄은 없앴다 — 칩 자체에 ✕ 가 붙어 같은 일을 둘로 하게 된다(§11-3) */}
            {children}
          </div>
        </>
      )}
    </div>
  );
}


/**
 * 칩 줄을 **가로로 밀 수 있게** 한다 (2026-08-23 사장님 — 「필터를 슬라이드해서 조정할 수
 * 있게 해줘야 하는데 지금 슬라이드가 안됨」).
 *
 * ⛔ `overflow-x-auto` 만으로는 **마우스로 못 민다.** 그것은 「넘치면 스크롤을 허용한다」는 뜻일 뿐,
 *    미는 방법은 따로다 — 손가락은 그냥 밀리고 트랙패드는 두 손가락으로 밀리지만,
 *    **휠 달린 마우스는 세로로만 굴러간다.** 스크롤막대까지 숨겨 놨으니 밀 방법이 아예 없었다.
 *    그래서 둘을 붙인다 — ① 세로 휠을 가로로 옮긴다 ② 마우스로 잡아끌 수 있게 한다.
 *
 * ⛔ `passive: false` 로 직접 단다. React 의 `onWheel` 은 passive 로 붙어
 *    `preventDefault()` 가 무시된다(콘솔에 경고만 뜬다).
 * ⛔ **넘칠 때만** 가로챈다. 칩이 다 보이는데도 가로채면 그 위에서 페이지가 안 움직인다.
 * ⛔ 잡아끈 뒤의 클릭은 삼킨다. 안 그러면 밀어 놓고 손을 뗀 자리의 칩이 **열린다.**
 *    5px 을 넘게 움직였을 때만 끈 것으로 친다(손떨림은 클릭으로 남긴다).
 * ⛔ 손가락(`pointerType === "touch"`)은 건드리지 않는다 — 브라우저가 이미 밀어 준다.
 *    가로채면 오히려 관성이 사라져 뻑뻑해진다.
 * ⛔ 줄에 `select-none` 을 건다 — 잡아끌면 브라우저가 **칩 글자를 긁는다**(파랗게 잡힌다).
 *    지도에서 난 것과 **같은 결함**이라 같이 고쳤다(§11-3 · §12-127).
 */
function useSlide() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const over = () => el.scrollWidth > el.clientWidth + 1;

    const wheel = (e: WheelEvent) => {
      if (!over() || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };

    let from = 0;
    let at = 0;
    let moved = false;
    let on = false;

    const down = (e: PointerEvent) => {
      if (e.pointerType === "touch" || !over()) return;
      on = true;
      moved = false;
      from = e.clientX;
      at = el.scrollLeft;
    };
    const move = (e: PointerEvent) => {
      if (!on) return;
      const dx = e.clientX - from;
      if (!moved && Math.abs(dx) < 5) return;
      moved = true;
      el.setPointerCapture?.(e.pointerId);
      el.scrollLeft = at - dx;
    };
    const up = () => { on = false; };
    const click = (e: MouseEvent) => {
      if (!moved) return;
      moved = false;
      e.stopPropagation();
      e.preventDefault();
    };

    el.addEventListener("wheel", wheel, { passive: false });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("click", click, true);
    return () => {
      el.removeEventListener("wheel", wheel);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("click", click, true);
    };
  }, []);

  return ref;
}

/** 고르는 줄 하나 — 44px 이상 */
function Row({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className="flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3 text-left text-sm active:bg-fill"
    >
      <span className="min-w-0 flex-1">{children}</span>
      {on ? <Check size={16} className="shrink-0 text-key" aria-hidden /> : <span className="w-4 shrink-0" aria-hidden />}
    </button>
  );
}

/**
 * 여러 개를 고르는 칸. 맨 위 「전체」 는 고른 것을 다 지운다.
 *
 * ⛔ **없는 값은 안 낸다**(2026-08-22 사장님 — 엑셀처럼). 지원청을 서부로 놓으면
 *    서부에 실제로 있는 급지만 나온다. 전에는 서부에 하나도 없는 「?」가 그대로 서 있었다.
 * ⛔ **다만 지금 고른 값은 없어도 남긴다.** 안 남기면 골라 놓고 그것을 못 푼다 —
 *    지도는 0교인데 왜 0교인지 화면 어디에도 안 보이는 상태가 된다.
 */
function Many({ picked, onPick, items, at }: {
  picked: string[];
  onPick: Dispatch<SetStateAction<string[]>>;
  items: { key: string; label: string }[];
  /** 지금 고를 수 있는 값. 없으면 다 낸다 */
  at?: Set<string>;
}) {
  const rows = at ? items.filter((it) => at.has(it.key) || picked.includes(it.key)) : items;
  // ⛔ 앞의 값을 props 에서 읽어 새 배열을 만들지 않는다. 같은 순간에 두 번 눌리면
  //    둘 다 옛 값을 읽어 **먼저 누른 것이 사라진다.** 앞 값을 받아 고치는 꼴로 넘긴다.
  const flip = (k: string) => onPick((v) => (v.includes(k) ? v.filter((x) => x !== k) : [...v, k]));
  return (
    <>
      <Row on={picked.length === 0} onClick={() => onPick([])}>전체</Row>
      {rows.map((it) => (
        <Row key={it.key} on={picked.includes(it.key)} onClick={() => flip(it.key)}>{it.label}</Row>
      ))}
      {/* ⛔ 빈 채로 두지 않는다. 갑구역에는 급지가 없어 목록이 「전체」 하나만 남는데,
          아무 말도 없으면 고장난 것처럼 읽힌다. 없다는 것도 값이다. */}
      {rows.length === 0 && <p className="px-3 py-2 text-xs text-ink3">고를 것이 없습니다</p>}
    </>
  );
}

/**
 * 학급수 — **슬라이더 둘**(2026-08-22 사장님 「학급수는 필터는 슬라이더로 바꿔」).
 *
 * ⛔ 손잡이 둘을 한 줄에 겹쳐 두지 않는다. 겹치면 폰에서 어느 쪽을 잡았는지 알 수 없다(§11-4).
 *    최소·최대를 두 줄로 갈라 각각 44px 높이를 준다.
 * ⛔ 한쪽이 다른 쪽을 넘지 못하게 그 자리에서 막는다 — 넘긴 뒤에 고쳐 주면 값이 튄다.
 * ⛔ 끝값은 붙박이가 아니다. 나머지 필터를 지난 학교의 최소·최대를 받는다(엑셀 자동필터와 같은 뜻).
 */
function ClassRange({
  bound, value, onPick,
}: {
  bound: [number, number];
  value: [number, number] | null;
  onPick: Dispatch<SetStateAction<[number, number] | null>>;
}) {
  const [lo, hi] = value ?? bound;
  // ⛔ 다른 필터가 좁혀 놓으면 지금 고른 값이 끝값 **밖**으로 밀린다. 그대로 두면
  //    손잡이가 글자와 딴 자리에 서고, 그 손잡이를 잡는 순간 값이 훌쩍 튄다. 끝값을 넓혀 담는다.
  const [b0, b1] = [Math.min(bound[0], lo), Math.max(bound[1], hi)];
  const bar = "mt-1 h-11 w-full cursor-pointer accent-key";
  return (
    <div className="px-3 pb-2 pt-1">
      <p className="text-[15px] font-semibold tabular-nums">
        {lo} ~ {hi}
        <span className="ml-1 text-xs font-medium text-ink3">학급</span>
      </p>

      <label className="mt-1 block">
        <span className="text-[11.5px] font-medium text-ink3">최소</span>
        <input
          type="range" min={b0} max={b1} value={lo} aria-label="학급수 최소"
          onChange={(e) => onPick([Math.min(Number(e.target.value), hi), hi])}
          className={bar}
        />
      </label>

      <label className="block">
        <span className="text-[11.5px] font-medium text-ink3">최대</span>
        <input
          type="range" min={b0} max={b1} value={hi} aria-label="학급수 최대"
          onChange={(e) => onPick([lo, Math.max(Number(e.target.value), lo)])}
          className={bar}
        />
      </label>
    </div>
  );
}

/** 여럿 고른 것을 칩에 짧게 적는다 — 둘까지는 이름, 그 위로는 개수 */
const brief = (labels: string[]) =>
  labels.length === 0 ? "전체" : labels.length <= 2 ? labels.join(" · ") : `${labels[0]} 외 ${labels.length - 1}`;

export function MapFilters({
  sido,
  zones, grades, offices, cities, classes, officeChoices, cityChoices, avail, shown,
  onSido,
  onZones, onGrades, onOffices, onCities, onClasses, onShown,
}: {
  sido: Sido;
  /** 고른 구역(경기 갑·을·병 · 인천 Ⅰ·Ⅱ·Ⅲ). 비어 있으면 전부 */
  zones: string[];
  /** 고른 급지. 비어 있으면 전부 */
  grades: string[];
  /** 고른 지원청. 비어 있으면 전부 */
  offices: string[];
  /**
   * 고른 시·군. 비어 있으면 전부.
   * ⛔ 지원청과 **다른 값이다** — 경기는 광주하남·구리남양주처럼 두 시를 묶은 지원청이 여섯이고
   *    인천은 남부 하나가 네 구·군을 덮는다. 지원청은 「갈 수 있는 범위」, 시·군은 「사는 곳」이다.
   */
  cities: string[];
  /** 고른 학급수 범위 `[최소, 최대]`. null 이면 전부 */
  classes: [number, number] | null;
  /** 이 시·도에 실제로 있는 지원청 이름 */
  officeChoices: string[];
  /** 이 시·도에 실제로 있는 시·군 이름 */
  cityChoices: string[];
  /**
   * **다른 필터를 지난 학교에 실제로 있는 값**만 담은 꾸러미(2026-08-22 사장님 — 엑셀 자동필터처럼).
   * ⛔ 지금 고른 값은 여기 없어도 목록에 남긴다 — 안 남기면 **골라 놓고 못 푼다.**
   */
  avail: {
    zones: Set<string>;
    grades: Set<string>;
    offices: Set<string>;
    cities: Set<string>;
    /** 나머지 필터를 지난 학교의 학급수 최소·최대. 하나도 없으면 null */
    classes: [number, number] | null;
  };
  /** 지금 꺼내 둔 칩 */
  shown: FilterKey[];
  onSido: (s: Sido) => void;
  onZones: Dispatch<SetStateAction<string[]>>;
  onGrades: Dispatch<SetStateAction<string[]>>;
  onOffices: Dispatch<SetStateAction<string[]>>;
  onCities: Dispatch<SetStateAction<string[]>>;
  onClasses: Dispatch<SetStateAction<[number, number] | null>>;
  onShown: Dispatch<SetStateAction<FilterKey[]>>;
}) {
  const [open, setOpen] = useState<null | "지역" | "추가" | FilterKey>(null);
  const flip = (k: NonNullable<typeof open>) => setOpen((v) => (v === k ? null : k));
  /** 아직 못 내는 필터를 눌렀을 때 뜨는 까닭 */
  const [why, setWhy] = useState(false);
  const plus = useRef<HTMLButtonElement>(null);

  /**
   * ⛔ **인천은 「구역」을 안 낸다**(2026-08-22 사장님).
   *    인천 인사구역(Ⅰ·Ⅱ·Ⅲ)은 교사가 전보 때 보는 값이 아니다 — 보는 값은 급지(가·나·다)다.
   *    학교 상세에서도 같은 까닭으로 이미 뺐다(`school-panel.tsx`). 저장은 그대로 두고 화면에만 안 낸다.
   */
  const addable = ADDABLE.filter(
    (a) =>
      !(a.key === "구역" && sido === "인천") &&
      /**
       * ⛔ **인사구역 고시를 아직 안 읽은 시·도에서는 구역·급지를 아예 안 낸다.**
       *    고를 거리가 없는 칩을 세워 두면 눌러 보고 빈 목록을 보게 된다 —
       *    「값이 없는 학교」로 읽히지만 없는 것은 우리가 읽은 고시문이다(§12 공지가 그 말을 한다).
       */
      !((a.key === "구역" || a.key === "급지") && !hasAreas(sido)),
  );
  const canPick = (k: FilterKey) => addable.some((a) => a.key === k) || (k !== "구역" && k !== "급지");

  const has = (k: FilterKey) => shown.includes(k);
  const drop = (k: FilterKey) => {
    onShown((v) => v.filter((x) => x !== k));
    setOpen(null);
    if (k === "구역") onZones([]);
    if (k === "급지") onGrades([]);
    if (k === "지원청") onOffices([]);
    if (k === "시군구") onCities([]);
    if (k === "학급수") onClasses(null);
  };
  const add = (k: FilterKey) => (has(k) ? drop(k) : onShown((v) => [...v, k]));
  const slide = useSlide();

  return (
    // ⛔ `w-fit max-w-full` 이다. 폭을 다 차지하면 칩 오른쪽 **빈자리까지 손가락을 먹어**
    //    그 아래 지도를 못 끈다(재 봤다 — 빈자리를 누르면 이 칸이 받았다).
    //    내용만큼만 차지하되 화면을 넘으면 그 안에서 민다.
    // ⛔ 칩이 다섯이면 넘치는 것이 보통이다(2026-08-23 부터 처음부터 다 선다) — 가로로 민다.
    //    ⛔ 줄바꿈하지 않는다. 두 줄이 되면 지도 위쪽을 통째로 덮는다.
    <div className="relative min-w-0">
    <div
      ref={slide}
      /**
       * ⛔ **여백 20px 을 두고 바깥 여백으로 도로 당긴다**(`-m-5 p-5`)
       *    — 2026-08-23 사장님 「사각형 박스가 눈에 확 띄니까 / 그림자의 경계가 딱 그어져있는게
       *    눈으로 보이니까 좀 짜쳤음」.
       *    ⭐ **`overflow-x-auto` 는 세로로도 자른다.** 한 축이 `visible` 이 아니면 다른 축도
       *       `auto` 가 된다(CSS 규칙이다). 그래서 알약의 그림자가 이 칸 모서리에서
       *       **일직선으로 싹둑 잘려** 사각형 테두리로 보였다. 알약은 둥근데 사각형이 보인 까닭이다.
       *    ⛔ 여백만 주면 줄이 그만큼 커지므로 **바깥 여백으로 같은 만큼 당긴다.** 자리는 그대로다.
       * ⛔⛔ **여기에 `pointer-events-none` 을 걸면 폰에서 칩 줄을 못 민다.**
       *    2026-08-23 사장님 — 「모바일에서 필터가 슬라이드로 넘기는게 안됨. **아이폰, 사파리,
       *    네이버 브라우저 모두 다**」. 까닭은 이렇다 — 손가락으로 미는 것은 브라우저가
       *    **눌린 자리를 찾아(hit-test) 그 칸의 스크롤을 굴리는 것**인데, `pointer-events: none`
       *    이면 이 칸이 **찾아지지 않는다.** 손가락이 이 칸을 통과해 지도로 가 버려서,
       *    칩 줄은 제자리에 있고 지도만 끌렸다.
       *    ⚠️ **마우스로는 `useSlide` 가 대신 밀어 줘서 데스크톱에서는 멀쩡해 보였다** —
       *       폰에서만 나는 결함이라 오래 안 드러났다.
       * ⛔ 그래서 **켠다.** 대신 `touch-action: pan-x` 로 **가로만** 받는다 —
       *    세로로 쓸어내리는 것까지 먹으면 이 줄 위에서 지도가 아예 안 움직인다.
       * ⚠️ 맞바꾼 것 — 알약 위아래 여백(그림자 자리) 20px 이 손가락을 먹는다.
       *    `w-fit` 이라 **가로로는 알약이 있는 만큼만** 먹으므로 옆 빈자리는 그대로 지도가 받는다.
       */
      style={{ touchAction: "pan-x" }}
      className="chip-row pointer-events-auto -m-5 flex w-fit max-w-full select-none items-start gap-1.5 overflow-x-auto overscroll-x-contain p-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {/*
        시·도 고르기 — **열일곱이다**(2026-08-23 전국 적재).
        ⛔ 한 줄로 늘어놓지 않고 **둘로 가른다.** 인사구역·급지·모의지원이 있는 곳과
           학교 정보만 있는 곳은 화면에서 할 수 있는 일이 다르다. 고르기 전에 알려 준다.
        ⛔ 「준비 중」이라고 적되 못 고르게 막지는 않는다 — 학교 정보는 다 들어 있다.
      */}
      <Chip label="지역" value={sido} open={open === "지역"} onOpen={() => flip("지역")} width="w-44">
        {([true, false] as const).map((ruled) => {
          const list = SIDOS.filter((s) => hasAreas(s) === ruled);
          if (!list.length) return null;
          return (
            <div key={String(ruled)} className={ruled ? "" : "mt-1 border-t border-divider pt-1"}>
              <p className="px-3 pb-1 pt-2 text-[11.5px] font-semibold text-ink3">
                {ruled ? "인사구역 · 급지" : "학교 정보 · 인사구역 준비 중"}
              </p>
              {list.map((s) => (
                <Row key={s} on={sido === s} onClick={() => { onSido(s); setOpen(null); }}>{s}</Row>
              ))}
            </div>
          );
        })}
      </Chip>

      {has("지원청") && (
        <Chip
          label="지원청" value={brief(offices)} open={open === "지원청"}
          onOpen={() => flip("지원청")} onDrop={() => drop("지원청")} width="w-56"
        >
          <Many picked={offices} onPick={onOffices} items={officeChoices.map((o) => ({ key: o, label: o }))} />
        </Chip>
      )}

      {has("시군구") && (
        <Chip
          label="시군구" value={brief(cities)} open={open === "시군구"}
          onOpen={() => flip("시군구")} onDrop={() => drop("시군구")} width="w-56"
        >
          <Many picked={cities} onPick={onCities} at={avail.cities} items={cityChoices.map((c) => ({ key: c, label: c }))} />
        </Chip>
      )}

      {has("구역") && canPick("구역") && (
        <Chip
          label="구역" value={brief(zones)} open={open === "구역"}
          onOpen={() => flip("구역")} onDrop={() => drop("구역")} width="w-44"
        >
          <Many picked={zones} onPick={onZones} at={avail.zones} items={zoneChoices(sido).map((z) => ({ key: z, label: z }))} />
        </Chip>
      )}

      {has("급지") && canPick("급지") && (
        <Chip
          label="급지" value={brief(grades.map((g) => gradeLabel(sido, g, true)))} open={open === "급지"}
          onOpen={() => flip("급지")} onDrop={() => drop("급지")} width="w-48"
        >
          <Many
            picked={grades} onPick={onGrades} at={avail.grades}
            items={gradeChoices(sido).map((g) => ({ key: g, label: gradeLabel(sido, g) }))}
          />
        </Chip>
      )}

      {has("학급수") && (
        <Chip
          label="학급수" value={classes ? `${classes[0]} ~ ${classes[1]}` : "전체"}
          open={open === "학급수"} onOpen={() => flip("학급수")} onDrop={() => drop("학급수")} width="w-64"
        >
          <Row on={classes == null} onClick={() => onClasses(null)}>전체</Row>
          {avail.classes ? (
            <ClassRange bound={avail.classes} value={classes} onPick={onClasses} />
          ) : (
            <p className="px-3 py-2 text-xs text-ink3">고를 것이 없습니다</p>
          )}






        </Chip>
      )}

      {/* 「+」 — 필요한 필터를 그때그때 꺼낸다.
          ⛔ **늘 맨 뒤에 선다**(2026-08-23 사장님). 가운데 있으면 필터를 더할 때마다
             단추가 오른쪽으로 밀려, 두 번째를 누르려면 손이 매번 다른 자리를 찾아야 한다. */}
      <div className="pointer-events-auto shrink-0">
        <button
          ref={plus}
          type="button"
          onClick={() => { flip("추가"); setWhy(false); }}
          aria-expanded={open === "추가"}
          aria-label="필터 고르기"
          className={`glass-2 flex size-11 items-center justify-center rounded-full active:opacity-80 ${
            open === "추가" ? "ring-2 ring-key" : ""
          }`}
        >
          <Plus
            size={18}
            className={`text-ink2 transition-transform duration-200 ${open === "추가" ? "rotate-45" : ""}`}
            aria-hidden
          />
        </button>

        {open === "추가" && (
          <>
            <button type="button" aria-label="닫기" onClick={() => flip("추가")} className="fixed inset-0 z-10 cursor-default" />
            <div
              ref={(el) => place(el, plus.current)}
              className="glass glass-thick pop fixed z-20 max-h-[70vh] w-56 overflow-y-auto overscroll-contain rounded-panel p-2"
            >
              {(["학교 고르기"] as const).map((kind) => (
                <div key={kind}>
                  <p className="px-3 pb-1 pt-2 text-[11.5px] font-semibold text-ink3">{kind}</p>
                  {addable.filter((a) => a.kind === kind).map((a) => (
                    <Row key={a.key} on={has(a.key)} onClick={() => add(a.key)}>{a.key}</Row>
                  ))}
                </div>
              ))}

              {/* ⛔ 표본이 없는 값은 고를 수 있는 척 두지 않는다. 칸은 두고 까닭을 적는다 */}
              <div className="mt-1 border-t border-divider pt-1">
                <button
                  type="button"
                  aria-disabled="true"
                  // ⛔ 토글이 아니다. 누르면 껐다가 그 자리의 hover 가 곧바로 다시 켜서 깜빡인다.
                  //    셋 다 「켠다」로 두면 어느 순서로 와도 결과가 같다. 닫는 일은 「+」를 여닫을 때 한다.
                  onClick={() => setWhy(true)}
                  onMouseEnter={() => setWhy(true)}
                  onFocus={() => setWhy(true)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3 text-left text-sm text-ink3"
                >
                  <span className="min-w-0 flex-1">평점</span>
                </button>
                {why && <p className="px-3 pb-2 text-xs leading-relaxed text-ink3">데이터가 충분히 쌓이면 제공할 예정입니다</p>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* ⛔ 행정구역 경계·도서 지역은 **여기 없다.** 필터가 아니라 지도 레이어라
          오른쪽 위 레이어 단추로 옮겼다(`map-layers.tsx` · §12-90, 2026-08-23 사장님).
          켜 둔 것은 그 단추 색으로 알린다 — 칩 줄에 섞으면 또 필터로 읽힌다. */}
    </div>
    </div>
  );
}
