#!/usr/bin/env node
/**
 * 실제로 눌러 보는 검사 — 크롬을 띄워 화면을 열고 **콘솔 오류까지 줍는다**
 *
 * 사장님(2026-08-24) — 「로컬서버 연김에 **다른 찐빠도 없는지 직접 작동 테스트** 진행해봐」.
 *
 * ⛔⛔ **`npm run verify` 가 못 잡는 것을 잡으려고 만들었다.** 그날 두 번 다 그랬다 —
 *    ① 별점 축이 비어 있어 `null.toFixed(1)` 로 판이 통째로 날아간 것(§12-173-4)
 *    ② 학교를 누르기만 해도 경로가 그려져 지도가 축소된 것(§12-174).
 *    **둘 다 타입도 빌드도 초록이었다.** 화면은 「들어온 값」으로 도는데 검사기는 「적힌 것」만 본다.
 *
 * ⛔ **새 패키지를 안 깐다**(사장님 · Playwright 등). 크롬을 `--remote-debugging-port` 로 띄우고
 *    **Node 에 들어 있는 WebSocket** 으로 직접 몬다. 붙는 것은 크롬 하나뿐이다(§ 브라우저는 크롬).
 *
 * ⛔ **반드시 로컬을 본다.** `npm run local:dev` 가 띄운 주소를 쓴다 — 운영을 눌러 보면
 *    별점·제보가 진짜로 남는다.
 *
 * 쓰는 법 — 창 둘로 나눠 돌린다
 *   ① npm run local:dev
 *   ② npm run smoke -- <주소>       (주소를 안 주면 http://localhost:3000)
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PORT = 9222;

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * 집 — ⛔ **DB 가 아니라 브라우저에 있다**(§12-57). `supabase/seed.sql` 의 통근 캐시와
 *    **같은 격자**여야 「재 둔 값이 있는 학교」가 재현된다.
 */
// 합성 테스트 출발지다. 실제 사용자의 집 좌표가 아니다.
const HOME = { label: "테스트 출발지", gy: 8340, gx: 22302, at: "07:30" };

// ── 크롬을 몬다 (CDP) ───────────────────────────────────────────────────────

let seq = 0;
const waiting = new Map();
/** 이번 화면에서 주운 오류들. ⛔ 지우지 않고 쌓아 두었다가 화면이 바뀔 때 비운다 */
let bag = [];

function send(ws, method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((ok, no) => {
    waiting.set(id, { ok, no });
    setTimeout(() => waiting.delete(id) && no(new Error(`${method} 응답이 없다`)), 20000);
  });
}

/** 조건이 참이 될 때까지 기다린다. ⛔ 고정 시간 대기를 쓰지 않는다 — 느린 날 거짓 실패가 난다 */
async function until(ws, expr, ms = 8000) {
  const end = Date.now() + ms;
  for (;;) {
    const r = await send(ws, "Runtime.evaluate", { expression: expr, returnByValue: true });
    if (r.result?.value) return true;
    if (Date.now() > end) return false;
    await new Promise((r2) => setTimeout(r2, 200));
  }
}

const text = (ws) =>
  send(ws, "Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true }).then(
    (r) => r.result?.value ?? "",
  );

async function go(ws, url) {
  bag = [];
  await send(ws, "Page.navigate", { url });
  await until(ws, "document.readyState === 'complete'", 15000);
  // 화면이 서버에서 받아 그리는 시간을 준다. ⛔ 조건으로 기다리는 것은 각 검사가 따로 한다
  await new Promise((r) => setTimeout(r, 1200));
}

// ── 검사 목록 ───────────────────────────────────────────────────────────────
//
// ⛔ **각 줄이 「무엇이 물리는가」를 갖는다.** 그냥 열어 보고 끝내면 200 만 확인하는 셈이다.

