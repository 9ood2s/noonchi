"use client";

/**
 * 길찾기 — 집에서 이 학교까지 (docs/DESIGN.md §12-54 ~ 57 · §12-101 · §12-103)
 *
 * 생김새는 네이버지도 길찾기다(2026-08-23 사장님이 화면 셋을 보내며 정했다) —
 * 수단 탭 → 방향 스위치 → **경로 목록**(막대 그래프 · ★저장) → 상세보기(타임라인).
 *
 * ⛔ **대중교통은 닫아 뒀다**(2026-08-23 · `lib/features.ts` 에 까닭과 숫자를 적었다).
 *    지금 화면에 뜨는 것은 **자동차뿐**이고, 그래서 수단 탭 줄도 · 구간 막대도 · 상세보기도
 *    안 뜬다 — 그 셋은 대중교통 여정(환승·도보)을 읽으려고 만든 것이라 자동차에는 구간이 없다.
 *    다시 켜면 셋이 함께 돌아온다. 지운 코드가 아니다.
 *
 * ⛔ **눌러야 잰다**(§12-99). 학교를 고르면 **이미 재 둔 값만** 본다 — 캐시 읽기는 공짜다.
 *    카카오 무료는 하루 1,000건이고 학교는 1,638곳이다. 훑어보는 사람 하나가 하루치를 태운다.
 * ⛔ **한 번 부르면 여덟 경로가 온다**(자동차 3 · 대중교통 5). 호출은 한 번이라 쿼터가 안 는다.
 * ⛔ **통행료만 낸다**(2026-08-23 사장님). 연료비·택시비는 응답에 오지만 「1종 휘발유 기준」이라
 *    경유·전기차에는 틀린 값이다.
 * ⛔ **도착 시각은 못 적는다**(§12-56). 두 API 가 출발 시각을 못 받아서, 지금 부르면 지금 교통으로 잰다.
 *    그래서 「07:30 기준 · 25분」까지다.
 * ⛔ **집 주소는 서버가 격자로 바꿔 준 것만** 든다. 정확한 좌표는 이 기기에도 안 남는다(§12-57).
 * ⛔ 실패를 화면이 버리지 않는다 — `{ok:false}` 와 **던지는 것** 둘 다 받는다(§11-2).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpDown, Car, MapPin, Star, Timer, TramFront } from "lucide-react";
import { NeedLogin } from "@/components/need-login";
import { HomeDialog } from "./home-dialog";
import { authClient } from "@/lib/auth/client";
import { CHANGED, homePoint, outAt, readHome, type Home } from "@/lib/home";
import { ROUTE_DETAIL_CLOSE, showRoute, showRouteDetail } from "@/lib/route-line";
import { TRANSIT_ON } from "@/lib/features";
// ⛔ 수단 색·아이콘은 **한 곳**에 둔다. 옆 칸과 이 칸이 다른 색을 쓰면 눈이 못 잇는다(§11-3)
import { StepIcon, bgOf, 거리 } from "@/components/map/route-detail";
import { toast } from "@/lib/toast";

/** 대중교통 여정 한 구간 — 무엇을 타고 어디서 어디까지인가 */
type Step = {
  kind: string;
  label: string;
  from: string | null;
  to: string | null;
  stops: number | null;
  min: number | null;
  m: number | null;
  points: [number, number][] | null;
};
type Route = {
  mode: "자동차" | "대중교통";
  key: string;
  label: string;
  min: number;
  km: number | null;
  toll: number | null;
  transfers?: number | null;
  walk?: number | null;
  steps?: Step[] | null;
  path?: [number, number][] | null;
};
type Dir = "출근" | "퇴근";
type Mode = "자동차" | "대중교통";
/** ⛔ 닫힌 수단은 목록에서 뺀다 — 그래야 「자동차」만 남았을 때 탭이 하나로 줄어든다 */
const MODES: Mode[] = TRANSIT_ON ? ["자동차", "대중교통"] : ["자동차"];

