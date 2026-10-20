/**
 * 운영 화면(`/admin`)이 읽는 것 — 한 곳에 모은다
 *
 * 사장님(2026-08-24) — 「사용자 패턴과 방문자수, 활동내역, 신규가입자 등을 보고
 * 고객 패턴을 연구할 수 있는 pm용 관리 페이지」.
 *
 * ⛔ **읽기만 있다.** 지우는 함수도 고치는 함수도 여기 없다(2026-08-24 확인 ④ —
 *    「단순 조회용 페이지이며 삭제 및 변경 등은 agent와 db에서 함께 반영」).
 *    유일한 예외가 제보 답장인데, 그것도 새 문을 내지 않고 **제보 창이 쓰던 문을 그대로 쓴다**
 *    (`components/report-dialog.tsx` 의 `answer()` 와 같은 `reports` 표 update · §11-3).
 *
 * ⛔ **익명 클라이언트(`lib/supabase.ts`)를 쓰지 않는다.** 운영 뷰는 `authenticated` 에게만
 *    열려 있고, 그 안에서 다시 `is_staff()` 가 가른다. 익명 키로 부르면 권한부터 막힌다.
 *
 * ⛔ **실패를 삼키지 않는다**(§11-2). 모든 읽기가 `{ rows, error }` 를 돌려주고,
 *    화면은 `error` 를 그 자리에 적는다. 빈 목록과 「못 읽었다」는 다른 것이다 —
 *    둘을 같이 「없습니다」로 그리면 서버가 죽어도 화면은 평온해 보인다.
 */

import { authClient } from "@/lib/auth/client";

/** 숫자로. ⛔ 평균 칸은 `numeric` 이라 글자로 올 수 있다. `null` 은 `null` 로 둔다 — 0 이 아니다 */
const num = (v: unknown): number | null => (v == null ? null : Number(v));

/** 실패를 사람 말로. ⛔ 버리지 않는다 — 바꾸는 것은 문구뿐이다(`lib/home-school.ts` 와 같은 결) */
function readable(message: string): string {
  if (/permission denied/i.test(message)) return "권한이 없습니다";
  return message;
}

/**
 * 서버에서 받은 한 줄. ⛔ **형이 없다** — PostgREST 가 주는 것은 그냥 JSON 이고,
 * 우리 뷰는 마이그레이션이 만든 것이라 타입이 생성돼 있지 않다. 그래서 여기서 한 번만
 * 느슨하게 받고, **바로 아래에서 우리 형으로 옮긴다**(`readOverview` 등). 밖으로는 안 샌다.
 */
type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * 받아서 우리 형으로 옮긴다.
 *
 * ⛔ **`Promise` 가 아니라 `PromiseLike` 다.** Supabase 질의는 thenable 이라 `.catch` 가 없다 —
 *    `Promise` 로 적으면 타입이 안 맞는다. 끊긴 요청은 `try` 가 받는다(§11-2).
 * ⛔ 실패를 삼키지 않는다. `error` 가 오면 줄을 비우고 **까닭을 함께** 돌려준다.
 */
async function guard<T>(
  run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
  shape: (raw: Raw[]) => T[]
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const { data, error } = await run();
    if (error) return { rows: [], error: readable(error.message) };
    return { rows: shape((data as Raw[] | null) ?? []), error: null };
  } catch (e: unknown) {
    return { rows: [], error: readable(e instanceof Error ? e.message : String(e)) };
  }
}

// ── 내가 운영인가 ────────────────────────────────────────────────────────────

export type Who = {
  /** 로그인한 사람의 메일. 손님은 `null` */
  email: string | null;
  staff: boolean;
  /** 「개발자」 같은 표 이름 */
  label: string | null;
  error: string | null;
};

/**
 * 지금 들어온 사람이 운영인가.
 *
 * ⛔ **이것이 문지기가 아니다.** 진짜 문은 DB 에 있다 — 뷰마다 `where public.is_staff()` 가
 *    걸려 있어서, 이 함수가 거짓말을 해도 줄이 안 나온다. 여기서 보는 것은
 *    **무엇을 그릴지**를 정하기 위해서다(빈 표 대신 「권한이 없습니다」를 낸다).
 * ⛔ `staff` 표는 누구나 읽는다(§12-147). 그래서 조회가 싸고, 남의 뱃지도 이걸로 그린다.
 */
