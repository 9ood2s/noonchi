-- 운영 화면에 셋을 더한다 — 온전한 학교 이름 · 활동 내역 · 시간대 패턴
--
-- ① 학교 이름이 짧게 나오고 있었다. 표에 든 `school_name` 은 「효탑」이고,
--    화면이 쓰는 것은 `official_name`(「효탑초등학교」)이다 — `app/school/[code]/page.tsx` 의
--    `displayName()` 이 그렇게 고른다. 운영 화면만 다른 이름을 쓰면 서로 대조가 안 된다(§11-3).
-- ② 사장님 — 「사용자 활동 기록과 패턴」. 일자별 수치만으로는 **무엇이 일어났는지**가 안 보인다.
-- ③ 사장님 — 「사용자 패턴」. 하루 중 언제 오는가가 이 서비스에서는 뜻이 있다 —
--    교사가 쓰는 서비스라 방과 후·밤에 몰릴 것이라는 짐작을 **재서** 확인할 수 있다.

-- ── ① 온전한 학교 이름 ──────────────────────────────────────────────────────
--
-- ⛔ `create or replace view` 는 **칸을 뒤에만** 더할 수 있다. 가운데에 끼우면 거절당한다.
--    그래서 `official_name` 이 맨 끝에 붙는다 — 순서가 아니라 이름으로 읽으면 상관없다.
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
       rt.score,
       p.official_name
  from v
  left join public.personnel_areas p
         on p.std_code = v.std_code and btrim(p.std_code) <> ''
  left join (select std_code, count(*)::int as n from public.watchlist group by std_code) w
         on w.std_code = v.std_code
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

create or replace view public.admin_school_ratings with (security_invoker = false) as
select r.std_code,
       p.school_name as name,
       p.sido,
       p.city,
       p.office,
       count(*)::int                       as n,
       count(distinct r.started_year)::int as years,
       min(r.started_year)                 as first_year,
       max(r.started_year)                 as last_year,
       max(r.created_at)                   as last_at,
       round(avg(r.admin), 2)              as admin,
       round(avg(r.mood), 2)               as mood,
       round(avg(r.rights), 2)             as rights,
       round(avg(r.workload), 2)           as workload,
       round(avg(r.facility), 2)           as facility,
       round(avg(r.access), 2)             as access,
       count(r.access)::int                as n_access,
       p.official_name,
       -- 조회한 사람 수를 같이 낸다 — 「많이 보는데 평가가 없는 학교」를 여기서 바로 가린다
       coalesce(v.n, 0)                    as viewers
  from public.ratings r
  left join public.personnel_areas p
         on p.std_code = r.std_code and btrim(p.std_code) <> ''
  left join (select std_code, count(distinct viewer)::int as n from public.school_views group by std_code) v
         on v.std_code = r.std_code
 where public.is_staff()
 group by r.std_code, p.school_name, p.sido, p.city, p.office, p.official_name, v.n;

create or replace view public.admin_members with (security_invoker = false) as
select u.id                                        as user_id,
       public.mask_email(u.email)                  as email,
       pr.nickname,
       u.is_anonymous                              as guest,
       (s.user_id is not null)                     as staff,
       s.label                                     as staff_label,
       u.created_at                                as joined_at,
       u.last_sign_in_at,
       coalesce(u.raw_app_meta_data ->> 'provider', '메일')  as provider,
       hs.std_code                                 as home_std_code,
       coalesce(hp.official_name, hp.school_name)  as home_school,
       coalesce(rt.n, 0)                           as ratings,
       coalesce(w.n, 0)                            as watches,
       coalesce(rp.n, 0)                           as reports,
       coalesce(sr.n, 0)                           as saved_routes,
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

create or replace view public.admin_reports with (security_invoker = false) as
select r.id,
       r.created_at,
       r.kind,
       r.body,
       r.status,
       r.reply,
       r.replied_at,
       r.std_code,
       coalesce(p.official_name, p.school_name) as school,
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


