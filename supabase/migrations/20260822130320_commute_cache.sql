-- 통근 소요시간 캐시 (docs/DESIGN.md §12-54 · 55 · 56 · 57)
--
-- ⛔ **사람과 안 묶는다.** user_id 가 없다.
--    열쇠는 (집 격자 · 학교 · 기준 시간대) 셋뿐이라, 이 표만 봐서는 누가 어디 사는지 알 수 없다.
--    집 좌표는 **500m 격자로 뭉개서** 받는다 — 24km 통근에서 500m 는 1분 남짓이라 값은 거의 안 변하고,
--    유출돼도 「어느 동네쯤」까지만 나온다(§12-57).
--    사람과 집을 잇는 값은 **브라우저에만** 둔다(localStorage). 서버로 보내지 않는다.
--
-- ⛔ 캐시가 필요한 까닭 — 두 API 모두 **출발 시각을 못 받는다**(§12-55-1).
--    그래서 「그 시간대에 실제로 재서 남긴다」가 유일한 방법이고, 카카오 무료 쿼터가
--    하루 1,000건이라 격자 단위로 나눠 쓰지 않으면 금방 마른다.
--    호출이 **사용자 수가 아니라 격자 수**에 비례한다.
--
-- ⛔ 잰 날짜를 반드시 남긴다. 없으면 석 달 전 값인지 모른다(§12-56).

create table if not exists public.commute (
  /** 500m 격자. lat/0.0045 · lng/0.00568 을 반올림한 값 (위도 37.5 기준 — 경기·인천) */
  grid_y      int      not null,
  grid_x      int      not null,
  std_code    text     not null,
  /** 기준 시간대. 자정부터 분, **30분 단위**. 08:30 → 510 */
  at_min      smallint not null,
  /** 자동차 소요시간(분). 못 쟀으면 null — 0 으로 두지 않는다, 0 분은 「가깝다」로 읽힌다 */
  car_min     smallint,
  /** 대중교통 소요시간(분). 못 쟀으면 null */
  transit_min smallint,
  measured_at timestamptz not null default now(),

  primary key (grid_y, grid_x, std_code, at_min),

  -- ⛔ 말이 안 되는 값을 받지 않는다. 상한으로 조용히 자르는 게 아니라 **거절**한다(§11-1).
  constraint commute_at_ck   check (at_min >= 0 and at_min < 1440 and at_min % 30 = 0),
  constraint commute_car_ck  check (car_min is null or (car_min > 0 and car_min <= 600)),
  constraint commute_bus_ck  check (transit_min is null or (transit_min > 0 and transit_min <= 600))
);

comment on table public.commute is
  '통근 소요시간 캐시. 집 격자 · 학교 · 기준 시간대로만 잡는다 — 사람과 안 묶인다.';

alter table public.commute enable row level security;

-- 읽기는 누구나. 공공 API 를 우리가 대신 부른 결과라 개인 정보가 없다.
drop policy if exists "통근 시간은 누구나 읽는다" on public.commute;
create policy "통근 시간은 누구나 읽는다" on public.commute
  for select to anon, authenticated using (true);

-- ⛔ 쓰기 정책을 만들지 않는다. 서버가 service_role 로만 넣는다.
--    열어 두면 아무나 「강남까지 3분」 같은 값을 심을 수 있고, 화면은 그걸 확신을 갖고 보여준다.
