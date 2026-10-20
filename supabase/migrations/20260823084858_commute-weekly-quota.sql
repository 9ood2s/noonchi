-- 길찾기 주간 상한 — 소수가 비용을 통째로 만들지 못하게 (docs/DESIGN.md §12-152)
--
-- 사장님(2026-08-23) — 「**일주일 20건**으로 가. 하루만에 다 재지는 않을테니. 필요하면
-- 네이버 가서 재겠지 뭐」 · 「**관심목록에서 내리더라도 횟수는 리셋되지 않게** 조심하고」.
--
-- 왜 필요한가 — 네이버 Directions 는 월 6만 건이 무료고 그 뒤로 건당 5원이다(사장님 확인).
-- 그런데 길찾기에 **1인당 상한이 없었다.** 관심목록은 9곳으로 막혀 있지만 길찾기는
-- 학교 상세에서 아무 학교나 누를 수 있어서, 한 사람이 1,600개를 훑으면 **3,200건**이다.
-- 그런 사람이 26명이면 8만 건을 넘겨 11만원이 나오는데, 그 26명이 만드는 광고 수익은 0이다.
-- ⭐ **비용을 만드는 것은 트래픽이 아니라 소수일 수 있다.** 악의가 없어도 일어난다 —
--    지도를 훑어보는 것은 자연스러운 행동이다.
--
-- ⛔ **세는 것은 「바깥을 실제로 부른 횟수」다.** 관심목록에 몇 곳을 담았는지와 **아무 상관이 없다** —
--    담은 개수로 세면 담았다 빼는 것만으로 무한정 잴 수 있다. 여기는 **누적**이라 안 줄어든다.
-- ⛔ **재 둔 값을 읽는 것은 안 센다.** 캐시가 맞으면 바깥을 안 부르므로 돈이 안 든다.
--    「열람은 무인증」(CLAUDE.md §13)이 깨지지 않는다 — 막는 것은 「새로 재는 것」 하나다.
-- ⛔ **주는 월요일에 시작한다**(서울 기준). 굴러가는 7일(rolling)로 하면 **언제 풀리는지
--    사람이 모른다** — 「월요일에 다시」라고 말할 수 있어야 한다.

create table if not exists public.commute_quota (
  user_id  uuid not null references auth.users (id) on delete cascade,
  -- 그 주의 월요일. ⛔ 서버가 정한다 — 화면이 보내면 지난 주를 보내 상한을 우회한다
  week     date not null,
  n        int  not null default 0,
  primary key (user_id, week)
);

alter table public.commute_quota enable row level security;

-- ⛔ **정책을 하나도 만들지 않는다.** 익명 열쇠로도 로그인한 열쇠로도 못 읽고 못 쓴다 —
--    세는 일은 서버(서비스 롤)만 한다. 남은 횟수는 서버가 답에 담아 화면에 알려 준다.

/**
 * 한 건을 쓴다. 상한을 넘으면 **늘리지 않고** `null` 을 돌려준다.
 *
 * ⛔ **세는 것과 판정하는 것이 한 문장이어야 한다.** 「세어 보고 → 넣는다」로 나누면
 *    같은 사람이 동시에 두 번 눌렀을 때 둘 다 통과한다(경합).
 *    `on conflict … where` 가 그 둘을 원자적으로 묶는다 — 조건이 안 맞으면 아무 줄도 안 바뀌고
 *    `returning` 이 비어 돌아온다.
 * ⛔ 상한 값을 **표에 박지 않는다.** 부르는 쪽이 넘긴다 — 숫자를 바꾸려고 마이그레이션을
 *    또 돌리지 않게.
 */
create or replace function public.claim_commute(who uuid, cap int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  w   date := (date_trunc('week', now() at time zone 'Asia/Seoul'))::date;
  got int;
begin
  insert into public.commute_quota (user_id, week, n)
  values (who, w, 1)
  on conflict (user_id, week) do update
    set n = commute_quota.n + 1
    where commute_quota.n < cap
  returning n into got;

  return got;  -- null = 상한을 넘었다
end $$;

revoke all on function public.claim_commute(uuid, int) from public;
revoke all on function public.claim_commute(uuid, int) from anon;
revoke all on function public.claim_commute(uuid, int) from authenticated;
grant execute on function public.claim_commute(uuid, int) to service_role;

comment on table public.commute_quota is
  '길찾기를 실제로 잰 횟수(주 단위 누적). 관심목록과 무관하고 줄어들지 않는다.';
