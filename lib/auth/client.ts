"use client";

import { createBrowserClient } from "@supabase/ssr";

/** 브라우저에서 쓰는 Supabase. 로그아웃처럼 화면에서 바로 부르는 자리에 쓴다. */
export const authClient = () =>
  createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