const CASES = [
  {
    name: "지도 첫 화면",
    url: `${BASE}/map`,
    check: async (ws) => {
      const t = await text(ws);
      if (t.includes("화면을 그리지 못했습니다")) return "화면이 통째로 날아갔다";
      return null;
    },
  },
  {
    name: "학교 상세 — 축 하나가 빈 별점 (인천가현 · §12-173-4)",
    url: `${BASE}/map?sido=인천&school=7361023`,
    check: async (ws) => {
      const ok = await until(ws, "document.body.innerText.includes('별점')");
      const t = await text(ws);
      if (t.includes("화면을 그리지 못했습니다")) return "⛔ 그날 그 자리가 또 터졌다";
      if (!ok) return "별점 칸이 안 떴다";
      // 값이 없는 축은 「—」로 그린다. 숫자로 채우거나 0으로 채우면 안 된다
      if (!t.includes("—")) return "값이 없는 축을 「—」로 안 그렸다";
      return null;
    },
  },
  {
    name: "학교 상세 — 평가 0건 (효탑)",
    url: `${BASE}/map?sido=경기&school=7541060`,
    check: async (ws) => {
      const ok = await until(ws, "document.body.innerText.includes('아직 평가가 없습니다')");
      return ok ? null : "「아직 평가가 없습니다」가 안 떴다";
    },
  },
  {
    /**
     * ⛔⛔ 사장님이 잡은 그 결함(§12-174) — 「경로 저장해 놓은 학교를 누르면 누를 때마다
     *    경로 안내 화면이 뜨면서 지도가 축소됨. **누르지도 않았는데**」.
     * ⭐ **지도의 배율을 재지 않는다** — 헤드리스에서 지도 자체가 안 뜰 수 있다.
     *    대신 **원인을 곧바로 잰다**: 아무 경로 카드도 골라져 있으면 안 된다(`aria-pressed`).
     *    골라지는 순간 선이 그려지고 지도가 그 선을 담으려고 축소된다.
     */
    name: "경로를 재 둔 학교를 눌러도 저절로 안 그려진다 (인천가정 · §12-174)",
    url: `${BASE}/map?sido=인천&school=7361021`,
    home: true,
    check: async (ws) => {
      await until(ws, "document.body.innerText.includes('길찾기') || document.body.innerText.includes('출근')");
      const r = await send(ws, "Runtime.evaluate", {
        expression: `[...document.querySelectorAll('[aria-pressed="true"]')]
          .filter(e => /분|빠른길/.test(e.innerText || '')).length`,
        returnByValue: true,
      });
      const n = r.result?.value ?? 0;
      return n > 0 ? `⛔ 누르지도 않았는데 경로 ${n}개가 골라져 있다` : null;
    },
  },
  {
    name: "학교별 정적 화면",
    url: `${BASE}/school/7361023`,
    check: async (ws) => {
      const t = await text(ws);
      return t.includes("인천가현") ? null : "학교 이름이 안 보인다";
    },
  },
  {
    name: "학교 목록 입구",
    url: `${BASE}/school`,
    check: async (ws) => ((await text(ws)).includes("인천") ? null : "시·도 목록이 안 보인다"),
  },
  {
    name: "계산기",
    url: `${BASE}/calc`,
    check: async (ws) => ((await text(ws)).includes("계산기") ? null : "계산기가 안 떴다"),
  },
  {
    name: "운영 화면 — 로그인 안 한 채로 열면 막힌다",
    url: `${BASE}/admin`,
    check: async (ws) => {
      const ok = await until(ws, "/로그인|권한/.test(document.body.innerText)");
      const t = await text(ws);
      if (t.includes("회원") && t.includes("@")) return "⛔ 로그인도 안 했는데 회원 목록이 보인다";
      return ok ? null : "막는 안내가 안 떴다";
    },
  },
];

// ── 돌린다 ──────────────────────────────────────────────────────────────────

