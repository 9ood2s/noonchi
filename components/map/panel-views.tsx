"use client";

/**
 * 지도 위 칸에 드는 것들 — 관심목록 · 마이페이지 (`docs/DESIGN.md §12-95`)
 *
 * ⛔ **화면(라우트)이 아니다.** 지도를 열어 둔 채로 왼쪽 칸(넓은 화면)이나 아래 시트(폰)에 든다.
 *    학교 상세(`school-panel.tsx`)가 이미 그 그릇에 드는 것과 같은 방식이다 —
 *    그릇을 둘로 만들지 않는다(§11-3).
 * ⛔ **로그인 상태를 서버에서 보지 않는다**(CLAUDE.md §13). 브라우저에서 본다.
 * ⛔ **실패를 화면이 버리지 않는다**(§11-2). 서버가 오류를 답하는 길과 요청이 끊겨 **던지는**
 *    길이 둘 다 있으므로 `try/catch` 로 함께 잡는다.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Heart, LogOut, MapPin, RotateCw, School, Trash2, User, X } from "lucide-react";
import { NeedLogin } from "@/components/need-login";
import { NicknameField } from "@/components/nickname-field";
import { StaffBadge } from "@/components/staff-badge";
import { clearHomeSchool, readHomeSchool, saveHomeSchool } from "@/lib/home-school";
import { SchoolPicker, type PickedSchool } from "@/components/school-picker";
import { ReportButton } from "@/components/report-button";
import { MadeBy } from "@/components/made-by";
import { CHANGED as HOME_CHANGED, homePoint, outAt, readHome, type Home } from "@/lib/home";
import { HomeDialog } from "./home-dialog";
import { authClient } from "@/lib/auth/client";
import { db } from "@/lib/supabase";
/**
 * ⛔ **`areaLabel` 을 쓰지 않는다.** 그것은 「구역-급지」를 그대로 잇는 함수라
 *    인천에서 **`Ⅰ-가`** 가 나온다 — **인사구역 Ⅰ·Ⅱ·Ⅲ 은 화면에 안 내기로 한 값이다**
 *    (2026-08-21 사장님 확인 · 교사가 전보 때 보는 값이 아니다. 저장은 두고 보여주지만 않는다).
 *    2026-08-23 사장님이 관심목록에서 새어 나온 것을 짚었다 — 「이거 옛날에 걷어낸거잖아」.
 * ⛔ 시·도를 가려 주는 `fullLabel` 하나만 쓴다(경기 「병-나」 · 인천 「가급지」).
 *    학교 배지·필터·비교 판이 다 그것을 쓴다 — 여기만 달랐다(§11-3).
 */
import { fullLabel } from "@/lib/map";
import type { Sido } from "@/lib/schools";
import { toast } from "@/lib/toast";

type Watch = { std_code: string; considering: boolean; reasons: string[]; bonus: number | null };
type SchoolRow = { std_code: string; name: string; sido: string; city: string | null; office: string; area: string; area_grade: string | null };

/**
 * 칸 머리줄 — 학교 상세와 같은 높이로 맞춘다.
 *
 * ⛔ **닫기 단추가 여기 있어야 한다**(2026-08-23 사장님 — 「마이페이지랑 관심목록은
 *    닫기 버튼도 따로 없다?」). 학교 상세·목록은 `map-screen` 의 `panelActions` 로 ✕ 를 받는데
 *    **그 `actions` 가 이 칸들에는 안 넘어오고 있었다** — 열면 나가는 길이 레일을 다시 누르는 것뿐이었다.
 *    ⛔ 폰의 아래 시트에는 `actions` 가 아예 안 넘어간다. 그래서 **여기서 그린다** —
 *       하트(관심목록)를 `actions` 가 아니라 학교 상세 안에서 그린 것과 같은 까닭이다(§12-126).
 * ⛔ 44px 을 채운다(§11-4). 아이콘은 17px 이라 가운데 정렬로 채운다.
 */
