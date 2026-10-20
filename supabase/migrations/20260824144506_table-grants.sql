-- ⛔⛔ 표 권한이 마이그레이션에 **하나도 없었다** — 운영은 우연히 돌고 있었다
--
-- 2026-08-24. 사장님 말씀대로 로컬 Supabase 를 세우고 **크롬으로 실제로 눌러 보다가** 잡혔다
-- (`npm run smoke`). 로컬에서 학교 화면이 통째로 비면서 서버 기록에 이 한 줄이 찍혔다 —
--   `학교 코드를 못 읽었다 (대구): permission denied for table personnel_areas`
--
-- ⛔ **RLS 정책은 문을 「좁히는」 것이지 「여는」 것이 아니다.** `personnel_areas_read` 같은
--    정책을 아무리 잘 써 놔도, 그 역할에 `grant select` 가 없으면 **줄을 한 개도 못 본다.**
--    우리 마이그레이션에는 `create policy` 만 있고 `grant` 가 없었다.
--
-- ⭐ **그런데 운영은 왜 돌았나** — Supabase 가 `public` 스키마에 대해
--    `alter default privileges … grant all on tables to anon, authenticated, service_role` 을
--    미리 걸어 두기 때문이다. 운영에서는 표를 만드는 순간 그 기본값이 붙었다.
--    **로컬에서 마이그레이션을 돌리면 그게 안 붙는다.** 그래서 같은 코드가 두 곳에서 다르게 돌았다.
--
-- ⛔⛔ **이것이 왜 큰 결함인가** — 지금 운영이 도는 것은 **코드가 맞아서가 아니라 환경 덕**이다.
--    새 프로젝트를 세우거나(재해 복구·미리보기 브랜치·새 환경) 기본 권한 설정이 바뀌면
--    **마이그레이션만으로는 죽은 사이트가 나온다.** 학교가 한 곳도 안 뜬다.
--
-- ⛔ **여기서 정책보다 넓게 주지 않는다.** 정책이 `authenticated` 에게만 열어 둔 표에
--    `anon` 을 끼워 넣지 않는다. 아래 목록은 `pg_policies` 를 그대로 읽어 맞췄다.
-- ⛔ **정책이 하나도 없는 표에는 아무것도 안 준다** — `school_views` · `commute_quota` 가 그렇다.
--    그 둘은 서버(service_role)만 지나가는 자리다(§12-92). 권한을 주면 그 설계가 무너진다.
-- ⛔ **`admin_*` 여덟 뷰도 안 건드린다** — 그쪽은 일부러 `anon` 을 뗀 자리다(`20260824112302`).
--
-- ⚠️ **운영에서는 이 파일이 사실상 아무것도 안 바꾼다** — 이미 더 넓게 붙어 있다.
--    바꾸는 것은 **「다음에 세우는 DB」**다.

-- ── 누구나 읽는 공개 데이터 ─────────────────────────────────────────────────
-- 학교 마스터. ⛔ 이것이 안 열리면 지도·목록·정적 화면이 **전부** 빈다
grant select on public.personnel_areas to anon, authenticated;
-- 운영 뱃지. 남에게 보여야 뜻이 있는 값이다(§12-147)
grant select on public.staff            to anon, authenticated;
-- 통근 캐시. ⛔ 읽기만이다 — 넣는 것은 서버(service_role)뿐이다(§12-99)
grant select on public.commute          to anon, authenticated;

-- ── 로그인한 사람 것 ────────────────────────────────────────────────────────
--
-- ⛔ 정책이 열어 둔 것과 **같은 칸만** 준다. 정책에 `delete` 가 없으면 여기도 없다 —
--    별점을 못 지우는 것은 실수가 아니라 §6 이 정한 것이다.
grant select                        on public.home_schools to authenticated;
grant select, insert, update        on public.profiles     to authenticated;
grant select, insert, update        on public.ratings      to authenticated;
grant select, insert, update, delete on public.watchlist   to authenticated;
grant select, insert, delete        on public.saved_routes to authenticated;
grant select, insert, update        on public.reports      to authenticated;
grant select, insert, update, delete on public.report_files to authenticated;

-- ⛔ 시퀀스 권한은 필요 없다 — `ratings`·`watchlist`·`saved_routes` 의 id 는
--    `generated always as identity` 라 표 권한만으로 들어간다(직렬(serial)이면 달랐다).

comment on table public.personnel_areas is
  '학교 마스터. 전국 17개 시·도 공립 초등. 인사구역은 고시 원문을 읽은 시·도(경기·인천)만 채워져 있고 나머지는 null 이다. 공공데이터이며 교사 입력과 섞지 않는다. 학년도는 적용 학년도 기준. ⛔ 읽기 권한은 20260824144506 에 명시했다 — 그 전에는 운영의 기본 권한에 기대고 있었다.';
