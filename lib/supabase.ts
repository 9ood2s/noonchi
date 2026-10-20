import { createClient } from "@supabase/supabase-js";

/**
 * 공개 데이터를 읽는 클라이언트.
 *
 * ⛔ 쓰기에는 쓰지 않는다 — publishable 키는 브라우저에 나가는 값이고, 쓰기는 RLS 로 막혀 있다.
 *    교사 입력(별점·TO 제보·모의지원)이 생기면 로그인한 사용자로 따로 만든다.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL 과 NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없다. .env.example 을 .env.local 로 복사해 채운다."
  );
}

export const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
