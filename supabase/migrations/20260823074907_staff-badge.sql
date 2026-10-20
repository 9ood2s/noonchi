-- 뱃지 — 운영하는 사람을 가리키는 표 (docs/DESIGN.md §12-147)
--
-- 운영자 권한은 설치자가 신뢰할 수 있는 SQL 관리 도구에서 계정 UUID 를 확인해 직접 부여한다.
-- 공개 소스에는 특정 메일로 자동 승격하는 조건을 두지 않는다.
--
-- ⛔ **`profiles` 에 칸을 더하지 않고 표를 따로 둔다.** 까닭 둘.
--    ① `profiles` 는 **자기 줄만 읽는다.** 뱃지는 남에게 보여야 뜻이 있는데 거기 두면 남이 못 본다.
--    ② `profiles` 는 본인이 고칠 수 있다(닉네임 때문에). 같은 줄에 두면 **스스로 뱃지를 달 수 있다.**
-- ⛔ **쓰기 정책을 하나도 만들지 않는다.** 그러면 익명 열쇠로도 로그인한 열쇠로도 못 넣는다 —
--    넣는 길은 마이그레이션과 서비스 롤뿐이다(`school_views` 가 쓰는 방식과 같다).

create table if not exists public.staff (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  label    text not null,
  since    timestamptz not null default now()
);

alter table public.staff enable row level security;

-- ⛔ 읽기는 **누구나**. 뱃지는 보여야 하는 값이고, 담긴 것은 「이 사람은 운영 쪽이다」뿐이다.
drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to anon, authenticated using (true);

-- 자동 운영자 등록은 없다. 로컬 테스트 계정은 seed.sql 에서만 명시적으로 등록한다.

comment on table public.staff is '운영 쪽 사람. 읽기는 공개, 쓰기는 정책이 없어 서버만 넣는다.';
