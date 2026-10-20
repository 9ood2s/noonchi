# 별도 설치 운영 설정

## 계정과 키

`.env.example`을 복사하고 필요한 서비스마다 본인의 계정으로 값을 발급한다. 학교 원자료가 이미 포함되어 있으므로 기존 공개자료로 빌드할 때 `NEIS_API_KEY`·`SCHOOLINFO_API_KEY`는 필요하지 않다. 새 자료를 수집할 때만 사용한다.

| 기능 | 설정 |
|---|---|
| DB·회원·별점·관심목록 | 자신의 Supabase URL·publishable key |
| 조회 기록·통근 캐시 서버 쓰기 | 자신의 Supabase service-role key (서버 전용) |
| 브라우저 지도 | 자신의 NAVER Maps client ID, 허용 웹 서비스 URL |
| 자동차 길찾기·좌표 수집 | 자신의 NAVER Maps API ID·비밀키 |
| 주소 검색·대중교통 보조 | 자신의 Kakao REST key (서버 전용) |
| canonical·사이트맵·로그인 복귀·www 정리 | `NEXT_PUBLIC_SITE_URL`을 자신의 HTTPS origin으로 설정 |
| 관련 서비스 링크 | 선택 env URL을 직접 설정한 경우만 표시 |

Supabase Auth에서 Anonymous sign-ins와 manual identity linking을 활성화한다. 비회원 입력과 비회원→정식 로그인 승격에 각각 필요하다. OAuth 공급자의 클라이언트 ID·비밀은 Supabase Auth 설정에 둔다. Google·NAVER가 요구하는 callback URL, Supabase Site URL·redirect allowlist, NAVER Maps 허용 도메인을 새 설치에 맞춘다. 코드 복사만으로 기존 회원이나 로그인 제공자 연결이 옮겨지지 않는다.

## 관리자 권한

이 설치에 본인 계정으로 로그인한 뒤 Supabase의 신뢰된 SQL 관리 화면에서 사용자 UUID를 확인한다. 자신의 UUID로 아래를 실행한다. 공개 API나 프런트엔드에서 실행하지 않는다.

```sql
insert into public.staff (user_id, label)
select id, '운영자'
from auth.users
where id = '<YOUR_AUTH_USER_UUID>'::uuid
on conflict (user_id) do update set label = excluded.label;
```

특정 이메일을 코드에 넣어 관리자가 되게 하지 않는다. 로컬 seed의 운영자는 합성 테스트 자료이며 실제 운영에 넣지 않는다.

## 기존 설치 업그레이드

공개본은 새 설치에서 기존 소유자 이메일에 관리자 권한을 자동 부여하던 부분을 제거한다. 이미 운영 중인 DB를 되돌리거나 과거 마이그레이션을 재실행하지 않는다. 기존 배포 환경변수를 유지하되 `NEXT_PUBLIC_SITE_URL`을 명시한다. 소스 정리는 공급자에서 키를 폐기하는 작업과 다르다.

운영 데이터(회원·평가·제보·관심목록·통근 출발지·방문 기록)는 소스와 함께 복사하거나 공개하지 않는다. 로컬 개발은 `npm run local:dev`로만 진행한다.
