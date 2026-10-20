-- 잡아 두는 이름을 **두 갈래로 나눈다** (docs/DESIGN.md §12-147)
--
-- 앞선 마이그레이션은 전부 부분 일치라 **「눈치쌤」이 막혔다**(실측). 서비스 이름을 쓰는
-- 자연스러운 이름인데 사칭이라 보기 어렵다. 「눈치빠른교사」도 같이 막히고 있었다.
--
-- 갈라 놓는다.
--   ① **직함은 부분 일치** — 「관리자2」·「운영자님」처럼 뒤에 뭘 붙이면 옆에 놓고 못 가린다.
--      사칭을 막는 것이 목적이라 정확히 같은 글자만 막아서는 뜻이 없다.
--   ② **서비스 이름은 정확히 같을 때만** — 「눈치」·「noonchi」 그 자체는 못 쓰고,
--      「눈치쌤」·「눈치빠른사람」은 쓸 수 있다.

create or replace function public.nickname_reserved(want text)
returns boolean
language sql
immutable
as $$
  select
    -- ① 직함 — 어디에 들어 있어도 막는다
    lower(btrim(coalesce(want, ''))) ~
      '(관리자|운영자|개발자|주인장|관리팀|운영팀|고객센터|공식|admin|developer|moderator|official|support)'
    -- ② 서비스 이름 — 정확히 같을 때만 막는다
    or lower(btrim(coalesce(want, ''))) in ('눈치', 'noonchi', '눈치스쿨', 'noonchischool');
$$;
