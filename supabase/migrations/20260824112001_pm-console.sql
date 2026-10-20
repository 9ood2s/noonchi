-- 운영 화면(`/admin`)이 읽는 것들 — 사용자 패턴 · 학교 랭킹 · 회원 · 제보
--
-- 사장님(2026-08-24) — 「방문자수, 활동내역, 신규가입자 등을 보고 고객 패턴을 연구할 수 있는
-- pm용 관리 페이지」. 확인받은 것 넷(2026-08-24):
--   ① 방문자는 **`school_views` 만** 쓴다 — 새 기록 표를 만들지 않는다(1단계)
--   ② 회원 메일은 **가려서** 낸다 (`te***@example.com`)
--   ③ 별점은 **운영 화면만** 표본 3 문턱을 푼다 — 교사가 보는 뷰는 그대로 둔다
--   ④ 조회 전용이다 — 지우기·고치기는 여기에 없다
--
-- ⛔⛔ **뷰 하나하나가 `where public.is_staff()` 로 스스로 잠근다.**
--    까닭 — 이 뷰들은 `security_invoker = false` 라 표의 RLS 를 **대신 지나간다**.
--    그래야 남의 별점·남의 관심목록을 집계할 수 있다(`school_rating_avg` 와 같은 방식).
--    그런데 그것은 곧 **정책이 안 걸린다**는 뜻이라, 잠그는 줄이 없으면
--    `anon` 키로 주소만 알면 전 회원 목록이 나간다. 그 줄이 여기서는 `is_staff()` 다.
--    ⭐ 화면에서도 막지만(`app/admin/page.tsx`), **화면 코드가 깜빡해도 안 새게** 여기서 다시 막는다.
--
-- ⛔ **쓰는 길을 하나도 만들지 않는다.** 뷰뿐이고 `insert`·`update`·`delete` 규칙이 없다 —
--    운영 화면은 **보기만 한다**. 회원 삭제·데이터 수정은 사람이 판단해 DB 에서 한다.
--    화면에 지우는 단추를 두면 실수 한 번에 되돌릴 수 없는 일이 생긴다.
--
-- ⛔ **개인을 가리키는 값을 최소한만 낸다.** 메일 전체·비밀번호 해시·전화번호는 안 나간다.
--    `auth.users` 에서 꺼내는 것은 넷뿐 — 가린 메일 · 가입 시각 · 마지막 로그인 · 손님인가.


-- ── 메일 가리기 ──────────────────────────────────────────────────────────────
--
-- `teacher@example.com` → `te***@example.com`
--
-- ⛔ **앞 두 글자만 남긴다.** 한 글자만 남기면 누가 누군지 운영도 못 가리고,
--    셋을 남기면 흔한 주소가 그대로 드러난다.
-- ⛔ 골뱅이가 없거나 앞이 두 글자 이하인 주소도 있다(테스트 계정). 그때는 통째로 `***` 다 —
--    자르다 실패해 원문이 그대로 나가는 일이 없게 한다.
create or replace function public.mask_email(addr text)
returns text
language sql immutable
as $$
  select case
    when addr is null or position('@' in addr) = 0 then null
    when length(split_part(addr, '@', 1)) <= 2 then '***@' || split_part(addr, '@', 2)
    else left(split_part(addr, '@', 1), 2) || '***@' || split_part(addr, '@', 2)
  end;
$$;

comment on function public.mask_email(text) is
  '메일 주소를 앞 두 글자만 남기고 가린다. 운영 화면이 회원을 가리키되 주소는 안 새게.';


