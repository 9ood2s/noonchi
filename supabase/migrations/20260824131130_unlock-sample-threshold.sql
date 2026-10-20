-- 표본 문턱을 푼다 — **한 명이 남겨도 그대로 내보낸다**
--
-- 사장님(2026-08-24) — 「표본 3으로 걸어놓은 것들 **모두 풀어버려**. 뭔가 **빠르게 쌓이는 재미**가
-- 있어야 되려 사용자도 늘고, 그렇게 사용자들이 늘어야 **표본이 다시 늘어서 신뢰도도 높아지는
-- 선순환** 구조가 될 것 같아」 · 「**한명이라도 평가하면 그대로 내보내.** 그리고 **몇명이 평가했는지는
-- 표기하지 말고**」 · 「그게 바이럴이 되야 사용자 유입이 지속될듯」.
--
-- ⛔⛔ **`CLAUDE.md §1` 의 「표본이 적으면 안 보여준다. 표본수는 늘 함께 표시한다」를 뒤집는다.**
--    두 쪽이 다 바뀐다 — ① 문턱을 없애고 ② 표본수를 **화면에서 뺀다.**
--    그 규칙에 사장님 결정을 적어 두었다. 안 적으면 다음 세션이 §1 을 근거로 되돌린다.
--
-- ⭐ **왜 이것이 방어를 무너뜨리지 않는가** — §1 이 문턱을 세운 까닭은 「적은 표본의 평균을
--    확신처럼 보여주지 않기 위해서」였다. **표본수를 화면에서 빼면 확신의 근거도 같이 사라진다** —
--    보는 사람이 「3명이 준 4.5」와 「300명이 준 4.5」를 나눠 믿을 수 없게 되지만, 반대로
--    「1명뿐인데 4.5」를 대단한 수치로 오독하는 길도 막힌다. 사장님 판단은 **지금 단계에서는
--    화면이 비어 있는 것이 더 큰 손해**라는 것이다(선순환).
--
-- ⭐ **뜻밖의 이득 하나** — 표본수를 안 내보내면 **누가 남겼는지 좁히는 길이 좁아진다.**
--    전에는 「2명이 남김」이 그 둘을 좁혔다(`school-ratings.tsx` 의 옛 주석). 이제 그 수가 안 나간다.
--
-- ⚠️ **그래도 남는 자리 하나 — `school_rating_by_year`.**
--    근무 시작 연도로 쪼갠 칸은 문턱이 없으면 **한 사람짜리 칸**이 생길 수 있고,
--    작은 학교에서는 「2019년에 부임한 사람」이 곧 특정 개인이다(CLAUDE.md §1 의 「특정 개인을
--    가리키는 항목을 만들지 않는다」에 닿는다). ⛔ **사장님께 그대로 보고했다.**
--    되돌리려면 이 파일의 `school_rating_by_year` 에 `having count(*) >= 3` 한 줄을 되살리면 된다.
--
-- ⛔ **낱개 별점은 여전히 안 나간다.** `ratings` 표의 RLS(「자기 것만 읽는다」)는 그대로다 —
--    바뀐 것은 **평균을 몇 명부터 내보내나**뿐이고, 누가 무엇을 줬는지는 아무도 못 본다.
-- ⛔ **`where admin is not null` 은 그대로 둔다.** 별점을 안 남기고 근무 이력만 적은 줄이 있어
--    (`school_history_count` 가 그것을 센다) 빼면 평균이 빈 줄까지 세게 된다.

create or replace view public.school_rating_avg with (security_invoker = false) as
select std_code,
       count(*)::int as n,
       round(avg(admin), 2)    as admin,
       round(avg(mood), 2)     as mood,
       round(avg(rights), 2)   as rights,
       round(avg(workload), 2) as workload,
       round(avg(facility), 2) as facility,
       round(avg(access), 2)   as access
  from public.ratings
 where admin is not null
 group by std_code;

comment on view public.school_rating_avg is
  '학교별 별점 평균. ⛔ 문턱 없다 — 한 명이 남겨도 나간다(2026-08-24 사장님). n 은 화면에 안 적는다.';

create or replace view public.school_rating_by_year with (security_invoker = false) as
select std_code,
       started_year,
       count(*)::int as n,
       round(avg(admin), 2)    as admin,
       round(avg(mood), 2)     as mood,
       round(avg(rights), 2)   as rights,
       round(avg(workload), 2) as workload,
       round(avg(facility), 2) as facility,
       round(avg(access), 2)   as access
  from public.ratings
 where admin is not null
 group by std_code, started_year;

comment on view public.school_rating_by_year is
  '근무 시작 연도별 별점 평균. ⛔ 문턱 없다. ⚠️ 한 사람짜리 칸이 생길 수 있다 — 되돌리려면 having 을 되살린다.';

/**
 * 관심 사유도 같이 푼다(사장님 「모두」).
 * ⛔ 아직 화면에서 쓰는 곳이 없다(`grep` 로 확인 — `lib/ratings.ts` 주석에만 이름이 나온다).
 *    그래도 같이 풀어 둔다 — 나중에 화면을 붙일 때 여기만 잠겨 있으면 또 이 문턱을 찾아야 한다.
 */
create or replace view public.school_watch_reasons with (security_invoker = false) as
select std_code,
       count(*)::int as n,
       count(*) filter (where considering)::int          as considering,
       count(*) filter (where '관리자' = any(reasons))::int as admin,
       count(*) filter (where '분위기' = any(reasons))::int as mood,
       count(*) filter (where '교권'   = any(reasons))::int as rights,
       count(*) filter (where '업무량' = any(reasons))::int as workload,
       count(*) filter (where '시설'   = any(reasons))::int as facility,
       count(*) filter (where '접근성' = any(reasons))::int as access
  from public.watchlist
 group by std_code;

comment on view public.school_watch_reasons is
  '학교별 관심 사유. ⛔ 문턱 없다(2026-08-24 사장님). 낱개 줄은 안 나간다 — 세어 놓은 것만이다.';

-- ⛔ 권한은 그대로다. `create or replace view` 는 grant 를 지우지 않지만, 한 번 더 적어 둔다 —
--    뷰를 지웠다 다시 만드는 날 이 줄이 없으면 화면이 통째로 조용히 빈다.
grant select on public.school_rating_avg, public.school_rating_by_year, public.school_watch_reasons
  to anon, authenticated;
