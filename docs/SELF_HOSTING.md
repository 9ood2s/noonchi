# 별도 설치 운영 설정

## 계정과 키

`.env.example`을 `.env.local`로 복사하고 필요한 서비스마다 본인의 계정으로 값을 발급한다. 자신의 Supabase 프로젝트·API 계정·배포 도메인으로 독립 운영하며, 기존 운영자의 DB·회원·API·배포 연결은 포함되지 않는다. 학교 원자료가 이미 포함되어 있으므로 기존 공개자료로 빌드할 때 `NEIS_API_KEY`·`SCHOOLINFO_API_KEY`는 필요하지 않다. 새 자료를 수집할 때만 사용한다.

| 기능 | 설정 |
|---|---|
| DB·회원·별점·관심목록·학교 화면 빌드 | `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| 조회 기록·통근 캐시 서버 쓰기 | `SUPABASE_SERVICE_ROLE_KEY` (서버 전용) |
| 브라우저 지도 | `NEXT_PUBLIC_NCP_MAPS_CLIENT_ID`·NAVER Maps 허용 웹 서비스 URL |
| 자동차 길찾기·좌표 수집 | `NCP_MAPS_KEY_ID`·`NCP_MAPS_KEY` (서버 전용) |
| 주소 검색 | `KAKAO_REST_KEY` (서버 전용) |
| Google 로그인 | 본인 Google OAuth 앱의 client ID·비밀을 Supabase Auth에 설정 |
| canonical·사이트맵·로그인 복귀·www 정리 | `NEXT_PUBLIC_SITE_URL`을 자신의 HTTPS origin으로 설정 |
| 관련 서비스 링크 | 선택 env URL을 직접 설정한 경우만 표시 |

`SUPABASE_SERVICE_ROLE_KEY`에는 같은 프로젝트의 `service_role` 키 또는 secret key를 넣는다. RLS를 우회하므로 서버에만 둔다. 서버 키나 OAuth 비밀에 `NEXT_PUBLIC_` 접두사를 붙이지 않는다. 지도 스타일 ID 두 값은 선택 항목이며 비우면 NAVER 기본 밝은 지도를 쓴다. `NEXT_PUBLIC_*` 값을 바꾼 뒤에는 다시 빌드·배포한다.

## 새 Supabase 프로젝트

본인 계정에 빈 새 프로젝트를 만든다. [Supabase CLI 설치 안내](https://supabase.com/docs/guides/local-development/cli/getting-started)에 따라 `supabase` 명령을 사용할 수 있게 한 뒤 저장소 루트에서 실행한다. `YOUR_PROJECT_REF`는 새 프로젝트의 reference ID로 바꾼다.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

적용 전에 연결 대상이 본인의 새 프로젝트인지 확인한다. `supabase/migrations`에는 스키마·권한·공개 학교자료가 포함되며 CLI가 순서대로 적용한다. `supabase/seed.sql`은 합성 로컬 시험 자료다. 운영 명령에 `--include-seed`를 추가하지 않는다. [공식 db push 문서](https://supabase.com/docs/reference/cli/supabase-db-push)를 참고한다.

새 프로젝트의 API URL·publishable key·서버 키를 환경변수에 넣는다. 공개본의 `supabase/config.toml`은 로컬 스택 설정이므로 호스팅 프로젝트의 Auth 설정은 다음 단계에서 따로 설정한다.

## Google 로그인

현재 로그인 화면은 Google만 표시한다. 이메일·비밀번호 가입 화면은 제공하지 않는다.

1. 본인 Supabase Auth에서 Anonymous sign-ins와 manual identity linking을 활성화한다. 비회원 입력과 관심학교를 유지한 채 정식 로그인으로 전환하는 데 각각 필요하다.
2. 본인 Google Cloud 프로젝트에서 웹 애플리케이션용 OAuth 클라이언트를 만들고 서비스에 맞는 동의 화면·사용 가능 대상을 설정한다.
3. Google의 Authorized redirect URIs에는 **본인 Supabase 대시보드 Google 설정에 표시되는 callback URL**을 넣는다. 기본 형태는 `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`이다. 직접 custom domain을 설정했다면 대시보드의 주소를 따른다.
4. Google client ID·client secret을 본인 Supabase Auth의 Google 제공자 설정에 넣고 활성화한다. 이 비밀을 Next.js 환경변수에 넣지 않는다.
5. Supabase Auth URL Configuration에서 Site URL을 본인의 `https://example.org`로 설정하고 Redirect URLs에 `https://example.org/auth/callback`을 허용한다. 앱은 복귀 위치를 담은 `?next=...`를 붙인다. 실제 관심학교 화면에서 시작한 로그인도 확인한다.
6. `NEXT_PUBLIC_SITE_URL=https://example.org`로 설정하고 재빌드한다. 로그인 → 학교 저장 → 새로고침 → 로그아웃을 확인한다.