-- ── ① 한눈 요약 ─────────────────────────────────────────────────────────────
--
-- 화면 맨 위 숫자 칸들이 읽는다. **줄이 하나뿐인 뷰**다.
--
-- ⛔ 「방문자」는 **학교를 한 번이라도 연 사람**이다. 홈·계산기만 보고 나간 사람은 안 든다
--    (2026-08-24 확인 ①). 화면이 그 뜻을 라벨에 적는다 — 「학교를 연 사람」.
-- ⛔ 하루의 경계는 **서울 기준**이다. UTC 로 두면 오전 9시에 하루가 바뀐다.
create or replace view public.admin_overview with (security_invoker = false) as
select
  -- 회원
  (select count(*)::int from auth.users)                                       as members,
  (select count(*)::int from auth.users where not is_anonymous)                as members_named,
  (select count(*)::int from auth.users where is_anonymous)                    as members_guest,
  (select count(*)::int from auth.users
     where (created_at at time zone 'Asia/Seoul')::date
         = (now() at time zone 'Asia/Seoul')::date)                            as signups_today,
  (select count(*)::int from auth.users where created_at >= now() - interval '7 days')  as signups_7d,
  (select count(*)::int from auth.users where created_at >= now() - interval '30 days') as signups_30d,
  -- 돌아온 사람 — 가입한 날과 마지막 로그인이 다르면 한 번은 다시 왔다는 뜻이다
  (select count(*)::int from auth.users
     where last_sign_in_at is not null
       and last_sign_in_at > created_at + interval '1 day')                    as members_returned,

  -- 방문 (학교를 연 사람)
  (select count(distinct viewer)::int from public.school_views
     where day = (now() at time zone 'Asia/Seoul')::date)                      as viewers_today,
  (select count(distinct viewer)::int from public.school_views
     where day >= (now() at time zone 'Asia/Seoul')::date - 6)                 as viewers_7d,
  (select count(distinct viewer)::int from public.school_views)                as viewers_total,
  (select count(*)::int from public.school_views)                              as opens_total,
  (select count(*)::int from public.school_views
     where day = (now() at time zone 'Asia/Seoul')::date)                      as opens_today,
  (select count(distinct std_code)::int from public.school_views)              as schools_seen,

  -- 활동
  (select count(*)::int from public.ratings)                                   as ratings,
  (select count(distinct std_code)::int from public.ratings)                   as rated_schools,
  (select count(distinct user_id)::int from public.ratings)                    as raters,
  (select count(*)::int from public.watchlist)                                 as watches,
  (select count(distinct user_id)::int from public.watchlist)                  as watchers,
  (select count(*)::int from public.home_schools)                              as home_schools,
  (select count(*)::int from public.saved_routes)                              as saved_routes,
  (select count(*)::int from public.reports)                                   as reports,
  (select count(*)::int from public.reports where status = 'new')              as reports_new
where public.is_staff();

comment on view public.admin_overview is
  '운영 화면 한눈 요약. is_staff() 가 아니면 한 줄도 안 나간다. 「방문자」는 학교를 연 사람이다.';


-- ── ② 일자별 ────────────────────────────────────────────────────────────────
--
-- 꺾은선·막대가 읽는다. **최근 60일을 빠짐없이 낸다** — 아무 일도 없던 날은 0 으로.
--
-- ⛔ **빈 날을 건너뛰지 않는다.** 있는 날만 내면 꺾은선의 가로 간격이 거짓말을 한다 —
--    사흘 쉬었다가 온 날이 바로 다음 날처럼 붙어 보인다. `generate_series` 가 날을 다 깐다.
-- ⛔ `school_views.day` 는 **이미 서울 기준 날짜**다(그 표가 서버에서 그렇게 넣는다).
--    나머지 표는 `timestamptz` 라 여기서 서울로 옮겨 센다. 안 옮기면 새벽 활동이 전날로 붙는다.
create or replace view public.admin_daily with (security_invoker = false) as
with days as (
  select d::date as day
    from generate_series(
      (now() at time zone 'Asia/Seoul')::date - 59,
      (now() at time zone 'Asia/Seoul')::date,
      interval '1 day') as d
),
v as (
  select day, count(distinct viewer)::int as viewers, count(*)::int as opens
    from public.school_views group by day
),
u as (
  select (created_at at time zone 'Asia/Seoul')::date as day,
         count(*)::int                                   as signups,
         count(*) filter (where not is_anonymous)::int   as signups_named
    from auth.users group by 1
),
r as (
  select (created_at at time zone 'Asia/Seoul')::date as day, count(*)::int as ratings
    from public.ratings group by 1
),
w as (
  select (created_at at time zone 'Asia/Seoul')::date as day, count(*)::int as watches
    from public.watchlist group by 1
),
p as (
  select (created_at at time zone 'Asia/Seoul')::date as day, count(*)::int as reports
    from public.reports group by 1
)
select days.day,
       coalesce(v.viewers, 0)       as viewers,
       coalesce(v.opens, 0)         as opens,
       coalesce(u.signups, 0)       as signups,
       coalesce(u.signups_named, 0) as signups_named,
       coalesce(r.ratings, 0)       as ratings,
       coalesce(w.watches, 0)       as watches,
       coalesce(p.reports, 0)       as reports
  from days
  left join v on v.day = days.day
  left join u on u.day = days.day
  left join r on r.day = days.day
  left join w on w.day = days.day
  left join p on p.day = days.day
 where public.is_staff();

