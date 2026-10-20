/**
 * 제보 — 교사가 우리에게 보내는 것 (`docs/DESIGN.md §12-161`)
 *
 * 사장님(2026-08-23) — 「오류보고랑 수정 요청이랑 함께. **제보라는 버튼을 곳곳에 배치.**
 * 항목을 **오류수정 · 예상티오 · 인사관련문서** 이렇게 나누면 될 듯.」
 *
 * ⛔ 부르는 쪽과 받는 쪽이 서로를 모른다(`lib/login-gate.ts` · `lib/toast.ts` 와 같은 방식).
 *    받는 쪽은 `components/report-dialog.tsx` 하나뿐이고 `app/layout.tsx` 에 달려 **어느 화면에서든** 뜬다.
 *    그래서 단추(`components/report-button.tsx`)를 아무 데나 놓아도 된다 — 「곳곳에 배치」가 그 뜻이다.
 * ⛔ 갈래 값(`error`·`to`·`doc`)은 **DB 의 `check` 와 같아야 한다**(`reports` 표).
 *    한쪽만 늘리면 저장이 거절된다. 늘릴 때 같이 늘린다(CLAUDE.md §11-3).
 */

export const REPORT_EVENT = "noonchi:report";

export type ReportKind = "error" | "to" | "doc";

/**
 * 화면에 적는 이름과 무엇을 적으라는 한 줄.
 *
 * ⛔ **문구는 사장님이 적어 주신 그대로다**(2026-08-23). 내가 줄여 쓰거나 말을 달지 않는다 —
 *    「왜 자꾸 좆같이 말을 달아서 넣지?」. 예시를 늘어놓는 것보다 **무엇을 적으라는 말**이 낫다는 판단이다.
 * ⚠️ 그래서 `…주세요` 로 끝난다 — 가드 ①(안내문 어미)이 세는 꼴이지만 **사장님이 못박은 문구**라 그대로 둔다.
 */
export const REPORT_KINDS: { key: ReportKind; label: string; hint: string }[] = [
  {
    key: "error",
    label: "오류 수정",
    hint: "실제 학급수나 급지정보가 다른 경우 제보해주세요(2027년 기준)",
  },
  {
    key: "to",
    label: "TO 제보",
    hint: "내년 예상되는 우리학교의 전출자 수나 전입TO를 적어주세요.",
  },
  {
    key: "doc",
    label: "인사 관련 문서",
    hint: "지원청 인사관리세부기준-급지표-전보 계획 문서나 우리 지역의 인사시스템을 상세하게 설명해주세요.",
  },
];

export const REPORT_LABEL: Record<ReportKind, string> = {
  error: "오류 수정",
  to: "TO 제보",
  doc: "인사 관련 문서",
};

/**
 * 글자 상한. **DB 의 `check` 와 같은 수다.**
 * ⛔ 넘으면 **조용히 자르지 않는다.** 화면이 남은 글자를 세어 보여주고 보내기를 잠근다 —
 *    잘린 줄 모르고 보내면 뒤가 통째로 사라진다(CLAUDE.md §11-1).
 */
export const BODY_MAX = 4000;

/**
 * 파일은 셋까지 · 하나에 **25MB**. ⛔ 서버(스토리지 버킷)도 **같은 수**로 거절한다.
 *
 * ⛔ 두 수가 어긋나면 안 된다 — 화면이 더 크게 잡으면 올리다가 413 을 받고,
 *    더 작게 잡으면 받을 수 있는 것을 미리 막는다(`supabase/migrations/…_reports-bigger-files.sql`).
 * ⭐ **재 보고 정한 값이다**(2026-08-24) — 24MB 올리기 2.1초 · 30MB 는 413 으로 깔끔하게 거절.
 *    시간 때문에 끊기는 자리는 없다. 우리 교육청 원자료 중 가장 큰 것은 0.56MB 인데,
 *    **스캔한 고시문은 자릿수가 다르다.**
 */
export const FILE_MAX = 3;
export const FILE_BYTES = 25 * 1024 * 1024;

/**
 * 받는 파일 — **고스트 힌트에 적는 것과 같은 목록**이다(2026-08-24 사장님 —
 * 「hwp, hwpx, xlsx, pdf, cvc 도 고스트 힌트로 넣어주고」).
 * ⛔ 화면에 적어 두고 실제로는 안 받으면 그것이 더 나쁘다 — 버킷의 허용 형식과 함께 늘린다.
 */
export const FILE_KINDS = "PDF · 한글 · 엑셀 · CSV · 사진";
/** 파일 고르개가 걸러 주는 값. ⛔ 확장자와 형식을 **둘 다** 적는다 — 브라우저마다 하나만 본다 */
export const FILE_ACCEPT =
  ".pdf,.hwp,.hwpx,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp,.heic," +
  "application/pdf,application/haansofthwp,application/x-hwp,application/hwp+zip," +
  "application/vnd.hancom.hwpx," +
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel," +
  "text/csv,application/csv,image/*";

/** 제보 창을 열 때 미리 채워 둘 것. 학교 화면에서 누르면 그 학교가 담긴다 */
export type ReportSeed = {
  kind?: ReportKind;
  /** 표준학교코드 */
  stdCode?: string;
  /** 화면에 적어 줄 학교 이름. 저장하지 않는다 — 저장하는 것은 코드다 */
  schoolName?: string;
  /**
   * 어느 시·도 이야기인가. 「인사구역 준비 중」 공지에서 누르면 담긴다.
   * ⛔ 이것이 없으면 `/school` 한 장에 열다섯 시·도가 함께 있어 **어느 고시문인지 알 수 없다.**
   */
  sido?: string;
};

/** 제보 창을 연다. 어디서 불러도 된다 */
export function openReport(seed: ReportSeed = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ReportSeed>(REPORT_EVENT, { detail: seed }));
}
