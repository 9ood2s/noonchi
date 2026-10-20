"use client";

/**
 * 목록과 상세 — **폰의 아래 시트와 데스크톱의 왼쪽 칸이 같이 쓴다.**
 *
 * ⛔ 두 레이아웃에 따로 쓰지 않는다. 한쪽만 고쳐져 조용히 어긋난다(CLAUDE.md §11-3).
 *    달라지는 것은 담는 그릇(시트냐 칸이냐)뿐이고, 안에 든 것은 같다.
 *
 * ⛔ **여기서 배경을 칠하지 않는다.** 감싸는 쪽(시트·왼쪽 칸)이 유리(.glass .glass-thick)다.
 *    여기서 bg-background·bg-surface 를 칠하면 그 유리를 단색으로 덮어 뒤 지도가 사라진다.
 *    안쪽 칸이 필요하면 bg-fill 까지만 쓰고, 유리 위에 유리(.glass/.glass-2)를 또 얹지 않는다.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ExternalLink } from "lucide-react";
import { sourceOf, YEAR, type Sido } from "@/lib/schools";
import { pinPerClass, type GroupPin, type Meta, type Pin } from "@/lib/map";
import { schoolFacts } from "@/lib/school-facts";
import { AreaBadge } from "@/components/area-badge";
import { ReportButton } from "@/components/report-button";
import { Commute } from "./commute";
import { SchoolRatings } from "./school-ratings";
import { SchoolSurvey } from "@/components/school-survey";
import { WatchButton } from "@/components/watch-button";

export function SchoolList({
  sido, visible, groups, grouped, meta, onSelect, onGroupPick, actions,
}: {
  sido: Sido;
  visible: Pin[];
  /** 묶음 말풍선(지원청 또는 시·군). 지도가 묶어 보여줄 때 목록도 같은 것을 보여준다 */
  groups: GroupPin[];
  grouped: boolean;
  meta: Meta;
  onSelect: (p: Pin) => void;
  onGroupPick: (name: string) => void;
  /**
   * 머리줄 오른쪽에 붙는 단추들(고정·닫기). ⛔ 그릇이 넣는다 —
   * 폰 아래 시트에는 그런 단추가 없고 넓은 화면 유리 칸에만 있다.
   * 여기서 자리를 잡아 주지 않으면 그릇이 절대 자리로 얹게 되고, 그러면 배지 위에 겹친다(겹쳤다).
   */
  actions?: React.ReactNode;
}) {
  const rows = useMemo(() => [...visible].sort((a, b) => a.n.localeCompare(b.n, "ko")), [visible]);
  const groupRows = useMemo(() => [...groups].sort((a, b) => b.n - a.n), [groups]);

  return (
    <>
      <header className="flex shrink-0 items-baseline gap-2 px-4 pb-2">
        <h2 className="text-base font-bold">
          {sido} · 초등 <span className="tabular-nums">{rows.length}</span>교
        </h2>
        <p className="text-xs text-ink3 tabular-nums">{YEAR}학년도</p>
        {/* ⛔ 「지원청으로 묶음」을 적지 않는다. 고르는 칩을 없애 늘 지원청이라(2026-08-22)
            바뀌지 않는 값을 매번 적는 꼴이다. §3 — 화면엔 데이터와 짧은 라벨만. */}
        {actions && <span className="ml-auto flex shrink-0 items-center gap-1">{actions}</span>}
      </header>

      {/* ⛔ 묶여 있을 때 학교를 낱낱이 늘어놓지 않는다. 지도는 시·군으로 보여주는데 목록만
          1,355줄을 그리면 화면이 어긋나고, 줄 높이가 쌓여 칸 자체가 터진다(실제로 터졌다 —
          지도 캔버스가 85,656px 이 됐다). 묶여 있으면 목록도 시·군으로 묶는다. */}
      {grouped ? (
        <ul className="min-h-0 flex-1 divide-y divide-divider overflow-y-auto overscroll-contain">
          {groupRows.map((c) => (
            <li key={c.g}>
              <button
                type="button"
                onClick={() => onGroupPick(c.g)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left active:bg-fill"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.g}</span>
                <span className="shrink-0 text-sm text-ink3 tabular-nums">{c.n}교</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
      <ul className="min-h-0 flex-1 divide-y divide-divider overflow-y-auto overscroll-contain">
        {rows.map((p) => (
          <li key={p.k ?? `${p.c}-${p.n}`}>
            <button
              type="button"
              onClick={() => onSelect(p)}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left active:bg-fill"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{p.f ?? p.n}</span>
                <span className="mt-0.5 block truncate text-xs text-ink3 tabular-nums">
                  {p.c} · {p.o}
                  {pinPerClass(p) != null && ` · 학급당 ${pinPerClass(p)!.toFixed(1)}명`}
                </span>
              </span>
              <Badge sido={sido} p={p} />
            </button>
          </li>
        ))}

        {rows.length === 0 && <li className="px-4 py-6 text-sm text-ink3">이 화면에 학교가 없습니다.</li>}

        {/* ⛔ 못 찍은 학교를 조용히 감추지 않는다 — 몇 개인지, 어디인지 적는다 */}
        {meta.unplaced.length > 0 && (
          <li className="px-4 py-3 text-xs leading-relaxed text-ink3">
            좌표 없음 <span className="tabular-nums">{meta.unplaced.length}</span>교 · 지도에 안 찍힘
            <br />
            {meta.unplaced.map((u) => u.name).join(" · ")}
          </li>
        )}
      </ul>
      )}
    </>
  );
}

export function SchoolDetail({
  p, sido, statYear, onBack, actions,
}: {
  p: Pin;
  sido: Sido;
  /**
   * 그 시·도에서 가장 최근 공시 연도(`Pack.meta.statYear`).
   * ⛔ 인사구역 고시가 없는 시·도는 이것이 **자료 출처의 기준일**이다 — 없으면 출처가 빈 채로 나간다(§2).
   */
  statYear: number | null;
  onBack: () => void;
  /** 머리줄 오른쪽에 붙는 단추들(고정·닫기). 그릇이 넣는다 — SchoolList 와 같은 뜻이다 */
  actions?: React.ReactNode;
}) {
  const source = sourceOf(sido, statYear);
  const [survey, setSurvey] = useState<number | null>(null);

  /**
   * 표에 적히는 값은 **`lib/school-facts.ts` 한 곳**에서 만든다 —
   * 학교별 정적 화면(`app/school/[code]/page.tsx`)이 같은 것을 쓴다(CLAUDE.md §11-3).
   * ⛔ 여기서 칸을 다시 짜지 않는다. 한쪽만 고쳐지면 지도와 정적 화면이 다른 값을 낸다.
   */
  const { cells, oldYear, note, gradePending, areaPending } = schoolFacts(sido, p);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <header className="flex items-start gap-2 px-3 pb-3">
        {/* 손가락으로 누르는 것이라 44px 을 채운다(CLAUDE.md §11-4). 아이콘은 20px 이라 가운데 정렬로 채운다 */}
        <button
          type="button"
          onClick={onBack}
          aria-label="목록으로"
          className="-ml-2 flex min-h-11 min-w-11 shrink-0 items-center justify-center text-ink3 active:opacity-60"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <div className="min-w-0 flex-1 pt-1.5">
          <h2 className="truncate text-lg font-bold tracking-tight">{p.f ?? p.n}</h2>
          <p className="mt-0.5 truncate text-xs text-ink3">
            {p.c} · {p.o}
            {p.b > 0 && ` · 분교장 ${p.b}`}
          </p>
        </div>
        {/*
          ⛔ **하트가 관심목록이다**(2026-08-23 사장님 · §12-126). 자리는 여기 머리줄이고,
             칸 맨 아래에 있던 「관심목록에 담기」 가로 단추는 지웠다.
          ⭐ **`actions` 가 아니라 여기서 그린다.** `actions` 는 넓은 화면의 왼쪽 칸만 넘겨 준다
             — 폰의 아래 시트는 안 넘긴다(school-sheet.tsx). 거기 두면 **폰에서 담을 길이 사라진다.**
             같은 부품이 두 그릇에 드는 자리라 늘 둘 다 본다(§11-3).
        */}
        <div className="flex shrink-0 items-center gap-1 pt-1">
          <Badge sido={sido} p={p} big />
          {p.k && <WatchButton stdCode={p.k} name={p.f ?? p.n} sido={sido} />}
          {actions}
        </div>
      </header>

      {/* 공공데이터 — 교사 입력과 갈라 표시한다(§2) */}
      <div className="px-4">
        {/* ⛔ 칸을 칠해서 선을 만들지 않는다. 예전엔 bg-line 위에 bg-background 칸을 gap-px 로 얹어
            선을 그렸는데, 그 방식은 유리 위에서 칸 하나하나가 흰 벽돌로 보인다.
            칸은 투명하게 두고 선만 긋는다 — 2열이라 셋째 칸부터 위선, 오른쪽 열(2n)에 왼선. */}
        <dl className="grid grid-cols-2 overflow-hidden rounded-card border border-divider *:border-divider [&>*:nth-child(n+3)]:border-t [&>*:nth-child(2n)]:border-l">
          {cells.map((c, i) => (
            <Cell key={c.k} k={c.k} v={c.v} wide={cells.length % 2 === 1 && i === cells.length - 1} />
          ))}
        </dl>
        {/*
          학년별 학생수 (2026-08-23 사장님 — 「그 아래에 학년별 학생수도 넣어줘야함」).
          ⛔ **표 아래에 따로 둔다.** 두 칸짜리 표에 여섯 값을 넣으면 표가 세 줄 늘어난다.
          ⛔ 막대는 **그 학교 안에서만** 견준다(가장 많은 학년이 꽉 찬다) — 학교끼리 견주는 값이 아니다.
             큰 학교와 작은 학교를 같은 자로 그리면 작은 학교는 막대가 다 사라진다.
          ⛔ 숫자를 막대 위에 적는다. 막대만 있으면 「많다·적다」만 알고 몇 명인지는 모른다.
          ⛔ 없으면 **아무것도 안 그린다** — 빈 막대 여섯은 「0명」으로 읽힌다.
        */}
        {p.sg && p.sg.length === 6 && (
          <div className="mt-3">
            <p className="text-xs text-ink3">학년별 학생수</p>
            <ol className="mt-1.5 flex items-end gap-1">
              {p.sg.map((n, i) => {
                const top = Math.max(...p.sg!);
                return (
                  <li key={i} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-[11px] font-semibold tabular-nums">{n}</span>
                    <span
                      className="w-full rounded-[3px] bg-[var(--key-fill)]"
                      style={{ height: `${top > 0 ? Math.max(3, Math.round((n / top) * 34)) : 3}px` }}
                      aria-hidden
                    />
                    <span className="text-[11px] tabular-nums text-ink3">{i + 1}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
        {/* ⛔ 별표를 달았으면 **그 뜻을 그 자리에 적는다.** 별표만 있고 풀이가 없으면 겁만 준다 */}
        {oldYear && <p className="mt-2 text-xs text-ink3">* {oldYear}년 공시</p>}
        {note && <p className="mt-2 text-xs leading-relaxed text-ink3">{note}</p>}
        {/* ⛔ 없는 값을 「없음」으로 굳히지 않는다. 어디가 왜 「?」인지 그 자리에 적는다. */}
        {gradePending && <p className="mt-2 text-xs leading-relaxed text-ink3">{gradePending}</p>}

        {/* 통근 — 공공 API(네이버·카카오)를 우리가 대신 부른 값이다.
            교사 입력(별점)과 갈라 둔다(§2) */}
        <Commute stdCode={p.k} />

        {/* 교사 입력 — 공공데이터와 갈라 둔다(§2) */}
        <SchoolRatings stdCode={p.k} onSurvey={(rated) => setSurvey(rated)} />
        {survey != null && p.k && (
          <SchoolSurvey stdCode={p.k} name={p.f ?? p.n} rated={survey} onClose={() => setSurvey(null)} />
        )}

        {/* ⛔ 전보년수 계산으로 가는 길을 뺐다(2026-08-21 사장님 — 「일단은 빼놓자」).
            지도에 집중하게 하는 것이 목적이다. 계산기 코드는 그대로 있고 길만 끊었다. */}

        {/*
          제보 — ⛔ **지도 상세에도 둔다.** 정적 화면과 같은 자리에 같은 단추다 —
          지도에서 보던 사람이 「값이 틀렸다」를 하려고 화면을 옮기게 두지 않는다(§12-95).
        */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          <ReportButton kind="error" stdCode={p.k ?? undefined} schoolName={p.f ?? p.n} label="오류 수정" />
          <ReportButton kind="to" stdCode={p.k ?? undefined} schoolName={p.f ?? p.n} label="TO 제보" />
        </div>

        {/*
          출처 — **접어 둔다** (2026-08-23 사장님 — 「이것도 굳이 패널에 달아놓을 필요없지 않나?
          이 자리는 나중에 광고 태울 자리로 쓰면 되겠다」).
          ⛔ **없애지는 않는다.** 공공데이터는 출처와 기준일을 함께 낸다(CLAUDE.md §2) —
             급지가 몇 차 개정 기준인지가 이 서비스 신뢰의 전부다. 다만 **늘 펴 놓을 까닭은 없다.**
             필요한 사람만 열어 본다.
          ⛔ **배경 지도 줄은 지웠다.** 네이버로 옮긴 뒤로 V-World 를 안 쓰는데 그대로 남아
             **틀린 출처를 내고 있었다.** 네이버는 지도 안에 제 로고와 저작권을 스스로 낸다.
          ⭐ **이 아래가 광고 자리다**(§12-120). 붙일 때 이 `<footer>` 다음에 넣는다.
        */}
        <footer className="mt-4 pb-6">
          <details className="text-xs leading-relaxed text-ink3">
            <summary className="inline-flex min-h-9 cursor-pointer items-center gap-1 select-none">
              자료 출처
              <ChevronDown size={13} strokeWidth={1.8} aria-hidden />
            </summary>
            <div className="mt-1">
              {/* 인천은 화면에 내는 값이 급지라 그 출처를 앞에 둔다. 시 기준은 순위 계산이 쓴다. */}
              {sido === "인천" && <p>급지 · 교육지원청 교육공무원인사관리세부기준 [별표1] · 2026. 8. 7. 고시</p>}
              <p className={sido === "인천" ? "mt-1.5" : ""}>
                {/* ⛔ 고시문이 없는 시·도는 앞말을 안 붙인다 — 「인사구역 · 나이스 개방포털…」이 되면 거짓말이다 */}
                {areaPending ? "" : `${sido === "인천" ? "전보 기준" : "인사구역"} · `}
                {source.title}
              </p>
              <p className="mt-0.5">{source.revision}</p>
              <p className="mt-1.5">학생 수 · 학교알리미 공시</p>
              <p className="mt-0.5">학급 수 · 나이스 개방포털</p>
            </div>
          </details>
        </footer>
      </div>
    </div>
  );
}

function Cell({ k, v, wide }: { k: string; v: string | { href: string }; wide?: boolean }) {
  // 배경 없음 — 감싸는 판이 유리다. 선은 dl 이 긋는다
  return (
    <div className={`px-3 py-2.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-xs text-ink3">{k}</dt>
      <dd className="mt-0.5 text-sm font-medium tabular-nums">
        {typeof v === "string" ? (
          v
        ) : (
          /* ⛔ 44px 을 채운다(§11-4). 칸 안이라 -my 로 줄 높이는 그대로 둔다 */
          <a
            href={v.href}
            target="_blank"
            rel="noreferrer"
            className="-my-1.5 inline-flex min-h-11 items-center gap-1 text-key active:opacity-60"
          >
            바로가기
            <ExternalLink size={13} strokeWidth={2} aria-hidden />
          </a>
        )}
      </dd>
    </div>
  );
}

/**
 * ⛔ 배지 자체는 `components/area-badge.tsx` 에 있다 — 학교별 정적 화면이 같은 것을 쓴다(§11-3).
 *    여기는 지도가 들고 다니는 `Pin` 을 그 부품의 말로 바꿔 주는 껍데기다.
 */
export function Badge({ sido, p, big }: { sido: Sido; p: Pin; big?: boolean }) {
  return <AreaBadge sido={sido} area={p.a} grade={p.g} big={big} />;
}
