-- ⛔ **손님(익명 로그인)은 닉네임을 갖지 못한다** (docs/DESIGN.md §12-145)
--
-- 앞선 마이그레이션(add-nickname)의 구멍을 막는다. Supabase 에서 **익명 사용자도 `authenticated`
-- 역할을 받는다**(대시보드가 그렇게 경고한다). 그래서 `to authenticated` 만으로는 손님이 안 걸러진다.
-- 2026-08-23 실측 — 손님 열쇠로 닉네임이 그대로 들어갔다.
--
-- 왜 막나 — 손님 열쇠는 **아무나 몇 개든** 만들 수 있다. 그대로 두면 한 사람이 손님 계정을 줄줄이
-- 만들어 쓸 만한 이름을 전부 선점할 수 있고, 손님 계정은 지워지지 않아 **그 이름은 영영 안 풀린다.**
-- 이름은 1인 1표의 근거(메일 주소)가 있는 사람만 갖는다.
--
-- ⛔ 가르는 값은 토큰의 `is_anonymous` 다(실측으로 확인 — 손님 토큰 맨 위층에 `true` 로 들어 있다).

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and (nickname is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  );

-- 넣을 때도 같이 막는다. 줄은 가입 트리거가 미리 만들지만 upsert 가 없는 줄을 만들 수 있다.
drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert to authenticated
  with check (
    auth.uid() = id
    and (nickname is null or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false)
  );
