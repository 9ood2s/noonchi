-- 학교 조회수 — **하루 동안 그 학교를 확인한 사람 수** (docs/DESIGN.md §12-92)
--
-- 사장님(2026-08-23) — 「하루동안 확인한 사람들의 누적 숫자로 가자. **숫자의 크기는 곧 관심도**이니까」.
-- ⛔ 호갱노노의 「205명 보는중」처럼 **지금 보고 있는 사람**을 세지 않는다.
--    실시간은 사람이 많아야 숫자가 서고, 적을 때는 「1명」이 떠서 오히려 비어 보인다.
--    누적은 사람이 적어도 하루가 지나면 쌓인다.
--
-- ⛔ **사람 단위로 한 번만 센다.** 같은 사람이 열 번 열어도 1이다 — 안 그러면 새로고침이 곧 조회수다.
--    가리는 열쇠는 `viewer` 이고, 이것은 **브라우저 쿠키에 든 무작위 값**이다.
--    ⛔ 로그인을 요구하지 않는다. 지도를 여는 사람마다 계정을 만들 수는 없다.
--    ⛔ 개인을 가리키는 값이 아니다 — 무작위 uuid 하나뿐이고 다른 어떤 것과도 잇지 않는다.
--
-- ⛔ **익명 쓰기 정책을 만들지 않는다.** 열어 두면 아무나 한 학교를 「9,999명이 봤다」로 만들 수 있고
--    화면은 그걸 확신을 갖고 보여준다(`commute` 와 같은 판단 — §12-83-2).
--    서버가 service_role 로만 넣는다(`app/api/view/route.ts`).

create table if not exists public.school_views (
  std_code   text not null,
  -- 서울 기준 날짜. ⛔ UTC 로 두면 오전 9시에 하루가 바뀐다
  day        date not null,
  viewer     uuid not null,
  created_at timestamptz not null default now(),
  -- 1인 1일 1학교 = 1. 잠금이 여기서 걸린다
  primary key (std_code, day, viewer)
);

create index if not exists school_views_day_idx on public.school_views (day);

comment on table public.school_views is
  '학교를 확인한 사람 수. 하루 단위 누적이며 사람 단위로 한 번만 센다. viewer 는 쿠키의 무작위 값이다.';

alter table public.school_views enable row level security;
-- 정책을 하나도 만들지 않는다 = 아무도 못 읽고 못 쓴다. service_role 만 지나간다.

-- 읽기는 **집계로만** 나간다. 낱개 줄이 새면 누가 어느 학교를 봤는지가 드러난다.
create or replace view public.school_views_today with (security_invoker = false) as
select std_code, count(*)::int as n
  from public.school_views
 where day = (now() at time zone 'Asia/Seoul')::date
 group by std_code;

comment on view public.school_views_today is
  '오늘 그 학교를 확인한 사람 수. 낱개 줄은 안 나간다.';

grant select on public.school_views_today to anon, authenticated;

-- 오래된 줄은 쌓아 둘 이유가 없다. 90일이 지나면 지운다.
-- ⛔ 크론을 걸지 않았다 — 지금은 줄이 적다. 늘어나면 여기에 스케줄을 붙인다.
create or replace function public.prune_school_views() returns void
language sql security definer set search_path = public as $$
  delete from public.school_views where day < (now() at time zone 'Asia/Seoul')::date - 90;
$$;