export async function whoAmI(): Promise<Who> {
  try {
    const supabase = authClient();
    const { data: me, error: meError } = await supabase.auth.getUser();
    if (meError) return { email: null, staff: false, label: null, error: readable(meError.message) };

    const user = me.user;
    if (!user) return { email: null, staff: false, label: null, error: null };

    const { data, error } = await supabase
      .from("staff")
      .select("label")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) return { email: user.email ?? null, staff: false, label: null, error: readable(error.message) };

    const row = data as { label: string } | null;
    return {
      email: user.is_anonymous ? null : (user.email ?? null),
      staff: !!row,
      label: row?.label ?? null,
      error: null,
    };
  } catch (e: unknown) {
    return { email: null, staff: false, label: null, error: readable(e instanceof Error ? e.message : String(e)) };
  }
}

// ── ① 한눈 요약 ─────────────────────────────────────────────────────────────

export type Overview = {
  members: number; membersNamed: number; membersGuest: number;
  signupsToday: number; signups7d: number; signups30d: number; membersReturned: number;
  viewersToday: number; viewers7d: number; viewersTotal: number;
  opensToday: number; opensTotal: number; schoolsSeen: number;
  ratings: number; ratedSchools: number; raters: number;
  watches: number; watchers: number; homeSchools: number; savedRoutes: number;
  reports: number; reportsNew: number;
};

export async function readOverview(): Promise<{ row: Overview | null; error: string | null }> {
  const r = await guard(
    () => authClient().from("admin_overview").select("*").limit(1),
    (raw) => raw
  );
  if (r.error || !r.rows.length) return { row: null, error: r.error };
  const d = r.rows[0];
  return {
    row: {
      members: d.members, membersNamed: d.members_named, membersGuest: d.members_guest,
      signupsToday: d.signups_today, signups7d: d.signups_7d, signups30d: d.signups_30d,
      membersReturned: d.members_returned,
      viewersToday: d.viewers_today, viewers7d: d.viewers_7d, viewersTotal: d.viewers_total,
      opensToday: d.opens_today, opensTotal: d.opens_total, schoolsSeen: d.schools_seen,
      ratings: d.ratings, ratedSchools: d.rated_schools, raters: d.raters,
      watches: d.watches, watchers: d.watchers, homeSchools: d.home_schools, savedRoutes: d.saved_routes,
      reports: d.reports, reportsNew: d.reports_new,
    },
    error: null,
  };
}

// ── ② 일자별 · 시간대 ───────────────────────────────────────────────────────

export type Daily = {
  day: string; viewers: number; opens: number;
  signups: number; signupsNamed: number; ratings: number; watches: number; reports: number;
};

export const readDaily = () =>
  guard<Daily>(
    () => authClient().from("admin_daily").select("*").order("day"),
    (raw) => raw.map((d) => ({
      day: d.day, viewers: d.viewers, opens: d.opens,
      signups: d.signups, signupsNamed: d.signups_named,
      ratings: d.ratings, watches: d.watches, reports: d.reports,
    }))
  );

export type Hourly = { hour: number; opens: number; viewers: number };

export const readHourly = () =>
  guard<Hourly>(
    () => authClient().from("admin_hourly").select("*").order("hour"),
    (raw) => raw as Hourly[]
  );

// ── ③ 학교 순위 ─────────────────────────────────────────────────────────────

export type SchoolRank = {
  stdCode: string; name: string | null; sido: string | null; city: string | null; office: string | null;
  viewersTotal: number; viewers7d: number; viewersToday: number; opensTotal: number;
  lastDay: string | null; watches: number; ratingsN: number; score: number | null;
};

/**
 * 조회한 사람이 많은 학교부터.
 *
 * ⛔ **Supabase 는 한 번에 1,000행만 준다**(CLAUDE.md §13). 지금 값이 있는 학교가 938곳이라
 *    아직 안 걸리지만, 늘면 조용히 끊긴다. 그래서 화면에 필요한 만큼만 못박아 받고
 *    **받은 개수를 화면에 적는다** — 「상위 200곳」이라고 쓰면 잘린 것이 아니라 고른 것이 된다.
 */
