import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppRail } from "@/components/app-rail";
import { LoginGate } from "@/components/login-gate";
import { OnboardingGate } from "@/components/onboarding-gate";
import { Toast } from "@/components/toast";
import { ReportDialog } from "@/components/report-dialog";
import { THEME_SCRIPT } from "@/components/theme-toggle";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  /**
   * ⛔ **대표 주소를 여기서 못박는다.** 이것이 없으면 각 화면의 canonical·미리보기 주소가
   *    상대 경로로 나가 검색이 어느 것이 진짜인지 못 가린다(`lib/site.ts`).
   */
  metadataBase: new URL(SITE_URL),
  /**
   * ⛔ **브라우저 탭에 서비스 이름을 낸다**(2026-08-23 사장님 — 「여기도 NOONCHI 로 바꿔줘」).
   *    전에는 「지도 · 교사 전보 정보」였다 — 탭이 여럿 열려 있으면 **어느 것이 우리 것인지 안 보인다.**
   *    검색 결과에도 이 뒷말이 그대로 붙으므로 이름이 서는 편이 낫다.
   * ⛔ 표기는 `NOONCHI` 다. 한글 「눈치」와 섞어 쓰지 않는다 — 한 서비스가 두 이름이 된다.
   */
  title: { default: "NOONCHI", template: "%s · NOONCHI" },
  description: "경기·인천 초등 교사 전보 — 인사구역, 전보년수, 학교 정보",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /**
   * ⛔ **브라우저가 화면 전체를 확대하지 못하게 막는다**
   *    (2026-08-23 사장님 — 「확대하다보면 웹 페이지 자체가 확대되서 ui가 안보임」).
   *    이 서비스는 화면 전체가 지도다. 두 손가락으로 벌리면 **지도가 확대돼야 하는데**
   *    브라우저가 그걸 「페이지 확대」로 받아 검색줄·필터·아래 시트가 화면 밖으로 밀려난다.
   *    지도는 자기 확대 기능이 따로 있으므로 페이지 확대는 잃을 것이 없다.
   * ⚠️ **이것만으로는 아이폰·아이패드 사파리가 안 듣는다.** 애플은 iOS 10 부터 이 값을
   *    접근성 때문에 무시한다. 그래서 지도 칸에 `touch-action: none` 과
   *    `gesturestart` 막기를 함께 건다(`components/map/map-screen.tsx`). 셋이 한 벌이다.
   */
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#10151b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    /* ⛔ `suppressHydrationWarning` — 위의 THEME_SCRIPT 가 리액트보다 **먼저** 돌면서
       `<html>` 에 `data-theme` 을 박는다. 그래서 서버가 그린 것과 브라우저가 받은 것이
       한 칸 어긋나고, 리액트가 콘솔에 「hydrated but some attributes… didn't match」를 낸다.
       ⛔ 스크립트를 늦추는 것으로 고치지 않는다 — 늦추면 어두운 화면이 한 번 번쩍인다.
          어긋나는 것이 우리가 일부러 만든 것이므로 이 한 줄로 「알고 있다」고 적는다.
       ⛔ 이 표시는 **`<html>` 한 겹에만** 걸린다. 안쪽 부품의 진짜 어긋남은 그대로 잡힌다. */
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      {/* ⛔ 첫 그림보다 먼저 돌아야 한다. 늦으면 어두운 화면이 한 번 번쩍인다. */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* ⛔ min-h-full 이 아니라 h-full 이다. min- 만 주면 높이가 「내용만큼」이라
          지도처럼 flex-1 로 화면을 채우려는 칸이 내용 높이만큼 늘어난다(캔버스가 85,656px 이 됐다). */}
      <body className="h-full flex flex-col font-sans">
        {/* ⛔ 헤더를 두지 않는다. 떠 있는 **아이콘 레일**이 그 일을 한다(시안 M · §12-89).
            벽에 붙은 띠는 리퀴드 글라스와 따로 논다 — 곡률과 떠 있음이 이 시안의 핵심이다.
            ⛔ 폰에서는 레일 대신 단추 하나다 — 세로 레일이 검색줄·칩줄을 덮는다. */}
        <AppRail />
        {children}
        {/* ⛔ **로그인·가입은 화면을 갈아치우지 않는다**(2026-08-23 사장님 — 「회원가입과 로그인 모두
            지도창 위의 모달에서 진행하면 좋겠음」 · §12-144). 여기 하나만 달려 있고 어느 화면에서든
            `openLogin()` 한 줄로 열린다 — 여는 쪽은 이것을 모른다(`lib/login-gate.ts`). */}
        <LoginGate />
        {/* ⛔ **가입 직후 한 번** — 닉네임·소속교는 필수, 거주지역은 건너뛴다(§12-148).
            표에 값이 있나로 가린다 — 「봤다」를 브라우저에 적으면 기기를 바꿨을 때 또 뜬다. */}
        <OnboardingGate />
        {/* ⛔ **토스트는 여기 하나뿐이다**(2026-08-23 사장님 — 「추가하거나 저장할 때마다 토스트도
            좀 띄워주고. **아무런 반응이 없는 버튼들이 너무 많음**」 · §12-159).
            화면 안에 두면 유리(backdrop-filter) 칸을 기준으로 잡혀 갇히고, 여러 곳에 두면 겹쳐 뜬다.
            부르는 쪽은 이것을 모른다 — `lib/toast.ts` 의 `toast("…")` 한 줄이다. */}
        <Toast />
        {/* 제보 창 — 단추는 곳곳에 있고 받는 쪽은 여기 하나다(§12-161) */}
        <ReportDialog />
        {/* ⛔ **온보딩 대화상자를 뗐다**(2026-08-23 사장님 — 「이 화면 안나오고 바로 지도로」).
            첫 방문에 어두운 막으로 지도를 덮고 있었고, 받은 학교는 `localStorage` 에만 적혀
            **아무 데도 안 쓰이고 있었다.** 현임교는 모의지원의 뿌리이므로(§12-88)
            그때 마이페이지 칸에서 받는다. 부품은 `components/onboarding.tsx` 에 남겨 뒀다. */}
      </body>
    </html>
  );
}