const 날짜 = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
};
export function Commute({ stdCode }: { stdCode: string | null }) {
  const [home, setHome] = useState<Home | null>(null);
  const [ready, setReady] = useState(false);
  /** 출근(집→학교) · 퇴근(학교→집). ⛔ 캐시도 방향마다 따로다 */
  const [dir, setDir] = useState<Dir>("출근");
  const [mode, setMode] = useState<Mode>("자동차");
  const [routes, setRoutes] = useState<Route[] | null>(null);
  const [measuredAt, setMeasuredAt] = useState<string | null>(null);
  /** 지금 지도에 그려 놓은 경로. 누르면 바뀐다 */
  const [pickedChoice, setPicked] = useState<string | null>(null);
  /** 펼쳐 놓은 상세보기 */
  const [openKey, setOpenKey] = useState<string | null>(null);
  /** 저장해 둔 경로들 — `수단/키` 꼴 */
  const [saved, setSaved] = useState<Set<string>>(new Set());
  /**
   * **이 학교에서 사람이 길찾기를 건드렸나.**
   *
   * ⛔⛔ 2026-08-24 사장님 — 「**경로저장해놓은 학교를 누르면** 그 학교 누를때마다
   *    **경로안내 화면으로 뜨면서 지도가 축소됨.** 누르지도 않았는데」.
   *    까닭 — 학교를 고르면 **재 둔 값을 미리 읽는데**(`ask(true)`), 목록이 서는 순간
   *    아래의 「첫 줄을 저절로 고른다」가 걸려 선이 그려지고, 그 선을 다 담으려고
   *    지도가 **집~학교 전체로 축소**됐다. 한 번이라도 재 둔 학교는 캐시가 있으니
   *    **누를 때마다** 그랬다.
   * ⭐ **자동으로 고르는 것 자체는 옳다** — 수단 탭을 갈아탈 때 아무것도 안 골라져 있으면
   *    선이 사라져서 「안 그려진다」가 된다(§12 의 그 결정). 그래서 **없애지 않고 조건을 붙인다.**
   *    ⛔ **사람이 이 칸을 건드린 뒤에만** 자동으로 고른다. 학교를 새로 고르면 다시 잠근다.
   */
  const [armed, setArmed] = useState(false);
  /**
   * 「경로 탐색 중」 막대를 낼지. ⛔ **사람이 「길찾기」를 눌렀을 때만 참이다.**
   *    2026-08-23 사장님 — 「학교를 열때마다 로딩바가 돔. 길찾기 눌렸을때만 돌도록 수정」.
   *    학교를 열면 **재 둔 값이 있나만 보는 요청**(`ask(true)`)이 한 번 나가는데, 그것까지
   *    이 값을 켜고 있었다. 바깥을 부르는 일이 아니라 우리 캐시를 보는 일이라 금세 끝나고,
   *    사람은 부탁한 적이 없다 — 그런 것에 막대를 돌리면 **화면이 늘 무언가 하는 중**으로 보인다.
   */
  const [busy, setBusy] = useState(false);
  /** 재 둔 값이 있나 보는 중(조용하다). ⛔ 이 동안에는 「길찾기」 단추도 안 낸다 —
      냈다가 값이 있으면 눌러 보기도 전에 사라져 **한 번 번쩍인다** */
  const [peeked, setPeeked] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  /**
   * 로그인이 필요하다고 알릴 말. ⛔ **참·거짓이 아니라 문구를 든다** — 이 칸에서 로그인이
   * 필요한 자리가 둘이 됐다(길찾기 · 경로 저장). 참·거짓이면 어느 쪽인지 못 적는다.
   */
  const [needLogin, setNeedLogin] = useState<string | null>(null);

  // ⛔ 그리는 도중이 아니라 붙은 뒤에 읽는다. 다른 학교로 옮겨도 같은 집을 쓴다.
  useEffect(() => {
    const read = () => {
      setHome(readHome());
      setReady(true);
    };
    read();
    window.addEventListener(CHANGED, read);
    return () => window.removeEventListener(CHANGED, read);
  }, []);

  const at = home ? (dir === "퇴근" ? outAt(home) : home.at) : null;

  const pending = useRef<AbortController | null>(null);
  const [scope, setScope] = useState({ home, stdCode, dir, mode });
  if (scope.home !== home || scope.stdCode !== stdCode || scope.dir !== dir || scope.mode !== mode) {
    const changedRoute = scope.home !== home || scope.stdCode !== stdCode || scope.dir !== dir;
    setScope({ home, stdCode, dir, mode });
    setFailed(null);
    setPicked(null);
    setOpenKey(null);
    setPeeked(false);
    setBusy(false);
    setNeedLogin(null);
    if (changedRoute) { setRoutes(null); setMeasuredAt(null); }
    if (scope.stdCode !== stdCode) setArmed(false);
  }
  const peek = !!home && !!stdCode && !peeked;

  const readRoutes = useCallback(async (cacheOnly: boolean, signal: AbortSignal) => {
    if (!home || !stdCode) return null;
    try {
      const r = await fetch("/api/commute", {
        method: "POST",
        signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: homePoint(home).lat, lng: homePoint(home).lng, stdCode,
          at: dir === "퇴근" ? outAt(home) : home.at, dir, mode, cacheOnly,
        }),
      });
      return await r.json();
    } catch (error) {
      if (signal.aborted) throw error;
      return { ok: false, error: "재지 못했습니다" };
    }
  }, [home, stdCode, dir, mode]);

  const ask = useCallback(async (cacheOnly: boolean, signal: AbortSignal) => {
    try {
      const j = await readRoutes(cacheOnly, signal);
      if (signal.aborted || !j) return;
      if (j.needLogin) { setNeedLogin("길찾기"); return; }
      if (j.ok && !j.routes && cacheOnly) setRoutes(null);
      else if (j.ok) { setRoutes(j.routes ?? []); setMeasuredAt(j.measuredAt ?? null); }
      else setFailed(j.error ?? "재지 못했습니다");
    } catch {
      if (!signal.aborted) setFailed("재지 못했습니다");
    } finally {
      if (!signal.aborted) { setPeeked(true); setBusy(false); }
    }
  }, [readRoutes]);

  /**
   * 「길찾기」를 눌렀을 때 — ⛔ **로그인부터 본다.** 서버도 막지만, 여기서 먼저 보면
   * 헛걸음(요청 한 번 + 실패 한 번)을 안 한다.
   * ⛔ 손님(익명)은 로그인으로 안 친다 — 익명은 아무나 몇 개든 만들 수 있어 문이 없는 것과 같다.
   * ⛔ 물어보다 실패하면 **막지 않고 보낸다.** 문은 서버에 있으니, 여기서 막으면
   *    로그인한 사람이 통신 한 번 튄 것 때문에 길찾기를 못 하게 된다.
   */
  const measure = useCallback(async () => {
    setNeedLogin(null);
    setFailed(null);
    pending.current?.abort();
    const request = new AbortController();
    pending.current = request;
    // 사람이 눌러서 재는 것이므로, 결과가 오면 첫 줄을 저절로 골라 그려도 된다
    setArmed(true);
    try {
      const { data } = await authClient().auth.getUser();
      if (request.signal.aborted) return;
      if (!data?.user || data.user.is_anonymous) {
        setNeedLogin("길찾기");
        return;
      }
    } catch {
      // 못 물어봤으면 그냥 보낸다 — 서버가 답한다
    }
    if (request.signal.aborted) return;
    setBusy(true);
    void ask(false, request.signal);
  }, [ask]);

  // 학교·방향·수단을 바꿀 때는 캐시만 읽는다. 이전 요청은 새 선택에 결과를 쓰지 못한다.
  useEffect(() => {
    const request = new AbortController();
    pending.current = request;
    readRoutes(true, request.signal).then((j) => {
      if (request.signal.aborted || !j) return;
      if (j.ok) { setRoutes(j.routes ?? null); setMeasuredAt(j.measuredAt ?? null); }
      else if (j.needLogin) setNeedLogin("길찾기");
      else setFailed(j.error ?? "재지 못했습니다");
    }).catch(() => {
      if (!request.signal.aborted) setFailed("재지 못했습니다");
    }).finally(() => {
      if (!request.signal.aborted) setPeeked(true);
    });
    return () => { request.abort(); pending.current?.abort(); };
  }, [readRoutes]);

  /** 저장해 둔 것을 읽어 온다. ⛔ 로그인 안 했으면 조용히 빈 채로 둔다 — 여기서 로그인을 강요하지 않는다 */
  useEffect(() => {
    if (!stdCode || at == null) return;
    let alive = true;
    (async () => {
      try {
        const supabase = authClient();
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) return;
        const { data } = await supabase
          .from("saved_routes")
          .select("mode, route_key")
          .eq("std_code", stdCode)
          .eq("dir", dir);
        if (alive && data) setSaved(new Set(data.map((r) => `${r.mode}/${r.route_key}`)));
      } catch {
        // 저장 목록을 못 받아도 길찾기는 돈다. 조용히 둔다 — 화면에 낼 실패가 아니다
      }
    })();
    return () => {
      alive = false;
    };
  }, [stdCode, dir, at]);

  // 자동 선택은 표시할 목록에서 도출한다. 사람이 건드리기 전에는 지도에 선을 그리지 않는다.
  const list = (routes ?? []).filter((r) => r.mode === mode);
  const picked = armed && list.length
    ? (pickedChoice && list.some((r) => `${r.mode}/${r.key}` === pickedChoice)
      ? pickedChoice : `${list[0].mode}/${list[0].key}`)
    : null;

  /** 고른 경로를 지도에 그리라고 알린다. ⛔ 닫으면 지운다 — 옛 선이 남의 학교 위에 남는다 */
  useEffect(() => {
    const r = routes?.find((x) => `${x.mode}/${x.key}` === picked);
    showRoute(
      r
        ? {
            car: r.mode === "자동차" ? (r.path ?? null) : null,
            transit:
              r.mode === "대중교통"
                ? (r.steps ?? []).filter((s) => s.points?.length).map((s) => ({ kind: s.kind, points: s.points! }))
                : null,
            dir,
          }
        : null,
    );
    return () => showRoute(null);
  }, [picked, routes, dir]);

  /**
   * 펼친 상세를 **옆 칸**으로 내보낸다 (2026-08-23 사장님 — 「패널옆에 닫을수 있는 새로운 패널」).
   * ⛔ 펼침 상태의 주인은 여기 하나(`openKey`)다. 옆 칸의 ✕ 는 값을 직접 못 바꾸고
   *    「접어라」만 되알린다(아래 listener) — 주인이 둘이면 어긋난 채로 남는다.
   * ⛔ 학교·방향·수단을 바꾸면 `routes` 가 비어 여기서 자동으로 `null` 이 나간다.
   * ⛔ 칸을 닫으면(언마운트) 지운다. 안 그러면 남의 학교 위에 옛 경로 상세가 남는다.
   */
  useEffect(() => {
    const r = routes?.find((x) => `${x.mode}/${x.key}` === openKey);
    showRouteDetail(
      r?.steps?.length
        ? {
            mode: r.mode,
            label: r.label,
            min: r.min,
            km: r.km,
            transfers: r.transfers ?? null,
            walk: r.walk ?? null,
            toll: r.toll,
            dir,
            at,
            steps: r.steps.map(({ kind, label, from, to, stops, min, m }) => ({ kind, label, from, to, stops, min, m })),
          }
        : null,
    );
    return () => showRouteDetail(null);
  }, [openKey, routes, dir, at]);

  // 옆 칸의 ✕ — 「접어라」를 받는다
  useEffect(() => {
    const on = () => setOpenKey(null);
    window.addEventListener(ROUTE_DETAIL_CLOSE, on);
    return () => window.removeEventListener(ROUTE_DETAIL_CLOSE, on);
  }, []);

  /** ★ — ⛔ 로그인해야 한다(2026-08-23 사장님). 기기에만 두면 폰을 바꾸는 순간 사라진다 */
  const toggleSave = async (r: Route) => {
    if (!stdCode || at == null) return;
    const id = `${r.mode}/${r.key}`;
    const on = saved.has(id);
    // ⛔ 낙관적 갱신은 **되돌린 뒤** 알린다(§11-2)
    const before = new Set(saved);
    const next = new Set(saved);
    if (on) next.delete(id);
    else next.add(id);
    setSaved(next);
    try {
      const supabase = authClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) {
        setSaved(before);
        setNeedLogin("경로 저장");
        return;
      }
      const slot = Number(at.slice(0, 2)) * 60 + Number(at.slice(3, 5));
      const { error } = on
        ? await supabase
            .from("saved_routes")
            .delete()
            .eq("std_code", stdCode).eq("dir", dir).eq("at_min", slot).eq("mode", r.mode).eq("route_key", r.key)
        : await supabase.from("saved_routes").insert({
            user_id: auth.user.id, std_code: stdCode, dir, at_min: slot,
            mode: r.mode, route_key: r.key, label: r.label, min_then: r.min,
          });
      if (error) throw new Error(error.message);
      toast(on ? "저장을 풀었습니다" : "경로를 저장했습니다");
    } catch {
      // ⛔ 되돌린 **뒤에** 알린다. 순서가 반대면 화면이 거짓말을 한 채로 남는다(§11-2)
      setSaved(before);
      setFailed("저장하지 못했습니다");
      toast("경로를 저장하지 못했습니다", "fail");
    }
  };

  if (!ready || !stdCode) return null;

  const fastest = list[0]?.min ?? null;



  return (
    <section className="mt-3 rounded-card border border-divider bg-fill p-3.5">
      {/*
        ⛔ **파란 밑줄 글씨로 두지 않는다**(2026-08-23 사장님 — 「얘는 디자인이 파랭이에
           언더라인이 끝인디」). 누르는 것은 단추 꼴이어야 한다 — 밑줄 글씨는 웹 문서의 링크지
           이 화면의 부품이 아니고, 폰에서는 **글자 몇 자가 곧 손가락 과녁**이 되어 잘 안 맞는다.
        ⛔ 주소를 정하기 **전과 후의 무게가 다르다** —
           · 전 = 이 칸에서 할 일이 그것 하나뿐이다 → 아래에 **전폭 단추**로 크게 세운다
           · 후 = 이미 정해졌다 → 머리줄의 **작은 알약**으로 물러난다
      */}
      <div className="flex items-center gap-2">
        <h3 className="shrink-0 text-sm font-bold">길찾기</h3>
        {home && (
          <>
            <p className="min-w-0 flex-1 truncate text-xs text-ink3">{home.label}</p>
            <button
              type="button"
              onClick={() => setAsking(true)}
              className="flex h-9 shrink-0 items-center gap-1 rounded-chip border border-divider bg-fill-2 px-2.5 text-xs font-semibold text-ink2 active:opacity-70"
            >
              <MapPin size={13} strokeWidth={1.9} aria-hidden />
              주소 변경
            </button>
          </>
        )}
      </div>

      {!home ? (
        <>
          {/* ⛔ 사장님 문구 그대로다 — 「집을 정하면 학교마다 통근 시간이 나옵니다」는
              무엇을 재는지(자차) 도 통행료가 나온다는 것도 안 말했다 */}
          <p className="mt-2 text-xs text-ink3">자차 출근 시간 및 통행료를 계산합니다</p>
          <button
            type="button"
            onClick={() => setAsking(true)}
            className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-card border border-divider bg-fill-2 text-sm font-semibold active:opacity-70"
          >
            <MapPin size={15} strokeWidth={1.8} aria-hidden />
            거주지역 설정
          </button>
        </>
      ) : (
        <>
          {/*
            수단 탭 — 네이버지도가 맨 위에 두는 그것이다.
            ⛔ **대중교통이 닫혀 있으면 탭 줄 자체를 안 낸다**(`lib/features.ts` ·
               2026-08-23 사장님 「닫아둬」). 「자동차」 하나만 남은 탭 줄은 고를 것이 없는
               고르개라, 자리만 먹고 **누를 수 있을 것처럼 보인다.**
            ⛔ 화면만 감추는 것이 아니다 — 서버도 카카오를 안 부른다. 주소창으로 뚫리면
               감춘 뜻이 없다(`app/api/commute/route.ts`).
          */}
          {TRANSIT_ON && (
          <div className="mt-2.5 flex gap-1.5" role="group" aria-label="수단">
            {MODES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => { setArmed(true); setMode(m); setPicked(null); setOpenKey(null); }}
                className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-chip text-[13px] font-semibold active:opacity-80 ${
                  mode === m ? "bg-[var(--key-fill)] text-white" : "bg-fill-2 text-ink2"
                }`}
              >
                {m === "자동차" ? <Car size={14} aria-hidden /> : <TramFront size={14} aria-hidden />}
                {m}
              </button>
            ))}
          </div>
          )}

          {/*
            방향 — ⛔ 출근과 퇴근은 **다른 값이다.** 캐시도 따로다.
            ⭐ **알약 둘에서 뒤집기 단추 하나로 바꿨다**(2026-08-24 사장님 — 「길찾기는 이런 버튼으로
               슉 바꾸면 좋지 않겠니…? **공간도 덜차지하고**」). 둘 중 하나를 고르는 것이 아니라
               **뒤집는 것**이라 단추 하나가 맞다 — 지도앱의 출발·도착 바꾸기가 그 꼴이다.
            ⛔ 지금 어느 쪽인지는 **글로 적는다.** 아이콘만 두면 무엇이 뒤집히는지 모른다.
            ⛔ 44px 을 채운다(§11-4). 시각과 측정일을 같은 줄에 두어 줄 수는 늘지 않는다.
          */}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setArmed(true); setDir((v) => (v === "출근" ? "퇴근" : "출근")); }}
              aria-label={dir === "출근" ? "학교에서 집으로 바꾸기" : "집에서 학교로 바꾸기"}
              className="flex size-9 shrink-0 items-center justify-center rounded-full border border-divider bg-fill-2 text-ink2 active:opacity-70"
            >
              <ArrowUpDown size={15} strokeWidth={1.9} aria-hidden />
            </button>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-key">
              {dir === "출근" ? "집 → 학교" : "학교 → 집"}
            </span>
            <span className="shrink-0 text-[11.5px] tabular-nums text-ink3">
              {at} 기준{measuredAt && ` · ${날짜(measuredAt)} 측정`}
            </span>
          </div>

          {failed && (
            <p role="alert" className="mt-2 rounded-chip border border-up px-2.5 py-1.5 text-xs text-up">
              {failed}
            </p>
          )}

          {/*
            ⛔ **막다른 곳으로 두지 않는다**(2026-08-23 사장님 — 「가입경로로 가는 버튼도 같이.
               가입 배선 깔자」). 「로그인이 필요합니다」 한 줄만 적으면 사람은 거기서 멈춘다 —
               그 줄이 지금까지 이 서비스의 가입 배선 전부였다.
            ⛔ 문구·모양은 관심목록·마이페이지와 **같은 부품**을 쓴다(`components/need-login.tsx`).
               같은 문 앞에서 매번 다른 안내를 받게 두지 않는다(§11-3).
          */}
          {needLogin && <NeedLogin what={needLogin} compact />}

          {/* ⛔ 재는 것은 사람이 누를 때만이다 — 훑어보는 사람 하나가 하루치 쿼터를 태운다 */}
          {!routes && !busy && !peek && (
            <button
              type="button"
              onClick={() => void measure()}
              className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-card border border-divider bg-fill-2 text-sm font-semibold active:opacity-70"
            >
              <Timer size={15} strokeWidth={1.7} aria-hidden />
              길찾기
            </button>
          )}
          {/*
            ⛔ **멈춘 게 아니라 도는 중이라는 것을 보여준다** (2026-08-23 사장님 —
               「로딩 바나 게이지로 상태를 알려줘야해. 화면이 멈춘게 아니라 동작하고 있는 중이라는 걸」).
               바깥 두 곳(네이버·카카오)을 부르는 일이라 **몇 초씩 걸린다.** 글자만 있으면
               그 사이에 화면이 죽은 것으로 보인다.
            ⛔ 진행률은 **모른다.** 몇 퍼센트인지 알 길이 없으므로 **끝을 모르는 막대**로 둔다 —
               가짜 퍼센트를 지어내지 않는다.
            ⛔ 「재는 중」이 아니라 **「경로 탐색 중」**이다(사장님) — 무엇을 하는 중인지 말한다.
          */}
          {busy && (
            <div className="mt-2.5" role="status" aria-live="polite">
              <p className="text-[13px] text-ink3">경로 탐색 중</p>
              <span className="bar mt-1.5 block h-1 overflow-hidden rounded-full bg-fill-2" aria-hidden>
                <span className="bar-run block h-full w-1/3 rounded-full bg-[var(--key-fill)]" />
              </span>
            </div>
          )}

          {routes && list.length === 0 && !busy && (
            <p className="mt-2.5 text-[13px] text-ink3">이 수단으로는 길을 못 찾았습니다</p>
          )}

          {list.map((r) => {
            const id = `${r.mode}/${r.key}`;
            const on = picked === id;
            return (
              <div
                key={id}
                className={`mt-2 rounded-card border px-3 py-2.5 ${on ? "border-key bg-fill-2" : "border-divider"}`}
              >
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setArmed(true); setPicked(on ? null : id); }}
                    aria-pressed={on}
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                  >
                    <span className="text-[12px] font-semibold text-key">{r.label}</span>
                    <span className="mt-0.5 flex items-baseline gap-1.5">
                      <b className="text-[20px] font-extrabold tabular-nums leading-none tracking-[-0.03em]">{r.min}분</b>
                      {r.km != null && <span className="text-[12px] tabular-nums text-ink3">{r.km}km</span>}
                      {fastest != null && r.min > fastest && (
                        <span className="text-[11.5px] tabular-nums text-ink3">+{r.min - fastest}</span>
                      )}
                    </span>
                  </button>
                  {/* ★ 저장 — ⛔ 늘 보인다. 호버 뒤에 숨기면 폰에서 영영 못 누른다(§11-4) */}
                  <button
                    type="button"
                    onClick={() => void toggleSave(r)}
                    aria-pressed={saved.has(id)}
                    aria-label={`${r.label} 경로 ${saved.has(id) ? "저장 풀기" : "저장"}`}
                    className={`flex size-11 shrink-0 items-center justify-center rounded-chip active:bg-fill ${
                      saved.has(id) ? "text-key" : "text-ink3"
                    }`}
                  >
                    <Star size={16} fill={saved.has(id) ? "currentColor" : "none"} strokeWidth={1.7} aria-hidden />
                  </button>
                </div>

                {/* 막대 — 구간이 시간에 비례한다. 어디서 오래 걸리는지가 한눈에 보인다 */}
                {r.steps && r.steps.length > 0 && (
                  <div className="mt-1.5 flex h-2.5 gap-px overflow-hidden rounded-full" aria-hidden>
                    {r.steps.map((s, i) => (
                      <span
                        key={i}
                        style={{ flexGrow: Math.max(1, s.min ?? 1), background: bgOf(s.kind) }}
                        className="first:rounded-l-full last:rounded-r-full"
                      />
                    ))}
                  </div>
                )}

                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-ink3">
                  {r.mode === "자동차" ? (
                    <span>{r.toll ? `통행료 ${r.toll.toLocaleString()}원` : "통행료 없음"}</span>
                  ) : (
                    <>
                      {r.transfers != null && <span>환승 {r.transfers}회</span>}
                      {r.walk != null && <span>도보 {r.walk}분</span>}
                    </>
                  )}
                </p>

                {r.steps && r.steps.length > 0 && (
                  <>
                    <button
                      type="button"
                      /* ⛔ 펴면 **그 경로를 지도에도 그린다.** 편 것과 그려진 선이 다르면
                         어느 것을 보고 있는지 알 수 없다 */
                      onClick={() => {
                        setArmed(true);
                        const next = openKey === id ? null : id;
                        setOpenKey(next);
                        if (next) setPicked(id);
                      }}
                      aria-expanded={openKey === id}
                      className="mt-1 min-h-9 text-[12px] font-semibold text-key active:opacity-70"
                    >
                      {openKey === id ? "접기" : "상세보기"}
                    </button>
                    {/*
                      ⛔ **넓은 화면(lg 이상)에서는 여기서 안 편다** — 옆 칸이 대신 편다
                         (2026-08-23 사장님 · §12-110). 이 칸은 380px 이라 환승 네 번짜리 여정이
                         글자만 잘린 채 세로로 길어진다.
                      ⛔ `matchMedia` 로 가르지 않고 **CSS 로 가른다.** 자바스크립트로 재면 첫 그림에
                         잠깐 잘못된 쪽이 보였다가 바뀐다(app-rail 에서 겪었다).
                         지도 쪽 기준(WIDE = 1024px)과 `lg` 가 같은 값이라 둘이 어긋나지 않는다.
                    */}
                    {openKey === id && (
                      <ol className="mt-1 flex flex-col gap-1.5 border-t border-divider pt-2 lg:hidden">
                        {r.steps.map((s, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-0.5 shrink-0" style={{ color: bgOf(s.kind) }} aria-hidden>
                              <StepIcon kind={s.kind} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-semibold">{s.label}</span>
                              {(s.from || s.m != null) && (
                                <span className="block truncate text-[11.5px] text-ink3">
                                  {s.from}
                                  {s.to && s.to !== s.from && ` → ${s.to}`}
                                  {s.stops ? ` · ${s.stops}개 정류장` : ""}
                                  {s.kind === "도보" && s.m != null ? ` · ${거리(s.m)}` : ""}
                                </span>
                              )}
                            </span>
                            {s.min != null && (
                              <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink3">{s.min}분</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </>
      )}

      {asking && <HomeDialog now={home} onClose={() => setAsking(false)} />}
    </section>
  );
}
