-- 현재 소속교 — 지도가 어디로 열리는지를 정하는 값 (docs/DESIGN.md §12-88 · §12-148)
--
-- 사장님(2026-08-23) — 「현재 소속교도 거기서 놓고 관리해야지. **매년 3월 1일 이후에 수정할 수
-- 있도록 하는건 동일**하고. **소속교는 필수**야」 · 「**현재소속교를 받아놔야 처음 열었을때
-- 본인 관내 지도가 딱 뜨지**」.
--
-- 표 설계는 §12-88 에 이미 확정돼 있었다. 「때가 되면 그대로 짓는다」고 적어 둔 것을 그대로 짓는다.
--
-- 무엇에 쓰나 둘.
--   ① **지도가 그 사람 관내로 열린다.** 전보를 보러 온 교사에게 첫 화면이 남의 지원청이면
--      매번 찾아 들어가야 한다.
--   ② **모의지원의 비교 범위**를 정한다(§12-88) — 현임교의 지원청 안에서만 견준다.
--      그래서 지원청마다 다른 만점 문제가 통째로 사라진다.
--
-- ⛔ **한 학년도에 한 번만 정한다.** 잠금은 별점(`ratings`)이 쓰는 방식 그대로다 —
--    `school_year` 를 **서버가** 정하고(아래 트리거) 그것을 기본키에 넣는다.
--    학년도는 3월 1일에 바뀌므로 한 번 정하면 **다음 2월 28일까지** 못 바꾼다.
-- ⛔ **고칠 길(update)과 지울 길(delete)을 아예 안 만든다.** 정책이 없으면 아무도 못 한다 —
--    「못 바꾼다」를 화면이 지키게 두지 않는다(화면은 반드시 뚫린다).
-- ⛔ **손님(익명)은 못 정한다.** 손님 열쇠는 아무나 몇 개든 만들 수 있어 1인 1표가 못 된다.
--    Supabase 는 익명 사용자에게도 `authenticated` 역할을 주므로 토큰의 `is_anonymous` 를 본다.

create table if not exists public.home_schools (
  user_id      uuid     not null references auth.users (id) on delete cascade,
  std_code     text     not null,
  -- 정한 학년도. ⛔ 서버가 정한다 — 화면이 보내는 값을 믿으면 잠금이 뜻이 없다
  school_year  smallint not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, school_year)
);

alter table public.home_schools enable row level security;

-- 자기 줄만 읽는다. ⛔ 남의 소속교는 개인을 가리키는 값이라 아무에게도 안 보여준다
drop policy if exists home_schools_self_read on public.home_schools;
create policy home_schools_self_read on public.home_schools
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists home_schools_self_insert on public.home_schools;
create policy home_schools_self_insert on public.home_schools
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- ⛔ update·delete 정책은 **일부러 없다.** 한 학년도에 한 번이 이 표의 뜻이다.

/**
 * 학년도를 서버가 매긴다. 3월 1일에 바뀐다.
 * ⛔ `now()` 를 그냥 쓰지 않는다 — UTC 로 보면 3월 1일 오전 9시까지 옛 학년도가 된다.
 *    별점(`ratings`)이 쓰는 식과 **글자까지 같게** 둔다. 다르면 두 표의 잠금이 하루 어긋난다.
 */
create or replace function public.set_home_school_year()
returns trigger
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

drop trigger if exists home_schools_year on public.home_schools;
create trigger home_schools_year
  before insert on public.home_schools
  for each row execute function public.set_home_school_year();

comment on table public.home_schools is
  '현재 소속교. 한 학년도에 한 번만 정한다(3월 1일에 풀린다). 지도가 열리는 지원청과 모의지원의 비교 범위를 정한다.';
