-- 이 학교 숫자가 몇 년 공시인가 (학교알리미 pbanYr)
--
-- 사장님(2026-08-23) — 「작년 정보는 있고 올해정보만 없는 경우는 작년정보 띄워주고
-- 주석으로 * 하나 달아서 2025년 공시를 알려주던가」.
-- 올해 공시에 학생수가 없고 작년에는 있으면 작년 것을 통째로 쓰고 이 칸에 그 해를 적는다.
-- 화면은 이 값이 올해가 아니면 별표를 붙인다. docs/DESIGN.md §12-142
--
-- ⛔ 칸을 더하기만 한다. ⛔ 섞지 않는다 — 학생수를 작년 것으로 쓰면 교원수도 같은 해 것이다.
alter table public.personnel_areas
  add column if not exists stat_year int;

comment on column public.personnel_areas.stat_year is
  '학생·교원 숫자의 공시 연도(학교알리미 pbanYr). 올해가 아니면 화면이 별표로 알린다';
