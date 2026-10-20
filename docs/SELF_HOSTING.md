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

조회수 기록에는 `20261020000000_school_views_service_grants.sql`도 필요하다. 이 마이그레이션은 서버 역할에 조회·삽입 권한을 명시하고 원시 기록의 브라우저 접근은 차단한다. 기존 공개본 설치를 갱신할 때는 본인 DB에 새 마이그레이션만 추가 적용한다. 데이터 초기화는 필요 없다. [적용·회귀 검사 안내](VIEW_RECORDING.md)를 참고한다.

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
npm audit
npm audit --omit=dev
npm ls
npm run checks
npm run selftest:deployment
npm run build
npm start
```

Vercel 등에서도 같은 변수를 **새 배포 프로젝트**에 설정한다. Vercel은 프로젝트 대시보드나 `vercel env`를 사용할 수 있다. 앱 origin·Supabase Auth 복귀 URL·NAVER Maps 허용 URL을 실제 주소와 맞춘다. 운영·미리보기 환경마다 사용할 DB와 허용 URL을 정한다.

첫 배포에서는 지도 표시, 학교 상세, 손님 관심학교 저장, Google 로그인 후 관심학교 유지, 주소 검색, 자동차 경로 조회, 새로고침 후 유지 여부를 실제 화면에서 확인한다. 외부 API와 OAuth는 발급한 본인 계정으로 확인해야 한다. 테스트 명령 통과만으로 공급자 연결이 확인되는 것은 아니다.

## Vercel 없이 배포

Vercel 계정·CLI·배포 프로젝트는 필수가 아니다. 현재 `build`·`start`는 표준 Next.js 명령이며 Vercel 전용 SDK·Blob·DB를 사용하지 않는다. [Next.js 공식 Node.js 배포 안내](https://nextjs.org/docs/app/getting-started/deploying#nodejs-server)의 방식으로 본인 VPS·학교 서버·Node.js 실행을 지원하는 호스트에서 운영할 수 있다.

1. Node.js 22 이상과 npm이 있는 **본인의 별도 서버**에 이 공개 저장소를 복제한다. DB는 본인 Supabase Cloud 또는 아래 자체 호스팅 Supabase를 먼저 준비한다.
2. 저장소 루트에 `.env.local`을 만들거나 호스트의 비밀 환경변수 기능을 사용한다. `NEXT_PUBLIC_SITE_URL`은 본인 실제 HTTPS origin, DB URL·키는 본인 DB로 설정한다. 빌드 중 학교 페이지가 DB를 읽으므로 빌드 서버에서도 DB API에 접근할 수 있어야 한다.
3. 아래 명령으로 설치·검사·빌드한 뒤 서버를 실행한다. `127.0.0.1` 바인딩은 같은 머신의 프록시 뒤에서 운영하는 예다.

```sh
npm ci
npm audit
npm audit --omit=dev
npm ls
npm run checks
npm run selftest:deployment
npm run build
npm start -- --hostname 127.0.0.1 --port 3000
```

4. nginx·Caddy 등의 리버스 프록시에서 본인 HTTPS 도메인을 `127.0.0.1:3000`에 연결한다. 원래 Host·전달 프로토콜이 앱에 전달되도록 설정하고, 프로세스는 systemd 또는 호스트의 서비스 관리 기능으로 재기동되게 한다. [공식 자체 호스팅 안내](https://nextjs.org/docs/app/guides/self-hosting#reverse-proxy)를 따른다. 이 저장소에는 프록시·TLS 인증서·서비스 관리자 설정이 포함되어 있지 않다.
5. 앱 origin·DB Auth 허용 복귀 URL·Google callback·지도 허용 URL을 실제 도메인에 맞춘 뒤 실제 화면에서 로그인·저장·파일·경로를 확인한다. `VERCEL_URL`을 흉내 내어 설정할 필요는 없다. `NEXT_PUBLIC_SITE_URL`을 명시하면 된다.

업데이트할 때는 새 릴리스 디렉터리에서 같은 환경변수로 설치·빌드한 다음 서비스 관리자로 교체한다. `NEXT_PUBLIC_*`를 바꾸면 재빌드가 필요하다. 컨테이너 호스트에서도 Node 서버 방식으로 배포할 수 있지만, 현재 저장소에 앱용 Dockerfile이나 `output: "standalone"` 설정은 없으므로 해당 구성은 직접 추가·검증해야 한다.

GitHub Pages·S3 같은 정적 파일 호스팅으로 전체 앱을 그대로 옮길 수는 없다. 이 앱은 Route Handlers·쿠키 세션·OAuth callback·서버에서 보호하는 키를 사용한다. `output: "export"`를 추가하는 것만으로 이 기능들이 대체되지 않는다. 여러 앱 인스턴스로 확장할 때의 공유 캐시·배포 버전 조정도 위 Next.js 자체 호스팅 문서를 따른다.

## Supabase Cloud 없이 자체 운영

관리형 Supabase 가입 없이도 오픈소스 Supabase를 본인 서버에서 운영할 수 있다. **Supabase 자체를 사용하지 않는 구성과는 다르다.** `npm run local:up`의 CLI 스택은 개발·시험용이며, 그 포트를 그대로 외부에 공개해 운영하지 않는다. [공식 설명](https://supabase.com/docs/guides/self-hosting#not-the-same-as-local-development)을 참고한다.

1. 이 저장소와 분리된 운영 디렉터리에 [공식 Docker Compose 설치 절차](https://supabase.com/docs/guides/self-hosting/docker)로 새 Supabase 인스턴스를 준비한다. 이 저장소는 해당 운영 Compose 구성을 제공하지 않는다. API gateway·PostgREST·Auth·PostgreSQL·Storage가 필요하며, 본인이 키 생성·HTTPS·백업·복구·업데이트를 관리한다. 공식 예제의 비밀값을 그대로 쓰지 않는다.
2. [공식 HTTPS·URL 설정](https://supabase.com/docs/guides/self-hosting/self-hosted-proxy-https#step-1-update-environment-variables)에 따라 앱과 DB API 주소를 나눈다. 아래 주소는 예약된 예시 도메인이므로 본인 주소로 교체한다.

| 설정 위치 | 예시 |
|---|---|
| Supabase 서버 `SUPABASE_PUBLIC_URL` | `https://api.example.org` |
| Supabase 서버 `API_EXTERNAL_URL` | `https://api.example.org/auth/v1` |
| Supabase 서버 `SITE_URL` | `https://app.example.org` |
| 앱 `NEXT_PUBLIC_SITE_URL` | `https://app.example.org` |
| 앱 `NEXT_PUBLIC_SUPABASE_URL` | `https://api.example.org` — PostgreSQL 접속 문자열이 아님 |
| 앱 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 자체 서버의 publishable key 또는 호환되는 anon key |
| 앱 서버 `SUPABASE_SERVICE_ROLE_KEY` | 같은 서버의 secret 또는 service_role key |

