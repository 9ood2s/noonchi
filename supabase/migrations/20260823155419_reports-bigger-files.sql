-- 제보 파일 — 한도를 25MB 로 올리고 xlsx·csv 를 받는다 (docs/DESIGN.md §12-161-4)
--
-- 사장님(2026-08-24) — 「용량제한이나 응답시간 제한으로 업로드가 실패하지는 않을지 재봐
-- **pdf용량은 꽤 커서**. **hwp, hwpx, xlsx, pdf, cvc** 도 고스트 힌트로 넣어주고」.
--
-- ■ 재 봤다 (2026-08-24 · 실제로 올려 보고 잰 값)
--   우리가 가진 교육청 원자료 가장 큰 것 = **0.56MB**(경기 2026 인사관리세부기준 pdf).
--   9MB 올리기 = 200 · **0.9초**(9.5MB/s) · 12MB = **413 EntityTooLarge** 로 **깔끔하게 거절**.
--   ⭐ 시간 때문에 끊기는 자리는 없다. 막히는 것은 오직 크기이고, **조용히 실패하지 않는다.**
--
-- ⛔ 그래도 올린다 — **스캔한 고시문은 수십 MB 가 된다.** 글자 pdf 와 스캔 pdf 는 자릿수가 다르다.
--    25MB 면 그 대부분이 들어오고, 초과는 그대로 거절된다(자르지 않는다 · CLAUDE.md §11-1).
-- ⛔ 화면의 상한(`lib/report.ts` 의 `FILE_BYTES`)과 **같은 수여야 한다.** 화면이 더 크게 잡으면
--    올리다가 413 을 받고, 더 작게 잡으면 받을 수 있는 것을 미리 막는다.
update storage.buckets
   set file_size_limit = 26214400,  -- 25MB
       allowed_mime_types = array[
         'application/pdf',
         'application/haansofthwp',                                            -- .hwp
         'application/x-hwp',
         'application/hwp+zip',                                                -- .hwpx
         'application/vnd.hancom.hwpx',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
         'application/vnd.ms-excel',                                           -- .xls
         'text/csv',
         'application/csv',
         -- ⛔ .hwpx·.xlsx·.csv 를 이 형으로 보내는 브라우저가 있다. 안 받으면 멀쩡한 파일이 튕긴다
         'application/zip',
         'application/octet-stream',
         'image/jpeg', 'image/png', 'image/webp', 'image/heic'
       ]
 where id = 'reports';
