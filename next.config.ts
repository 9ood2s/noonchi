import type { NextConfig } from "next";
import { canonicalRedirects } from "./lib/deployment.mjs";

const nextConfig: NextConfig = {
  /**
   * ⛔ 개발 서버에 `127.0.0.1` 로 들어와도 자바스크립트를 받게 한다.
   *
   * Next 는 개발용 파일(`/_next/static/*`)을 **서버를 띄운 이름(기본 `localhost`)** 밖에서
   * 부르면 403 으로 막는다. 그래서 `http://127.0.0.1:3000` 으로 열면 화면(HTML)은 뜨는데
   * **자바스크립트가 하나도 안 붙어** 아무것도 안 눌리고 지도 말풍선도 안 그려진다.
   * 오류 화면이 아니라 멀쩡해 보이는 채로 죽는다 — 그래서 알아채기 어렵다.
   *
   * 이 맥은 `localhost` 가 `::1` 로 먼저 풀리는데 그 자리를 다른 프로젝트가 잡고 있어서
   * 우리 것은 `127.0.0.1` 로 들어와야 한다. 둘 다 열어 둔다.
   */
  allowedDevOrigins: ["127.0.0.1"],

  /**
   * ⛔ **첫 화면은 지도다**(2026-08-23 사장님 — 「이 화면 안나오고 바로 지도로 나갈 수 있게」).
   *    전에는 `/` 가 인사구역 요약을 낸 뒤 지도로 넘기는 자리였는데, 지도를 보러 온 사람에게
   *    한 화면을 더 밟게 하는 것이었다(§12-95 「모든 것은 지도를 열어 둔 채로」와도 어긋난다).
   * ⚠️ **검색에 잡히는 정적 화면이 이걸로 없어졌다**(CLAUDE.md §13 — 수익이 광고다).
   *    되살릴 자리는 `docs/BACKLOG.md` 에 적어 뒀다 — 지원청별 정적 화면으로 다시 낸다.
   * ⛔ `permanent: false` 다. 뒤에 홈을 되살릴 수 있어야 하는데, 영구로 두면 브라우저가
   *    그 넘김을 캐시해서 되살려도 안 온다.
   */
  redirects: async () => [
    ...canonicalRedirects(process.env.NEXT_PUBLIC_SITE_URL),
    { source: "/", destination: "/map", permanent: false },
  ],
};

export default nextConfig;
