"use client";

/**
 * 아이콘 레일 — 시안 M 의 그것이다(`docs/DESIGN.md §12-52`「아이콘 레일」 · §12-89).
 *
 * ⛔ **전에는 햄버거 단추 하나였다.** 2026-08-21 09:43 에 M 을 고르면서 레일이 확정됐는데,
 *    같은 날 16:02 「헤더를 없애고 떠 있는 단추 하나」(§12-66)를 **레일을 대체하는 것으로 읽어**
 *    단추로 만들었다. 두 결정이 부딪히는 것을 문서에 안 적어 아무도 못 봤다.
 *    사장님이 시안 그림을 들고 짚었다(2026-08-23) — 레일로 되돌린다.
 * ⭐ 레일이 나은 까닭 — 단추는 **두 번** 눌러야 닿는다(열고 → 고르고). 레일은 **한 번**이다.
 *
 * ⛔ **폰에는 레일을 세우지 않는다.** 세로 레일은 4칸이면 216px 이라 검색줄과 칩줄을 덮는다.
 *    시안도 폰 아트보드(`Phone`)에는 레일이 없다. 폰은 단추 하나 그대로다.
 * ⛔ **갈래를 자바스크립트로 재지 않는다.** `matchMedia` 로 재면 첫 그림이 늘 폰 쪽이라
 *    넓은 화면에서 **햄버거가 한 번 번쩍인 뒤** 레일로 바뀐다. `lg:` 로 갈라 그림 전에 정해진다.
 * ⛔ 로그인 상태도 밝기도 **서버에서 보지 않는다.** 서버에서 보면 이 부품이 든 모든 화면이
 *    동적이 되어 홈이 검색에 안 잡힌다(CLAUDE.md §13 — 수익이 광고다).
 * ⛔ 칸은 44px 이상이다. 손가락으로 눌러야 한다(§11-4).
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Check, Heart, LogIn, LogOut, Monitor, Moon, Sun, User, X } from "lucide-react";
import { PANEL_EVENT, openPanel, type PanelKey } from "@/lib/panel";
import { openLogin } from "@/lib/login-gate";
import { toast } from "@/lib/toast";
import { authClient } from "@/lib/auth/client";
import { carryOverWatchlist } from "@/lib/auth/carry";
import { apply, readAppliedTheme, type Theme } from "@/components/theme-toggle";
import { NoonchiLogo } from "@/components/brand/noonchi-logo";
import { NoonchiWordmark } from "@/components/brand/noonchi-wordmark";

/**
 * ⛔ **모든 것은 지도를 열어 둔 채로 한다**(2026-08-23 사장님 — 「지도화면에서 나가는 페이지는
 *    만들지마. 모든걸 지도를 열어둔 상태에서 다 처리할 수 있게」). 그래서 레일의 줄은
 *    **화면을 갈아치우지 않고** 지도 위 칸(넓은 화면 왼쪽 칸 · 폰 아래 시트)을 연다.
 * ⛔ 「학교 찾기」를 따로 두지 않는다. 지도 위에서 다 한다(네이버 지도처럼).
 * ⛔ **기준 개정은 뺐다**(2026-08-23 사장님 「별 도움이 안됨」). 자료는 `lib/revisions.ts` 에 남겼다.
 * ⛔ **전보년수 계산기도 레일에 없다**(2026-08-21 사장님 「일단은 빼놓자」 · §12-87-4).
 */
/** 레일에 서는 lucide 아이콘이 받는 것 — 24 격자 · `currentColor` */
type RailIcon = (props: {
  size?: number;
  strokeWidth?: number;
  className?: string;
  "aria-hidden"?: boolean;
}) => React.ReactNode;

/**
 * ⛔ **지도 칸은 아이콘이 아니라 로고다**(2026-08-23 사장님 — 「시안이랑 다른데」).
 *    핸드오프에는 그림이 둘이었다 — 시안 01 의 **채운 심볼**(파란 캡슐·흰 눈·검은 눈동자)과
 *    시안 06 의 **한 색 선 아이콘**(`noonchi-dock.svg`). 지시서는 레일에 후자를 쓰라고 했는데,
 *    **우리 레일은 고른 칸을 파랑으로 채우기 때문에**(M 규칙 4) 선 아이콘을 넣으면 색이 뒤집혀
 *    「파란 칸 위 흰 마크」가 된다 — 사장님이 화면에서 보고 시안과 다르다고 짚은 것이 이것이다.
 *    그래서 **채운 심볼을 그대로 세우고, 이 칸만 파랑 채움을 뺀다**(아래 `Cell` 의 `plain`).
 * ⛔ 나머지 둘(하트·사람)은 lucide 그대로 둔다. 브랜드는 첫 칸 하나로 족하다.
 */
