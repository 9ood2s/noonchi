-- 별점 다섯째 축을 급식에서 **시설·환경**으로 바꾼다.  근거 = docs/DESIGN.md §6
--
-- 왜 — 급식은 사람마다 입맛이 갈려서 학교의 값이 아니라 평가자의 값이 된다.
-- 교사 입맛이 까다로운 편이라 대체로 박하게 나오고, 그러면 다섯 축 중 하나가 늘 낮아 쓸모가 없다.
-- 시설·환경(냉난방·화장실·교실 상태·주차)은 있는 네 축과 하나도 안 겹치고 학교마다 확연히 다르다.
-- 주차는 경기처럼 관내·관외 이동이 많은 곳에서 실제로 큰 변수다.
--
-- 지금 ratings 는 0줄이라 값을 옮길 것이 없다. 이름만 바꾼다.
alter table public.ratings rename column meal to facility;

comment on column public.ratings.facility is '시설·환경 (냉난방·화장실·교실 상태·주차). 1~5';

-- 뷰는 컬럼 이름을 안고 있으므로 다시 만든다
drop view if exists public.school_rating_avg;
drop view if exists public.school_rating_by_year;

create view public.school_rating_avg with (security_invoker = false) as
select std_code, count(*)::int as n,
       round(avg(admin)::numeric, 2)    as admin,
       round(avg(mood)::numeric, 2)     as mood,
       round(avg(rights)::numeric, 2)   as rights,
       round(avg(workload)::numeric, 2) as workload,
       round(avg(facility)::numeric, 2) as facility
from public.ratings group by std_code having count(*) >= 3;

create view public.school_rating_by_year with (security_invoker = false) as
select std_code, started_year, count(*)::int as n,
       round(avg(admin)::numeric, 2)    as admin,
       round(avg(mood)::numeric, 2)     as mood,
       round(avg(rights)::numeric, 2)   as rights,
       round(avg(workload)::numeric, 2) as workload,
       round(avg(facility)::numeric, 2) as facility
from public.ratings group by std_code, started_year having count(*) >= 3;

grant select on public.school_rating_avg     to anon, authenticated;
grant select on public.school_rating_by_year to anon, authenticated;

-- check 제약도 이름이 바뀐 컬럼을 보게 다시 건다
alter table public.ratings drop constraint if exists ratings_score_ck;
alter table public.ratings add constraint ratings_score_ck check (
  admin between 1 and 5 and mood between 1 and 5 and rights between 1 and 5
  and workload between 1 and 5 and facility between 1 and 5
);
