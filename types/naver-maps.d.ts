/**
 * 네이버 지도 타입을 프로그램에 끌어들이고, `window.naver` 를 알려 준다.
 *
 * ⛔ `@types/navermaps` 가 저절로 안 들어온다. 전역 선언만 있는 꾸러미라
 *    어느 파일도 `import` 하지 않으면 프로그램에 안 담긴다(`--listFilesOnly` 로 확인했다).
 *    ⛔ tsconfig 의 `types` 로 해결하지 않는다 — 거기 적으면 **적은 것만** 들어와
 *       react·node 가 통째로 빠진다. 필요한 것 하나만 여기서 가리킨다.
 * ⛔ `window.naver` 는 그 꾸러미가 안 적어 준다(전역 `naver` 만 적는다).
 *    스크립트를 다 받았는지 보려면 `window.naver?.maps` 를 봐야 해서 여기서 더한다.
 */

/// <reference types="navermaps" />

declare global {
  interface Window {
    naver?: typeof naver;
  }
}

export {};
