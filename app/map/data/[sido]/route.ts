/**
 * 지도가 받아 가는 점 목록.  GET /map/data/<시·도>
 *
 * 빌드할 때 시·도마다 한 장씩 만들어 정적으로 낸다 — 교육청 고시는 연 1회 바뀐다(CLAUDE.md §13).
 *
 * ⛔ **열일곱 시·도를 한 파일로 내지 않는다.** 전에는 `/map/data` 하나가 전부를 담았는데,
 *    경기·인천 1,637교일 때는 괜찮았지만 전국 6,236교가 되면 지도를 열자마자 그걸 통째로
 *    받는다 — 폰에서 인천 하나 보려는 사람이 제주까지 받는다.
 *    시·도를 고를 때 그 시·도만 받고, 한 번 받은 것은 화면이 들고 있는다(`map-screen.tsx`).
 *
 * ⛔ 좌표 없는 학교를 조용히 버리지 않는다. 몇 개를 못 찍었는지 함께 내보내고
 *    화면이 그 숫자를 보여준다. 조용히 모자란 채로 넘어간 전례가 셋 있다(docs/postmortems.md).
 */
import { newestStatYear, schoolsOf, SIDOS, YEAR, type Sido } from "@/lib/schools";
import { pinOf, type Pin } from "@/lib/map";

export const dynamic = "force-static";
export const revalidate = 3600;

/**
 * ⛔ 목록에 없는 시·도는 404 다. 열어 두면 아무 글자나 넣어도 빈 꾸러미가 만들어져
 *    화면이 「학교 0교」라는 거짓말을 한다.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return SIDOS.map((sido) => ({ sido }));
}

/** 좌표를 소수 5자리로 줄인다 — 1m 안쪽이라 학교 위치엔 넘치고, 크기는 3할이 준다. */
const round = (v: number) => Math.round(v * 1e5) / 1e5;

type Feature = { type: "Feature"; id: number; geometry: { type: "Point"; coordinates: [number, number] }; properties: Pin | GroupPin };
type GroupPin = { g: string; n: number };

/**
 * 도서 지역 — 지도에서 따로 다룬다.
 *
 * ⛔ 백령·연평·대청은 경도 124.6 까지 나간다. 이걸 넣고 인천 전체를 맞추면
 *    **지도 중심이 서해 바다로 가서** 정작 학교가 몰린 육지가 구석에 몰린다.
 *    그래서 화면에서 켜고 끌 수 있게 하고, 끄면 그만큼 빼고 범위를 잡는다.
 * ⛔ 빼는 게 아니라 **갈라 두는 것**이다. 그 섬들도 엄연히 소속 교육지원청이 있고
 *    Ⅲ구역(다급지) 근무연한이 걸리는, 인사에서 제일 중요한 자리다.
 *
 * 근거 = 인천 기준 제11조 ④ 「강화교육지원청 관내 부속도서(교동면, 삼산면, 서도면) 및
 *        남부교육지원청 옹진군 관내」 — 고시문이 스스로 이 둘을 묶어 부른다.
 */
const ISLAND_CITY = new Set(["옹진군"]);
/** 강화 부속도서. ⛔ 지원청까지 맞춰야 한다 — 이름만 보면 **용인 교동초**가 걸린다(실제로 걸렸다). */
const ISLAND_GANGHWA = new Set(["교동", "삼산", "서도"]);
const isIsland = (sido: string, office: string, city: string | null, name: string) =>
  sido === "인천" &&
  ((city != null && ISLAND_CITY.has(city)) || (office === "강화" && ISLAND_GANGHWA.has(name)));

async function pack(sido: Sido) {
  const all = await schoolsOf(sido);
  const placed = all.filter((s) => s.lat != null && s.lng != null);

  /**
   * **가장 최근 공시 연도.** 여기서 걸러 내고 되돌아간 학교에만 연도를 남겨 보낸다 —
   * 화면은 「`sy` 가 있으면 별표」 한 줄로 끝난다(§12-142).
   * ⛔ 세는 자리는 `lib/schools.ts` 한 곳이다. 학교별 정적 화면이 같은 값을 쓴다(CLAUDE.md §11-3).
   */
  const newest = await newestStatYear(sido);

  const schools: Feature[] = placed.map((s, i) => {
    const pin = pinOf(s);
    return {
      type: "Feature",
      id: i,
      geometry: { type: "Point", coordinates: [round(s.lng!), round(s.lat!)] },
      properties: {
        ...pin,
        sy: pin.sy != null && pin.sy < newest ? pin.sy : null,
        i: isIsland(sido, s.office, s.city, s.name) ? 1 : 0,
      },
    };
  });

  /**
   * 멀리서 볼 때 쓰는 묶음 말풍선. **두 가지로 미리 만들어 둔다** — 화면에서 골라 쓴다.
   *   지원청 : 전보가 도는 단위. 경기는 광주하남·동두천양주·화성오산처럼 여러 시·군이 한 지원청이다
   *   시·군  : 사는 곳으로 찾는 사람에게 익숙한 단위
   * ⛔ 도서는 묶음에서 뺀다 — 백령·연평이 들어가면 자리(평균)가 바다로 끌려간다.
   */
  const group = (key: (s: (typeof placed)[number]) => string): Feature[] => {
    const bucket = new Map<string, { lng: number; lat: number; n: number }>();
    for (const s of placed) {
      if (isIsland(sido, s.office, s.city, s.name)) continue;
      const k = key(s);
      const b = bucket.get(k) ?? { lng: 0, lat: 0, n: 0 };
      bucket.set(k, { lng: b.lng + s.lng!, lat: b.lat + s.lat!, n: b.n + 1 });
    }
    return [...bucket].map(([g, b], i) => ({
      type: "Feature",
      id: i,
      geometry: { type: "Point", coordinates: [round(b.lng / b.n), round(b.lat / b.n)] },
      properties: { g, n: b.n },
    }));
  };
  const offices = group((s) => s.office);
  const cities = group((s) => s.city ?? s.office);

  return {
    schools: { type: "FeatureCollection" as const, features: schools },
    offices: { type: "FeatureCollection" as const, features: offices },
    cities: { type: "FeatureCollection" as const, features: cities },
    meta: {
      total: all.length,
      placed: placed.length,
      unplaced: all
        .filter((s) => s.lat == null || s.lng == null)
        .map((s) => ({ name: s.name, office: s.office })),
      islands: placed.filter((s) => isIsland(sido, s.office, s.city, s.name)).length,
      statYear: newest,
    },
  };
}

export async function GET(_req: Request, ctx: { params: Promise<{ sido: string }> }) {
  const { sido: raw } = await ctx.params;
  const sido = decodeURIComponent(raw);
  // ⛔ 모르는 시·도는 404 다. 빈 꾸러미로 답하면 화면이 「학교 0교」로 그린다
  if (!(SIDOS as readonly string[]).includes(sido)) {
    return new Response("모르는 시·도다", { status: 404 });
  }

  return Response.json(
    { year: YEAR, sido, ...(await pack(sido as Sido)) },
    { headers: { "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
