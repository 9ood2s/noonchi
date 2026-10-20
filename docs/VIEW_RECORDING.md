# 조회수 기록 권한과 검증

확인일: 2026-10-20. 공개본을 새로 설치하면 `/api/view`가 HTTP 200이어도 `{ok:false, error:"permission denied for table school_views"}`를 반환하던 문제를 해결했다. 기존 운영 서비스와 비공개 저장소에는 적용하지 않았다.

## 수정

서버 역할의 RLS 우회 권한은 테이블 접근 권한을 대신하지 않는다. 기존 55개 마이그레이션에는 `school_views`의 서버 역할 GRANT가 빠져 있었다.

새 [마이그레이션](../supabase/migrations/20261020000000_school_views_service_grants.sql)은 `service_role`에 `SELECT, INSERT`를 명시한다. `/api/view`는 `ignoreDuplicates: true`, 즉 `ON CONFLICT DO NOTHING`으로 기록하므로 UPDATE 권한은 추가하지 않는다. 충돌 키의 SELECT도 필요하다. [PostgreSQL 공식 INSERT 권한 설명](https://www.postgresql.org/docs/17/sql-insert.html)을 참고한다.

`PUBLIC`, `anon`, `authenticated`의 원시 테이블 권한은 회수한다. 기존 무정책 RLS와 `school_views_today`의 집계 읽기 권한은 유지한다. 외부에는 학교 코드·오늘 인원만 제공하고 방문자 식별값은 공개하지 않는다. 기존 설치에서 서버 역할에 따로 부여한 권한은 축소하지 않는다.

과거 마이그레이션·API·쿠키·기본키·집계 캐시·기록 데이터·의존성은 변경하지 않았다. 서버 역할에 UPDATE·DELETE 등 추가 연산을 허용하거나 브라우저에 서버 키를 전달할 필요가 없다.

## 본인 설치에 적용

새 설치는 README 절차대로 모든 마이그레이션을 적용하면 된다. 별도 수동 GRANT는 필요 없다. `SUPABASE_SERVICE_ROLE_KEY`는 같은 DB 프로젝트의 서버 전용 키를 사용한다. `local:dev`에서는 현재 로컬 스택 키가 자동 주입된다.

이미 공개본을 설치한 본인 로컬 DB는 데이터 초기화 없이 다음 새 마이그레이션만 적용한다.

```sh
supabase migration up --local
```

본인 클라우드 설치는 연결된 프로젝트를 확인한 뒤 `supabase db push --dry-run` → `supabase db push`로 미적용 마이그레이션을 추가한다. 과거 파일을 재실행하거나 운영 데이터에 `db reset`·시험 seed를 적용하지 않는다. [프로젝트 연결 안내](SELF_HOSTING.md#새-supabase-프로젝트)를 참고한다.

## 검증 방법

자신의 격리 로컬 DB에서 [pgTAP 회귀 검사](../supabase/tests/school_views_permissions.test.sql)를 실행할 수 있다. 시험 기록과 역할 전환은 한 트랜잭션에서 수행하고 마지막에 롤백한다. [Supabase DB 테스트 안내](https://supabase.com/docs/guides/database/testing)를 참고한다.

```sh
supabase test db
```

앱 서버도 실행해 `POST /api/view`에 `{"stdCode":"7361023"}`을 보내고 응답의 `ok:true`를 확인한다. HTTP 200만으로 성공을 판단하지 않는다. 같은 `nv` 쿠키를 재사용하면 서울 기준 같은 날 같은 학교는 한 번만 기록된다. 다른 브라우저는 추가로 집계되고, 같은 브라우저도 다른 학교에는 별도로 기록된다.

`school_views_today`에서 집계값을 확인할 수 있다. `/map/views`는 기존처럼 120초 캐시가 있으므로 기록 직후 API 집계 응답이 늦게 반영될 수 있다. 지도 말풍선 배지는 조회수가 아니라 관심학교 수다.

## 이번 확인 결과

공개본 별도 clone과 새 로컬 Supabase 프로젝트만 사용했다. 개인 API 키·기존 DB·회원 데이터는 사용하지 않았다.

- 기존 55개 마이그레이션 상태에서 실제 PostgREST 기록 요청의 권한 오류를 재현했다.
- 합성 기존 기록이 있는 상태에서 56번째 마이그레이션만 추가해 기록·중복 처리 성공, 기존 행과 생성 시각 보존, 마이그레이션 재실행을 확인했다.
- 격리 DB를 비운 뒤 56개 마이그레이션과 합성 seed를 처음부터 적용해 새 설치를 검증했다.
- 업그레이드·새 설치에서 pgTAP 33개 검사, 서버 기록·공개 접근 권한 HTTP 검사 16개를 각각 통과했다.
- 새 설치의 프로덕션 앱 API에서 HTTP 쿠키 세션으로 검사 14개를 통과했다. 최초 기록·쿠키 속성·동일 쿠키 재방문·8개 병렬 중복·다른 방문자·다른 학교·서울 날짜·실제 행/집계 정합성·잘못된 입력 차단을 확인했다.
- 새 `npm ci`와 `npm run checks`를 통과했다. 린트 오류·경고 0건, 기존 셀프체크 109개·가드 4종·배포 설정 검사 5개를 통과했다. 프로덕션 빌드·TypeScript 검사와 정적 페이지 6,461개 생성도 성공했다.

권한 HTTP 검사에는 공개 키와 로컬 Auth에서 발급한 실제 `authenticated` 토큰을 사용했다. 두 역할 모두 원시 SELECT·INSERT·UPDATE·DELETE는 거절되고 집계만 읽을 수 있었다. 새 설치의 서버 UPDATE·DELETE도 거절됐다. UI·외부 지도·OAuth 제공자 연결을 바꾸거나 새로 검증한 작업은 아니다.
