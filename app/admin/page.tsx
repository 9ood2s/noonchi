import type { Metadata } from "next";
import { AdminConsole } from "@/components/admin/console";

/**
 * 운영 화면 (`docs/DESIGN.md §12-165`)
 *
 * ⛔ **검색에 안 잡히게 막는다.** `robots: { index: false }` 가 `<meta name="robots">` 를 박고,
 *    `app/robots.ts` 가 `/admin` 을 크롤링 금지에 적는다. 둘을 다 한다 —
 *    robots.txt 는 「보러 오지 마라」이고 메타 태그는 「봤어도 싣지 마라」라서 하는 일이 다르다.
 * ⛔ 사이트맵에는 애초에 안 들어간다(`app/sitemap.ts` 는 학교 화면만 싣는다).
 *
 * ⛔ **서버에서 아무것도 받지 않는다.** 서버에서 로그인 상태를 보면 이 화면이 동적이 되고,
 *    받은 값이 HTML 에 실려 나간다. 껍데기만 미리 만들어 두고 **브라우저가 자기 열쇠로** 받는다
 *    (CLAUDE.md §13 · `components/admin/console.tsx`).
 */
export const metadata: Metadata = {
  title: "운영",
  robots: { index: false, follow: false },
};

export default function Admin() {
  return <AdminConsole />;
}