comment on view public.admin_daily is
  '최근 60일 일자별 방문·가입·활동. 아무 일도 없던 날도 0 으로 낸다 — 빼면 꺾은선이 거짓말을 한다.';


-- ── ③ 학교별 순위 ───────────────────────────────────────────────────────────
--
-- 사장님 — 「각 학교별 방문자 수가 가장 많은 학교를 순위로 매기는 랭킹」.
--
-- ⛔ **`school_views` 를 뿌리로 잡고 학교 마스터를 왼쪽으로 붙인다.** 반대로 하면
--    6,236교가 다 나오고 그중 137줄만 값이 있다 — 화면이 0인 학교를 6천 줄 받는다.
-- ⛔ 학교 이름이 `null` 일 수 있다. `personnel_areas` 는 학년도마다 지웠다 다시 넣는 표라
--    조회 기록이 남은 학교가 다음 해 목록에서 빠질 수 있다. 그때 **줄을 버리지 않는다** —
--    이름 자리에 코드를 적는 것은 화면이 한다. 여기서 버리면 조회수 총계가 안 맞는다.
create or replace view public.admin_school_rank with (security_invoker = false) as
with v as (
  select std_code,
         count(distinct viewer)::int as viewers_total,
         count(*)::int               as opens_total,
         count(distinct viewer) filter (
           where day >= (now() at time zone 'Asia/Seoul')::date - 6)::int      as viewers_7d,
         count(distinct viewer) filter (
           where day = (now() at time zone 'Asia/Seoul')::date)::int           as viewers_today,
         max(day)                    as last_day
    from public.school_views
   group by std_code
)
select v.std_code,
       p.school_name  as name,
       p.sido,
       p.city,
       p.office,
       p.area,
       p.area_grade,
       v.viewers_total,
       v.viewers_7d,
       v.viewers_today,
       v.opens_total,
       v.last_day,
       coalesce(w.n, 0)  as watches,
       coalesce(rt.n, 0) as ratings_n,
       rt.score
  from v
  left join public.personnel_areas p
         on p.std_code = v.std_code and btrim(p.std_code) <> ''
  left join (select std_code, count(*)::int as n from public.watchlist group by std_code) w
         on w.std_code = v.std_code
  /**
   * 별점 평균 — ⛔ **여섯 축의 평균을 다시 평균낸 하나**다. 순위표에 여섯 칸을 늘어놓으면
   *    읽히지 않아서, 여기서는 한 값으로 접고 낱낱은 ④ 가 낸다.
   * ⛔ `avg` 는 null 을 안 센다 — 접근성을 안 고른 옛 별점이 값을 끌어내리지 않는다.
   */
  left join (
    select std_code, count(*)::int as n,
           round(( coalesce(avg(admin),0) + coalesce(avg(mood),0) + coalesce(avg(rights),0)
                 + coalesce(avg(workload),0) + coalesce(avg(facility),0) + coalesce(avg(access),0) )
                 / nullif( (case when avg(admin)    is null then 0 else 1 end)
                         + (case when avg(mood)     is null then 0 else 1 end)
                         + (case when avg(rights)   is null then 0 else 1 end)
                         + (case when avg(workload) is null then 0 else 1 end)
                         + (case when avg(facility) is null then 0 else 1 end)
                         + (case when avg(access)   is null then 0 else 1 end), 0), 2) as score
      from public.ratings
     group by std_code
  ) rt on rt.std_code = v.std_code
 where public.is_staff();

