-- 교원 구성과 학생 전출입 (docs/DESIGN.md §12-102)
--
-- 사장님(2026-08-23) — 학교알리미 점검표를 보고 「교원이랑 학생현황만 추가하면 되겠다」.
--
-- 출처 = 학교알리미 `apiType=22`(교원 현황) · `apiType=10`(학생 현황).
-- ⛔ **바깥을 더 부르지 않는다.** 두 칸은 이미 부르고 있었고 값만 안 꺼내 쓰고 있었다.
--
-- ⛔ **교장·교감은 안 담는다.** `apiType=22` 의 `COL_1`·`COL_2` 로 인원과 성별까지 오지만,
--    학교당 1명이라 그건 **개인을 가리킨다.** 평가 단위는 학교다(CLAUDE.md §1).
-- ⛔ **0 과 「모름」을 가른다.** 전입 0 인 학교가 실제로 있으므로 `> 0` 으로 자르면 안 된다.
--    값이 안 온 곳만 null 이다 — 분교장 37곳이 그렇다(공시가 본교에 묶여 있다).

alter table public.personnel_areas
  add column if not exists teachers_f smallint,
  add column if not exists teachers_m smallint,
  add column if not exists teachers_t smallint,
  add column if not exists moved_in   smallint,
  add column if not exists moved_out  smallint;

comment on column public.personnel_areas.teachers_f is '여교원 수. 총원(teachers)과 함께 남녀 구성을 낸다.';
comment on column public.personnel_areas.teachers_m is '남교원 수.';
comment on column public.personnel_areas.teachers_t is
  '기간제 교원 수. ⛔ 많다고 나쁜 학교가 아니다 — 휴직이 많다는 뜻일 수도 있다. 세어서 보여만 준다.';
comment on column public.personnel_areas.moved_in is '한 해 전입 학생 수. 0 과 모름(null)을 가른다.';
comment on column public.personnel_areas.moved_out is '한 해 전출 학생 수.';

-- ⛔ 말이 안 되는 값을 받지 않는다(§11-1 — 조용히 자르지 않고 거절한다)
alter table public.personnel_areas drop constraint if exists pa_staff_ck;
alter table public.personnel_areas add constraint pa_staff_ck check (
  (teachers_f is null or teachers_f between 0 and 500)
  and (teachers_m is null or teachers_m between 0 and 500)
  and (teachers_t is null or teachers_t between 0 and 500)
  and (moved_in  is null or moved_in  between 0 and 5000)
  and (moved_out is null or moved_out between 0 and 5000)
);
