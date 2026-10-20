-- 닉네임 — 남긴 것에 이름을 달 자리 (docs/DESIGN.md §12-145)
--
-- 사장님(2026-08-23) — 「앞으로 리뷰나 이런 기능을 달 수도 있으니 **사용자 닉네임 수정도
-- 가능하도록** 해주고 **중복체크도** 달고」.
--
-- ⛔ 실명이 아니다. `profiles` 는 개인정보를 최소한만 담는다는 규칙 그대로다.
-- ⛔ 비워 둘 수 있다(null). 로그인은 했는데 아직 이름을 안 정한 사람이 있고, 그 사람도 막히면 안 된다.

alter table public.profiles add column if not exists nickname text;

-- 모양 — 한글·영문·숫자·밑줄 2~12자.
-- ⛔ **공백을 안 받는다.** 앞뒤 공백만 다른 이름을 만들면 남을 그대로 흉내낼 수 있다.
-- ⛔ 자모 단독(ㄱ·ㅏ)은 `가-힣` 범위 밖이라 저절로 막힌다.
-- ⛔ 여기서 자르지 않고 **거부한다**(CLAUDE.md §11-1 — 조용히 자르면 사람은 저장된 줄 안다).
alter table public.profiles drop constraint if exists profiles_nickname_shape;
alter table public.profiles add constraint profiles_nickname_shape
  check (nickname is null or nickname ~ '^[가-힣a-zA-Z0-9_]{2,12}$');

-- 유일성 — **대소문자를 무시한다.** `Noonchi` 와 `noonchi` 는 같은 이름이다.
-- ⛔ 화면의 중복 확인은 미리보기일 뿐이고, 마지막으로 가르는 것은 이 색인이다.
--    두 사람이 같은 순간에 같은 이름을 넣으면 미리보기는 둘 다 통과시킨다.
create unique index if not exists profiles_nickname_lower_key
  on public.profiles (lower(nickname)) where nickname is not null;

-- ⛔ **지금까지 update 정책이 하나도 없었다** — 본인도 자기 줄을 못 고쳤다.
drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- 중복 확인.
-- ⛔ **화면에서 직접 셀 수가 없다** — RLS 가 남의 줄을 가려서 늘 「없음」이 나오고,
--    그러면 「쓸 수 있습니다」를 보여준 뒤 저장에서 튕긴다. 그래서 서버가 대신 센다.
-- ⛔ **있나 없나만 답한다.** 누구 것인지도, 목록도 답하지 않는다.
-- ⛔ **로그인한 사람만** 부를 수 있다. 열어 두면 아무나 닉네임을 하나씩 넣어 보며 캐낸다.
create or replace function public.nickname_taken(want text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where lower(nickname) = lower(btrim(want)) and id <> auth.uid()
  );
$$;

revoke all on function public.nickname_taken(text) from public;
revoke all on function public.nickname_taken(text) from anon;
grant execute on function public.nickname_taken(text) to authenticated;

comment on column public.profiles.nickname is '남긴 것에 다는 이름. 대소문자 무시 유일. 없어도 된다.';
