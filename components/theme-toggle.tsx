"use client";

/**
 * 밝게 / 어둡게 / 자동 — **값과 적용만** 여기 둔다. 고르는 화면은 `components/app-rail.tsx` 다.
 *
 * ⛔ **아무것도 안 고른 사람은 「밝게」다**(2026-08-23 사장님). 운영체제를 따라가면
 *    어두운 화면을 쓰는 사람에게 첫인상이 통째로 달라진다 — 지도 배경 타일까지 바뀐다.
 *    「자동」은 남겨 둔다. 고른 사람만 운영체제를 따라간다.
 * ⛔ 「자동」은 data-theme 을 아예 안 붙인다. 붙이면 운영체제 설정을 못 따라간다.
 *    밝게·어둡게는 붙여서 운영체제 설정을 이긴다(globals.css 가 그 세 갈래를 다 받는다).
 * ⛔ 첫 그림이 그려지기 전에 정해야 한다. 늦으면 어두운 화면이 한 번 번쩍인다 —
 *    그래서 <head> 에서 먼저 한 줄 돌린다(THEME_SCRIPT).
 */

const KEY = "runaway.theme";
export type Theme = "auto" | "light" | "dark";

/** 화면이 그려지기 전에 돌아야 하는 한 줄. 안 그러면 색이 한 번 번쩍인다. */
export const THEME_SCRIPT = [
  'try{',
  `var d=document.documentElement,t=localStorage.getItem("${KEY}");`,
  // 「자동」만 표시를 떼서 운영체제를 따라간다. 안 골랐으면(null) 밝게다.
  'if(t==="auto"){delete d.dataset.theme}else{d.dataset.theme=t==="dark"?"dark":"light"}',
  '}catch(e){document.documentElement.dataset.theme="light"}',
].join("");

export function apply(t: Theme) {
  const el = document.documentElement;
  if (t === "auto") delete el.dataset.theme;
  else el.dataset.theme = t;
  try {
    // ⛔ 「자동」도 적어 둔다. 지우면 「안 골랐다」와 구별이 안 되고, 안 고른 사람은 밝게다.
    localStorage.setItem(KEY, t);
  } catch {}
  // 지도가 배경 타일을 바꿔야 하므로 알린다
  window.dispatchEvent(new CustomEvent("runaway:theme"));
}

/** 지금 어두운 화면인가. 지도가 배경 타일을 고를 때 쓴다. */
export const isDarkNow = () => {
  const set = document.documentElement.dataset.theme;
  if (set === "dark") return true;
  if (set === "light") return false;
  // data-theme 이 없으면 「자동」을 고른 것이다 — 그때만 운영체제를 본다
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
};

/**
 * 사람이 골라 둔 값. ⛔ **안 골랐으면 「밝게」다**(2026-08-23 사장님) — 「자동」이 아니다.
 * 「자동」은 대놓고 고른 사람만 갖는다.
 */
export function readTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    if (t === "light" || t === "dark" || t === "auto") return t;
  } catch {}
  return "light";
}
