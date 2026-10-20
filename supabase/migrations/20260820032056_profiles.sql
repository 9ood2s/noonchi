-- 사용자 — 별점·TO 제보·모의지원의 1인 1표 근거 (DESIGN.md §9-2)
--
-- ⛔ 개인정보를 최소한으로 담는다. 이메일은 auth.users 에 있고 여기 복사하지 않는다.
--    이름·학교·전화 따위는 받지 않는다. 받을 이유가 생기면 그때 왜 필요한지 적고 더한다.
-- ⛔ 열람은 무인증이다(DESIGN.md §9-1). 이 표는 **쓰기** 를 가르는 자리에만 쓴다.

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- 3단계 교사 인증(공직자통합메일 도메인 등)은 나중에 얹는다. 지금은 늘 false 다.
  teacher_verified boolean not null default false
);

alter table public.profiles enable row level security;

-- 남의 줄은 못 본다. 자기 줄만 읽고 만든다.
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert to authenticated with check (auth.uid() = id);

-- 가입하면 줄이 저절로 생긴다. 화면이 만들기를 기다리지 않는다 —
-- 화면이 실패를 삼키면 로그인은 됐는데 줄이 없는 상태가 남는다(CLAUDE.md §11-2).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

comment on table public.profiles is '사용자. 1인 1표의 근거이며 개인정보는 최소한만 담는다.';
