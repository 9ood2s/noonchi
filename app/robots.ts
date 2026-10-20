import type { MetadataRoute } from "next";
import { SIDOS } from "@/lib/schools";
import { SITE_URL } from "@/lib/site";

/**
 * ⛔ **막는 것부터 적는다.** `/auth/callback` 과 `/login` 은 사람마다 결과가 다르고
 *    검색이 집어 봐야 쓸 것이 없다. `/api` 는 화면이 아니다.
 * ⛔ `/admin` 은 운영 화면이다. 화면 자체도 `robots: { index: false }` 를 달고 있는데
 *    **둘 다 한다** — 이 파일은 「보러 오지 마라」이고 메타 태그는 「봤어도 싣지 마라」라서
 *    하는 일이 다르다. 막혀 있어도 다른 곳에서 링크되면 주소만으로 실리는 일이 있다.
 * ⛔ 사이트맵은 시·도마다 한 장이라 **모두 적어 준다** — 첫 장만 적으면 나머지를 안 본다.
 *    `SIDOS` 를 따라가므로 새 지역을 열 때 이 파일은 안 고친다.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/login", "/admin"] },
    sitemap: SIDOS.map((_, i) => `${SITE_URL}/sitemap/${i}.xml`),
    host: SITE_URL,
  };
}
