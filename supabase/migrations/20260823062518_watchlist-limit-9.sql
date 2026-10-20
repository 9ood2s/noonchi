-- 관심목록은 사람당 9곳까지 (docs/DESIGN.md §12-143)
--
-- 사장님(2026-08-23) — 「즐겨찾기는 최대 9개까지 추가 가능」.
--
-- ⛔ **화면만 막으면 안 된다.** 창을 둘 열어 놓고 각각 담으면 화면의 셈이 어긋나 10개가 된다.
--    상한은 마지막에 쓰는 자리(여기)에서 지켜야 한다.
-- ⛔ **조용히 자르지 않는다**(CLAUDE.md §11-1). 넘치면 오류를 던져 화면이 알린다 —
--    담긴 줄 알았는데 안 담긴 상태가 이 서비스에서 가장 나쁜 결말이다.
-- ⛔ 세는 것은 **그 사람 것만**이다. `count(*)` 를 전체에 걸면 아무도 못 담는다.
create or replace function public.watchlist_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(*) into n from public.watchlist where user_id = new.user_id;
  if n >= 9 then
    raise exception '관심목록은 9곳까지입니다' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists watchlist_limit_trg on public.watchlist;
create trigger watchlist_limit_trg
  before insert on public.watchlist
  for each row execute function public.watchlist_limit();

comment on function public.watchlist_limit is
  '관심목록 9곳 상한. 화면의 셈과 별개로 여기서 막는다(창을 둘 열면 화면 셈이 어긋난다)';
