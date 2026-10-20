#!/usr/bin/env node
/**
 * 로컬 Supabase 에만 연결해 개발 서버를 실행한다.
 * CLI 가 알려 주는 현재 스택의 주소와 키를 사용하며 키 값은 출력하지 않는다.
 * 원격 DB 주소나 키를 .env 파일에서 빌려 쓰지 않는다.
 */
import { execFileSync, spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = 3000;
const SITE_URL = `http://localhost:${PORT}`;

let status;
try {
  status = JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15000,
  }));
} catch {
  console.error("로컬 Supabase 상태를 읽지 못했습니다. Supabase CLI 설치와 npm run local:up 상태를 확인하세요.");
  process.exit(1);
}

let api;
try {
  api = new URL(status.API_URL);
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) ||
      api.username || api.password || api.pathname !== "/" || api.search || api.hash) throw new Error();
} catch {
  console.error("로컬 개발 서버는 HTTP loopback Supabase 주소만 허용합니다.");
  process.exit(1);
}
const URL_ = api.origin;
const ANON = status.ANON_KEY || status.PUBLISHABLE_KEY;
const SERVICE = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (typeof ANON !== "string" || !ANON || typeof SERVICE !== "string" || !SERVICE) {
  console.error("로컬 Supabase 상태에 클라이언트 키 또는 서버 키가 없습니다. 로컬 스택 설정을 확인하세요.");
  process.exit(1);
}

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/**
 * 그 포트가 비었나.
 *
 * ⛔⛔ **`listen(port, "127.0.0.1")` 로 재면 안 된다 — 실제로 뚫렸다**(2026-08-24).
 *    옆 프로젝트의 `next dev` 는 `:::3000`(IPv6 의 모든 주소)를 잡는데, 거기에 대고
 *    127.0.0.1 만 집어 보면 **비었다고 나온다.** 그래서 문지기가 통과시키고 곧바로
 *    `EADDRINUSE` 로 죽었다. **`next dev` 가 잡는 방식과 똑같이** 주소를 안 적고 잰다.
 */
const free = (port) =>
  new Promise((done) => {
    const s = net.createServer();
    s.once("error", () => done(false));
    s.once("listening", () => s.close(() => done(true)));
    s.listen(port);
  });

async function preflight() {
  // ① 로컬 Supabase 가 떠 있나
  let up = false;
  try {
    const r = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: ANON }, signal: AbortSignal.timeout(5000) });
    up = r.status < 500;
  } catch {
    up = false;
  }
  if (!up) {
    console.error(red("⛔ 로컬 Supabase 가 안 떠 있다."), `\n   ${bold("npm run local:up")} 을 먼저 돌린다.`);
    process.exit(1);
  }

  // ② 함정 씨앗이 심겨 있나 — 없으면 로컬에서 백 번 눌러도 멀쩡하다
  let rows = [];
  try {
    const r = await fetch(`${URL_}/rest/v1/school_rating_avg?select=std_code,n,access`, {
      headers: { apikey: ANON, Authorization: `Bearer ${ANON}` },
      signal: AbortSignal.timeout(5000),
    });
    rows = r.ok ? await r.json() : [];
  } catch {
    rows = [];
  }
  const nullAxis = rows.filter((r) => r.access === null).length;
  if (!rows.length || !nullAxis) {
    console.error(
      red("⛔ 로컬 DB 에 함정 씨앗이 없다."),
      `\n   별점 ${rows.length}곳 · 값이 빈 축이 있는 곳 ${nullAxis}곳.`,
      `\n   ${bold("npm run local:reset")} 으로 ${bold("supabase/seed.sql")} 을 다시 심는다.`,
      dim("\n   (빈 DB 로는 2026-08-24 에 화면을 날린 종류의 결함을 못 잡는다 — DESIGN.md §12-173-4)")
    );
    process.exit(1);
  }

  // ③ 고정한 로컬 주소를 사용할 수 있나
  const ok = await free(PORT);
  if (!ok) {
    console.error(
      red(`⛔ 포트 ${PORT} 이 이미 쓰이고 있다.`),
      `\n   인증 redirect 와 지도 허용 도메인에 ${bold(SITE_URL)} 을 등록하세요.`,
      "\n   기존 프로세스는 자동 종료하지 않습니다. 포트 사용 상태를 확인하세요."
    );
    process.exit(1);
  }

  console.log(
    `${bold("로컬 Supabase")} ${URL_}`,
    `\n${bold("별점이 있는 학교")} ${rows.length}곳 ${dim(`(값이 빈 축이 있는 곳 ${nullAxis}곳 — 함정)`)}`,
    `\n${bold("눌러 볼 것")} 지도에서 ${bold("인천가현초")}(축 하나가 비어 있다) · ${bold("효탑초")}(평가 0건) · ${bold("/admin")}`,
    "\n"
  );
}

await preflight();

// origin 과 실제 포트가 달라지지 않도록 자동 포트 변경을 허용하지 않는다.
const args = ["next", "dev", "--port", String(PORT)];

spawn("npx", args, {
  cwd: ROOT,
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_PUBLIC_SITE_URL: SITE_URL,
    NEXT_PUBLIC_SUPABASE_URL: URL_,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ANON,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE,
  },
}).on("error", () => {
  console.error("로컬 개발 서버를 실행하지 못했습니다. Node.js 와 프로젝트 의존성을 확인하세요.");
  process.exit(1);
}).on("exit", (code) => process.exit(code ?? 0));
