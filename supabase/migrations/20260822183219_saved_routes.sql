-- 길찾기 — 경로 목록 캐시와 **저장한 경로** (docs/DESIGN.md §12-103)
--
-- 사장님(2026-08-23) — 네이버지도 길찾기 화면 셋을 보내며 「이런 ui를 원한 거야,
-- **각 루트별로 저장할 수 있게**」. 저장은 「**로그인 필요 — 계정에**」로 정했다.
--
-- ⛔ **바깥을 더 부르지 않는다.** 실측 —
--   · NCP 는 `option=trafast:tracomfort:traavoidtoll` 로 **한 번에 3경로**를 준다
--     (빠른길 29분/22.0km · 편한길 33분/21.2km · 무료우선 34분/18.8km). 4개를 넣으면 400 이다.
--   · 카카오는 이미 **15경로**를 준다.
--   둘 다 호출 수는 그대로다(§12-99).

-- ── ① 캐시 — 경로 목록을 통째로 담는다 ──────────────────────────────────
-- 전에는 고른 하나의 선(car_path)과 여정(transit_steps)만 담았다. 이제 여러 경로를 담는다.
-- ⛔ **경로를 담아 두어야 캐시가 뜻이 있다** — 안 담으면 목록을 그리려고 바깥을 다시 부른다.
alter table public.commute
  add column if not exists routes jsonb;

comment on column public.commute.routes is
  '경로 목록 [{mode,key,label,min,km,toll,transfers,steps,path}]. mode = 자동차·대중교통. 첫 줄이 가장 빠른 것이다.';

-- 옛 칸은 남겨 둔다 — 이미 담긴 값이 있고, 지우면 그 줄을 다시 재야 한다(그건 쿼터다).
comment on column public.commute.car_path is
  '⚠️ 옛 칸. 지금은 routes 에 담는다. 이미 담긴 값이 있어 지우지 않았다.';

-- ── ② 저장한 경로 — 사람마다 ────────────────────────────────────────────
-- ⛔ **로그인해야 한다**(2026-08-23 사장님). 기기에만 두면 폰을 바꾸는 순간 사라진다.
-- ⛔ 경로 자체를 통째로 베껴 담지 않는다 — 무엇을 저장했는지(어느 학교·방향·시간대·수단·경로)
--    만 적고, 값은 캐시에서 다시 읽는다. 그래야 길이 바뀌면 저장한 것도 따라 바뀐다.
create table if not exists public.saved_routes (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  std_code   text not null,
  /** 출근 = 집→학교 · 퇴근 = 학교→집 */
  dir        text not null,
  /** 기준 시간대. 자정부터 분, 30분 단위 */
  at_min     smallint not null,
  /** 자동차 · 대중교통 */
  mode       text not null,
  /** 그 수단 안에서 어느 경로인가 — `trafast` · `최적` 처럼 */
  route_key  text not null,
  /** 화면에 적을 이름. 길이 바뀌어도 「내가 저장한 그것」을 알아볼 수 있게 함께 둔다 */
  label      text,
  /** 저장할 때의 소요시간(분). ⛔ 지금 값이 아니라 **그때 값**이다 — 비교하라고 둔다 */
  min_then   smallint,
  created_at timestamptz not null default now(),

  -- 한 사람이 같은 경로를 두 번 저장하지 않는다
  constraint saved_routes_once unique (user_id, std_code, dir, at_min, mode, route_key),
  constraint saved_routes_dir_ck  check (dir in ('출근', '퇴근')),
  constraint saved_routes_mode_ck check (mode in ('자동차', '대중교통')),
  constraint saved_routes_at_ck   check (at_min >= 0 and at_min < 1440 and at_min % 30 = 0)
);

create index if not exists saved_routes_user_idx on public.saved_routes (user_id, created_at desc);

comment on table public.saved_routes is
  '저장한 통근 경로. 무엇을 저장했는지만 적고 값은 캐시에서 다시 읽는다 — 길이 바뀌면 따라 바뀐다.';

alter table public.saved_routes enable row level security;

-- 자기 것만. ⛔ 남이 어느 학교로 가는 길을 저장했는지는 이 서비스에서 가장 민감한 값이다.
drop policy if exists "자기 경로만 읽는다" on public.saved_routes;
create policy "자기 경로만 읽는다" on public.saved_routes
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists "자기 이름으로만 저장한다" on public.saved_routes;
create policy "자기 이름으로만 저장한다" on public.saved_routes
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "자기 경로만 지운다" on public.saved_routes;
create policy "자기 경로만 지운다" on public.saved_routes
  for delete to authenticated using (auth.uid() = user_id);
