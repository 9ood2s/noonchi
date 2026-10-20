-- 소속교를 지운다 (docs/DESIGN.md §12-163)
--
-- 사장님(2026-08-23) — 「소속교도 거주지역처럼 **입력한 것을 지울 수 있게** 해줘」.
-- 거주지역은 「거주지역 지우기」가 있는데(브라우저에만 있는 값이라 한 줄이면 됐다)
-- 소속교는 표에 있어서 지우는 길이 아예 없었다 — 한 번 정하면 **바꿀 수만 있고 뺄 수는 없었다.**
--
-- ⛔ **표에 delete 정책을 만들지 않는다.** `home_schools` 는 읽기 정책 하나뿐이고
--    쓰는 문은 `set_home_school` 함수 하나다(§11-3). 지우는 문도 같은 꼴로 낸다 —
--    정책을 열면 학년도를 화면이 골라 보내게 되고, 브라우저 시계가 틀리면 엉뚱한 해를 지운다.
-- ⛔ **올해 것만 지운다.** 지난 학년도 줄은 남긴다 — 그 해에 어디 있었는지는 기록이다.
create or replace function public.clear_home_school()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  delete from public.home_schools
   where user_id = auth.uid()
     and school_year = public.current_school_year();
end $$;

comment on function public.clear_home_school() is
  '올해 소속교를 지운다. 지난 학년도 줄은 남긴다.';

-- ⛔ 손님은 애초에 소속교를 못 정하므로(set_home_school 이 막는다) 지울 것도 없다.
--    그래도 부를 수는 있게 둔다 — 없는 줄을 지우는 것은 아무 일도 안 하는 것이다.
grant execute on function public.clear_home_school() to authenticated;