export const readSchoolRank = (limit = 200) =>
  guard<SchoolRank>(
    () => authClient().from("admin_school_rank").select("*")
      .order("viewers_total", { ascending: false })
      .order("opens_total", { ascending: false })
      .limit(limit),
    (raw) => raw.map((d) => ({
      stdCode: d.std_code,
      name: d.official_name ?? d.name ?? null,
      sido: d.sido ?? null, city: d.city ?? null, office: d.office ?? null,
      viewersTotal: d.viewers_total, viewers7d: d.viewers_7d, viewersToday: d.viewers_today,
      opensTotal: d.opens_total, lastDay: d.last_day ?? null,
      watches: d.watches, ratingsN: d.ratings_n, score: num(d.score),
    }))
  );

// ── ④ 학교별 평가 ───────────────────────────────────────────────────────────

export type SchoolRating = {
  stdCode: string; name: string | null; sido: string | null; city: string | null; office: string | null;
  n: number; nAccess: number; viewers: number;
  firstYear: number | null; lastYear: number | null; lastAt: string | null;
  admin: number | null; mood: number | null; rights: number | null;
  workload: number | null; facility: number | null; access: number | null;
};

/**
 * 학교별 별점.
 *
 * ⛔ **표본수를 내는 곳은 이제 여기뿐이다**(2026-08-24 · `DESIGN.md §12-173`).
 *    교사 화면도 한 명이 남기면 평균을 내지만 **몇 명인지는 안 적는다** — 문턱을 없앤 것과 한 벌이다.
 *    운영은 자료가 얼마나 쌓였는지를 판단해야 하므로 여기서는 낸다.
 * ⛔ **이 화면은 `is_staff()` 가 잠근다** — 그래서 표본수를 내도 밖으로 안 샌다.
 *    ⛔ 이 값을 교사 화면으로 옮기지 마라. 옮기는 순간 한 사람짜리 평균이 드러난다.
 */
export const readSchoolRatings = (limit = 200) =>
  guard<SchoolRating>(
    () => authClient().from("admin_school_ratings").select("*")
      .order("n", { ascending: false })
      .order("viewers", { ascending: false })
      .limit(limit),
    (raw) => raw.map((d) => ({
      stdCode: d.std_code,
      name: d.official_name ?? d.name ?? null,
      sido: d.sido ?? null, city: d.city ?? null, office: d.office ?? null,
      n: d.n, nAccess: d.n_access, viewers: d.viewers,
      firstYear: d.first_year ?? null, lastYear: d.last_year ?? null, lastAt: d.last_at ?? null,
      admin: num(d.admin), mood: num(d.mood), rights: num(d.rights),
      workload: num(d.workload), facility: num(d.facility), access: num(d.access),
    }))
  );

// ── ⑤ 회원 ──────────────────────────────────────────────────────────────────

export type Member = {
  userId: string;
  /** ⛔ 가려진 주소다 — `op***@example.invalid`. 원문이 나오는 길은 없다(2026-08-24 확인 ②) */
  email: string | null;
  nickname: string | null;
  guest: boolean; staff: boolean; staffLabel: string | null;
  joinedAt: string; lastSignInAt: string | null; provider: string;
  homeSchool: string | null;
  ratings: number; watches: number; reports: number; savedRoutes: number;
  lastActAt: string | null;
};

export const readMembers = (limit = 500) =>
  guard<Member>(
    () => authClient().from("admin_members").select("*").order("joined_at", { ascending: false }).limit(limit),
    (raw) => raw.map((d) => ({
      userId: d.user_id, email: d.email ?? null, nickname: d.nickname ?? null,
      guest: !!d.guest, staff: !!d.staff, staffLabel: d.staff_label ?? null,
      joinedAt: d.joined_at, lastSignInAt: d.last_sign_in_at ?? null, provider: d.provider,
      homeSchool: d.home_school ?? null,
      ratings: d.ratings, watches: d.watches, reports: d.reports, savedRoutes: d.saved_routes,
      lastActAt: d.last_act_at ?? null,
    }))
  );

