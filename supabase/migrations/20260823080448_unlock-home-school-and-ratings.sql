-- 잠금 둘을 푼다 — 소속교와 별점 (docs/DESIGN.md §12-149)
--
-- 사장님(2026-08-23) — 「소속교는 한달에 한번만 바꾸게 해줄까 그럼… **너무 빡쎈가 중간발령으로
-- 가는 경우도 있을 텐데**」 · 「**잠금을 해제해버릴까**… 별점은 **남겼다는 기록만 두고 수정하기**
-- 정도?」 → 「그렇게 하자」.
--
-- ⛔ 이것은 §6「쓰면 못 고친다」(2026-08-20 확정)를 **뒤집는** 결정이다. 근거를 남긴다.
--
-- ① 소속교 — 잠가서 막는 것이 **아무것도 없었다.**
--    지도는 이미 아무 지원청이나 필터로 볼 수 있다. 잠금의 원래 목적은 §12-88 의
--    「모의지원 비교 범위」인데 모의지원은 아직 없다(§12-88-4). 만들 때는 **지원 줄에
--    그때의 소속교를 같이 적어 봉인**하면 되므로(스냅샷) 이 표를 잠글 까닭이 사라진다.
--    반면 잃는 것은 있었다 — 중간발령(9월 1일자·결원 보충)으로 옮긴 사람이 그 해 내내
--    남의 관내 지도를 본다.
--
-- ② 별점 — **잠금이 오히려 틀린 값을 고정하고 있었다.**
--    잠금이 막는 것은 「한 사람이 자기 표를 바꾸는 것」인데 1인 1표라 그건 **한 표**다.
--    반면 별 다섯 축을 한 번에 찍는 화면이라 실수가 나고, 그 값이 1년 내내 평균에 남는다.
--    표본이 적을 때 더 위험한 쪽은 조작이 아니라 **틀린 값**이다.
--    ⛔ 1인 1표와 세 곳 상한은 **그대로 둔다.** 푸는 것은 「고칠 수 없다」 하나뿐이다.

-- ── 학년도를 세는 곳을 하나로 ────────────────────────────────────────────
-- ⛔ 트리거와 저장 함수가 각자 세고 있었다. 한쪽만 고치면 두 표의 잠금이 하루 어긋난다(§11-3).
create or replace function public.current_school_year()
returns smallint
language sql
stable
as $$
  select (case
    when extract(month from now() at time zone 'Asia/Seoul') >= 3
      then extract(year from now() at time zone 'Asia/Seoul')
      else extract(year from now() at time zone 'Asia/Seoul') - 1
  end)::smallint;
$$;

-- ── ① 소속교 ────────────────────────────────────────────────────────────
alter table public.home_schools add column if not exists updated_at timestamptz not null default now();

create or replace function public.set_home_school_year()
returns trigger
language plpgsql
as $$
begin
  new.school_year := public.current_school_year();
  return new;
end $$;

/**
 * 소속교를 정하거나 **바꾼다.**
 *
 * ⛔ **학년도를 화면이 보내지 않는다.** 브라우저 시계는 틀릴 수 있고, 틀린 해를 보내면
 *    `on conflict` 가 안 맞아 새 줄을 만들려다 기본키에서 튕긴다. 서버가 센다.
 * ⛔ **손님(익명)은 못 정한다.** Supabase 는 익명에게도 `authenticated` 역할을 준다.
 * ⛔ `security definer` 라 RLS 를 지나간다 — 그래서 **직접 넣는 길(insert 정책)은 닫는다.**
 *    쓰는 문이 둘이면 한쪽만 고치는 사고가 난다(§11-3).
 */
create or replace function public.set_home_school(want text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception '손님은 소속교를 정할 수 없습니다' using errcode = '42501';
  end if;

  insert into public.home_schools (user_id, std_code, school_year)
  values (auth.uid(), want, public.current_school_year())
  on conflict (user_id, school_year)
  do update set std_code = excluded.std_code, updated_at = now();
end $$;

revoke all on function public.set_home_school(text) from public;
revoke all on function public.set_home_school(text) from anon;
grant execute on function public.set_home_school(text) to authenticated;

-- ⛔ 직접 넣는 길을 닫는다. 이제 문은 `set_home_school` 하나다.
drop policy if exists home_schools_self_insert on public.home_schools;

-- ── ② 별점 ──────────────────────────────────────────────────────────────
alter table public.ratings add column if not exists updated_at timestamptz not null default now();

/**
 * 고칠 때 **뼈대는 못 바꾸게** 못 박는다.
 *
 * ⛔ `user_id`·`std_code`·`school_year` 는 **1인 1표의 뼈대**다. 이것을 고칠 수 있으면
 *    한 줄을 남겨 두고 학교만 갈아 끼워 여러 학교에 표를 던질 수 있다.
 * ⭕ `started_year`(근무 시작 연도)와 별점은 **고칠 수 있다** — 실수를 고치는 것이 목적이다.
 */
create or replace function public.keep_rating_bones()
returns trigger
language plpgsql
as $$
begin
  new.user_id     := old.user_id;
  new.std_code    := old.std_code;
  new.school_year := old.school_year;
  new.updated_at  := now();
  return new;
end $$;

drop trigger if exists ratings_keep_bones on public.ratings;
create trigger ratings_keep_bones
  before update on public.ratings
  for each row execute function public.keep_rating_bones();

-- 자기 줄만 고친다. ⛔ 지우는 길은 안 연다 — 남긴 사실은 남는다(사장님 「남겼다는 기록만 두고」)
drop policy if exists ratings_self_update on public.ratings;
create policy ratings_self_update on public.ratings
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

comment on column public.ratings.updated_at is '마지막으로 고친 때. 남긴 사실은 지워지지 않는다.';
