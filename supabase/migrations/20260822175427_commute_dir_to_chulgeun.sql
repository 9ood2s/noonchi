-- 방향 이름을 「등교」 → 「출근」으로 고친다 (docs/DESIGN.md §12-101-1)
--
-- ⛔ **「등교」는 학생이 하는 것이다.** 이 서비스의 사용자는 교사이므로 **출근**이다
--    (사장님, 2026-08-23 — 「등교는 무슨.. 출근이지」).
--    CLAUDE.md §4 「인사 용어는 교사가 쓰는 말 그대로 쓴다」의 그 자리다.
--
-- ⚠️ **앞선 20260822174709 은 빈 파일이었다.** 0바이트인 채로 `supabase db push` 가
--    「적용 성공」을 냈다 — 오류 없이 아무것도 안 했다. 그 뒤에 제약을 확인해 보고서야 알았다
--    (`docs/postmortems.md`). 그 줄은 원격 장부에 남아 있으므로 다시 못 쓴다. 그래서 이 파일이다.
--
-- ⚠️ 이 값은 몇 시간 전에 내가 넣은 것이라 실제 사용자 데이터가 아니다. 그래도 지우지 않고
--    **옮긴다** — 지우면 그 줄을 다시 재야 하고 그건 카카오 쿼터다.

alter table public.commute drop constraint if exists commute_dir_ck;

update public.commute set dir = '출근' where dir = '등교';

alter table public.commute alter column dir set default '출근';

alter table public.commute add constraint commute_dir_ck check (dir in ('출근', '퇴근'));

comment on column public.commute.dir is
  '방향. 출근 = 집→학교 · 퇴근 = 학교→집. 일방통행·배차가 달라 시간이 같지 않다.';