const dir = mkdtempSync(path.join(tmpdir(), "noonchi-smoke-"));
const chrome = spawn(
  CHROME,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${dir}`,
    "--headless=new",
    "--no-first-run",
    "--disable-gpu",
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let ws;
let bad = 0;
try {
  /**
   * 크롬이 설 때까지 기다렸다가 **페이지 하나에** 붙는다.
   *
   * ⛔⛔ `/json/version` 이 주는 것은 **브라우저 소켓**이다. 거기에는 `Page`·`Runtime` 이 없어서
   *    `Page.enable` 이 「wasn't found」로 튕긴다(2026-08-24 에 실제로 걸렸다).
   *    화면을 몰려면 `/json/list` 의 `type === "page"` 짜리에 붙어야 한다.
   */
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      target = list.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
    } catch {
      /* 아직 안 떴다 */
    }
    if (!target) await new Promise((r) => setTimeout(r, 250));
  }
  if (!target) throw new Error("크롬 페이지에 못 붙었다");

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, no) => {
    ws.addEventListener("open", ok, { once: true });
    ws.addEventListener("error", () => no(new Error("크롬에 못 붙었다")), { once: true });
  });
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && waiting.has(m.id)) {
      const { ok, no } = waiting.get(m.id);
      waiting.delete(m.id);
      m.error ? no(new Error(m.error.message)) : ok(m.result);
      return;
    }
    // ⛔ **오류를 줍는다.** 화면이 멀쩡해 보여도 콘솔에 터진 것이 있으면 결함이다
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params?.exceptionDetails;
      bag.push(d?.exception?.description ?? d?.text ?? "알 수 없는 예외");
    }
    if (m.method === "Log.entryAdded" && m.params?.entry?.level === "error") {
      /**
       * ⛔ **주소를 같이 줍는다.** 「Failed to load resource: … 401」 은 글만 보면
       *    **어느 요청인지 알 수가 없다**(2026-08-24 에 그것 때문에 못 걸러냈다).
       *    바깥(지도 키 등) 것을 가려내려면 URL 이 있어야 한다.
       */
      const e2 = m.params.entry;
      bag.push(`${e2.url ?? "?"} :: ${e2.text}`);
    }
  });

  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  await send(ws, "Log.enable");

  console.log(`\n크롬으로 ${BASE} 를 눌러 본다\n`);

  for (const c of CASES) {
    // 집이 필요한 검사는 **문서가 서기 전에** 심는다 — 화면이 처음 읽을 때 이미 있어야 한다
    await send(ws, "Page.removeScriptToEvaluateOnNewDocument", { identifier: "1" }).catch(() => {});
    if (c.home) {
      await send(ws, "Page.addScriptToEvaluateOnNewDocument", {
        source: `try{localStorage.setItem("runaway.home", ${JSON.stringify(JSON.stringify(HOME))})}catch{}`,
      });
    }

    await go(ws, c.url);
    let why = null;
    try {
      why = await c.check(ws);
    } catch (e) {
      why = `검사가 던졌다: ${e.message}`;
    }

    /**
     * ⛔ 콘솔 오류를 **덤으로 취급하지 않는다.** 다만 우리 잘못이 아닌 것은 거른다 —
     *    지도 키(NCP)는 `localhost:3000` 에서만 통과해서 다른 포트면 늘 실패한다(§12-156-6).
     */
    /**
     * ⛔ 우리 잘못이 아닌 것만 가른다 — 지도 키(NCP)는 **`localhost:3000` 에서만** 통과해서
     *    다른 포트로 열면 늘 401 이 난다(§12-156-6). 그 401 과 그 뒤에 딸려 나오는
     *    네이버 스크립트 안의 오류는 **우리 코드가 아니다.**
     * ⛔ 그렇다고 「401 이면 다 넘긴다」로 두지 않는다 — 주소를 보고 가른다.
     */
    const OUTSIDE = /naver|ncloud|nmap|favicon|Autofill|net::ERR_|chrome-extension/i;
    const mine = bag.filter((t) => !OUTSIDE.test(t));

    if (why || mine.length) {
      bad++;
      console.log(red(`✗ ${c.name}`));
      if (why) console.log(`    ${why}`);
      for (const t of mine.slice(0, 3)) console.log(dim(`    콘솔: ${String(t).slice(0, 160)}`));
    } else {
      console.log(green(`✓ ${c.name}`));
      if (bag.length) console.log(dim(`    (거른 바깥 오류 ${bag.length}개 — 지도 키 등)`));
    }
  }

  console.log(bad ? red(`\n${bad}곳에서 걸렸다\n`) : green(`\n${CASES.length}곳 다 지나갔다\n`));
} catch (e) {
  console.error(red(`⛔ ${e.message}`));
  bad = 1;
} finally {
  try {
    ws?.close();
  } catch {}
  chrome.kill();
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}

process.exit(bad ? 1 : 0);