// ── ⑥ 활동 내역 ─────────────────────────────────────────────────────────────

export type Activity = {
  kind: string; at: string;
  stdCode: string | null; school: string | null; sido: string | null; office: string | null;
  guest: boolean;
};

/**
 * 최근 활동. ⛔ **누가 했는지는 안 온다**(2026-08-24 확인 ③) — 무엇이·언제·어느 학교에,
 * 그리고 손님인가 넷뿐이다. 「A가 B초에 별점을 남겼다」는 화면에 없다.
 */
export const readActivity = () =>
  guard<Activity>(
    () => authClient().from("admin_activity").select("*"),
    (raw) => raw.map((d) => ({
      kind: d.kind, at: d.at,
      stdCode: d.std_code ?? null, school: d.school ?? null,
      sido: d.sido ?? null, office: d.office ?? null,
      guest: !!d.guest,
    }))
  );

// ── ⑦ 제보 ──────────────────────────────────────────────────────────────────

export type AdminReport = {
  id: string; createdAt: string; kind: string; body: string;
  status: string; reply: string | null; repliedAt: string | null;
  stdCode: string | null; school: string | null; sido: string | null; page: string | null;
  nickname: string | null; email: string | null; files: number;
};

export const readReports = () =>
  guard<AdminReport>(
    () => authClient().from("admin_reports").select("*").order("created_at", { ascending: false }).limit(300),
    (raw) => raw.map((d) => ({
      id: d.id, createdAt: d.created_at, kind: d.kind, body: d.body,
      status: d.status, reply: d.reply ?? null, repliedAt: d.replied_at ?? null,
      stdCode: d.std_code ?? null, school: d.school ?? null, sido: d.sido ?? null, page: d.page ?? null,
      nickname: d.nickname ?? null, email: d.email ?? null, files: d.files,
    }))
  );

/**
 * 제보에 답장을 달고 처리 상태를 옮긴다.
 *
 * ⛔ **새 문을 내지 않는다.** `reports` 표의 `reports_staff_update` 하나로 쓴다 —
 *    제보 창(`components/report-dialog.tsx`)의 `answer()` 와 **같은 문**이다.
 *    쓰는 문을 둘로 늘리면 한쪽만 고쳐지는 날이 온다(§11-3).
 * ⛔ 실패를 삼키지 않는다(§11-2). 끊긴 요청은 `catch` 가 받는다.
 */
export async function answerReport(
  id: string, text: string, done: boolean
): Promise<{ ok: true } | { error: string }> {
  const patch = text.trim()
    ? { reply: text.trim(), replied_at: new Date().toISOString(), status: done ? "done" : "new" }
    : { status: done ? "done" : "new" };
  try {
    const { error } = await authClient().from("reports").update(patch).eq("id", id);
    if (error) return { error: readable(error.message) };
    return { ok: true };
  } catch (e: unknown) {
    return { error: readable(e instanceof Error ? e.message : String(e)) };
  }
}

// ── 화면이 쓰는 꼴 만들기 ───────────────────────────────────────────────────

/** `2026-08-24` → `8. 24.` ⛔ 자리를 아껴야 하는 가로축에서 쓴다 */
export const shortDay = (day: string) => {
  const [, m, d] = day.split("-");
  return `${Number(m)}. ${Number(d)}.`;
};

/**
 * 언제였나 — 「3분 전」 · 「어제」 · 「8. 20.」
 * ⛔ 하루가 넘으면 날짜로 적는다. 「26시간 전」은 사람이 못 읽는다.
 */
export function ago(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return "방금";
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
  if (sec < 172800) return "어제";
  const d = new Date(iso);
  return `${d.getMonth() + 1}. ${d.getDate()}.`;
}

/** `2026-08-24T01:51:46Z` → `8. 24. 10:51` (서울 시각) */
export function stamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(d);
}

/** 천 단위 쉼표. ⛔ 숫자 칸은 늘 `tabular-nums` 와 함께 쓴다 */
export const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("ko-KR"));
