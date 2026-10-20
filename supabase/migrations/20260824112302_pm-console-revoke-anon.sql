-- 운영 뷰에서 `anon` 을 떼어낸다 — ⛔ `grant … to authenticated` 만으로는 안 막힌다
--
-- ⛔⛔ **바로 앞 마이그레이션(20260824112001)의 주석이 틀렸다.** 거기 「`anon` 에게 주지 않는다」고
--    적고 `grant select … to authenticated` 만 했는데, **주지 않는 것과 뺏는 것은 다르다.**
--    Supabase 는 `public` 스키마에 만들어지는 모든 객체에 대해
--    `alter default privileges … grant all on tables to anon, authenticated, service_role` 을
--    미리 걸어 둔다. 그래서 뷰를 만드는 순간 `anon` 은 **이미** SELECT 를 갖고 태어난다.
--
-- ⚠️ **새지는 않았다** — 뷰 안의 `where public.is_staff()` 가 막아서 `anon` 이 읽어도 0줄이었다.
--    실제로 `set role anon` 으로 `admin_members` 를 읽어 봤고 0줄이 나왔다.
--    ⛔ 그래도 고친다. 「두 겹으로 막았다」고 적어 두고 실제로는 한 겹이면,
--       다음 사람이 그 주석을 믿고 `is_staff()` 를 빼는 날 통째로 샌다.
--
-- ⛔ **쓰기 권한도 함께 뺏는다.** 지금 이 뷰들은 집계·조인이 섞여 있어 PostgreSQL 이
--    자동 갱신을 안 해 주지만(그래서 넣어도 오류가 난다), 나중에 누가 단순한 뷰를 하나 더
--    같은 이름 규칙으로 만들면 그것은 갱신 가능한 뷰가 된다. 규칙을 지금 못박는다.
--
-- ⛔ **`personnel_areas` 같은 공개 표에는 이 짓을 하지 않는다.** 저것들은 `anon` 이 읽어야 하는
--    공개 데이터다. 여기서 손대는 것은 `admin_` 으로 시작하는 운영 전용 뷰 여섯뿐이다.

revoke all on
  public.admin_overview,
  public.admin_daily,
  public.admin_school_rank,
  public.admin_school_ratings,
  public.admin_members,
  public.admin_reports
from anon;

revoke insert, update, delete, truncate, references, trigger on
  public.admin_overview,
  public.admin_daily,
  public.admin_school_rank,
  public.admin_school_ratings,
  public.admin_members,
  public.admin_reports
from authenticated;

-- 남는 것은 이것뿐이다 — 로그인한 사람의 **읽기**. 그중 `is_staff()` 만 줄을 받는다.
grant select on
  public.admin_overview,
  public.admin_daily,
  public.admin_school_rank,
  public.admin_school_ratings,
  public.admin_members,
  public.admin_reports
to authenticated;

-- 메일 가리개도 같다. `anon` 이 부를 일이 없다
revoke all on function public.mask_email(text) from anon;
grant execute on function public.mask_email(text) to authenticated;
