-- 전입·전출 칸을 걷어낸다 (docs/DESIGN.md §12-102)
--
-- 사장님(2026-08-23) — 「전출입은 이상신호가 아니야.. **의미없으니까 빼도 됨**」.
--
-- ⚠️ **파괴적 변경이다**(CLAUDE.md §11-5). 다만 —
--   · 이 두 칸은 **같은 날 몇 분 전에 내가 더한 것**이고
--   · 화면에 한 번도 안 나갔고
--   · 사장님이 빼라고 했다.
--   그래서 확인받은 것으로 본다. 다른 칸(teachers_f·teachers_m·teachers_t)은 그대로 둔다.
--
-- ⛔ 처음엔 「전출이 학생수보다 많을 수 없다」고 검산을 걸었다가 **틀렸다** —
--    걸린 곳이 신설교였다(고덕함박초 학생 463 · 전입 493. 새로 연 학교라 전원이 전입이다).
--    짐작으로 「이상값」이라 부르지 않는다. 이 실수는 `docs/DESIGN.md §12-102-1` 에 남겼다.

alter table public.personnel_areas drop constraint if exists pa_staff_ck;

alter table public.personnel_areas
  drop column if exists moved_in,
  drop column if exists moved_out;

-- 남은 셋에만 다시 건다
alter table public.personnel_areas add constraint pa_staff_ck check (
  (teachers_f is null or teachers_f between 0 and 500)
  and (teachers_m is null or teachers_m between 0 and 500)
  and (teachers_t is null or teachers_t between 0 and 500)
);