type Tab = { panel: PanelKey; label: string; Icon?: RailIcon; brand?: true };

const TABS: readonly Tab[] = [
  { panel: null, label: "지도", brand: true },
  { panel: "watch", label: "관심목록", Icon: Heart },
  { panel: "me", label: "마이페이지", Icon: User },
];

const THEMES: { key: Theme; label: string; Icon: typeof Monitor }[] = [
  { key: "auto", label: "자동", Icon: Monitor },
  { key: "light", label: "밝게", Icon: Sun },
  { key: "dark", label: "어둡게", Icon: Moon },
];

/** 무엇이 펼쳐져 있나. `메뉴` 는 폰의 단추 하나, `밝기` 는 레일의 칸이다 */
type Open = null | "메뉴" | "밝기";

function subscribeTheme(notify: () => void) {
  window.addEventListener("runaway:theme", notify);
  return () => {
    window.removeEventListener("runaway:theme", notify);
  };
}
const serverTheme = (): Theme => "auto";

export function AppRail() {
  const here = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);
  /**
   * 로그인했나 — **브라우저에서 본다**(CLAUDE.md §13). 서버에서 보면 이 부품이 든 모든 화면이
   * 동적이 되어 홈·학교 화면이 검색에 안 잡힌다.
   * ⛔ 손님(익명)은 로그인한 것으로 치지 않는다 — 열쇠는 있지만 계정이 없다.
   * ⛔ 로그인·로그아웃을 하면 그 자리에서 바뀐다(`onAuthStateChange`).
   */
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    const supabase = authClient();
    let alive = true;
    supabase.auth
      .getUser()
      .then(({ data }) => alive && setSignedIn(!!data.user && !data.user.is_anonymous))
      .catch((e: unknown) => console.error("[레일] 로그인 상태", e));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const isMember = !!session?.user && !session.user.is_anonymous;
      setSignedIn(isMember);
      /**
       * ⭐ **회원으로 들어오면 손님 때 담아 둔 것을 옮긴다**(`lib/auth/carry.ts` · §12-170).
       * ⛔ 여기서 하는 까닭 — 이 부품은 `app/layout.tsx` 에 달려 **어느 화면에서든** 돈다.
       *    로그인은 구글을 다녀오는 길이라 어느 화면으로 돌아올지 정해져 있지 않다.
       * ⛔ 옮길 것이 없으면 아무 말도 안 한다.
       */
      if (!isMember) return;
      void carryOverWatchlist().then((r) => {
        if (!r || r.moved === 0) return;
        toast(r.left > 0 ? `관심목록 ${r.moved}곳을 옮겼습니다 · ${r.left}곳은 못 옮겼습니다` : `관심목록 ${r.moved}곳을 옮겼습니다`);
      });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  const theme = useSyncExternalStore(subscribeTheme, readAppliedTheme, serverTheme);
  const [panel, setPanel] = useState<PanelKey>(null);

  // 서버·hydration은 같은 snapshot, 이후에는 저장된 밝기와 변경 이벤트를 구독한다.

  // 지도가 칸을 닫으면(학교를 고르거나 X 를 누르면) 레일의 불도 꺼져야 한다
  useEffect(() => {
    const on = (e: Event) => setPanel((e as CustomEvent<PanelKey>).detail);
    window.addEventListener(PANEL_EVENT, on);
    return () => window.removeEventListener(PANEL_EVENT, on);
  }, []);

  // 다른 화면으로 넘어가면 닫는다 — 열어 둔 채로 남으면 새 화면을 가린다
  const [previousPath, setPreviousPath] = useState(here);
  if (previousPath !== here) {
    setPreviousPath(here);
    setOpen(null);
  }

  /**
   * 칸을 연다. ⛔ **화면을 갈아치우지 않는다**(2026-08-23 사장님) —
   *    지도에 있으면 지도에 대고 알리고, 다른 화면이면 지도로 가면서 주소에 적어 보낸다.
   */
  const go = (key: PanelKey) => {
    setOpen(null);
    if (here === "/map") {
      setPanel(key);
      openPanel(key);
      return;
    }
    router.push(key ? `/map?panel=${key}` : "/map");
  };

  const ThemeIcon = THEMES.find((t) => t.key === theme)?.Icon ?? Monitor;
  const flip = (k: Open) => setOpen((v) => (v === k ? null : k));

  return (
    <div className="fixed left-3 top-3 z-40">
      {/* 넓은 화면 — 세로 레일 */}
      <nav aria-label="메뉴" className="glass-2 hidden w-14 flex-col rounded-[22px] py-1 lg:flex">
        {TABS.map(({ panel: key, label, Icon, brand }) => (
          <button key={label} type="button" aria-label={label} aria-pressed={here === "/map" && panel === key} onClick={() => go(key)}>
            <Cell on={here === "/map" && panel === key} plain={brand}>
              {/* 로고는 캡슐이라 가로로 눕는다 — 34 로 그려야 **높이**가 옆 아이콘(20)과 맞는다 */}
              {brand ? <NoonchiLogo size={34} aria-hidden /> : Icon ? <Icon size={20} strokeWidth={1.7} aria-hidden /> : null}
            </Cell>
          </button>
        ))}
        <button type="button" aria-label="밝기" aria-expanded={open === "밝기"} onClick={() => flip("밝기")}>
          <Cell on={open === "밝기"}>
            <ThemeIcon size={20} strokeWidth={1.7} aria-hidden />
          </Cell>
        </button>
      </nav>

      {/*
        워드마크 — **넓은 화면은 레일 바로 아래, 폰은 왼쪽 아래**(2026-08-24 사장님 · A안 ·
        「폰은 아래 지도에서 네이버 반대편에다 두면 안되나」).
        ⛔ **넓은 화면에 우리 이름이 서는 자리가 하나도 없었다** — 레일은 아이콘뿐이고 지도가 화면을 다 쓴다.
        ⛔ 폰은 레일이 없어 레일 아래라는 자리가 없다. **네이버 로고 맞은편**(왼쪽 아래)에 둔다 —
           지도앱이 로고를 두는 자리이고 서로 안 가린다.
        ⛔ **손가락을 안 먹는다**(`pointer-events-none`). 장식이라 눌릴 까닭이 없고,
           먹으면 그 자리의 지도를 못 끈다.
        ⛔ **폰에서는 아래 시트 위로 올린다.** 시트가 제 높이를 `--sheet-h` 로 내보내므로 그만큼 띄운다
           (`school-sheet.tsx`). 안 띄우면 시트 안에 글자가 겹쳐 찍힌다 — 실제로 그랬다.
      */}
      <span
        aria-hidden
        style={{ bottom: "calc(var(--sheet-h, 0px) + 12px)" }}
        className="pointer-events-none fixed left-3 z-30 lg:!bottom-auto lg:left-4 lg:top-[246px]"
      >
        <NoonchiWordmark height={16} />
      </span>

      {/* 폰 — 단추 하나. 누르면 같은 것들이 한 판에 펼쳐진다 */}
      <button
        type="button"
        onClick={() => flip("메뉴")}
        aria-expanded={open === "메뉴"}
        aria-label="메뉴"
        className={`glass-2 flex size-11 items-center justify-center rounded-full active:opacity-80 lg:hidden ${
          open ? "ring-2 ring-key" : ""
        }`}
      >
        {/* ⛔ **폰의 메뉴 아이콘은 우리 심볼이다**(2026-08-24 사장님). 햄버거는 아무 앱에나 있어서
            **여기가 우리 것이라는 표가 하나도 없었다** — 폰에는 레일이 없어 로고가 설 자리가 이것뿐이다.
            ⛔ 열렸을 때는 ✕ 그대로다. 닫는 뜻은 로고로 못 말한다. */}
        {open ? (
          <X size={18} className="text-ink2" aria-hidden />
        ) : (
          <NoonchiLogo size={26} aria-hidden />
        )}
      </button>

      {open && (
        <>
          {/* 바깥을 누르면 닫힌다. 폰에서 손가락으로 닫을 자리가 있어야 한다 */}
          <button type="button" aria-label="닫기" onClick={() => setOpen(null)} className="fixed inset-0 -z-10 cursor-default" />
          {/* 폰은 단추 아래로, 넓은 화면은 레일 오른쪽으로 자란다 */}
          <div
            className={`glass glass-thick pop absolute w-56 rounded-panel p-2 ${
              open === "메뉴" ? "left-0 top-[calc(100%+8px)]" : "left-[calc(100%+8px)] top-0"
            }`}
          >
            {open === "메뉴" &&
              TABS.map(({ panel: key, label, Icon, brand }) => (
                <button
                  key={label}
                  type="button"
                  aria-pressed={here === "/map" && panel === key}
                  onClick={() => go(key)}
                  className="flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3 text-left text-sm active:bg-fill"
                >
                  {/* ⛔ 여기서는 16 그대로다. 옆 줄들과 아이콘 폭이 어긋나면 글자 시작점이 줄마다 달라진다 */}
                  {brand ? (
                    <NoonchiLogo size={16} className="shrink-0" aria-hidden />
                  ) : Icon ? (
                    <Icon size={16} className="shrink-0 text-ink3" aria-hidden />
                  ) : null}
                  <span className="min-w-0 flex-1">{label}</span>
                  {here === "/map" && panel === key && <Check size={16} className="shrink-0 text-key" aria-hidden />}
                </button>
              ))}

            {/*
              로그인·로그아웃 — **마이페이지 바로 아래**(2026-08-24 사장님 — 「메뉴의 마이페이지 아래에
              로그인/회원가입 버튼 하나 만들어줘. 로그인 했으면 거기 로그아웃도 바로 할 수 있게.
              **마이페이지 매번 들어가기 귀찮을 수도 있으니**」).
              ⛔ **상태를 서버에서 보지 않는다**(CLAUDE.md §13) — 브라우저에서 본다. 서버에서 보면
                 이 부품이 든 **모든 화면이 동적**이 되어 검색에 안 잡힌다.
              ⛔ 손님(익명)은 「로그인 · 가입」이다 — 열쇠는 있지만 계정은 없다.
              ⛔ 로그아웃 실패를 삼키지 않는다(§11-2). 됐다고 보이면 안 된다.
            */}
            {open === "메뉴" && (
              <button
                type="button"
                onClick={async () => {
                  if (!signedIn) return openLogin();
                  const { error } = await authClient().auth.signOut();
                  if (error) {
                    console.error("[로그아웃]", error.message);
                    return toast("로그아웃하지 못했습니다", "fail");
                  }
                  setSignedIn(false);
                  setOpen(null);
                  toast("로그아웃했습니다");
                }}
                className="mt-1 flex min-h-11 w-full items-center gap-2.5 rounded-chip border-t border-divider px-3 pt-2.5 text-left text-sm active:bg-fill"
              >
                {signedIn ? (
                  <LogOut size={16} className="shrink-0 text-ink3" aria-hidden />
                ) : (
                  <LogIn size={16} className="shrink-0 text-key" aria-hidden />
                )}
                <span className="min-w-0 flex-1">{signedIn ? "로그아웃" : "로그인 · 가입"}</span>
              </button>
            )}

            {(open === "메뉴" || open === "밝기") && (
              <>
                <p
                  className={`px-3 pb-1 text-[11.5px] font-semibold text-ink3 ${
                    open === "메뉴" ? "mt-1 border-t border-divider pt-2.5" : "pt-1"
                  }`}
                >
                  밝기
                </p>
                {THEMES.map(({ key, label, Icon }) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={theme === key}
                    onClick={() => {
                      apply(key);
                    }}
                    className="flex min-h-11 w-full items-center gap-2.5 rounded-chip px-3 text-left text-sm active:bg-fill"
                  >
                    <Icon size={16} className="shrink-0 text-ink3" aria-hidden />
                    <span className="min-w-0 flex-1">{label}</span>
                    {theme === key ? (
                      <Check size={16} className="shrink-0 text-key" aria-hidden />
                    ) : (
                      <span className="w-4 shrink-0" aria-hidden />
                    )}
                  </button>
                ))}
              </>
            )}

          </div>
        </>
      )}
    </div>
  );
}

/**
 * 레일 칸 하나 — 44×44 · 곡률 15. ⛔ 고른 것만 파랑으로 채운다(M 규칙 4)
 *
 * ⛔ **`plain` 은 그 규칙의 예외다** — 로고가 서는 칸에만 쓴다(2026-08-23 사장님).
 *    로고는 제 색(파란 캡슐)을 갖고 있어서, 그 뒤를 또 파랑으로 채우면 파랑 위 파랑이 되어
 *    로고가 사라진다. 그래서 이 칸은 **고른 표시를 옅은 회색 채움으로** 한다.
 */
function Cell({ on, plain, children }: { on: boolean; plain?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={`mx-auto my-1 flex size-11 items-center justify-center rounded-[15px] active:opacity-80 ${
        on ? (plain ? "bg-fill" : "bg-[var(--key-fill)] text-white") : "text-ink3"
      }`}
    >
      {children}
    </span>
  );
}
