-- 코드 자리가 공백인 학교 한 곳을 바로잡고, 보낸 뒤에는 첨부를 못 지우게 막는다.
--
-- ── ① 표준학교코드가 공백인 학교 ────────────────────────────────────────────
--
-- 나이스가 **코드 자리에 공백을 채워 보내는 학교가 있다.** 충남다우리학교(초)가 `'       '`
-- (공백 일곱)로 온다 — `null` 이 아니라 문자열이라 `is not null` 도 `if (code)` 도 다 지나간다.
--
-- 그래서 두 가지가 조용히 틀려 있었다.
--   ⛔ 사이트맵에 `/school/       ` 이 실렸다 — 열면 404 다(다른 세션이 잡았다 · `dd650e4`).
--   ⛔ **학급수가 남의 것이었다.** 그 공백으로 나이스 `classInfo` 를 부르면 오류가 아니라
--      **다른 학교의 학급이 온다.** 이 학교에 7학급이 붙어 있었는데 근거가 없는 값이다.
--
-- `dd650e4` 가 **읽는 쪽**을 막았고(`usableCode`), 받는 쪽은 `scripts/fetch-neis-schools.mjs` 의
-- `code7()` 과 `scripts/fetch-classes.mjs` 가 막는다. 여기서는 **이미 들어와 있는 한 줄**을 고친다.
--
-- ⛔ 씨앗을 다시 뽑지 않는다. 6,300줄짜리 마이그레이션이 또 생긴다(`docs/BACKLOG.md` ⑳).
--    고칠 것이 한 줄이면 한 줄만 고친다.
-- ⛔ 학교를 지우지 않는다. 실제로 있는 공립 학교다 — **모르는 값만 null 로 되돌린다**(§11-1).

update public.personnel_areas
   set std_code = null,
       classes  = null
 where school_year = 2027
   and std_code is not null
   and std_code !~ '^[0-9]+$';


-- ── ② 보낸 뒤에는 첨부를 못 지운다 ──────────────────────────────────────────
--
-- `docs/BACKLOG.md` ㉑ (검수에서 나왔다). `report_files` 표는 「아직 제보에 안 붙은 것만」
-- 지우게 잠가 뒀는데 **스토리지 정책에는 그 조건이 없었다.** 그래서 보낸 사람이 제보를 보낸 뒤에도
-- 파일 자체는 지울 수 있었고, 운영이 열면 **줄은 있는데 파일이 없는** 꼴이 된다.
--
-- ⭐ 지우는 길을 아주 막지는 않는다 — 보내기 전 미리보기에서 잘못 올린 것은 뺄 수 있어야 한다.
--    **아직 제보에 안 붙은 파일만** 지울 수 있게 조건을 맞춘다(표와 같은 조건이다).

drop policy if exists reports_files_own_delete on storage.objects;
create policy reports_files_own_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
    -- ⛔ 이미 제보에 붙은 파일은 못 지운다. 표(`report_files_own_delete`)와 같은 조건이다
    and not exists (
      select 1 from public.report_files f
       where f.path = storage.objects.name and f.report_id is not null
    )
  );
