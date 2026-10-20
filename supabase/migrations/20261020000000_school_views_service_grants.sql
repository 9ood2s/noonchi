-- 조회수는 서버만 기록한다. RLS 우회 권한도 테이블의 GRANT를 대신하지 않는다.
-- 기존 마이그레이션의 집계 뷰와 무정책 RLS는 유지하고 원시 기록은 공개하지 않는다.
revoke all privileges on table public.school_views from public, anon, authenticated;

-- /api/view의 ignoreDuplicates upsert는 ON CONFLICT DO NOTHING이다.
-- INSERT와 충돌 키를 읽는 SELECT가 필요하며 UPDATE/DELETE는 새로 부여하지 않는다.
-- https://www.postgresql.org/docs/17/sql-insert.html
grant select, insert on table public.school_views to service_role;
