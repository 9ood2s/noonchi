"use client";

/**
 * **비교 판** — 담아 둔 학교 셋을 나란히 놓고 견준다. (docs/DESIGN.md §12-144)
 *
 * 2026-08-23 사장님 — 「동시 비교는 3개까지만 화면 가운데에 열어서 비교 가능.
 * 기본적인 학교 정보와 출퇴근 시간을 한번에 비교할 수 있는 그림 …
 * 이건 패널이 좀 커져서 지도를 덮어도 좋아」.
 *
 * ⛔ **왼쪽 칸이 아니라 화면 가운데다.** 보는 동안 지도가 필요 없는 화면이라 크게 쓴다.
 *    학교 상세는 「지도에서 고른 것의 정보」라 지도 옆에 서지만, 이건 지도를 덮어도 된다.
 * ⛔ **폰에서 카드 셋으로 쌓지 않는다.** 쌓으면 나란히 못 봐서 비교가 아니게 된다.
 *    항목 이름 열만 왼쪽에 고정하고 학교 열을 옆으로 민다.
 * ⛔ **「낫다」는 통근에만 붙인다**(2026-08-23 사장님 동의). 급지·구역·학급수는 사람마다
 *    좋고 나쁨이 **반대**다 — 가산을 노리는 사람에게 병구역이 좋은 자리다. 우리가 정할 일이 아니다.
 * ⛔ **출처를 갈라 놓는다**(CLAUDE.md §2). 공공데이터 묶음 셋과 교사 입력(별점)을 갈라 적고
 *    ⛔ 별점에는 표본수(N)를 안 낸다(2026-08-24 사장님 · `DESIGN.md §12-173`).
 * ⛔ **바깥은 사람이 누를 때만 부른다**(§12-136). 열 때는 저장해 둔 값만 읽는다.
 */

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { NeedLogin } from "@/components/need-login";
import { areaFact, incheonGradeLabel } from "@/lib/areas.mjs";
import { fullLabel, pinPerClass, type Pin } from "@/lib/map";
import { hasAreas, type Sido } from "@/lib/schools";
import { AXES, ratingsOfMany, type AxisKey, type RatingAvg } from "@/lib/ratings";
import { CHANGED as HOME_CHANGED, homePoint, outAt, readHome, type Home } from "@/lib/home";

/** 저장해 둔 통근 값 한 학교치 */
type Got = { car: number | null; km: number | null; toll: number | null };
type Dir = "출근" | "퇴근";

/** 한 방향치 — 학교코드 → 값 */
type Side = Record<string, Got>;

