-- 잡아 두는 이름 — 운영자를 사칭하지 못하게 (docs/DESIGN.md §12-147)
--
-- 사장님(2026-08-23) — 「**관리자, 개발자, 주인장, noonchi, developer, 운영자** 같은 단어들은
-- 못만들게 빼놔야됨」.
--
-- ⛔ **화면이 아니라 표에서 막는다.** 화면에만 두면 주소창으로 API 를 직접 부르는 사람에게는
--    없는 것과 같다. 화면이 미리 알려 주는 것은 헛걸음을 줄이는 곁들임이다.
-- ⛔ **부분 일치로 막는다.** 「관리자」만 막으면 「관리자2」가 그대로 통과하고, 옆에 놓고 보면
--    사람은 구분하지 못한다. 사칭을 막는 것이 목적이라 정확히 같은 글자만 막아서는 뜻이 없다.
-- ⛔ **대소문자를 무시한다** — `Admin` 도 `ADMIN` 도 같다.
-- ⚠️ 목록을 넓히면 멀쩡한 이름이 걸린다. 짧은 낱말(`dev`·`root`)은 일부러 안 넣었다 —
--    다른 말 속에 자주 들어가 오탐이 난다.

create or replace function public.nickname_reserved(want text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(want, ''))) ~
    '(관리자|운영자|개발자|주인장|관리팀|운영팀|고객센터|공식|눈치|noonchi|admin|developer|moderator|official|support)';
$$;

alter table public.profiles drop constraint if exists profiles_nickname_free;
alter table public.profiles add constraint profiles_nickname_free
  check (nickname is null or not public.nickname_reserved(nickname));

-- 화면이 **한 번 물어 세 가지를 다 안다.**
-- ⛔ 예약어 목록을 화면에도 두지 않는다 — 두 곳에 두면 한쪽만 고치는 사고가 난다(§11-3).
-- ⛔ 「됨」이 아닌 답은 그대로 화면 문구가 되지 않는다. 화면이 사람 말로 바꾼다.
create or replace function public.nickname_check(want text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select case
    when btrim(coalesce(want, '')) !~ '^[가-힣a-zA-Z0-9_]{2,12}$' then '모양'
    when public.nickname_reserved(want) then '예약'
    when exists (
      select 1 from public.profiles
      where lower(nickname) = lower(btrim(want)) and id <> auth.uid()
    ) then '중복'
    else '됨'
  end;
$$;

revoke all on function public.nickname_check(text) from public;
revoke all on function public.nickname_check(text) from anon;
grant execute on function public.nickname_check(text) to authenticated;

-- ⛔ `nickname_taken` 을 대신한다. 죽은 함수를 남겨 두지 않는다 —
--    다음 사람이 어느 쪽이 진짜인지 몰라 옛것을 부른다.
drop function if exists public.nickname_taken(text);
