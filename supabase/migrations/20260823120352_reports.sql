-- 제보 — 교사가 우리에게 보내는 것 (docs/DESIGN.md §12-161)
--
-- 사장님(2026-08-23) — 「오류보고랑 수정 요청이랑 함께. **제보라는 버튼을 곳곳에 배치.**
-- 항목을 **오류수정 · 예상티오 · 인사관련문서** 이렇게 나누면 될 듯. supaclass q&a 참고하면 좋을 듯.」
--
-- 뼈대는 supaclass 의 `app_feedback`(0245)을 따랐다 — 본인 것만 읽는 RLS · 답장 · 명시적 길이 거부.
-- ⛔ 그쪽 저장소를 고치러 가지 않는다. 꼴만 가져왔고 여기부터는 갈린다(CLAUDE.md 머리말).
--
-- ⛔⛔ **받은 제보를 다른 사용자에게 보여주지 않는다.** 이 표에는 읽기 정책이 둘뿐이다 —
--    보낸 본인, 그리고 운영(`staff`). 남의 글을 화면에 되돌려 걸면 자유 서술 평가를 막아 둔
--    CLAUDE.md §1 로 되돌아간다(사실적시 명예훼손 · 운영자 배상책임).
--    ⭐ 우리가 읽고 **데이터로 반영하는 것**까지가 이 표의 일이다.
--
-- ⛔ **침묵 상한 금지**(CLAUDE.md §11-1). 4,000자를 넘으면 조용히 자르지 않고 `check` 가 **거절한다.**
--    화면은 남은 글자를 세어 보여주고, 넘으면 저장 단추를 잠근다 — 잘린 줄 모르고 보내는 일이 없게.

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),

  /**
   * 무엇을 보내나. 사장님이 나눈 셋 그대로다.
   *   error 오류 수정 — 우리 화면 값이 틀렸다
   *   to    예상 TO   — 내년에 자리가 몇이나 날 것 같다
   *   doc   인사 관련 문서 — 교육청 고시문 등
   * ⛔ 값을 늘릴 때는 화면의 라벨(`lib/report.ts`)과 **함께** 늘린다. 한쪽만 늘면 저장이 거절된다.
   */
  kind        text not null check (kind in ('error', 'to', 'doc')),

  body        text not null check (char_length(body) between 1 and 4000),

  /**
   * 어느 학교 이야기인가. 학교 화면에서 누르면 저절로 담긴다.
   * ⛔ 외래키를 안 건다 — `personnel_areas` 는 학년도마다 지웠다 다시 넣는 표라(seed) 참조가 끊긴다.
   */
  std_code    text,
  /** 어느 화면에서 눌렀나. 오류 제보를 되짚을 때 이것이 없으면 어디를 보라는 말인지 알 수 없다 */
  page        text,

  user_id     uuid not null references auth.users (id) on delete cascade,
  /** 브라우저. 오류 재현용 */
  ua          text,

  status      text not null default 'new' check (status in ('new', 'done')),
  /** 운영이 단 답장. 보낸 사람이 자기 화면에서 읽는다 */
  reply       text,
  replied_at  timestamptz
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists reports_user_idx   on public.reports (user_id, created_at desc);
create index if not exists reports_school_idx on public.reports (std_code) where std_code is not null;

alter table public.reports enable row level security;

/**
 * ⛔ **손님(익명)은 못 보낸다.** 익명 열쇠는 아무나 몇 개든 만들 수 있어 도배를 못 막는다.
 *    「열람 무인증 · 입력만 메일 인증」(`DESIGN.md §9`) 이 그대로 걸리는 자리다.
 */
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

-- 보낸 본인은 자기 것만 읽는다 (답장을 읽어야 하므로)
drop policy if exists reports_own_select on public.reports;
create policy reports_own_select on public.reports
  for select to authenticated using (user_id = auth.uid());

/**
 * 운영은 다 읽고 상태·답장을 고친다. **명단은 `staff` 표 하나다**(§12-147 · staff-badge).
 * ⛔ 메일 주소를 여기 또 박지 않는다 — 두 곳에 두면 한쪽만 늘어난다(§11-3).
 */
create or replace function public.is_staff()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.staff s where s.user_id = auth.uid());
$$;

drop policy if exists reports_staff_select on public.reports;
create policy reports_staff_select on public.reports
  for select to authenticated using (public.is_staff());