comment on view public.admin_school_rank is
  '학교별 조회한 사람 수 순위. school_views 를 뿌리로 잡아 값이 있는 학교만 낸다.';


-- ── ④ 학교별 평가 내역 ──────────────────────────────────────────────────────
--
-- 사장님 — 「각 학교별 평가 내역들을 조회할 수 있어야함」.
--
-- ⛔⛔ **여기만 표본 3 문턱이 없다**(2026-08-24 확인 ③). 교사가 보는
--    `school_rating_avg` 는 `having count(*) >= 3` 을 **그대로 둔다** — 그쪽을 건드리면
--    표본이 적은 학교의 평균이 전국 화면에 나간다(CLAUDE.md §1).
--    운영은 자료가 얼마나 쌓였는지 봐야 하므로 1건부터 본다.
-- ⛔ **낱개 별점은 안 낸다**(2026-08-24 확인 ③). 누가 어느 학교에 몇 점을 줬는지는
--    운영도 화면에서 안 본다 — 학교 단위 집계까지가 이 뷰의 일이다.
create or replace view public.admin_school_ratings with (security_invoker = false) as
select r.std_code,
       p.school_name as name,
       p.sido,
       p.city,
       p.office,
       count(*)::int                                   as n,
       count(distinct r.started_year)::int             as years,
       min(r.started_year)                             as first_year,
       max(r.started_year)                             as last_year,
       max(r.created_at)                               as last_at,
       round(avg(r.admin), 2)                          as admin,
       round(avg(r.mood), 2)                           as mood,
       round(avg(r.rights), 2)                         as rights,
       round(avg(r.workload), 2)                       as workload,
       round(avg(r.facility), 2)                       as facility,
       round(avg(r.access), 2)                         as access,
       -- 축별로 몇 명이 답했나. ⛔ 접근성은 2026-08-23 에 생겨서 그 전 별점은 비어 있다
       count(r.access)::int                            as n_access
  from public.ratings r
  left join public.personnel_areas p
         on p.std_code = r.std_code and btrim(p.std_code) <> ''
 where public.is_staff()
 group by r.std_code, p.school_name, p.sido, p.city, p.office;

comment on view public.admin_school_ratings is
  '학교별 별점 집계 — 운영 전용이라 표본 3 문턱이 없다. 교사가 보는 school_rating_avg 는 그대로다.';


-- ── ⑤ 회원 ──────────────────────────────────────────────────────────────────
--
-- 사장님 — 「회원 관리(단순 조회용 페이지이며 삭제 및 변경 등은 agent와 db에서 함께 반영)」.
--
-- ⛔ **메일은 가려서 낸다**(2026-08-24 확인 ②). 원문이 나가는 길은 여기 없다.
-- ⛔ **고치는 길이 없다.** 뷰이고 규칙을 안 만들었다 — 화면에서는 못 지우고 못 바꾼다.
-- ⛔ 손님(익명)도 낸다. 전체의 절반이 넘어서 빼면 「사람이 얼마나 오나」가 안 보인다.
--    다만 `guest` 칸으로 갈라 두어 화면이 섞지 않게 한다(CLAUDE.md §2 의 결).
create or replace view public.admin_members with (security_invoker = false) as
select u.id                                        as user_id,
       public.mask_email(u.email)                  as email,
       pr.nickname,
       u.is_anonymous                              as guest,
       (s.user_id is not null)                     as staff,
       s.label                                     as staff_label,
       u.created_at                                as joined_at,
       u.last_sign_in_at,
       -- 무엇으로 들어왔나. ⛔ 원문 그대로 두지 않고 갈래 이름만 낸다
       coalesce(u.raw_app_meta_data ->> 'provider', '메일')  as provider,
       hs.std_code                                 as home_std_code,
       hp.school_name                              as home_school,
       coalesce(rt.n, 0)                           as ratings,
       coalesce(w.n, 0)                            as watches,
       coalesce(rp.n, 0)                           as reports,
       coalesce(sr.n, 0)                           as saved_routes,
       /**
        * 마지막 활동 — 별점·관심목록·제보·경로 중 가장 나중 것.
        * ⛔ 로그인 시각과 다르다. 들어와서 아무것도 안 하고 나간 사람은 여기가 비어 있다.
        */
       greatest(rt.last_at, w.last_at, rp.last_at, sr.last_at) as last_act_at
  from auth.users u
  left join public.profiles pr on pr.id = u.id
  left join public.staff    s  on s.user_id = u.id
  left join public.home_schools hs
         on hs.user_id = u.id
        and hs.school_year = (case
              when extract(month from now() at time zone 'Asia/Seoul') >= 3
                then extract(year from now() at time zone 'Asia/Seoul')
                else extract(year from now() at time zone 'Asia/Seoul') - 1 end)
  left join public.personnel_areas hp
         on hp.std_code = hs.std_code and btrim(hp.std_code) <> ''
  left join (select user_id, count(*)::int n, max(created_at) last_at from public.ratings      group by user_id) rt on rt.user_id = u.id
  left join (select user_id, count(*)::int n, max(created_at) last_at from public.watchlist    group by user_id) w  on w.user_id  = u.id
  left join (select user_id, count(*)::int n, max(created_at) last_at from public.reports      group by user_id) rp on rp.user_id = u.id
  left join (select user_id, count(*)::int n, max(created_at) last_at from public.saved_routes group by user_id) sr on sr.user_id = u.id
 where public.is_staff();

