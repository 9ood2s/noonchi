-- 학교에 붙는 사실들 — 학교알리미 공시자료에서 온다
--
-- ⭐ teachers 가 TO 추정의 뿌리다. 경기 제11조 ① —
--    "동일교 재직교사의 2분의 1을 초과하여 관내·외를 불문하고 전보 내신할 수 없다". 그 분모다.
-- ⛔ 공공데이터다. 교사 입력(별점·TO 제보·모의지원)과 섞지 않는다(CLAUDE.md §2).

alter table public.personnel_areas
  add column if not exists official_name text,           -- 정식 이름 ("고색초등학교"). 표에는 줄임말만 있다
  add column if not exists lat  double precision,         -- 위도 (학교알리미 LTTUD)
  add column if not exists lng  double precision,         -- 경도 (학교알리미 LGTUD)
  add column if not exists teachers smallint;             -- 총 교원수 (학교알리미 apiType=22 COL_S)

comment on column public.personnel_areas.school_name  is '표에 적힌 이름. 교사들이 부르는 줄임말이다("고색")';
comment on column public.personnel_areas.official_name is '나이스 정식 이름("고색초등학교")';
comment on column public.personnel_areas.teachers      is '총 교원수. 전보 내신 상한(재직교사의 1/2)의 분모다';

create index if not exists personnel_areas_geo
  on public.personnel_areas (lat, lng) where lat is not null;
