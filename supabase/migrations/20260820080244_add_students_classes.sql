-- 학생수·학급수를 담는다.
--
-- ⭐ 왜 이 둘인가 — 화면이 보여줄 값은 **학급당 학생수(학생수 ÷ 학급수)** 다.
--    담임이 맡는 것은 학급이다. 「교사 1인당 학생수」는 분모의 '교원'에 보건·영양·사서·상담처럼
--    수업을 하지 않는 인원이 섞여 있어 실제 학급 크기보다 훨씬 작게 나온다.
--    실증 — 강화초 학급당 19.0명 / 교사당 10.0명. 교동초 3.0 / 1.4.
--
-- ⛔ teachers 는 지운 게 아니다. 모의지원의 「동일교 재직교사의 1/2」 분모로 쓴다(경기 제11조 ①).
--    다만 화면에 **비교값으로는 내지 않는다.**
alter table public.personnel_areas
  add column if not exists students smallint,
  add column if not exists classes  smallint;

comment on column public.personnel_areas.students is '학생 수. 학교알리미 공시(apiType=10) STDNT_SUM';
comment on column public.personnel_areas.classes  is '학급 수. 나이스 classInfo 줄 수';
comment on column public.personnel_areas.teachers is
  '총 교원수. 학교알리미 공시. ⛔ 화면 비교값으로 쓰지 않는다 — 수업을 하지 않는 인원이 섞여 있다. 모의지원의 재직교사 1/2 분모 전용';
