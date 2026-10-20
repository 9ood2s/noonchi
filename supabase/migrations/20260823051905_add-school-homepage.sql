-- 학교 홈페이지 주소 (나이스 학교기본정보 HMPG_ADRES)
--
-- 사장님(2026-08-23) — 「학교 홈페이지주소를 넣어주는건 어떰? … 접속하면 그래도 학교의
-- 전반적인 모습 같은 걸 사이트에서 직접 확인해볼 수 있으니」. 화면에는 주소가 아니라
-- 「바로가기」 단추로 나간다(docs/DESIGN.md §12-137).
--
-- ⛔ 칸을 더하기만 한다. 지우거나 형을 바꾸지 않는다 — 이미 1,638교가 들어 있다.
-- ⛔ NOT NULL 을 걸지 않는다. 나이스에 홈페이지가 없는 학교가 실제로 있다(경기 1 · 인천 2).
alter table public.personnel_areas
  add column if not exists homepage text;

comment on column public.personnel_areas.homepage is
  '학교 홈페이지 주소. 나이스 학교기본정보 HMPG_ADRES. 없는 학교는 null';