-- ── ② 활동 내역 ─────────────────────────────────────────────────────────────
--
-- 사장님 — 「agent에게 물어보지 않아도 그때 그때 조회할 수 있는 사용자 활동 기록」.
--
-- ⛔⛔ **누가 했는지는 안 낸다**(2026-08-24 확인 ③ — 「낱개 별점은 안 낸다」).
--    「A가 B초에 별점을 남겼다」가 화면에 뜨면, 별점을 **본인만 읽게** 막아 둔 RLS 를
--    운영 화면이 우회해 되살리는 꼴이다. 교사가 어느 학교를 눈여겨보는지는
--    **전보를 어디로 갈지**와 같은 말이라, 새면 안 되는 축에 든다.
--    ⭐ 그래서 내는 것은 **무엇이 · 언제 · 어느 학교에** 셋뿐이다. 사람 자리에는
--       `guest`(손님인가) 하나만 둔다 — 손님과 실계정의 활동 비율은 봐야 하는 값이다.
-- ⛔ 제보(`report`)만 예외로 사람을 볼 수 있는데, 그것은 **답장을 해야 하기 때문**이고
--    이 뷰가 아니라 `admin_reports` 가 낸다. 여기서는 갈래와 시각만 센다.
--
-- ⛔ 200건에서 끊는다. **조용히 자르는 것이 아니다** — 화면이 「최근 200건」이라고 적는다
--    (CLAUDE.md §11-1 은 *저장*을 조용히 자르지 말라는 것이고, 여기는 읽는 쪽의 쪽수다).
create or replace view public.admin_activity with (security_invoker = false) as
with e as (
  select '별점'::text as kind, r.created_at as at, r.std_code,
         (select is_anonymous from auth.users where id = r.user_id) as guest
    from public.ratings r
  union all
  select '관심', w.created_at, w.std_code,
         (select is_anonymous from auth.users where id = w.user_id)
    from public.watchlist w
  union all
  select '제보', p.created_at, p.std_code,
         (select is_anonymous from auth.users where id = p.user_id)
    from public.reports p
  union all
  select '소속교', h.created_at, h.std_code,
         (select is_anonymous from auth.users where id = h.user_id)
    from public.home_schools h
  union all
  select '경로', s.created_at, s.std_code,
         (select is_anonymous from auth.users where id = s.user_id)
    from public.saved_routes s
  union all
  -- 가입은 학교가 없다. ⛔ 빈 칸을 지어내지 않는다 — null 로 두고 화면이 「—」를 적는다
  select case when u.is_anonymous then '손님' else '가입' end, u.created_at, null, u.is_anonymous
    from auth.users u
)
select e.kind,
       e.at,
       e.std_code,
       coalesce(p.official_name, p.school_name) as school,
       p.sido,
       p.office,
       coalesce(e.guest, false) as guest
  from e
  left join public.personnel_areas p
         on p.std_code = e.std_code and btrim(p.std_code) <> ''
 where public.is_staff()
 order by e.at desc
 limit 200;

comment on view public.admin_activity is
  '최근 200건의 활동. ⛔ 누가 했는지는 안 낸다 — 무엇이·언제·어느 학교에, 그리고 손님인가뿐이다.';


-- ── ③ 시간대 패턴 ───────────────────────────────────────────────────────────
--
-- 하루 24칸. **서울 시각 기준**이다 — UTC 로 세면 아홉 칸이 밀려 「새벽에 몰린다」는
-- 엉뚱한 결론이 나온다.
--
-- ⛔ 세는 것은 `school_views.created_at` 이다. 그 표의 `day` 칸은 날짜뿐이라 시각이 없다.
-- ⛔ 한 사람이 하루에 한 학교를 한 번만 넣으므로, 이 값은 **연 횟수**이지 머문 시간이 아니다.
create or replace view public.admin_hourly with (security_invoker = false) as
with hours as (select generate_series(0, 23) as hour),
o as (
  select extract(hour from (created_at at time zone 'Asia/Seoul'))::int as hour,
         count(*)::int                as opens,
         count(distinct viewer)::int  as viewers
    from public.school_views
   group by 1
)
select hours.hour,
       coalesce(o.opens, 0)   as opens,
       coalesce(o.viewers, 0) as viewers
  from hours
  left join o on o.hour = hours.hour
 where public.is_staff();

comment on view public.admin_hourly is
  '하루 24칸 시간대별 학교 조회. ⛔ 서울 시각 기준 — UTC 로 세면 아홉 칸이 밀린다.';


-- ⛔ 새로 만든 둘도 `anon` 을 떼고 로그인한 사람의 **읽기만** 남긴다
--    (20260824112302 에서 배운 것 — Supabase 는 새 객체에 anon 권한을 자동으로 붙인다)
revoke all on public.admin_activity, public.admin_hourly from anon;
revoke insert, update, delete, truncate, references, trigger
  on public.admin_activity, public.admin_hourly from authenticated;
grant select on public.admin_activity, public.admin_hourly to authenticated;
