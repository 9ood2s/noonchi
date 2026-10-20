-- 별점·관심 사유에 **접근성**을 더한다 (docs/DESIGN.md §12-164)
--
-- 사장님(2026-08-23) — 「관심사유랑 평가 축에 **'접근성'**도 넣어야함…
-- **교통이 얼마나 편하냐**도 중요한 지표니까」.
--
-- ⭐ 다섯 축이 상한이라고 적어 뒀던 것을 여섯으로 연다(§6). 까닭이 있다 —
--    이 서비스는 **어느 학교로 옮길까**를 고르는 자리이고, 그때 교사가 실제로 재는 것이
--    관리자·분위기만이 아니라 **집에서 얼마나 걸리나**다. 길찾기를 붙인 것도 같은 까닭이었다.
--    다만 길찾기는 **내 집 기준**이라 사람마다 다르고, 이 축은 **그 학교 자체가 얼마나 닿기 쉬운가**다
--    (역·정류장·주차). 둘은 다른 값이라 겹치지 않는다.
--
-- ⛔ 방향은 다른 축과 같다 — **1 나쁨 → 5 좋음.** 「멀수록 높다」가 아니다.
-- ⛔ 이미 남긴 별점은 이 칸이 비어 있다(null). 없는 값을 0으로 채우지 않는다 —
--    0점을 준 사람과 안 고른 사람은 다르다(CLAUDE.md §11-1 의 결).
alter table public.ratings add column if not exists access smallint
  check (access between 1 and 5);

comment on column public.ratings.access is
  '접근성(1~5) — 역·정류장·주차. 2026-08-23 에 더했다. 그 전 별점은 null 이다.';

/**
 * 평균 뷰 둘에 접근성을 더한다.
 * ⛔ **`avg` 는 null 을 세지 않는다** — 접근성을 안 고른 옛 별점이 평균을 끌어내리지 않는다.
 *    그래서 표본수(n)와 접근성 표본수가 다를 수 있다. 화면은 n 하나만 적는다 —
 *    축마다 표본을 따로 적으면 읽는 사람이 무엇을 믿을지 모른다.
 * ⛔ `having count(*) >= 3` 은 그대로다(§6 · 표본이 적으면 안 보여준다).
 */
create or replace view public.school_rating_avg with (security_invoker = false) as
select std_code,
       count(*)::int as n,
       round(avg(admin), 2)    as admin,
       round(avg(mood), 2)     as mood,
       round(avg(rights), 2)   as rights,
       round(avg(workload), 2) as workload,
       round(avg(facility), 2) as facility,
       round(avg(access), 2)   as access
  from public.ratings
 where admin is not null
 group by std_code
having count(*) >= 3;

create or replace view public.school_rating_by_year with (security_invoker = false) as
select std_code,
       started_year,
       count(*)::int as n,
       round(avg(admin), 2)    as admin,
       round(avg(mood), 2)     as mood,
       round(avg(rights), 2)   as rights,
       round(avg(workload), 2) as workload,
       round(avg(facility), 2) as facility,
       round(avg(access), 2)   as access
  from public.ratings
 where admin is not null
 group by std_code, started_year
having count(*) >= 3;

/**
 * 관심 사유에도 더한다. ⛔ 사유는 `text[]` 라 표를 안 고쳐도 되지만,
 *    **집계 뷰가 축마다 칸을 세고 있어서** 여기 한 줄을 더해야 화면이 그 수를 볼 수 있다.
 * ⛔ 라벨 글자(`접근성`)가 `lib/ratings.ts` 의 `AXES` 와 **같아야 한다** — 한쪽만 고치면
 *    세는 칸이 늘 0이 된다(§11-3).
 */
create or replace view public.school_watch_reasons with (security_invoker = false) as
select std_code,
       count(*)::int as n,
       count(*) filter (where considering)::int          as considering,
       count(*) filter (where '관리자' = any(reasons))::int as admin,
       count(*) filter (where '분위기' = any(reasons))::int as mood,
       count(*) filter (where '교권'   = any(reasons))::int as rights,
       count(*) filter (where '업무량' = any(reasons))::int as workload,
       count(*) filter (where '시설'   = any(reasons))::int as facility,
       count(*) filter (where '접근성' = any(reasons))::int as access
  from public.watchlist
 group by std_code
having count(*) >= 3;

grant select on public.school_rating_avg, public.school_rating_by_year, public.school_watch_reasons
  to anon, authenticated;