브라우저와 빌드·실행 서버가 모두 API URL에 접근할 수 있어야 한다. 앱 환경변수에 Docker 내부 서비스 이름이나 PostgreSQL URL을 넣지 않는다. Supabase 서버 비밀 파일과 앱 비밀 파일은 각각 관리한다.

3. Supabase 기본 `auth`·`storage` 스키마와 서비스 준비가 끝난 **새 DB**에 이 저장소의 마이그레이션을 적용한다. `NOONCHI_SELF_HOST_DB_URL`은 본인의 비밀 관리 기능이나 터미널 환경에 설정한 새 DB 접속 문자열이다. 비밀번호 등은 URL 인코딩한다. 여기서는 Cloud 로그인·`supabase link`가 필요하지 않다.

```sh
supabase db push --db-url "$NOONCHI_SELF_HOST_DB_URL" --dry-run
supabase db push --db-url "$NOONCHI_SELF_HOST_DB_URL"
```

이 명령은 해당 DB를 변경하므로 주소와 dry-run 결과를 확인한다. 운영에는 합성 사용자·평가 seed를 넣는 `--include-seed`를 추가하지 않는다. [공식 db push 문서](https://supabase.com/docs/reference/cli/supabase-db-push)를 따른다.

4. [자체 호스팅 OAuth 안내](https://supabase.com/docs/guides/self-hosting/self-hosted-oauth)에 따라 Google 제공자를 Auth 컨테이너에 설정한다. 관리형 대시보드 설정을 바꾸는 방식과 다르다. 손님 계정을 위해 `ENABLE_ANONYMOUS_USERS=true`, 정식 로그인으로 연결하려면 Auth 환경의 `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: "true"`가 필요하다. 새 변수를 `.env`에 적기만 하지 말고 Compose의 `auth.environment`에 실제 전달한다. 제공자·비밀 변경 뒤 Auth 서비스를 재생성해 반영한다. [identity linking 설명](https://supabase.com/docs/guides/auth/auth-identity-linking)을 참고한다.
5. Google에는 `https://api.example.org/auth/v1/callback`, Supabase Auth 허용 복귀 주소에는 `https://app.example.org/auth/callback`을 등록한다. 앱은 위의 Vercel 없는 Node 서버 방식으로 배포할 수 있다. 지도·주소·경로 키는 계속 본인 값을 사용한다.

이 저장소에서 실행 검증한 DB 경로는 CLI의 격리된 로컬 스택이다. 운영용 자체 호스팅 Compose 설치·실제 Google OAuth를 검증 완료한 배포 템플릿으로 제공하는 것은 아니다. 첫 운영 전에는 빈 DB 마이그레이션, 손님 관심학교 → Google 계정 연결 → 새로고침, 제보 첨부의 본인·관리자 권한, 통근 사용량 제한과 백업 복구를 본인 설치에서 확인한다.

## Supabase를 완전히 제외하려면

현재 일반 PostgreSQL·다른 인증·다른 파일 저장소용 어댑터는 구현되어 있지 않다. `NEXT_PUBLIC_SUPABASE_URL`을 PostgreSQL 주소로 바꾸거나 SDK만 삭제해서는 동작하지 않는다. 다음은 **설치 옵션이 아닌 별도 개발 범위**다.

| 영역 | 현재 접점 | 대체 작업 |
|---|---|---|
| 공개 자료·집계·학교 페이지 빌드 | `lib/supabase.ts`, `lib/schools.ts`, `lib/ratings.ts`, `app/map/*` | SDK의 HTTP 쿼리를 본인 서버의 데이터 접근 계층·API로 교체 |
| 로그인·세션 | `lib/auth/*`, `middleware.ts`, `app/auth/callback/route.ts` | 손님 계정, Google OAuth, 익명 계정 연결, 쿠키 갱신·로그아웃을 함께 구현 |
| 관심목록·평가·프로필·저장 경로 | 브라우저 SDK 호출과 DB RLS | 인증된 자체 API와 소유권 검사로 교체. 클라이언트에서 DB 관리자 키 사용 금지 |
| SQL 권한·업무 규칙 | `supabase/migrations`의 `auth.users`, `auth.uid()`, `auth.jwt()`, RLS·트리거·RPC | 사용자 ID·권한 모델에 맞게 외래키·정책·함수·집계를 이식 |
| 비공개 제보 첨부 | `components/report-dialog.tsx`, `storage.objects` 정책 | 업로드·삭제·서명 다운로드·본인/관리자 권한·25MB 제한을 다른 저장소에 구현 |

`claim_commute`의 원자적 사용량 제한과 `set_home_school`·`clear_home_school`·`nickname_check` RPC도 유지·대체해야 한다. 본인 데이터만 접근할 수 있다는 권한 검증을 서버에서 재현해야 한다. 현재 앱에는 Supabase Realtime 구독이나 Edge Functions 호출이 없으므로 해당 런타임의 별도 대체부터 시작할 필요는 없다.

DB 없이 계산 규칙만 필요하다면 `lib/transfer.mjs`·`lib/transfer-incheon.mjs`·`lib/commute.mjs`를 본인 앱에 재사용할 수 있다. `npm ci` 후 `npm run selftest`로 DB 연결 없이 계산·통근 계산 테스트를 실행한다. 전체 웹앱의 DB 없는 실행 모드는 제공하지 않는다.

## 로컬 개발

Node.js 22 이상, 실행 중인 Docker, `supabase` 명령이 필요하다. 기존 `supabase/config.toml`이 있으므로 `supabase init`을 다시 할 필요는 없다. README의 `local:up` → `local:dev` 순서를 따른다. 첫 기동에는 마이그레이션과 seed가 자동 적용되므로 `local:reset`은 필요하지 않다. 앱 포트는 3000, 로컬 Supabase API 포트는 55321이며 `local:dev`가 DB 주소·키를 자동 주입한다. 지도·주소·길찾기 키는 본인의 개발용 값을 `.env.local`에 설정한다.

로컬 Auth는 손님 로그인을 활성화하지만 외부 OAuth 제공자를 기본 설정하지 않는다. Google 로그인까지 확인하려면 [공식 local Google 설정](https://supabase.com/docs/guides/auth/social-login/auth-google#local-development)에 따라 본인 제공자를 `supabase/config.toml`에 설정하고 비밀을 CLI의 환경변수로 전달한다. 이 프로젝트의 로컬 Supabase callback은 `http://127.0.0.1:55321/auth/v1/callback`이며, Auth의 허용 복귀 URL에도 `http://localhost:3000/auth/callback`을 추가한다. 호스팅 프로젝트에서만 OAuth를 설정해도 로컬에는 적용되지 않는다. 비밀을 TOML에 직접 적거나 커밋하지 않는다.

`local:reset`은 합성 테스트 사용자를 포함한 로컬 DB 초기화다. 개인 자료가 있다면 먼저 백업하며, 원격 초기화용 `--linked`·`--db-url` 옵션을 추가하지 않는다. `local:dev`의 자동 키 주입은 `build`에는 적용되지 않으므로 로컬 DB로 빌드할 때도 자신의 로컬 URL·공개 키·서버 키를 별도로 설정한다.

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