Google에 등록하는 Supabase `/auth/v1/callback`과 Supabase가 앱으로 보내는 `/auth/callback`은 각각 다른 설정란에 등록한다. [공식 Google 연동 안내](https://supabase.com/docs/guides/auth/social-login/auth-google)와 [Redirect URLs 안내](https://supabase.com/docs/guides/auth/redirect-urls)를 참고한다.

### NAVER 로그인은 선택 기능

`components/login-form.tsx`의 `NAVER_LIVE = false`로 숨겨져 있어 키만 넣어서는 켜지지 않는다. 사용하려면 본인 NAVER 로그인 애플리케이션의 서비스 URL·이메일 필수 제공·검수를 준비하고 Supabase에 `custom:naver` 제공자를 만든다. UserInfo URL은 **본인 앱의** `https://example.org/api/auth/naver/userinfo`로 설정한다. callback과 client secret은 본인 Supabase 제공자 설정에 맞춘다. 검수와 실제 로그인을 확인한 뒤 `NAVER_LIVE`를 `true`로 바꾸고 배포한다. 기존 운영자의 로그인 제공자 연결·회원은 옮겨지지 않는다.

## 지도·주소·길찾기

NAVER Maps 콘솔에서 본인 애플리케이션을 만들고 Web Dynamic Map을 활성화한다. 허용 웹 서비스 URL에 실제 사용할 `http://localhost:3000`과 본인 배포 origin을 등록하고 client ID를 `NEXT_PUBLIC_NCP_MAPS_CLIENT_ID`에 넣는다. 지도가 실제로 그려지는지 확인한다. SDK 스크립트가 HTTP 200으로 내려온 것만으로 지도 인증 성공을 판단하지 않는다.

자동차 길찾기에는 Directions 5를 활성화한 본인 API ID·비밀키를 `NCP_MAPS_KEY_ID`·`NCP_MAPS_KEY`에 넣는다. 좌표 수집 스크립트도 같은 변수 이름으로 Geocoding을 사용하므로 새 좌표를 수집할 때 해당 API를 활성화한다. 브라우저 client ID와 서버 비밀키를 혼동하지 않는다.

주소 검색에는 본인 Kakao 개발자 애플리케이션의 **REST API 키**를 `KAKAO_REST_KEY`에 넣는다. JavaScript 키를 대신 넣지 않는다. 이 기능은 서버의 Kakao Local 주소 검색 호출이다.

대중교통 길찾기는 `lib/features.ts`의 `TRANSIT_ON = false`로 비활성화되어 있다. Kakao 키를 넣어도 켜지지 않는다. 재활성화는 해당 API의 이용 가능 여부·사용량 제한을 확인한 별도 개발 작업이다. 각 공급자의 본인 계정에서 사용량과 과금 설정을 관리한다.

## 빌드·배포

본인 DB 마이그레이션과 필요한 키 설정을 마친 뒤 실행한다.

```sh
npm ci
npm run checks
npm run selftest:deployment
npm run build
npm start
```

Vercel 등에서도 같은 변수를 **새 배포 프로젝트**에 설정한다. Vercel은 프로젝트 대시보드나 `vercel env`를 사용할 수 있다. 앱 origin·Supabase Auth 복귀 URL·NAVER Maps 허용 URL을 실제 주소와 맞춘다. 운영·미리보기 환경마다 사용할 DB와 허용 URL을 정한다.

첫 배포에서는 지도 표시, 학교 상세, 손님 관심학교 저장, Google 로그인 후 관심학교 유지, 주소 검색, 자동차 경로 조회, 새로고침 후 유지 여부를 실제 화면에서 확인한다. 외부 API와 OAuth는 발급한 본인 계정으로 확인해야 한다. 테스트 명령 통과만으로 공급자 연결이 확인되는 것은 아니다.

## 로컬 개발

Node.js 22 이상, 실행 중인 Docker, `supabase` 명령이 필요하다. 기존 `supabase/config.toml`이 있으므로 `supabase init`을 다시 할 필요는 없다. README의 `local:up` → `local:reset` → `local:dev` 순서를 따른다. 앱 포트는 3000, 로컬 Supabase API 포트는 55321이며 `local:dev`가 DB 주소·키를 자동 주입한다. 지도·주소·길찾기 키는 본인의 개발용 값을 `.env.local`에 설정한다.

로컬 Auth는 손님 로그인을 활성화하지만 외부 OAuth 제공자를 기본 설정하지 않는다. Google 로그인까지 확인하려면 [공식 local Google 설정](https://supabase.com/docs/guides/auth/social-login/auth-google#local-development)에 따라 본인 제공자를 `supabase/config.toml`에 설정하고 비밀을 CLI의 환경변수로 전달한다. 이 프로젝트의 로컬 Supabase callback은 `http://127.0.0.1:55321/auth/v1/callback`이며, Auth의 허용 복귀 URL에도 `http://localhost:3000/auth/callback`을 추가한다. 호스팅 프로젝트에서만 OAuth를 설정해도 로컬에는 적용되지 않는다. 비밀을 TOML에 직접 적거나 커밋하지 않는다.

`local:reset`은 합성 테스트 사용자를 포함한 로컬 DB 초기화다. 개인 자료가 있다면 먼저 백업하며, 원격 초기화용 `--linked`·`--db-url` 옵션을 추가하지 않는다. `local:dev`의 자동 키 주입은 `build`에는 적용되지 않으므로 로컬 DB로 빌드할 때도 자신의 로컬 URL·공개 키를 별도로 설정한다.

## 학교 원자료 갱신

포함된 공개 학교자료로 설치할 때 `NEIS_API_KEY`·`SCHOOLINFO_API_KEY`는 필요하지 않다. 갱신할 때만 본인 계정으로 키를 발급해 `.env.local`에 넣고 `npm run neis -- 경기`, `npm run schoolinfo -- 경기`, `npm run classes -- 경기`처럼 수집한다. 스크립트는 프로세스 환경변수 → `.env.local` → `.env` 순서로 읽는다. 수집은 작업 복사본의 자료를 갱신하므로 변경 내용을 검토한다.

다른 지역 자료를 수집해도 인사구역·전보 계산 규칙이 자동으로 완성되지는 않는다. 교육청 원문과 `data/source/README.md`, `lib/sido.mjs`, 지역별 판독·매칭 코드를 확인한다.

## 관리자 권한

이 설치에 본인의 **정식 계정으로** 로그인한 뒤 Supabase의 신뢰된 SQL 관리 화면에서 `auth.users.id`를 확인한다. 자신의 UUID로 아래를 실행한다. 공개 API나 프런트엔드에서 실행하지 않는다.

```sql
insert into public.staff (user_id, label)
select id, '운영자'
from auth.users
where id = '<YOUR_AUTH_USER_UUID>'::uuid
  and is_anonymous = false
on conflict (user_id) do update set label = excluded.label;
```

로그아웃·로그인 후 자신의 설치 `/admin` 접근을 확인한다. 특정 이메일을 코드에 넣어 관리자가 되게 하지 않는다. 로컬 seed의 운영자는 합성 테스트 자료이며 실제 운영에 넣지 않는다.

## 기존 설치 업그레이드

공개본은 새 설치에서 기존 소유자 이메일에 관리자 권한을 자동 부여하던 부분을 제거한다. 이미 운영 중인 DB를 되돌리거나 과거 마이그레이션을 재실행하지 않는다. 기존 배포 환경변수를 유지하되 `NEXT_PUBLIC_SITE_URL`을 명시한다. 소스 정리는 공급자에서 키를 폐기하는 작업과 다르다.

운영 데이터(회원·평가·제보·관심목록·통근 출발지·방문 기록)는 소스와 함께 복사하거나 공개하지 않는다. 로컬 개발은 `npm run local:dev`로만 진행한다.
