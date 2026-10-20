-- 학년별 학생수 (학교알리미 apiType 10 · STDNT_SUM_21~26)
--
-- 사장님(2026-08-23) — 「그 아래에 학년별 학생수도 넣어줘야함」.
-- 1~6학년 순서로 여섯 칸이다. docs/DESIGN.md §12-138
--
-- ⛔ 칸을 더하기만 한다. ⛔ NOT NULL 을 안 건다 —
--    공시 전인 학교(2026년 개교 등)는 총 학생수부터 없다.
alter table public.personnel_areas
  add column if not exists students_grade int[];

comment on column public.personnel_areas.students_grade is
  '학년별 학생수 1~6학년. 학교알리미 STDNT_SUM_21~26. 여섯을 더해 students 와 맞을 때만 담는다';
