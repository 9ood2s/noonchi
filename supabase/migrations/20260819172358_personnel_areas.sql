-- 인사구역 — 교육청 고시(공공데이터)에서 읽어 낸 것
--
-- 어디서 오나 : scripts/parse-personnel-areas.mjs 가 PDF 표를 읽어 data/derived/*.json 으로 내고,
--               scripts/load-personnel-areas.mjs 가 이 표에 넣는다.
-- ⛔ 이 표는 공공데이터다. 교사 입력(별점·TO 제보·모의지원)과 절대 같은 표에 담지 않는다.
--    화면에서도 갈라 보여준다(CLAUDE.md §2).
-- ⛔ 대상 직종은 유치원·초등·특수 셋뿐이다. 영양교사·보건교사는 담지 않는다(CLAUDE.md §7).

create table if not exists public.personnel_areas (
  id           bigint generated always as identity primary key,

  sido         text     not null,                  -- '경기' | '인천'
  school_year  smallint not null,                  -- 적용 학년도. 인천은 고시 연도가 아니라 적용 학년도로 맞춘다
  level        text     not null,                  -- '초등' | '유치원' | '특수'

  office       text     not null,                  -- 교육지원청
  city         text,                               -- 시·군 (인천은 없을 수 있다)
  area         text     not null,                  -- 경기 갑/을/병 · 인천 Ⅰ/Ⅱ/Ⅲ
  area_grade   text,                               -- 경기 병구역 급지 가/나/다/라. 지역가산 가·나 100% / 다·라 70%

  school_name  text     not null,                  -- 표에 적힌 이름. 줄임말이다("수원중촌")
  branches     text[]   not null default '{}',     -- 분교장
  closed       boolean  not null default false,    -- 폐·휴교 (표에 밑줄로 표시된 것)

  std_code     text,                               -- 표준학교코드. 나이스 대조 전까지 null
  source       text     not null,                  -- 원자료 파일

  created_at   timestamptz not null default now(),

  constraint personnel_areas_level_ck check (level in ('초등', '유치원', '특수')),
  constraint personnel_areas_sido_ck  check (sido  in ('경기', '인천'))
);

-- 같은 학년도·지역·학교급 안에서 같은 시·군에 같은 이름이 둘일 수 없다.
-- 시·군이 다르면 같은 이름이 있다(포천 중리 · 이천 중리).
create unique index if not exists personnel_areas_uniq
  on public.personnel_areas (sido, school_year, level, coalesce(city, ''), school_name);

create index if not exists personnel_areas_lookup
  on public.personnel_areas (sido, school_year, level, office);
create index if not exists personnel_areas_area
  on public.personnel_areas (sido, school_year, level, area, area_grade);
create index if not exists personnel_areas_std_code
  on public.personnel_areas (std_code) where std_code is not null;

-- 공공데이터라 누구나 읽는다. 쓰기는 열지 않는다 — 적재는 마이그레이션·서비스 키로만 한다.
alter table public.personnel_areas enable row level security;

drop policy if exists personnel_areas_read on public.personnel_areas;
create policy personnel_areas_read on public.personnel_areas
  for select to anon, authenticated using (true);

comment on table public.personnel_areas is
  '교육청 고시 인사구역. 공공데이터이며 교사 입력과 섞지 않는다. 학년도는 적용 학년도 기준.';