export function ComparePanel({ pins, sido, onClose, onPick }: {
  pins: Pin[];
  sido: Sido;
  onClose: () => void;
  /** 학교 이름을 누르면 지도가 그리로 간다 */
  onPick: (p: Pin) => void;
}) {
  const [home, setHome] = useState<Home | null>(null);
  const [ready, setReady] = useState(false);
  const [go, setGo] = useState<Side>({});
  const [back, setBack] = useState<Side>({});
  const [avg, setAvg] = useState<Record<string, RatingAvg>>({});
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  const codes = pins.map((p) => p.k).filter((k): k is string => !!k);

  // ⛔ 그리는 도중에 읽지 않는다 — localStorage 는 브라우저에만 있다
  useEffect(() => {
    const read = () => { setHome(readHome()); setReady(true); };
    read();
    window.addEventListener(HOME_CHANGED, read);
    return () => window.removeEventListener(HOME_CHANGED, read);
  }, []);

  // 별점 — 한 번에 읽는다. ⛔ 실패해도 표는 그린다(별점 한 줄만 비운다)
  useEffect(() => {
    if (!codes.length) return;
    let alive = true;
    ratingsOfMany(codes)
      .then((r) => alive && setAvg(r.avg))
      .catch(() => alive && setAvg({}));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes.join(",")]);

  /** 저장해 둔 통근 값을 두 방향 다 읽는다. ⛔ 바깥은 안 부른다 */
  const load = useCallback(async () => {
    if (!home || !codes.length) return;
    const at = homePoint(home);
    const one = async (dir: Dir) => {
      const r = await fetch("/api/commute/many", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: at.lat, lng: at.lng, codes, dir, at: dir === "퇴근" ? outAt(home) : home.at }),
      });
      const j = (await r.json()) as { ok?: boolean; found?: Side };
      return j?.ok ? (j.found ?? {}) : {};
    };
    try {
      const [a, b] = await Promise.all([one("출근"), one("퇴근")]);
      setGo(a);
      setBack(b);
    } catch {
      // ⛔ 요청이 끊기면 위에 닿지도 못한다(§11-2). 저장한 것을 못 읽은 것뿐이라 표는 그대로 그린다
      setFailed("저장한 통근 시간을 못 읽었습니다");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, codes.join(",")]);

  useEffect(() => { void load(); }, [load]);

  /** 아직 없는 학교만 실제로 찾는다. ⛔ 사람이 누를 때만이고, 로그인이 필요하다(§12-136) */
  const find = async () => {
    if (!home) return;
    setBusy(true);
    setFailed(null);
    setNeedLogin(false);
    const at = homePoint(home);
    try {
      const { data } = await authClient().auth.getUser();
      if (!data?.user || data.user.is_anonymous) {
        setNeedLogin(true);
        setBusy(false);
        return;
      }
      /**
       * ⛔ **한 번에 하나씩 차례로 부른다.** 여섯을 한꺼번에 던지면 바깥이 막을 수 있고,
       *    막히면 어느 것이 들어갔는지 모른 채 절반만 남는다.
       * ⛔ **답을 하나하나 본다**(§11-2). 부르고 안 보면 하나가 실패해도 화면은 조용히
       *    「길찾기 전」으로 남아, 사람은 단추가 안 먹은 줄 안다. 실패한 곳을 세어 알린다.
       * ⛔ 로그인이 풀린 답(401)이 오면 **거기서 멈춘다** — 나머지 다섯도 어차피 같은 답이다.
       */
      let bad = 0;
      for (const dir of ["출근", "퇴근"] as Dir[]) {
        const side = dir === "출근" ? go : back;
        for (const code of codes) {
          if (side[code]) continue;
          const r = await fetch("/api/commute", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              lat: at.lat, lng: at.lng, stdCode: code, dir,
              at: dir === "퇴근" ? outAt(home) : home.at, mode: "자동차",
            }),
          }).catch(() => null);
          const j = r ? ((await r.json().catch(() => null)) as { ok?: boolean; needLogin?: boolean } | null) : null;
          if (j?.needLogin) {
            setNeedLogin(true);
            setBusy(false);
            return;
          }
          if (!j?.ok) bad++;
        }
      }
      await load();
      if (bad) setFailed(`${bad}곳은 경로를 찾지 못했습니다`);
    } catch {
      setFailed("경로를 찾지 못했습니다");
    }
    setBusy(false);
  };

  const missing = codes.filter((c) => !go[c] || !back[c]).length;

  /** 가장 짧은 값 — 통근에만 쓴다 */
  const fastest = (side: Side) => {
    const list = codes.map((c) => side[c]?.car).filter((v): v is number => typeof v === "number");
    return list.length > 1 ? Math.min(...list) : null;
  };
  const bestGo = fastest(go);
  const bestBack = fastest(back);

  const minText = (v: Got | undefined, best: number | null) =>
    v?.car == null ? <span className="text-ink3">길찾기 전</span>
      : <span className={v.car === best ? "font-bold text-[var(--route-goal)]" : ""}>{v.car}분</span>;

  return (
    /**
     * ⛔ 막을 깐다 — 뒤 지도를 누르면 닫힌다. 큰 판을 띄워 놓고 나가는 길이 ✕ 하나뿐이면
     *    폰에서 답답하다.
     * ⛔ 판 자체는 **유리**다. 지도를 덮되 아주 가리지는 않는다.
     */
    <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-6" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25" aria-hidden />
      <div
        role="dialog"
        aria-label="학교 비교"
        onClick={(e) => e.stopPropagation()}
        className="glass glass-modal relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-panel"
      >
        <div className="flex items-center gap-2 border-b border-divider px-4 py-2.5">
          <h2 className="text-[15px] font-bold tracking-[-0.02em]">{pins.length}곳 비교</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="ml-auto flex size-9 items-center justify-center rounded-full text-ink3 active:bg-fill"
          >
            <X size={17} aria-hidden />
          </button>
        </div>

        {/*
          ⛔ 표는 **제 칸 안에서** 구른다 — 화면이 통째로 옆으로 밀리지 않는다.
          ⛔ 붙어 있는 칸(머리줄·항목 이름)에는 `--glass-tint-modal` 을 다시 칠한다.
             유리를 두 겹으로 칠하지 않는다는 규칙의 예외다 — **같은 색을 같은 자리에** 겹치는
             것이라 판보다 밝아지지 않고, 이게 없으면 지나가는 글자가 머리줄에 비쳐 겹친다.
        */}
        <div className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 w-[86px] bg-[var(--glass-tint-modal)] p-0" />
                {pins.map((p) => (
                  <th key={p.k ?? p.n} className="sticky top-0 z-20 bg-[var(--glass-tint-modal)] px-2.5 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => onPick(p)}
                      className="flex min-h-11 min-w-[104px] flex-col items-start justify-center gap-1 text-left active:opacity-60"
                    >
                      <span className="text-[14.5px] font-bold tracking-[-0.02em]">{p.n}</span>
                      <span className="text-[11.5px] font-medium text-ink3">
                        {[p.c ?? p.o, fullLabel(sido, p.a, p.g)].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/*
                ⛔ **인사구역이 없는 시·도는 「인사」 묶음을 아예 안 낸다.** 「없음」 줄 둘을 띄우면
                   「구역이 없는 학교」로 읽힌다 — 없는 것은 구역이 아니라 우리가 읽은 고시문이다.
              */}
              {hasAreas(sido) && (
                <>
                  <Group label="인사" n={pins.length} />
                  {sido === "인천" ? (
                    <Line k="급지" pins={pins} cell={(p) => incheonGradeLabel(p.g)} />
                  ) : (
                    <>
                      <Line k="인사구역" pins={pins} cell={(p) => fullLabel(sido, p.a, p.g)} />
                      <Line
                        k="지역가산"
                        pins={pins}
                        cell={(p) => (p.a == null ? null : areaFact(sido, p.a, p.g, p.cl)?.label.replace(/^지역가산\s*/, "")) ?? <span className="text-ink3">없음</span>}
                      />
                    </>
                  )}
                </>
              )}
              <Group label="학교" n={pins.length} />
              <Line k="교육지원청" pins={pins} cell={(p) => p.o} />

              {/* ⛔ 집 주소가 없으면 이 묶음을 아예 안 낸다 — 빈 줄 넷을 띄우지 않는다 */}
              {ready && home && (
                <>
                  <Group label="출퇴근" n={pins.length} />
                  <Line k="집 → 학교" pins={pins} cell={(p) => minText(go[p.k ?? ""], bestGo)} />
                  <Line k="학교 → 집" pins={pins} cell={(p) => minText(back[p.k ?? ""], bestBack)} />
                  <Line
                    k="거리"
                    pins={pins}
                    cell={(p) => (go[p.k ?? ""]?.km == null ? <span className="text-ink3">—</span> : `${go[p.k ?? ""]!.km}km`)}
                  />
                  <Line
                    k="통행료"
                    pins={pins}
                    cell={(p) => {
                      const t = go[p.k ?? ""]?.toll;
                      if (go[p.k ?? ""] == null) return <span className="text-ink3">—</span>;
                      return t ? `${t.toLocaleString()}원` : <span className="text-ink3">없음</span>;
                    }}
                  />
                </>
              )}

              <Group label="규모" n={pins.length} />
              <Line
                k="학급당"
                pins={pins}
                cell={(p) => (pinPerClass(p) == null ? <span className="text-ink3">공시 없음</span> : `${pinPerClass(p)!.toFixed(1)}명`)}
              />
              <Line k="학생 수" pins={pins} cell={(p) => (p.st == null ? <span className="text-ink3">공시 없음</span> : `${p.st.toLocaleString()}명`)} />
              <Line k="학급 수" pins={pins} cell={(p) => (p.cl == null ? <span className="text-ink3">공시 없음</span> : `${p.cl}개`)} />
              <Line
                k="교원 수"
                pins={pins}
                cell={(p) =>
                  p.t == null ? <span className="text-ink3">공시 없음</span>
                    : p.tm == null || p.tf == null ? `${p.t}명`
                      : `${p.t}명(${p.tm}/${p.tf})`
                }
              />
              <Line k="학년별" pins={pins} cell={(p) => <Bars v={p.sg} />} />

              {/* 교사 입력 — 공공데이터와 갈라 둔다(§2). ⛔ 표본수는 안 낸다(2026-08-24 · §12-173) */}
              <Group label="교사 평가" n={pins.length} />
              <Line
                k="별점"
                pins={pins}
                cell={(p) => {
                  const a = avg[p.k ?? ""];
                  /* ⛔ **문턱이 없다**(2026-08-24 사장님) — 여기 안 오는 것은 「아무도 안 남겼다」다.
                     ⛔ **표본수를 안 적는다** — 전에 `(N=…)` 이 붙어 있었다. 문턱을 없앤 지금
                        그 수를 적으면 한 사람짜리 평균이 그대로 드러난다(`school-ratings.tsx` 와 같은 판단). */
                  if (!a) return <span className="text-ink3">평가 없음</span>;
                  /* ⛔ **값이 없는 축을 빼고 평균낸다.** 전에는 여섯으로 나누고 있었는데,
                     접근성이 없는 학교(2026-08-23 전 별점)는 그 자리가 `null` 이라
                     **더한 값은 그대로인데 나누는 수만 커져 점수가 낮게 나왔다.** */
                  const vals = AXES.map((x) => a[x.key as AxisKey]).filter((v): v is number => v != null);
                  if (!vals.length) return <span className="text-ink3">평가 없음</span>;
                  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                  return <span>{mean.toFixed(1)}</span>;
                }}
              />
              <Line
                k="홈페이지"
                pins={pins}
                cell={(p) =>
                  p.h ? (
                    <a href={p.h} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1 text-key active:opacity-60">
                      바로가기
                      <ExternalLink size={12} strokeWidth={2} aria-hidden />
                    </a>
                  ) : (
                    <span className="text-ink3">공시 없음</span>
                  )
                }
              />
            </tbody>
          </table>
        </div>

        <div className="border-t border-divider px-3 py-2.5">
          {failed && (
            <p role="alert" className="mb-2 rounded-chip border border-up px-2.5 py-1.5 text-xs text-up">
              {failed}
            </p>
          )}
          {needLogin && <NeedLogin what="길찾기" compact />}

          {/* ⛔ 집 주소가 없으면 여기에 안내문을 적지 않는다 — 주소 설정으로 가는 길만 낸다 */}
          {ready && !home && (
            <p className="px-1 py-1 text-xs text-ink3">학교 상세의 길찾기에서 주소를 설정하면 출퇴근을 함께 봅니다</p>
          )}

          {/*
            ⛔ **「남은 N곳」이라고 안 적는다**(2026-08-24 사장님 — 「**뭘 구질구질하게 남은 n이 어떠니..
               그런말을 붙임**」). 재 둔 것은 저절로 불러오고 **안 잰 것만** 재면 되는 일이라,
               몇 곳이 남았는지는 **우리 사정이지 누르는 사람이 알 일이 아니다.**
            ⛔ 이름도 「길찾기」가 아니라 **「출퇴근 시간 비교」**다 — 여기서 하는 일이 그것이다.
            ⛔ **도는 것을 보여준다**(2026-08-24 사장님 — 「여기도 로딩이 안들어가있음」).
               글자만 바뀌면 눌렸는지 아닌지를 사람이 못 가린다(§11-2 의 결).
          */}
          {home && missing > 0 && !needLogin && (
            <button
              type="button"
              onClick={() => void find()}
              disabled={busy}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-card bg-[var(--key-fill)] text-sm font-semibold text-white active:opacity-80 disabled:opacity-50"
            >
              {busy && <Loader2 size={15} className="animate-spin" aria-hidden />}
              {busy ? "재는 중" : "출퇴근 시간 비교"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 묶음 머리줄 — 어디까지가 공공데이터고 어디부터 교사 입력인지 가른다(§2) */
function Group({ label, n }: { label: string; n: number }) {
  return (
    <tr>
      <th
        colSpan={n + 1}
        className="sticky left-0 bg-fill-2 px-2.5 py-1 text-left text-[11px] font-bold tracking-[0.08em] text-ink3"
      >
        {label}
      </th>
    </tr>
  );
}

/** 한 줄 — 왼쪽 항목 이름은 **화면에 붙어 있고** 학교 칸만 옆으로 민다 */
function Line({ k, pins, cell }: { k: string; pins: Pin[]; cell: (p: Pin) => React.ReactNode }) {
  return (
    <tr className="border-t border-divider">
      <th className="sticky left-0 z-10 whitespace-nowrap bg-[var(--glass-tint-modal)] px-2.5 py-2 text-left text-[12px] font-normal text-ink3">
        {k}
      </th>
      {pins.map((p) => (
        <td key={p.k ?? p.n} className="px-2.5 py-2 text-[13px]">
          {cell(p)}
        </td>
      ))}
    </tr>
  );
}

/**
 * 학년별 막대. ⛔ **그 학교 안에서만 견준다** — 학교끼리 같은 자로 그리면 작은 학교는 막대가 사라진다.
 * ⛔ 숫자 여섯을 세 학교에 늘어놓으면 열여덟이라 못 읽는다. 여기서는 모양만 낸다.
 */
function Bars({ v }: { v: number[] | null }) {
  if (!v || v.length !== 6) return <span className="text-ink3">공시 없음</span>;
  const top = Math.max(...v);
  return (
    <span className="flex h-6 items-end gap-[2px]" aria-label={v.map((n, i) => `${i + 1}학년 ${n}명`).join(", ")}>
      {v.map((n, i) => (
        <span
          key={i}
          className="w-[6px] rounded-[2px] bg-[var(--key-fill)]"
          style={{ height: `${top > 0 ? Math.max(3, Math.round((n / top) * 24)) : 3}px` }}
        />
      ))}
    </span>
  );
}
