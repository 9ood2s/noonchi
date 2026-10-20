/**
 * 학교 이름으로 찾을 때 쓰는 **가벼운 색인**.  GET /school-index
 *
 * 누가 쓰나 — 처음 화면의 위저드(`components/onboarding.tsx`)와 학교 고르기
 * (`components/school-picker.tsx`). 둘 다 「내가 있는 학교」 하나를 이름으로 찾는 일만 한다.
 *
 * ⛔ **점 목록(`/map/data/<시·도>`)을 대신 받게 두지 않는다.** 그건 학교 하나에 스무 칸이 붙어 있고
 *    전국 6,236교면 몇 MB다. 여기는 **네 칸만** 낸다 — 표준학교코드 · 이름 · 지원청 · 시·도.
 * ⛔ 배열의 배열로 낸다. 칸 이름을 6,236번 반복하면 그것만으로 절반이 된다.
 * ⛔ **짧은 이름은 정식 이름에 안 들어 있을 때만** 덧붙인다(전국 112교). 「고색」은
 *    「고색초등학교」 안에 있어 따로 실을 까닭이 없고, 실으면 색인이 그만큼 무거워진다.
 *
 * 빌드할 때 한 번 만들어 정적으로 낸다 — 교육청 고시와 나이스 목록은 연 단위로 바뀐다.
 */
import { SIDOS, YEAR, schoolsOf } from "@/lib/schools";

export const dynamic = "force-static";
export const revalidate = 3600;

/** 한 줄 = [표준학교코드, 정식 이름, 교육지원청, 시·도, (짧은 이름)] */
export type IndexRow = [string, string, string, string] | [string, string, string, string, string];

export async function GET() {
  const rows: IndexRow[] = [];
  for (const sido of SIDOS) {
    for (const s of await schoolsOf(sido)) {
      // ⛔ 표준학교코드가 없는 학교는 뺀다 — 고를 수는 있어도 별점·통근을 걸 열쇠가 없다
      if (!s.stdCode) continue;
      const full = s.officialName ?? s.name;
      rows.push(
        full.includes(s.name)
          ? [s.stdCode, full, s.office, sido]
          : [s.stdCode, full, s.office, sido, s.name],
      );
    }
  }

  return Response.json(
    { year: YEAR, rows },
    { headers: { "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}