function Head({ icon, children, onClose }: {
  icon: React.ReactNode;
  children: React.ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="flex min-h-11 items-center gap-2 px-4">
      <span className="text-key" aria-hidden>
        {icon}
      </span>
      <h2 className="text-[15px] font-bold tracking-[-0.02em]">{children}</h2>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-mr-2 ml-auto flex size-11 shrink-0 items-center justify-center rounded-full text-ink3 active:bg-fill"
        >
          <X size={17} aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * 관심목록에 담을 수 있는 상한. ⛔ **화면만의 약속이 아니다** — DB 방아쇠가 같은 수로 막는다
 * (`watchlist_limit`). 창을 둘 열어 놓고 각각 담으면 화면의 셈이 어긋나기 때문이다.
 */
export const WATCH_MAX = 9;
/** 한 번에 견줄 수 있는 학교 수 (2026-08-23 사장님 — 「동시 비교는 3개까지만」) */
export const COMPARE_MAX = 3;

export function WatchPanel({ onPick, onCompare, onClose }: {
  onPick: (stdCode: string) => void;
  /** 고른 학교들을 비교 판으로 넘긴다 */
  onCompare: (codes: string[]) => void;
  /** 칸을 닫는다. ⛔ 넓은 화면·폰 둘 다 이 하나로 닫힌다 */
  onClose?: () => void;
}) {
  const [state, setState] = useState<"받는중" | "로그인필요" | "됨" | "실패">("받는중");
  const [rows, setRows] = useState<Watch[]>([]);
  const [schools, setSchools] = useState<Record<string, SchoolRow>>({});
  const [error, setError] = useState<string | null>(null);
  /** 견주려고 고른 학교들. ⛔ 차례를 지킨다 — 비교 판의 열 차례가 고른 차례다 */
  const [picked, setPicked] = useState<string[]>([]);
  /**
   * 상한에 닿았다고 알릴 말.
   * ⛔ **미리 깔아 두지 않는다**(2026-08-23 사장님 — 「안내문구 이제 다 빼」).
   *    「3개까지 고를 수 있습니다」를 늘 띄워 두면 아무도 안 읽는다.
   *    **4번째를 눌렀을 때** 그 자리에서 뜨고, 다른 것을 누르면 사라진다.
   */
  const [hit, setHit] = useState<string | null>(null);
  /** 저장해 둔 통근 시간(출근) — 학교코드 → 분. 목록에서 미리 보인다 */
  const [mins, setMins] = useState<Record<string, number>>({});

  type Loaded = { member: false } | { member: true; rows: Watch[]; schools: Record<string, SchoolRow> };
  const pendingLoad = useRef<AbortController | null>(null);
  const load = useCallback(async (signal: AbortSignal): Promise<Loaded> => {
    const supabase = authClient();
    const { data: auth } = await supabase.auth.getUser();
    if (signal.aborted) throw new DOMException("Request aborted", "AbortError");
    // 손님은 담아 둔 목록과 비교를 모아 볼 수 없다. 별점·하트의 익명 사용과는 별개다.
    if (!auth?.user || auth.user.is_anonymous) return { member: false };
    const watchResponse = await supabase
      .from("watchlist")
      .select("std_code, considering, reasons, bonus")
      .order("created_at", { ascending: false })
      .abortSignal(signal);
    if (watchResponse.error) throw new Error(watchResponse.error.message);
    const rows = (watchResponse.data ?? []) as Watch[];
    if (!rows.length) return { member: true, rows, schools: {} };
    // 실제 컬럼은 school_name이다. UI에서 쓰는 name으로 별명을 붙인다.
    const schoolResponse = await db
      .from("personnel_areas")
      .select("std_code, name:school_name, sido, city, office, area, area_grade")
      .in("std_code", rows.map((r) => r.std_code))
      .abortSignal(signal);
    if (schoolResponse.error) throw new Error(schoolResponse.error.message);
    return { member: true, rows, schools: Object.fromEntries((schoolResponse.data ?? []).map((x) => [x.std_code as string, x as SchoolRow])) };
  }, []);

  const receive = useCallback((result: Loaded) => {
    if (!result.member) { setState("로그인필요"); return; }
    setRows(result.rows);
    setSchools(result.schools);
    setState("됨");
  }, []);

  useEffect(() => {
    const request = new AbortController();
    pendingLoad.current = request;
    load(request.signal).then((result) => {
      if (!request.signal.aborted) receive(result);
    }).catch((e: unknown) => {
      if (request.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setState("실패");
    });
    return () => { request.abort(); pendingLoad.current?.abort(); };
  }, [load, receive]);

  const retry = () => {
    pendingLoad.current?.abort();
    const request = new AbortController();
    pendingLoad.current = request;
    setState("받는중");
    setError(null);
    load(request.signal).then((result) => {
      if (!request.signal.aborted) receive(result);
    }).catch((e: unknown) => {
      if (request.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setState("실패");
    });
  };

  /**
   * 담은 학교들의 **저장해 둔 출근 시간**을 한 번에 읽는다.
   * ⛔ **바깥을 안 부른다** — 저장된 것만 본다(`/api/commute/many`). 목록을 여는 것만으로
   *    아홉 번 길을 찾으면 그게 곧 쿼터다.
   * ⛔ 집 주소가 없으면 아예 안 부른다.
   * ⛔ 실패는 조용히 둔다 — 통근 시간은 곁들임이고, 못 읽었다고 목록을 못 쓰게 하지 않는다.
   */
  useEffect(() => {
    const home = readHome();
    const codes = rows.map((r) => r.std_code);
    if (!home || !codes.length) return;
    let alive = true;
    (async () => {
      try {
        const at = homePoint(home);
        const r = await fetch("/api/commute/many", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lat: at.lat, lng: at.lng, codes, dir: "출근", at: home.at }),
        });
        const j = (await r.json()) as { ok?: boolean; found?: Record<string, { car: number | null }> };
        if (!alive || !j?.ok) return;
        const out: Record<string, number> = {};
        for (const [k, v] of Object.entries(j.found ?? {})) if (v.car != null) out[k] = v.car;
        setMins(out);
      } catch {
        // 곁들임이라 조용히 둔다 — 목록은 그대로 쓴다
      }
    })();
    return () => { alive = false; };
  }, [rows]);

  /**
   * 견줄 학교를 고르고 푼다.
   * ⛔ **3개가 차면 넷째는 안 들어간다.** 먼저 고른 것을 밀어내지 않는다
   *    (2026-08-23 사장님 동의) — 밀어내면 방금 고른 것이 조용히 빠져 「왜 없지」가 된다.
   * ⛔ 막힌 것을 **그때 알린다.** 조용히 안 눌리면 고장으로 읽힌다.
   */
  const flip = (code: string) => {
    setPicked((v) => {
      if (v.includes(code)) {
        setHit(null);
        return v.filter((x) => x !== code);
      }
      if (v.length >= COMPARE_MAX) {
        setHit(`비교는 ${COMPARE_MAX}개까지만 가능합니다`);
        return v;
      }
      setHit(null);
      return [...v, code];
    });
  };

  const remove = async (code: string) => {
    setPicked((v) => v.filter((x) => x !== code));
    // ⛔ 낙관적 갱신은 **되돌린 뒤** 알린다(§11-2). 순서가 반대면 화면이 거짓말을 한 채로 남는다.
    const before = rows;
    setRows((v) => v.filter((r) => r.std_code !== code));
    try {
      const { error: e } = await authClient().from("watchlist").delete().eq("std_code", code);
      if (e) throw new Error(e.message);
    } catch {
      setRows(before);
      setError("빼지 못했습니다");
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head icon={<Heart size={16} strokeWidth={1.7} />} onClose={onClose}>관심목록</Head>

      {state === "받는중" && <p className="px-4 py-3 text-[13.5px] text-ink3">받는 중</p>}
      {state === "로그인필요" && <NeedLogin what="관심목록" />}

      {state === "실패" && (
        <div className="px-4 py-3">
          <p className="text-[13.5px] font-semibold text-up">목록을 받지 못했습니다</p>
          {error && <p className="mt-1 font-mono text-[11.5px] break-all text-ink3">{error}</p>}
          <button
            type="button"
            onClick={retry}
            className="mt-3 flex h-11 items-center gap-2 rounded-card bg-fill px-4 text-sm font-semibold active:opacity-70"
          >
            <RotateCw size={15} strokeWidth={2.2} aria-hidden />
            다시 시도
          </button>
        </div>
      )}

      {state === "됨" && rows.length === 0 && (
        <div className="px-4 py-3">
          <p className="text-[13.5px] leading-relaxed text-ink3">담아 둔 학교가 없습니다.</p>
          <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-ink3">
            <MapPin size={14} strokeWidth={1.7} aria-hidden />
            지도에서 학교를 고르면 담을 수 있습니다.
          </p>
        </div>
      )}

      {state === "됨" && rows.length > 0 && (
        <>
          {error && (
            <p role="alert" className="mx-4 mt-2 rounded-chip border border-up px-3 py-2 text-[12px] text-up">
              {error}
            </p>
          )}
          <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3 pt-1">
            {rows.map((r) => {
              const s = schools[r.std_code];
              const on = picked.includes(r.std_code);
              /** 3개가 찼고 이건 안 골랐다 → 흐려진다. ⛔ 못 누르게 막지는 않는다 — 누르면 까닭을 알린다 */
              const full = !on && picked.length >= COMPARE_MAX;
              return (
                <li key={r.std_code} className="flex items-center gap-1">
                  {/*
                    견줄 것 고르기.
                    ⛔ **44px 을 채운다**(§11-4). 네모는 20px 이지만 손가락이 닿는 자리는 44px 다.
                    ⛔ `aria-pressed` 로 상태를 알린다 — 색만으로는 못 읽는 사람이 있다.
                  */}
                  <button
                    type="button"
                    onClick={() => flip(r.std_code)}
                    aria-pressed={on}
                    aria-label={`${s?.name ?? r.std_code} 비교 목록에 ${on ? "빼기" : "넣기"}`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-chip active:bg-fill"
                  >
                    <span
                      className={`flex size-5 items-center justify-center rounded-[6px] border-[1.6px] ${
                        on
                          ? "border-transparent bg-[var(--key-fill)] text-white"
                          : `border-ink3 ${full ? "opacity-30" : ""}`
                      }`}
                    >
                      {on && <Check size={13} strokeWidth={3} aria-hidden />}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPick(r.std_code)}
                    className={`flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-chip px-1 py-1.5 text-left active:bg-fill ${
                      full ? "opacity-50" : ""
                    }`}
                  >
                    <span className="truncate text-[14.5px] font-bold tracking-[-0.02em]">{s?.name ?? r.std_code}</span>
                    <span className="truncate text-[12px] text-ink3">
                      {s ? `${s.city ?? s.sido} · ${fullLabel(s.sido as Sido, s.area, s.area_grade)}` : "찾지 못했습니다"}
                      {r.bonus != null && ` · 예상 ${r.bonus}`}
                    </span>
                  </button>
                  {/*
                    저장해 둔 출근 시간 — ⛔ **비교를 안 열어도 여기서 대략 갈린다.**
                    ⛔ 아직 없는 학교에는 아무것도 안 적는다. 「길찾기 전」을 아홉 줄에 늘어놓으면
                       그것이 곧 안내문이 된다(2026-08-23 사장님 — 「안내문구 이제 다 빼」).
                  */}
                  {mins[r.std_code] != null && (
                    <span className="shrink-0 text-[12px] font-bold tabular-nums text-[var(--route-goal)]">
                      {mins[r.std_code]}분
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void remove(r.std_code)}
                    aria-label={`${s?.name ?? r.std_code} 관심목록에서 빼기`}
                    className="flex size-11 shrink-0 items-center justify-center rounded-chip text-ink3 active:bg-fill"
                  >
                    <Trash2 size={15} strokeWidth={1.7} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ⛔ 상한은 **닿았을 때만** 알린다. 미리 깔아 둔 안내문은 아무도 안 읽는다 */}
          {hit && (
            <p role="alert" className="mx-4 mb-1 rounded-chip border border-key px-3 py-2 text-[12px] text-key">
              {hit}
            </p>
          )}

          {/* ⛔ 고른 것이 있을 때만 뜬다. 늘 서 있으면 무엇을 눌러야 할지 모른 채 자리만 먹는다 */}
          {picked.length > 0 && (
            <button
              type="button"
              onClick={() => onCompare(picked)}
              className="mx-3 mb-2 flex min-h-11 items-center justify-center rounded-card bg-[var(--key-fill)] text-sm font-semibold text-white active:opacity-80"
            >
              고른 {picked.length}곳 비교
            </button>
          )}

          <p className="border-t border-divider px-4 py-2.5 text-[12px] tabular-nums text-ink3">
            담은 학교 {rows.length} / {WATCH_MAX}곳
          </p>
        </>
      )}
    </div>
  );
}

/**
 * 마이페이지 — **내가 이 서비스에 쌓아 둔 것**과 **집 주소**를 모은다 (§12-145).
 *
 * ⛔ **관심목록은 개수만.** 목록 자체는 하트 칸이 이미 그린다 — 두 곳에서 같은 목록을 그리면
 *    한쪽만 고치는 사고가 난다(§11-3).
 * ⛔ **남긴 별점도 개수만.** 어느 학교에 몇 점을 줬는지는 안 보인다 — 익명 전제를 우리가 깨지 않는다.
 * ⛔ **집 주소를 여기서도 고친다.** 지금은 학교 상세의 길찾기 칸을 열어야만 나와서,
 *    학교를 안 고르면 바꿀 길이 없었다.
 * ⛔ **손님(익명)에게도 가진 것은 보여준다**(2026-08-23 사장님 — 「익명으로 쓰다가 회원으로
 *    오는 사람도 있을 텐데 **익명에게도 보여줄 수 있는 정보는 보여주는게 좋지**」).
 *    전에는 이 칸을 통째로 「로그인이 필요합니다」로 막았는데, 손님도 관심목록과 별점을
 *    이미 갖고 있다 — **가진 것을 자기가 못 보는 화면**이었다.
 *    잠그는 것은 **로그인이 있어야 뜻이 있는 둘**뿐이다 — 메일 주소와 닉네임.
 */
export function MePanel({ onClose }: { onClose?: () => void }) {
  const [email, setEmail] = useState<string | null>(null);
  /** 손님 열쇠라도 있나. ⛔ `email` 과 다르다 — 손님은 열쇠가 있어도 메일 주소가 없다 */
  const [hasKey, setHasKey] = useState(false);
  /** 운영 쪽 표(「개발자」). ⛔ 화면이 정하지 않는다 — `staff` 표에서 읽어 온다 */
  const [badge, setBadge] = useState<string | null>(null);
  /** 올해 정해 둔 소속교. ⛔ 이름·지원청은 학교 표에서 따로 받아 붙인다 */
  const [mySchool, setMySchool] = useState<{ name: string; office: string } | null>(null);
  /** 소속교를 바꾸는 중인가. ⛔ 잠금을 풀었다(§12-149) — 중간발령으로 옮기는 사람이 있다 */
  const [changing, setChanging] = useState(false);
  const [schoolFailed, setSchoolFailed] = useState<string | null>(null);
  /** 소속교를 지우는 중인가. ⛔ 두 번 눌러 두 번 부르지 않게 잠근다 */
  const [clearing, setClearing] = useState(false);
  const [ready, setReady] = useState(false);
  /** 담은 학교 수 · 남긴 별점 수. ⛔ 못 읽으면 `null` 로 두고 그 칸을 안 낸다 */
  const [mine, setMine] = useState<{ watch: number; rated: number } | null>(null);
  /** 집. ⛔ 그리는 도중에 읽지 않는다 — localStorage 는 브라우저에만 있다 */
  const [home, setHome] = useState<Home | null>(null);
  /** 거주지역 창을 열어 뒀나. ⛔ 창 자체는 길찾기 칸과 **같은 부품**이다(§11-3) */
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const supabase = authClient();
    /** 손님은 로그인이 아니다 — 메일 주소가 없어 1인 1표의 근거가 못 된다(`currentMember` 와 같은 규칙) */
    const take = (u: { email?: string | null; is_anonymous?: boolean } | null | undefined) => {
      setHasKey(!!u);
      setEmail(u && !u.is_anonymous ? (u.email ?? null) : null);
    };
    supabase.auth
      .getUser()
      .then(({ data }) => take(data.user))
      .catch(() => take(null))
      .finally(() => setReady(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => take(s?.user));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const read = () => setHome(readHome());
    read();
    window.addEventListener(HOME_CHANGED, read);
    return () => window.removeEventListener(HOME_CHANGED, read);
  }, []);

  /**
   * 내가 쌓은 것을 센다. ⛔ **줄을 받아 오지 않고 개수만 센다**(`head: true`) —
   * 화면에 낼 것이 개수뿐인데 아홉 줄을 받아 올 까닭이 없다.
   * ⛔ 못 세도 화면은 뜬다 — 개수는 곁들임이라 조용히 그 칸만 안 낸다.
   */
  /** 내 뱃지. ⛔ 없으면 아무것도 안 그린다 — 없는 것이 보통이다 */
  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      try {
        const supabase = authClient();
        const { data: me } = await supabase.auth.getUser();
        if (!me.user) return;
        const { data: row } = await supabase
          .from("staff")
          .select("label")
          .eq("user_id", me.user.id)
          .maybeSingle();
        if (alive) setBadge((row?.label as string | null) ?? null);
      } catch {
        // 곁들임이라 조용히 둔다 — 뱃지가 없는 것과 같게 그린다
      }
    })();
    return () => { alive = false; };
  }, [email]);

  /** 올해 소속교. ⛔ 손님은 정할 수 없으므로 로그인한 사람만 본다 */
  useEffect(() => {
    if (!email) return;
    let alive = true;
    (async () => {
      try {
        const mine = await readHomeSchool();
        if (!alive || !mine) return;
        const { data } = await db
          .from("personnel_areas")
          .select("name:school_name, office")
          .eq("std_code", mine.std_code)
          .maybeSingle();
        if (alive && data) setMySchool({ name: data.name as string, office: data.office as string });
      } catch {
        // 곁들임이라 조용히 둔다 — 「아직 없습니다」로 그린다
      }
    })();
    return () => { alive = false; };
  }, [email]);

  useEffect(() => {
    // ⛔ 손님도 센다. 손님이 담은 것도 그 사람 것이다
    if (!hasKey) return;
    let alive = true;
    (async () => {
      try {
        const supabase = authClient();
        const [w, r] = await Promise.all([
          supabase.from("watchlist").select("std_code", { count: "exact", head: true }),
          supabase.from("school_ratings").select("std_code", { count: "exact", head: true }),
        ]);
        if (alive) setMine({ watch: w.count ?? 0, rated: r.count ?? 0 });
      } catch {
        // 곁들임이라 조용히 둔다
      }
    })();
    return () => { alive = false; };
  }, [hasKey]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Head icon={<User size={16} strokeWidth={1.7} />} onClose={onClose}>마이페이지</Head>

      {/* ⛔ 자리를 비워 둔다. 없애면 아직 모를 때와 알았을 때 높이가 달라져 칸이 튄다 */}
      {!ready && <p className="px-4 py-3 text-[13.5px] text-ink3">확인 중</p>}

      {ready && (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
          {/* 로그인한 사람에게는 메일과 이름을, 손님에게는 로그인으로 가는 문 하나를 낸다 */}
          {email ? (
            <>
              <div className="rounded-card border border-divider bg-fill px-3.5 py-3">
                <p className="text-[12px] font-medium text-ink3">로그인한 메일</p>
                <p className="mt-1 flex min-w-0 items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{email}</span>
                  {badge && <StaffBadge label={badge} />}
                </p>
              </div>

              {/* ⛔ 이름은 **여기 한 곳에서만** 고친다(§11-3). 리뷰·제보가 생겨도 그 화면에서 또 받지 않는다 */}
              <NicknameField />
            </>
          ) : (
            <NeedLogin what="닉네임" />
          )}

          {/* ⛔ 담은 학교는 **개수만**. 목록은 하트 칸이 그린다(§11-3) */}
          {mine && (
            <div className="mt-2 rounded-card border border-divider px-3.5 py-3">
              <p className="text-[12px] font-medium text-ink3">관심목록</p>
              <p className="mt-1 text-[14.5px] font-semibold tabular-nums">
                {mine.watch}곳 / {WATCH_MAX}곳
              </p>
              {/* 남은 자리를 눈금으로 — 숫자만 있으면 아홉이 많은지 적은지 안 잡힌다 */}
              <span className="mt-2 flex gap-[3px]" aria-hidden>
                {Array.from({ length: WATCH_MAX }, (_, i) => (
                  <span
                    key={i}
                    className={`h-[5px] flex-1 rounded-full ${i < mine.watch ? "bg-[var(--key-fill)]" : "bg-fill-2"}`}
                  />
                ))}
              </span>
            </div>
          )}

          {mine && (
            <div className="mt-2 rounded-card border border-divider px-3.5 py-3">
              <p className="text-[12px] font-medium text-ink3">남긴 별점</p>
              <p className="mt-1 text-[14.5px] font-semibold tabular-nums">{mine.rated}곳</p>
            </div>
          )}

          {/*
            제보 — ⛔ **답장을 읽는 자리가 여기다.** 창 안에 「보낸 것」 탭이 있고 답장이 거기 뜬다.
            메일로 안 보내므로 들어와서 볼 자리가 없으면 답장이 아무 데도 안 간다(§12-161).
          */}
          <div className="mt-2 rounded-card border border-divider px-3.5 py-3">
            <p className="text-[12px] font-medium text-ink3">제보</p>
            <p className="mt-1 text-[13.5px] text-ink3">오류 수정 · TO 제보 · 인사 관련 문서</p>
            <ReportButton label="제보하기 · 답장 보기" className="mt-2 w-full" />
          </div>

          {/*
            현재 소속교 — ⛔ **로그인한 사람만 정한다.** 쓰는 문은 `set_home_school` 하나이고
            그 함수는 `authenticated` 에게만 열려 있다(§12-149). 비로그인에게도 단추를 열어 두면
            눌렀을 때 `permission denied for function set_home_school` 이 그대로 화면에 뜬다.
            그래서 단추 자리에 **로그인으로 가는 문**을 낸다 — 손님도 같다(함수가 막는다).
            ⛔ 바꾸는 길은 열려 있다(§12-149 — 중간발령). 「한 번뿐」이 아니다.
          */}
          <div className="mt-2 rounded-card border border-divider px-3.5 py-3">
            <p className="text-[12px] font-medium text-ink3">현재 소속교</p>
            {email && mySchool ? (
              <>
                <p className="mt-1 truncate text-[14.5px] font-semibold">{mySchool.name}</p>
                <p className="mt-1 text-[12px] text-ink3">{mySchool.office}</p>
              </>
            ) : email ? (
              <p className="mt-1 text-[13.5px] text-ink3">아직 없습니다</p>
            ) : null}

            {!email ? (
              <NeedLogin what="소속교" compact />
            ) : changing ? (
              <div className="mt-2.5">
                <SchoolPicker
                  onPick={async (p: PickedSchool) => {
                    setSchoolFailed(null);
                    const r = await saveHomeSchool(p.stdCode);
                    // ⛔ 실패를 화면이 버리지 않는다(§11-2). 성공한 척 닫지 않는다
                    if ("error" in r) {
                      setSchoolFailed(r.error);
                      return toast("소속교를 저장하지 못했습니다", "fail");
                    }
                    setMySchool({ name: p.name, office: p.office });
                    setChanging(false);
                    toast("소속교를 저장했습니다");
                  }}
                  placeholder="학교 이름"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => { setChanging(false); setSchoolFailed(null); }}
                  className="mt-1.5 min-h-11 w-full text-[13px] text-ink3 active:opacity-60"
                >
                  그만두기
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setChanging(true)}
                className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-card border border-divider bg-fill-2 text-sm font-semibold active:opacity-70"
              >
                <School size={15} strokeWidth={1.8} aria-hidden />
                {/* ⛔ **「소속교 설정」 하나다**(2026-08-23 사장님). 거주지역과 같은 말을 쓴다 —
                    담긴 것이 있나 없나로 말을 바꾸면 같은 단추가 두 이름을 갖는다 */}
                소속교 설정
              </button>
            )}

            {/* ⛔ **지우는 길을 둔다**(2026-08-23 사장님 — 「소속교도 거주지역처럼 입력한 것을
                지울 수 있게」). 거주지역의 「거주지역 지우기」와 **같은 자리·같은 결**이다 —
                담긴 것이 있을 때만 뜨고, 옅은 글씨로 아래에 둔다.
                ⛔ 바꾸는 중에는 안 보인다 — 그때는 「그만두기」가 그 자리를 쓴다. */}
            {mySchool && !changing && (
              <button
                type="button"
                disabled={clearing}
                onClick={async () => {
                  setClearing(true);
                  setSchoolFailed(null);
                  const r = await clearHomeSchool();
                  setClearing(false);
                  // ⛔ 실패를 화면이 버리지 않는다(§11-2). 지운 척 비우지 않는다
                  if ("error" in r) {
                    setSchoolFailed(r.error);
                    return toast("소속교를 지우지 못했습니다", "fail");
                  }
                  setMySchool(null);
                  toast("소속교를 지웠습니다");
                }}
                className="mt-1 min-h-11 w-full text-[13px] text-ink3 active:opacity-60 disabled:opacity-40"
              >
                소속교 지우기
              </button>
            )}

            {schoolFailed && (
              <p role="alert" className="mt-1.5 text-[12px] text-up">
                {schoolFailed}
              </p>
            )}
          </div>

          {/*
            거주지역 — ⛔ **주소를 정하는 판은 길찾기 칸이 갖고 있다.** 여기서 같은 판을 또 만들지
            않는다(§11-3). 학교를 고르면 나오는 그 자리로 보내는 것이 아니라, **같은 창을 연다**.
          */}
          <div className="mt-2 rounded-card border border-divider px-3.5 py-3">
            <p className="text-[12px] font-medium text-ink3">거주지역</p>
            {home ? (
              <>
                <p className="mt-1 truncate text-[14.5px] font-semibold">{home.label}</p>
                <p className="mt-1 text-[12px] tabular-nums text-ink3">
                  출근 {home.at} · 퇴근 {outAt(home)}
                </p>
              </>
            ) : (
              <p className="mt-1 text-[13.5px] text-ink3">아직 없습니다</p>
            )}
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-card border border-divider bg-fill-2 text-sm font-semibold active:opacity-70"
            >
              <MapPin size={15} strokeWidth={1.8} aria-hidden />
              거주지역 설정
            </button>
            {/* ⛔ 이 줄은 지우지 않는다(2026-08-23 사장님 — 「그 안내도 들어가면 좋겠음」).
                주소를 받는 자리에서 **어디까지 나가는지**를 밝히는 것은 안내문이 아니라 약속이다.
                전에는 창을 열어야만 보여서, 열기 전에는 무엇이 서버로 가는지 알 수 없었다. */}
            <p className="mt-2 text-[11.5px] leading-relaxed text-ink3">
              주소는 이 기기에만 저장됩니다 · 서버로는 동네 정도까지만 갑니다
            </p>
          </div>

          {/* 교사 인증은 3단계다 — 아직 안 켰다(`DESIGN.md §9` · §12-141). 칸은 두고 상태를 적는다 */}
          <div className="mt-2 rounded-card border border-divider px-3.5 py-3">
            <p className="text-[12px] font-medium text-ink3">교사 인증</p>
            <p className="mt-1 text-[13.5px] text-ink3">아직 열지 않았습니다</p>
          </div>

          <button
            type="button"
            onClick={async () => {
              // ⛔ 실패를 삼키지 않는다 — 로그아웃이 안 됐는데 됐다고 보이면 안 된다
              const { error } = await authClient().auth.signOut();
              if (error) console.error("[로그아웃]", error.message);
            }}
            className="mt-3 flex min-h-11 w-full items-center gap-2.5 rounded-card border border-divider px-3.5 text-left text-sm font-semibold active:bg-fill"
          >
            <LogOut size={16} className="shrink-0 text-ink3" aria-hidden />
            로그아웃
          </button>

          <MadeBy />
        </div>
      )}

      {/* ⛔ 길찾기 칸과 **같은 창**이다. 여기에 또 만들면 한쪽만 고치는 사고가 난다(§11-3) */}
      {asking && <HomeDialog now={home} onClose={() => setAsking(false)} />}
    </div>
  );
}
