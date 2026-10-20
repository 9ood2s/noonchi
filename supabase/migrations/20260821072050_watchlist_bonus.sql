-- 관심목록에 「예상 총 가산점」을 받는다 (2026-08-21 사장님)
--
-- 왜 여기냐 — 「관심목록에 담기」가 이미 **옮길 의향**을 받는 자리다.
-- 학교마다 남으므로 「이 학교를 원하는 사람들의 가산점 분포」가 그대로 쌓인다.
-- 모의지원이 필요로 하는 값이 바로 그것이다.
--
-- ⛔ 단위는 시·도가 정한다. 학교(std_code)가 시·도를 정하므로 컬럼은 하나로 둔다.
--    경기는 **년** 단위다 — 고시문이 「전보년수(가산점 포함)」이라 쓰고 월수까지 계산해 소수점을 버린다.
--    인천은 **점** 단위다 — 교육지원청 가산점([별표2]).
--    화면이 시·도에 맞는 단위를 라벨에 붙인다(components/watch-button.tsx).
--
-- ⛔ 상한으로 조용히 자르지 않는다(CLAUDE.md §11-1). 범위를 벗어나면 **거절**하고
--    화면이 그 까닭을 띄운다. 잘라 저장하면 사용자는 들어간 줄 안다.

alter table public.watchlist
  add column if not exists bonus numeric(4, 1);

comment on column public.watchlist.bonus is
  '옮길 의향이 있는 사람이 스스로 적은 예상 총 가산점. 경기는 년 단위 · 인천은 점 단위 — 학교가 시·도를 정한다. 모르면 null.';

alter table public.watchlist drop constraint if exists watchlist_bonus_ck;
alter table public.watchlist
  add constraint watchlist_bonus_ck check (bonus is null or (bonus >= 0 and bonus <= 99));
