-- 개교 예정 학교를 같은 표에 담는다.
--
-- 경기 고시문 [별표4] 가 알려 주는 신설교는 [별표1] 인사구역 표에 **이미 구역이 실려 있다**
-- (2027학년도 6교 — 성남 금토 · 의왕 월암 · 화성 봉담2-1 · 용인 남동1 · 안성 공도1 · 시흥 장현1,
--  전부 을구역). 다만 아직 개교 전이라 나이스에 표준학교코드가 없고 학교알리미에 좌표·교원수도 없다.
--
-- ⛔ 이 학교들은 일반 전보와 지원을 따로 받는다. 목록에 섞어 두면 지금 갈 수 있는 학교로 읽힌다.
--    그래서 값을 하나 두고 화면이 갈라 보여준다.
alter table public.personnel_areas
  add column if not exists opens_year smallint;

comment on column public.personnel_areas.opens_year is
  '개교 예정 학년도. null 이면 이미 문을 연 학교다. 경기 고시문 [별표4] 에서 온다.';
