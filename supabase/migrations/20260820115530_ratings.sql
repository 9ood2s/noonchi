-- 별점 — 교사가 남기는 값. 근거 = docs/DESIGN.md §6
--
-- 축 다섯(관리자·분위기·교권·업무량·급식), 전부 1~5.
-- ⛔ 자유 텍스트를 받지 않는다(CLAUDE.md §1). 사실적시 명예훼손과 운영자 배상책임을 부른다.
-- ⛔ 평가 단위는 **학교**다. 특정 개인(교장·교감·교사)을 가리키는 칸을 만들지 않는다.
--
-- ⛔ 학교를 personnel_areas.id 로 가리키지 않는다. 그 표는 학년도치를 통째로 지우고 다시 넣어서
--    id 가 매번 바뀐다 — 외래키를 걸면 별점이 같이 날아간다. **표준학교코드**로 가리킨다.

create table if not exists public.ratings (
  id           bigint generated always as identity primary key,
  user_id      uuid     not null references auth.users(id) on delete cascade,
  std_code     text     not null,                 -- 표준학교코드
  school_year  smallint not null,                 -- 남긴 학년도. 서버가 정한다(아래 트리거)
  started_year smallint not null,                 -- 그 학교 근무 시작 연도

  admin        smallint not null,                 -- 관리자 (교장·교감)
  mood         smallint not null,                 -- 분위기 (교직원 관계)
  rights       smallint not null,                 -- 교권
  workload     smallint not null,                 -- 업무량
  meal         smallint not null,                 -- 급식

  created_at   timestamptz not null default now(),

  constraint ratings_score_ck check (
    admin between 1 and 5 and mood between 1 and 5 and rights between 1 and 5
    and workload between 1 and 5 and meal between 1 and 5
  ),
  constraint ratings_started_ck check (started_year between 1980 and 2100),

  -- ⛔ 1인 1표 + 잠금이 여기서 한꺼번에 걸린다.
  --    학년도는 3월 1일에 바뀌므로, 한 번 남기면 **다음 2월 28일까지** 다시 못 남긴다(§6).
  constraint ratings_once unique (user_id, std_code, school_year)
);

create index if not exists ratings_std_code_idx on public.ratings (std_code, started_year);

comment on table public.ratings is
  '교사가 남긴 별점. 공공데이터와 갈라 다룬다(CLAUDE.md §2). 표본 3 미만은 화면에 평균을 내지 않는다.';

-- ── 학년도를 서버가 정한다 ─────────────────────────────────────────────────
-- ⛔ 학년도를 화면에서 받으면 아무 해나 골라 넣어 잠금을 피할 수 있다.
create or replace function public.ratings_set_year() returns trigger
language plpgsql
as $$
begin
  new.school_year := case
    when extract(month from now() at time zone 'Asia/Seoul') >= 3
      then extract(year from now() at time zone 'Asia/Seoul')
      else extract(year from now() at time zone 'Asia/Seoul') - 1
  end;
  return new;
end $$;

drop trigger if exists ratings_set_year on public.ratings;
create trigger ratings_set_year before insert on public.ratings
  for each row execute function public.ratings_set_year();

-- ── 한 학년도에 최대 3개 학교 ──────────────────────────────────────────────
-- 현 소속교 + 이전 2개교(§6). ⛔ 조용히 자르지 않고 **막고 알린다**(CLAUDE.md §11-1).
create or replace function public.ratings_limit() returns trigger
language plpgsql
as $$
declare n int;
begin
  select count(*) into n from public.ratings
   where user_id = new.user_id and school_year = new.school_year;
  if n >= 3 then
    raise exception '한 학년도에 최대 3개 학교까지 남길 수 있습니다 (지금 %개)', n
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists ratings_limit on public.ratings;
create trigger ratings_limit before insert on public.ratings
  for each row execute function public.ratings_limit();

-- ── 누가 무엇을 할 수 있나 ─────────────────────────────────────────────────
alter table public.ratings enable row level security;

-- 자기가 남긴 것만 본다. 남의 낱낱 별점은 아무도 못 본다 — 평균만 아래 뷰로 나간다.
drop policy if exists "자기 것만 읽는다" on public.ratings;
create policy "자기 것만 읽는다" on public.ratings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "자기 이름으로만 남긴다" on public.ratings;
create policy "자기 이름으로만 남긴다" on public.ratings
  for insert to authenticated with check (auth.uid() = user_id);

-- ⛔ update·delete 정책을 만들지 않는다. 정책이 없으면 막힌다 — 그게 §6 의 잠금이다.

-- ── 화면이 읽는 평균 ───────────────────────────────────────────────────────
-- ⛔ 표본 3 미만은 아예 나가지 않는다(§6 · CLAUDE.md §1). having 으로 DB 가 막는다 —
--    화면 코드가 깜빡해도 새지 않게.
create or replace view public.school_rating_avg
with (security_invoker = false) as
select
  std_code,
  count(*)::int                    as n,
  round(avg(admin)::numeric, 2)    as admin,
  round(avg(mood)::numeric, 2)     as mood,
  round(avg(rights)::numeric, 2)   as rights,
  round(avg(workload)::numeric, 2) as workload,
  round(avg(meal)::numeric, 2)     as meal
from public.ratings
group by std_code
having count(*) >= 3;

-- 연도별 — 그 칸이 3 이상일 때만 펼쳐진다(§6 「표시 두 단」)
create or replace view public.school_rating_by_year
with (security_invoker = false) as
select
  std_code,
  started_year,
  count(*)::int                    as n,
  round(avg(admin)::numeric, 2)    as admin,
  round(avg(mood)::numeric, 2)     as mood,
  round(avg(rights)::numeric, 2)   as rights,
  round(avg(workload)::numeric, 2) as workload,
  round(avg(meal)::numeric, 2)     as meal
from public.ratings
group by std_code, started_year
having count(*) >= 3;

grant select on public.school_rating_avg     to anon, authenticated;
grant select on public.school_rating_by_year to anon, authenticated;
