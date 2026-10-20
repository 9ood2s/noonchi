"use client";

/**
 * 지도 레이어 — **지도 위에 무엇을 그릴지** 고르는 자리 (`docs/DESIGN.md §12-90`)
 *
 * ⛔ **이것들은 필터가 아니다.** 필터는 「어느 학교를 보여줄까」이고, 여기는 「지도에 무엇을 얹을까」다.
 *    전에는 셋 다 「+」(필터) 안에 들어 있었다 —
 *      · 도서 지역 → 「지도에 표시」라는 칸 이름만 붙여 필터 안에 뒀다
 * ⛔ **행정구역 경계는 아예 걷어냈다**(2026-08-23 사장님 — 「행정구역 경계 필요없어 지금도
 *    구데기 같아서 안쓰고 싶어」). VWorld WMS 를 중계하던 자리였고, 그게 5분에 502 를 297번
 *    쏟던 원인이었다(`postmortems.md`). 없애니 그 중계도 함께 사라졌다.
 *      · 말풍선 색(범례) → 「말풍선 색 · 눌러서 고르기」로 역시 필터 안에 뒀다
 *    §12-80·81 에서 「묶음·겹쳐보기·색」 칩을 걷어냈는데 **알맹이는 필터 안에 그대로 남아 있었다.**
 *    이름만 바꾼 것이지 자리를 옮긴 게 아니었다(2026-08-23 사장님이 두 번 짚었다).
 *
 * ⛔ **범례는 여기 있어도 여전히 눌러서 고를 수 있다.** 색을 보고 「이게 뭐지」 한 사람이
 *    바로 그 줄을 눌러 그것만 보게 한다(2026-08-21 사장님). 다만 그 결과는 **구역·급지 필터**라
 *    칩 줄에 그 이름으로 선다 — 무엇 때문에 학교가 줄었는지가 거기서 보인다.
 * ⛔ 켜 둔 레이어는 **단추 색으로** 알린다. 필터 칩 줄에 섞지 않는다 — 그러면 또 필터로 읽힌다.
 */

import { useState } from "react";
import { Check, Layers, X } from "lucide-react";
import { PIN_VALUES, type PinValue } from "@/lib/map";
import { hasAreas, type Sido } from "@/lib/schools";

