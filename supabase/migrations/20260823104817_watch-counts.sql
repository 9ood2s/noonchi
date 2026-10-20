-- 학교별 「관심목록에 담은 사람 수」 — 말풍선 배지가 읽는다 (docs/DESIGN.md §12-158)
--
-- 사장님(2026-08-23) — 「지금 1명, 2명 이렇게 표기하고 있잖아. 그걸 **관심목록에 추가한 숫자**로
-- 표기하는 거임. **하트랑 숫자 하나만** 띄워주면 됨」.
--
-- ⛔ 낱개 줄은 안 나간다. `watchlist` 는 자기 줄만 읽게 막혀 있고, 여기서 **집계만** 내보낸다 —
--    누가 어느 학교를 담았는지가 새면 「어디로 옮기려는지」가 그대로 드러난다.
--    `security_invoker = false` 라 이 뷰가 표의 RLS 를 대신 지나간다(school_views_today 와 같은 방식).
--
-- ⛔ **`school_watch_reasons` 를 고쳐 쓰지 않는다.** 그쪽은 사유 5축까지 내보내느라
--    `having count(*) >= 3` 으로 묶여 있다(표본이 적으면 안 보여준다 — CLAUDE.md §1).
--    ⭐ **개수는 평균이 아니라 사실이라 그 문턱이 필요 없다** — 「3명이 담았다」는 짐작이 아니다.
--    그래서 문턱 없는 뷰를 따로 만든다. 사유 쪽 문턱을 낮추면 그쪽이 위험해진다.
create or replace view public.school_watch_counts with (security_invoker = false) as
select std_code, count(*)::int as n
  from public.watchlist
 group by std_code;

comment on view public.school_watch_counts is
  '학교별 관심목록에 담은 사람 수. 낱개 줄은 안 나간다.';

grant select on public.school_watch_counts to anon, authenticated;