drop policy if exists reports_staff_update on public.reports;
create policy reports_staff_update on public.reports
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- ⛔ 삭제 정책을 안 만든다. 보낸 사람도 운영도 화면에서 못 지운다 —
--    지우는 길이 있으면 「반영했다」와 「없앴다」를 구분할 수 없게 된다. 필요하면 서비스 롤로 한다.

comment on table public.reports is
  '교사 제보(오류 수정 · 예상 TO · 인사 관련 문서). ⛔ 다른 사용자에게 보여주지 않는다 — 본인과 운영만 읽는다.';


-- ── 첨부 파일 ────────────────────────────────────────────────────────────────
--
-- 「인사 관련 문서」는 파일이라야 뜻이 있다. 고시문은 PDF·한글 파일로 온다.
--
-- ⛔ **공개 버킷이 아니다.** 남이 주소만 알면 받아 갈 수 있으면 안 된다.
-- ⛔ **경로 첫 칸이 보낸 사람의 user_id 다.** 정책이 그 칸만 보고 가른다 —
--    남의 폴더에는 못 넣고 못 읽는다.
-- ⛔ 우리가 받는 것은 **공개된 고시문**이다. 내부 문서·유출 자료는 화면이 그렇게 적어 두고,
--    실려도 **어디에도 되돌려 보여주지 않는다**(CLAUDE.md §1).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reports',
  'reports',
  false,
  10485760, -- 10MB. 고시문 PDF 가 이 안쪽이다. ⛔ 조용히 자르는 값이 아니라 거절하는 값이다
  array[
    'application/pdf',
    'application/haansofthwp',   -- .hwp
    'application/x-hwp',
    'application/hwp+zip',       -- .hwpx
    'application/vnd.hancom.hwpx',
    'application/zip',           -- .hwpx 를 이 형으로 보내는 브라우저가 있다
    'image/jpeg', 'image/png', 'image/webp', 'image/heic'
  ]
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists reports_files_insert on storage.objects;
create policy reports_files_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'reports'
    and (storage.foldername(name))[1] = auth.uid()::text
    and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  );

drop policy if exists reports_files_own_select on storage.objects;
create policy reports_files_own_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists reports_files_staff_select on storage.objects;
create policy reports_files_staff_select on storage.objects
  for select to authenticated
  using (bucket_id = 'reports' and public.is_staff());

-- 잘못 올린 것은 본인이 지운다(보내기 전 미리보기에서 뺄 수 있어야 한다)
drop policy if exists reports_files_own_delete on storage.objects;
create policy reports_files_own_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'reports' and (storage.foldername(name))[1] = auth.uid()::text);


-- 제보에 붙은 파일. ⛔ 표를 따로 두는 까닭 — 파일은 보내기 **전에** 올라가고,
--    보내기를 그만두면 제보 줄이 없는 파일이 남는다. 그것을 나중에 세어 치울 수 있어야 한다.
create table if not exists public.report_files (
  id         uuid primary key default gen_random_uuid(),
  report_id  uuid references public.reports (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  path       text not null unique,
  name       text not null,
  bytes      integer not null,
  created_at timestamptz not null default now()
);

create index if not exists report_files_report_idx on public.report_files (report_id);
create index if not exists report_files_orphan_idx on public.report_files (created_at) where report_id is null;

alter table public.report_files enable row level security;

drop policy if exists report_files_insert on public.report_files;
create policy report_files_insert on public.report_files
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists report_files_own on public.report_files;
create policy report_files_own on public.report_files
  for select to authenticated using (user_id = auth.uid());

-- 보내기를 누를 때 방금 올린 파일에 제보 번호를 적는다. 남의 파일에는 못 적는다
drop policy if exists report_files_own_update on public.report_files;
create policy report_files_own_update on public.report_files
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists report_files_own_delete on public.report_files;
create policy report_files_own_delete on public.report_files
  for delete to authenticated using (user_id = auth.uid() and report_id is null);

drop policy if exists report_files_staff_select on public.report_files;
create policy report_files_staff_select on public.report_files
  for select to authenticated using (public.is_staff());

comment on table public.report_files is
  '제보에 붙은 파일. report_id 가 null 이면 보내다 만 것 — 세어서 치운다.';
