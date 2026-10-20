-- 통근 — **경로**와 **방향**을 함께 담는다 (docs/DESIGN.md §12-101)
--
-- 사장님(2026-08-23) —
--   「출퇴근 경로 표시는 왜 안됨」
--   「대중교통도 무슨 수단으로 어디서 환승하고 그런것도 나오나?」
--   「집-학교 사이에 스위치도 만들어서 퇴근길도 함께 조회」
--   「경로가 처음 검색했을 때 한가지만 나오나 여러가지가 나오나?」
--
-- ⛔ **셋 다 이미 받고 있었는데 버리고 있었다.** 실측으로 확인했다 —
--   · NCP Directions 5 → `route.trafast[0].path` 에 점 545개
--   · 카카오 대중교통  → **경로 15개**가 오고, step 마다
--     `properties.type`(BUS/SUBWAY/WALKING) · `guidance`(노선명) · `stops`(정류장) ·
--     `vehicles`(노선번호) · `path.points`(선) 가 다 들어 있다
--   우리는 `min(totalTime)` 하나의 **소요시간만** 꺼내고 나머지를 통째로 버렸다.
-- ⛔ **바깥을 더 부르지 않는다.** 같은 응답에서 꺼내 쓰는 것뿐이라 쿼터가 안 는다(§12-99).
-- ⛔ **경로를 담아 두어야 캐시가 뜻이 있다.** 안 담으면 재 둔 값이 있어도 선을 그리려고
--    바깥을 다시 불러야 한다 — 그러면 캐시를 만든 까닭이 사라진다.
-- ⛔ 자동차 경로는 **점을 솎아서** 담는다. 545점을 그대로 두면 한 줄이 20KB 를 넘고,
--    화면 축척에서는 그만큼의 정밀도가 안 보인다(몇 미터 차이다).

-- ── 방향 — 등교(집→학교)와 퇴근(학교→집)은 **다른 값**이다 ──────────────
-- 일방통행·차선·버스 배차가 달라 시간이 같지 않다. 기본키에 넣어 따로 담는다.
alter table public.commute
  add column if not exists dir text not null default '등교';

alter table public.commute drop constraint if exists commute_dir_ck;
alter table public.commute add constraint commute_dir_ck check (dir in ('등교', '퇴근'));

comment on column public.commute.dir is
  '방향. 등교 = 집→학교 · 퇴근 = 학교→집. 일방통행·배차가 달라 시간이 같지 않다.';

-- 기본키를 방향까지로 넓힌다. ⛔ 옛 줄은 기본값 「등교」로 남으므로 잃는 것이 없다.
alter table public.commute drop constraint if exists commute_pkey;
alter table public.commute add primary key (grid_y, grid_x, std_code, at_min, dir);

-- ── 경로 ────────────────────────────────────────────────────────────────
alter table public.commute
  add column if not exists car_path      jsonb,
  add column if not exists transit_steps jsonb,
  add column if not exists transit_alts  jsonb;

comment on column public.commute.car_path is
  '자동차 경로 [[경도,위도], …]. 점을 솎아 담는다. 없으면 선을 안 그린다.';
comment on column public.commute.transit_steps is
  '고른 대중교통 여정 [{kind,label,from,to,min,points}]. kind = 버스·지하철·도보. 환승은 줄 개수로 드러난다.';
comment on column public.commute.transit_alts is
  '같이 온 다른 대중교통 경로 [{min,transfers,summary}]. ⛔ 카카오는 한 번에 15개를 준다 — 버리지 않는다.';
