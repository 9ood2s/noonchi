-- 관심 사유에 「접근성」을 받아들인다 (docs/DESIGN.md §12-164-1)
--
-- 2026-08-23 사장님이 화면에서 잡으셨다 — 「접근성」을 골라 담으니
--   new row for relation "watchlist" violates check constraint "watchlist_reasons_ck"
--
-- ⛔ **내가 축을 늘리면서 이 검사 조건을 안 봤다.** `lib/ratings.ts` 의 `AXES` 와
--    `school_watch_reasons` 뷰는 고쳤는데, **표에 걸린 `check` 를 빠뜨렸다.**
--    같은 값을 세 곳이 알고 있었고 두 곳만 고친 것이다(CLAUDE.md §11-3 이 말하는 그 사고다).
-- ⚠️ 화면은 실패를 제대로 보여줬다 — 조용히 안 담기지 않았다(§11-2 가 제 일을 했다).
--    그래서 사장님이 눌러 보고 바로 아셨다.
--
-- ⛔ **다음에 축을 늘릴 때 볼 곳 셋** — 늘리기 전에 이 목록을 먼저 읽는다.
--    ① `lib/ratings.ts` 의 `AXES`(화면에 뜨는 이름)
--    ② `public.watchlist` 의 `watchlist_reasons_ck`(여기 — 담을 때 걸린다)
--    ③ `public.school_watch_reasons` 뷰의 `filter (where '…' = any(reasons))`(세는 칸)
--    ⛔ 별점 쪽은 또 다르다 — `ratings` 는 **칸(열)** 이라 `alter table add column` 이다.
alter table public.watchlist drop constraint if exists watchlist_reasons_ck;
alter table public.watchlist add constraint watchlist_reasons_ck
  check (reasons <@ array['관리자', '분위기', '교권', '업무량', '시설', '접근성']::text[]);

comment on constraint watchlist_reasons_ck on public.watchlist is
  '관심 사유는 lib/ratings.ts 의 AXES 라벨과 같은 글자여야 한다. 축을 늘리면 여기도 같이 늘린다.';
