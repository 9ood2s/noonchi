import { MapScreen } from "@/components/map/map-screen";

/**
 * ⛔ **제목이 「지도」 하나였다**(2026-08-23 사장님 — 「그냥 '지도'는 심심하지 않음?」).
 *    탭에 「지도 · NOONCHI」로 떠서 **무엇을 하는 지도인지**가 없었고, 이 화면이 우리 대표 화면이라
 *    검색 결과에도 그대로 나간다.
 * ⛔ 「전국」을 적는다 — 2026-08-23 에 열일곱 시·도로 넓혔다. 인사구역은 아직 경기·인천뿐이지만
 *    학교 정보는 전국에 다 있다(그 갈래는 화면이 스스로 말한다).
 */
export const metadata = { title: "전국 초등 전보 지도" };

/** 화면 자체는 정적이다. 학교 점 목록은 /map/data 에서 따로 받아 간다. */
export default function MapPage() {
  return <MapScreen />;
}