comment on view public.admin_members is
  '회원 조회 전용. 메일은 mask_email 로 가려서 낸다. 고치는 길이 없다 — 뷰뿐이고 규칙을 안 만들었다.';


-- ── ⑥ 제보 ──────────────────────────────────────────────────────────────────
--
-- 사장님 — 「기존에 개발자 계정에서 받던 제안 사항을 이 페이지에서 받아볼 수 있도록」.
--
-- ⛔ `reports` 표는 이미 `reports_staff_select` 로 운영이 읽는다. 그런데 **보낸 사람이
--    누구인지는 안 보인다** — 표에는 `user_id`(uuid)뿐이라 화면에 36자리 숫자가 뜬다.
--    이 뷰가 닉네임과 가린 메일, 학교 이름을 붙인다.
-- ⛔ **답장·처리 상태는 이 뷰로 안 고친다.** 고치는 길은 `reports` 표의
--    `reports_staff_update` 하나다(§11-3 — 쓰는 문을 둘로 늘리지 않는다).
--    운영 화면도 제보 창과 **같은 문**으로 쓴다.
create or replace view public.admin_reports with (security_invoker = false) as
select r.id,
       r.created_at,
       r.kind,
       r.body,
       r.status,
       r.reply,
       r.replied_at,
       r.std_code,
       p.school_name as school,
       r.sido,
       r.page,
       r.ua,
       r.user_id,
       pr.nickname,
       public.mask_email(u.email) as email,
       coalesce(f.n, 0)           as files
  from public.reports r
  left join auth.users u  on u.id  = r.user_id
  left join public.profiles pr on pr.id = r.user_id
  left join public.personnel_areas p
         on p.std_code = r.std_code and btrim(p.std_code) <> ''
  left join (select report_id, count(*)::int n from public.report_files
              where report_id is not null group by report_id) f on f.report_id = r.id
 where public.is_staff();

comment on view public.admin_reports is
  '제보 + 보낸 사람(닉네임·가린 메일)·학교 이름. 고치는 것은 reports 표로 한다 — 쓰는 문은 하나다.';


-- ⛔ **`anon` 에게 주지 않는다.** 로그인한 사람에게만 열고, 그중 `is_staff()` 만
--    실제로 줄을 받는다. 두 겹이다 — 권한과 뷰 안의 조건.
grant select on
  public.admin_overview,
  public.admin_daily,
  public.admin_school_rank,
  public.admin_school_ratings,
  public.admin_members,
  public.admin_reports
to authenticated;

grant execute on function public.mask_email(text) to authenticated;
