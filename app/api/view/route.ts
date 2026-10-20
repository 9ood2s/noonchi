/**
 * 학교를 확인한 사람을 하루에 한 번 센다 (`docs/DESIGN.md §12-92`)
 *
 * 사장님(2026-08-23) — 「하루동안 확인한 사람들의 누적 숫자로 가자. **숫자의 크기는 곧 관심도**이니까」.
 *
 * ⛔ **로그인을 요구하지 않는다.** 지도를 여는 사람마다 계정을 만들 수는 없다.
 *    가리는 열쇠는 **httpOnly 쿠키에 든 무작위 uuid** 하나다 — 개인을 가리키는 값이 아니고
 *    다른 어떤 것과도 잇지 않는다.
 * ⛔ **쓰기는 서버만 한다.** `school_views` 에 정책을 하나도 안 만들어서 익명 키로는 못 들어간다 —
 *    열어 두면 아무나 한 학교를 「9,999명이 봤다」로 만들 수 있고 화면은 그걸 확신을 갖고 보여준다.
 * ⛔ **실패해도 화면은 그대로 돈다.** 조회수는 곁들이는 값이지 화면의 조건이 아니다.
 *    다만 **조용히 성공한 척하지 않는다** — 답에 `ok:false` 와 까닭을 담는다(§11-2).
 */

import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writer = url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;

/** 이 브라우저를 가리키는 무작위 값. ⛔ 개인 정보가 아니다 — 다른 무엇과도 잇지 않는다 */
const COOKIE = "nv";
const YEAR = 60 * 60 * 24 * 365;

/** 서울 기준 오늘. ⛔ UTC 로 두면 오전 9시에 하루가 바뀐다 */
const seoulToday = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", dateStyle: "short" }).format(new Date());

export async function POST(req: Request) {
  let body: { stdCode?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "본문을 읽지 못했습니다" }, { status: 400 });
  }
  const stdCode = body.stdCode;
  if (typeof stdCode !== "string" || !/^\d{5,12}$/.test(stdCode))
    return Response.json({ ok: false, error: "학교를 찾지 못했습니다" }, { status: 400 });

  if (!writer) return Response.json({ ok: false, error: "열쇠가 없습니다" }, { status: 503 });

  const jar = await cookies();
  let viewer = jar.get(COOKIE)?.value;
  const fresh = !viewer || !/^[0-9a-f-]{36}$/.test(viewer);
  if (fresh) viewer = crypto.randomUUID();

  // ⛔ 같은 사람이 열 번 열어도 1이다. 기본키가 (학교·날짜·사람)이라 두 번째는 조용히 지나간다.
  const { error } = await writer
    .from("school_views")
    .upsert({ std_code: stdCode, day: seoulToday(), viewer }, { onConflict: "std_code,day,viewer", ignoreDuplicates: true });

  const res = Response.json(error ? { ok: false, error: error.message } : { ok: true });
  if (fresh)
    jar.set(COOKIE, viewer!, { httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: YEAR });
  return res;
}
