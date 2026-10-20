# 의존성 보안 업데이트와 검증

확인일: 2026-10-20. 공개 저장소의 기존 잠금 파일에서 npm audit가 보고한 10건(high 8, critical 2)을 해결했다. 결과는 확인 당시 npm 권고 데이터 기준이며, 이후 배포 전 다시 검사한다.

## 변경

| 의존성 | 적용 버전 또는 처리 |
|---|---|
| Next.js · eslint-config-next | 16.3.8로 함께 갱신. 앱의 기존 16.3 계열 유지 |
| sharp | 0.35.5 |
| source-map-js | 1.2.2 |
| shell-quote | 1.12.0 |
| brace-expansion | 의존 경로별 1.1.21 · 5.0.12 |
| fast-glob → micromatch → braces | Next.js ESLint 플러그인 경로에서 실제 제거. tinyglobby 0.2.17을 사용하는 로컬 어댑터로 대체 |
| TypeScript · ESLint | 6.0.3 · 9.39.5로 린트 플러그인의 peer 범위에 맞춤 |

`braces`의 [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)에는 확인일 기준 수정 버전이 없다. 따라서 린트 규칙을 끄거나 감사 결과를 무시하는 대신, `@next/eslint-plugin-next`가 사용하는 `globSync` 호출을 [범위가 제한된 어댑터](../tools/next-eslint-glob/README.md)에 연결했다. 기존 디렉터리 검색 결과와 실제 Next.js 린트 규칙을 회귀 검사한다. `npm run checks`에 이 검사도 포함된다.

ESLint 10은 현재 React 린트 플러그인의 peer 범위에 들어가지 않으며 TypeScript 7은 현재 typescript-eslint의 지원 범위를 벗어난다. 지원 범위를 강제로 무시하지 않고 호환되는 조합을 사용한다. **ESLint 9 자체는 유지보수가 종료되어 설치 시 deprecation 경고가 나온다.** 상위 플러그인이 ESLint 10을 지원하면 함께 갱신해야 한다. 현재 감사 0건이 장기적인 유지보수를 보장하지는 않는다.

앱 코드·DB 마이그레이션·API 계약·React·Supabase SDK는 이 업데이트에서 변경하지 않았다. 기존 서비스의 배포 연결은 사용하지 않는다.

## 재현 명령

Node.js 24.19.0, npm 11.17.0에서 확인했다. 저장소의 Node.js 최소 요구사항은 22 이상이다. `npm ci`로 게시된 잠금 파일을 그대로 사용한다. `--legacy-peer-deps`, `--force`, 감사 제외 설정은 사용하지 않는다.

```sh
npm ci
npm audit
npm audit --omit=dev
npm ls --all
npm run checks
npm run selftest:deployment
npm run verify
npm start
```

`verify`는 Poppler의 `pdftotext`와 빌드용 DB 환경변수가 필요하다. 설정 절차는 [README](../README.md)를 따른다. 검증에는 별도 로컬 Supabase 스택에 마이그레이션 55개와 합성 seed를 적용했고, 로컬 DB 키만 사용했다.

## 확인 결과와 범위

- 새 `npm ci` 성공. 전체 감사와 실행 의존성 감사 모두 취약점 0건. `npm ls --all`의 peer·설치 오류 없음.
- 원문 판독·학교 매칭, 계산/통근 셀프체크 72개, 기존 가드 4종 통과.
- 배포 설정 셀프체크 5개 통과. glob 어댑터 회귀 검사 29개 통과. 실제 Next.js ESLint 규칙의 rootDir 설정 10종 실행 확인.
- 기본 Turbopack 프로덕션 빌드와 TypeScript 검사 성공. 정적 페이지 6,461개 생성 후 `npm start`로 실행.
- 실제 브라우저에서 학교 목록 → 인천 서부 → 학교 상세·출처, 경기·인천 계산기의 값 변경·최소기간 경고, 로그인 창 열기·Esc 닫기, 비로그인 관리자 접근 차단 확인.
- 로컬 HTTP 회귀 검사 24개 통과. 입력 오류, 통근 seed 캐시, 캐시 없음, 미인증 새 경로 차단, 주소 키 미설정 응답, 공개 집계·학교 목록을 확인. 외부 API를 호출하지 않았다.

의존성 업데이트 당시 전체 `npm run lint`는 기존 코드의 오류로 실패했다. 이후 공개본의 별도 린트 정리에서 오류 43건·경고 21건을 모두 해결했고, 현재 `checks`에는 `eslint --max-warnings=0`도 포함된다. 규칙·가드 기준을 완화하지 않았다. 변경과 검증 범위는 [린트 정리 기록](LINT_CLEANUP.md)을 참고한다.

실제 NAVER 지도 인증·Kakao 주소 검색·NAVER 신규 길찾기·Google OAuth와 로그인 후 저장 동작은 본인 키와 계정으로 별도 확인해야 한다. 지도 키가 없으면 관심목록·별점·마이페이지 UI까지는 검증할 수 없다. 키가 없을 때의 안내와 인증 요구를 실제 외부 연동 성공으로 취급하지 않는다.

빌드는 기존 `middleware` 파일을 향후 `proxy`로 옮기라는 deprecation 경고를 낸다. 이번 보안 패치에서는 동작 변경을 줄이기 위해 해당 구조를 유지했다.
