import type { MetadataRoute } from "next";
import { SIDOS, officesOf, schoolCodesOf, type Sido } from "@/lib/schools";
import { SITE_URL, officePath, schoolPath } from "@/lib/site";

/**
 * 사이트맵 — 검색에게 우리 화면 목록을 준다.
 *
 * ⛔ **시·도마다 한 장씩 나눠 낸다.** 한 장에 50,000줄 제한이 있는데, 지금은 1,637교라
 *    한 장이면 되지만 전국이 되면 2만교가 넘는다(2026-08-23 사장님 — 「앞으로 추가해야할
 *    전국의 학교들이 겁나 많음」). **나중에 나누면 주소가 바뀌어 그동안 쌓은 것을 다시 밟게 된다.**
 *    처음부터 나눠 두면 시·도가 늘 때 장수만 는다.
 * ⛔ `SOURCES` 를 따라간다 — 새 지역을 열 때 이 파일은 안 고친다.
 * ⚠️ 사이트맵에 있다고 검색이 집는 것은 아니다. `/school` → 지원청 → 학교로 **링크도 이어 둔다.**
 */

/** 첫 장(`sitemap/0.xml`)에 시·도가 아닌 것들을 함께 담는다 */
const COMMON: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/map`, changeFrequency: "monthly", priority: 1 },
  { url: `${SITE_URL}/school`, changeFrequency: "yearly", priority: 0.8 },
];

export async function generateSitemaps() {
  return SIDOS.map((_, id) => ({ id }));
}

/**
 * ⛔ **`id` 는 Next 16 부터 `Promise<string>` 이다** — 15 까지는 숫자를 그대로 받았다
 *    (`node_modules/next/dist/docs/.../version-16.md` 「Async `id` parameter for `sitemap`」).
 *    기다리지 않고 `SIDOS[id]` 로 집으면 `undefined` 가 나오는데, **오류가 안 난다** —
 *    빈 사이트맵 두 장이 그대로 만들어지고 빌드는 통과한다. 실제로 한 번 그렇게 나왔다.
 * ⛔ 그래서 못 알아본 값이면 **던진다.** 조용히 빈 목록을 내면 아무도 모른다(CLAUDE.md §11-1).
 */
export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const at = Number(await id);
  const sido: Sido | undefined = SIDOS[at];
  if (!sido) throw new Error(`사이트맵 번호를 못 알아봤다: ${at} (시·도 ${SIDOS.length}개)`);

  const offices = await officesOf(sido);
  const codes = await schoolCodesOf(sido);

  return [
    ...(at === 0 ? COMMON : []),
    ...offices.map((o) => ({
      url: `${SITE_URL}${officePath(sido, o)}`,
      changeFrequency: "yearly" as const,
      priority: 0.7,
    })),
    ...codes.map((c) => ({
      url: `${SITE_URL}${schoolPath(c)}`,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
