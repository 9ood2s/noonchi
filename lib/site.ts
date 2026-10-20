import { resolveSiteOrigin } from "./deployment.mjs";

/** 대표 주소와 정적 화면의 주소 규칙. 각 운영자의 배포 환경에서 주소를 설정한다. */
export const SITE_URL = resolveSiteOrigin(
  process.env.NEXT_PUBLIC_SITE_URL,
  process.env.VERCEL_URL,
);

/**
 * 학교 하나의 정적 화면.
 *
 * ⛔ **열쇠는 표준학교코드다** — 나이스가 매기는 전국 유일값이라
 *    ① 전국으로 늘려도 같은 이름끼리 부딪히지 않고(수원 원일초 · 안산 원일초가 실제로 있다)
 *    ② 학교가 지원청을 옮기거나 시·군 이름이 바뀌어도 **주소가 안 바뀐다.**
 *    주소가 바뀌면 그동안 쌓은 검색 순위를 잃는다 — 인천 행정구역 개편(중구·동구 → 제물포구)이
 *    실제로 있었던 일이라 이름을 주소에 넣는 것은 위험하다.
 */
export const schoolPath = (stdCode: string) => `/school/${stdCode}`;

/**
 * 교육지원청 하나의 학교 목록.
 *
 * ⛔ **학교를 한 장에 다 늘어놓지 않는다.** 지금은 1,637교라 한 장에도 들어가지만
 *    전국이 되면 2만교다 — 사람도 못 읽고 검색도 한 장에 몰린 링크를 다 따라가지 않는다.
 *    시·도 → 지원청 → 학교 세 단으로 두면 **전국이 되어도 단이 안 늘고 시·도 수만 는다.**
 * ⛔ 전보가 도는 단위가 교육지원청이다(CLAUDE.md §4 — 교사가 쓰는 말 그대로).
 */
export const officePath = (sido: string, office: string) =>
  `/school/office/${encodeURIComponent(sido)}/${encodeURIComponent(office)}`;

/**
 * 관할 기관 이름 — 화면에 적는 온전한 꼴.
 *
 * ⛔ **이름 뒤에 「교육지원청」을 손으로 붙이지 않는다.** 전국을 열면서 지원청이 아닌 관할이 생겼다 —
 *    **세종은 교육지원청이 없고 시교육청이 직접 관할한다**(55교 전부). 충남 대안학교 한 곳도 도교육청 직속이다.
 *    거기에 「교육지원청」을 붙이면 없는 기관 이름이 된다.
 * ⛔ 그래서 이름이 이미 「교육청」으로 끝나면 그대로 두고, 아니면 「교육지원청」을 붙인다.
 *    붙이는 자리가 여덟 곳이라 한 곳으로 모은다(CLAUDE.md §11-3).
 */
export const officeTitle = (office: string) =>
  office.endsWith("교육청") ? office : office + "교육지원청";

/** 정적 화면의 입구 — 시·도와 교육지원청 목록 */
export const SCHOOL_INDEX = "/school";

/**
 * 지도에서 이 학교를 열어 주는 주소.
 * ⛔ 시·도를 함께 적는다 — 지도는 시·도 하나를 골라 놓고 도는 화면이라 그것부터 맞춰야 한다.
 */
export const mapPath = (sido: string, stdCode: string) =>
  `/map?sido=${encodeURIComponent(sido)}&school=${encodeURIComponent(stdCode)}`;
