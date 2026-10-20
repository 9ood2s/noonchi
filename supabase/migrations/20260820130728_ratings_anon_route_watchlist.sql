-- 비회원 흐름으로 넓힌다.  근거 = docs/DESIGN.md §6 · §9
--
-- 바뀌는 것 셋
--   ① 별점을 **선택**으로 — "근무한 적 있다 + 연도 + 간 방법"만 남기고 별은 안 줘도 된다
--   ② **간 방법**(정기·비정기·신규발령·기간제)을 받는다. ⛔ 표시만 하고 평균은 가르지 않는다
--      (초등은 인재풀이 좁아 기간제도 대개 초등 출신이라 갈라도 뜻이 크지 않고,
--       표본이 적을 때 더 잘게 쪼개면 아무 칸도 안 켜진다)
--   ③ **관심목록** — 왜 담았는지를 5축으로 한 번 더 쌓는다

-- ① 별점은 선택 — 다 주거나 하나도 안 주거나 둘 중 하나다
alter table public.ratings
  alter column admin    drop not null,
  alter column mood     drop not null,
  alter column rights   drop not null,
  alter column workload drop not null,
  alter column facility drop not null;

alter table public.ratings drop constraint if exists ratings_score_ck;
alter table public.ratings add constraint ratings_score_ck check (
  (admin is null and mood is null and rights is null and workload is null and facility is null)
  or (admin between 1 and 5 and mood between 1 and 5 and rights between 1 and 5
      and workload between 1 and 5 and facility between 1 and 5)
);

-- ② 간 방법 · 근무 끝 연도
alter table public.ratings
  add column if not exists route      text,
  add column if not exists ended_year smallint;

alter table public.ratings drop constraint if exists ratings_route_ck;
alter table public.ratings add constraint ratings_route_ck
  check (route is null or route in ('정기', '비정기', '신규발령', '기간제', '그 밖'));

alter table public.ratings drop constraint if exists ratings_years_ck;
alter table public.ratings add constraint ratings_years_ck
  check (ended_year is null or ended_year >= started_year);

comment on column public.ratings.route is
  '그 학교에 간 방법. 정기·비정기(복직)·신규발령·기간제·그 밖. ⛔ 표시만 한다 — 평균을 가르지 않는다';
comment on column public.ratings.ended_year is '근무 끝 연도. null 이면 지금 근무 중';

-- 평균 뷰 — 별을 준 줄만 센다. 별 없이 근무 이력만 남긴 줄은 표본에 안 들어간다.
drop view if exists public.school_rating_avg;
drop view if exists public.school_rating_by_year;

create view public.school_rating_avg with (security_invoker = false) as
select std_code, count(*)::int as n,
       round(avg(admin)::numeric, 2)    as admin,
       round(avg(mood)::numeric, 2)     as mood,
       round(avg(rights)::numeric, 2)   as rights,
       round(avg(workload)::numeric, 2) as workload,
       round(avg(facility)::numeric, 2) as facility
from public.ratings where admin is not null
group by std_code having count(*) >= 3;

create view public.school_rating_by_year with (security_invoker = false) as
select std_code, started_year, count(*)::int as n,
       round(avg(admin)::numeric, 2)    as admin,
       round(avg(mood)::numeric, 2)     as mood,
       round(avg(rights)::numeric, 2)   as rights,
       round(avg(workload)::numeric, 2) as workload,
       round(avg(facility)::numeric, 2) as facility
from public.ratings where admin is not null
group by std_code, started_year having count(*) >= 3;

-- 근무 이력은 별점과 따로 센다 — "몇 명이 거쳐 갔나" 는 표본 3 없이도 보여줄 수 있다
create view public.school_history_count with (security_invoker = false) as
select std_code, count(*)::int as n, count(*) filter (where admin is not null)::int as rated
from public.ratings group by std_code;

grant select on public.school_rating_avg     to anon, authenticated;
grant select on public.school_rating_by_year to anon, authenticated;
grant select on public.school_history_count  to anon, authenticated;

-- ③ 관심목록 ─────────────────────────────────────────────────────────────
-- ⛔ 왜 담았는지를 5축으로 받는다. 별점과 **다른 표**에 쌓는다 —
--    "가 봤다(별점)" 와 "가고 싶다(관심)" 는 다른 값이라 한 평균에 섞으면 둘 다 틀린다.
create table if not exists public.watchlist (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  std_code   text not null,
  /** 다음 이동 때 고려하고 있나 */
  considering boolean not null default false,
  /** 무엇 때문에 담았나. 5축 중 여럿 가능 */
  reasons    text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint watchlist_once unique (user_id, std_code),
  constraint watchlist_reasons_ck check (
    reasons <@ array['관리자','분위기','교권','업무량','시설']::text[]
  )
);

create index if not exists watchlist_std_code_idx on public.watchlist (std_code);
comment on table public.watchlist is
  '관심목록. 「가고 싶다」 쪽 값이라 별점(「가 봤다」)과 섞지 않는다.';

alter table public.watchlist enable row level security;

drop policy if exists "자기 관심목록만 읽는다" on public.watchlist;
create policy "자기 관심목록만 읽는다" on public.watchlist
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "자기 이름으로만 담는다" on public.watchlist;
create policy "자기 이름으로만 담는다" on public.watchlist
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "자기 관심목록만 고친다" on public.watchlist;
create policy "자기 관심목록만 고친다" on public.watchlist
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "자기 관심목록만 뺀다" on public.watchlist;
create policy "자기 관심목록만 뺀다" on public.watchlist
  for delete to authenticated using (auth.uid() = user_id);

-- 관심 사유 집계 — 몇 명이 무엇 때문에 담았나. ⛔ 여기도 표본 3 미만은 안 나간다.
create or replace view public.school_watch_reasons with (security_invoker = false) as
select std_code,
       count(*)::int                                          as n,
       count(*) filter (where considering)::int                as considering,
       count(*) filter (where '관리자' = any(reasons))::int      as admin,
       count(*) filter (where '분위기' = any(reasons))::int      as mood,
       count(*) filter (where '교권'   = any(reasons))::int      as rights,
       count(*) filter (where '업무량' = any(reasons))::int      as workload,
       count(*) filter (where '시설'   = any(reasons))::int      as facility
from public.watchlist group by std_code having count(*) >= 3;

grant select on public.school_watch_reasons to anon, authenticated;
