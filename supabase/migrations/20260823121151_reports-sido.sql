-- 제보에 시·도를 담는다.
--
-- 왜 — 「인사구역 준비 중」 공지가 **시·도마다** 서고, 그 안의 「고시문 제보」 단추도 시·도마다 있다.
-- 그런데 `page`(누른 화면 경로)만으로는 못 가린다 — `/school` 한 장에 열다섯 시·도가 함께 있어
-- 어느 시·도 고시문을 보낸 것인지 알 수 없다.
--
-- ⭐ 이 칸이 있으면 운영이 **시·도로 묶어** 처리할 수 있다 — 「경북 고시문이 왔다 → 경북을 연다」가
--    이 서비스가 앞으로 지역을 넓히는 방식 그대로다(사장님 2026-08-23 「단계적으로 채워나가고」).
--
-- ⛔ 칸을 더하기만 한다. NOT NULL 을 안 건다 — 학교에서 누른 제보에는 시·도가 없을 수 있다
--    (그쪽은 `std_code` 로 어느 시·도인지 이미 알 수 있다).
alter table public.reports
  add column if not exists sido text;

create index if not exists reports_sido_idx on public.reports (sido) where sido is not null;

comment on column public.reports.sido is
  '어느 시·도 이야기인가. 「인사구역 준비 중」 공지에서 누르면 담긴다. 학교에서 누른 것은 std_code 로 안다';