export function MapLayers({
  sido,
  islands,
  hasIslands,
  onIslands,
  legendOn,
  onLegend,
  pinValue,
  onPinValue,
}: {
  /** 지금 보고 있는 시·도. 구역이 없는 곳에서는 「인사구역 · 급지」 줄을 안 낸다 */
  sido: Sido;
  /** 도서 지역 학교를 본 지도에 낼지 */
  islands: boolean;
  /** 이 시·도에 도서 지역이 있나 — 없으면 고를 거리가 없다 */
  hasIslands: boolean;
  onIslands: (v: boolean) => void;
  /** 오른쪽 아래 범례를 낼지 (§12-97) */
  legendOn: boolean;
  onLegend: (v: boolean) => void;
  /** 말풍선에 무엇을 적나 — **여럿을 고를 수 있다** */
  pinValue: PinValue[];
  onPinValue: (v: PinValue[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const on = islands;

  /*
   * 자리 — 넓은 화면은 오른쪽 **위**, 폰은 **칩 줄 아래**다
   * (2026-08-23 사장님 — 「상단 검색창과 필터 처리 방식은 구글 맵을 참고할 것」.
   *  구글 지도도 폰에서 레이어 단추를 칩 줄 **아래** 오른쪽에 둔다).
   * ⛔ 폰에서 이것을 검색 줄 옆에 두면 **검색창이 그만큼 짧아진다** — 오른쪽 56px 을 늘 비워야 했다.
   * ⛔ 120px 은 손으로 잰 값이다 — 여백 12 + 검색 48 + 사이 8 + 칩 44 = 112, 거기에 숨 8.
   *    검색·칩 높이를 바꾸면 **이 값도 같이 바꾼다.**
   * ⛔ 갈래는 `lg:` 다. 자바스크립트로 폭을 재지 않는다(§12-89).
   */
  return (
    <div className="pointer-events-auto absolute right-3 top-[120px] z-40 lg:top-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="지도 레이어"
        className={`glass-2 flex size-11 items-center justify-center rounded-[15px] active:opacity-80 ${
          on ? "text-key" : "text-ink3"
        } ${open ? "ring-2 ring-key" : ""}`}
      >
        {open ? <X size={18} aria-hidden /> : <Layers size={18} strokeWidth={1.7} aria-hidden />}
      </button>

      {open && (
        <>
          {/* 바깥을 누르면 닫힌다. 폰에서 손가락으로 닫을 자리가 있어야 한다 */}
          <button type="button" aria-label="닫기" onClick={() => setOpen(false)} className="fixed inset-0 -z-10 cursor-default" />
          {/* ⛔ 오른쪽에 붙인다. 왼쪽으로 자라면 화면 밖으로 나간다 */}
          <div className="glass glass-thick pop absolute right-0 top-[calc(100%+8px)] w-60 origin-top-right rounded-panel p-2">
            {/* ⛔ **이름은 사장님이 정하신 그대로다**(2026-08-24 — 「지도에 그리기, 말풍선에 적을 값은
                각각 '인덱스', '마커'로 바꿔」). 「지도에 그리기」·「말풍선에 적을 값」은 **설명이지 이름이 아니었다** —
                줄마다 길어 무엇을 고르는 자리인지 한눈에 안 들어왔다.
                ⚠️ 「인덱스」가 가드 ①의 내부 용어 목록에 들어 있어 베이스라인을 0→1 로 올렸다.
                   사장님이 못박은 이름이라 그대로 쓴다 — 가드가 제 일을 한 것이고, 우리가 판단한 것이다. */}
            <p className="px-3 pb-1 pt-2 text-[11.5px] font-semibold text-ink3">인덱스</p>
            {hasIslands && <Row on={islands} onClick={() => onIslands(!islands)}>도서 지역</Row>}
            {/* ⛔ 범례는 **처음부터 켜져 있다.** 색이 무슨 뜻인지 모르면 지도가 그냥 알록달록하다.
                끄고 싶은 사람만 끈다(2026-08-23 사장님 「범례는 켜고 끌 수 있게」). */}
            <Row on={legendOn} onClick={() => onLegend(!legendOn)}>범례</Row>

            {/* ⛔ **범례(「말풍선 색 · 눌러서 고르기」)는 없앴다**(2026-08-23 사장님) —
                「어차피 그게 급지 데이터고 필터로 다 설정하는 건데」. 색으로 고르는 일과
                급지 필터가 **같은 일을 둘로** 하고 있었다(§11-3 이 경계하는 그 꼴이다).
                그 자리에 **무엇을 적을지** 고르는 칸을 둔다 — 이건 필터가 못 하는 일이다. */}
            <p className="mt-1 border-t border-divider px-3 pb-1 pt-2.5 text-[11.5px] font-semibold text-ink3">
              마커
            </p>
            {/* ⛔ 하나만 고르는 자리가 아니다(2026-08-23 사장님). 켜고 끄는 것이 각각이다 */}
            {/* ⛔ 구역이 없는 시·도에서는 「인사구역 · 급지」를 안 낸다 — 골라도 말풍선이 그대로다 */}
            {PIN_VALUES.filter((v) => v.key !== "구역" || hasAreas(sido)).map((v) => (
              <Row
                key={v.key}
                on={pinValue.includes(v.key)}
                onClick={() =>
                  onPinValue(pinValue.includes(v.key) ? pinValue.filter((x) => x !== v.key) : [...pinValue, v.key])
                }
              >
                {v.label}
              </Row>
            ))}
          </div>
        </>
      )}
    </div>
  );
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
