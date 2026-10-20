# 눈치 (Noonchi)

교사 인사이동을 위한 학교 정보·평가·전보 계산 서비스입니다. 전국 초등학교 목록을 제공하며, 인사구역·계산 규칙은 경기·인천에서 시작합니다. 다른 지역은 해당 교육청의 공식 원문을 확인한 뒤 확장해 주세요.

각 설치는 **본인의 DB·API 계정·도메인**을 사용합니다. 기존 운영자의 키나 회원 데이터는 제공하지 않습니다.

## 시작 방식 고르기

| 목적 | DB·계정 준비 | 실행 명령 |
|---|---|---|
| 내 컴퓨터에서 먼저 확인 | Docker와 Supabase CLI. 클라우드 Supabase 가입·키 발급은 불필요 | `npm run local:dev` |
| 본인 클라우드 DB로 개발·배포 | 새 Supabase 프로젝트·본인의 API 키·로그인 제공자 설정 | 개발은 `npm run dev`, 배포는 `npm run build` → `npm start` |

`local:dev`는 DB 주소·키를 현재 로컬 스택의 값으로 자동 주입합니다. `.env.local`에 클라우드 DB 값을 넣어도 이 명령은 **로컬 DB를 사용**합니다. 지도·주소·길찾기 키는 별도로 본인의 값을 설정해야 합니다.

**네트워크에 공개하기 전:** 2026-10-20 새 복제본의 `npm ci`·`npm audit`에서 보안 권고 10건(high 8, critical 2)이 확인됐습니다. Next.js 등 실행 시 사용하는 의존성도 포함됩니다. 설치·로컬 실행 성공과 보안 업데이트 완료는 별개입니다. 공개 운영 전 `npm audit` 결과에 따라 의존성을 업데이트하고 재검증해야 합니다. 이번 설치 안내 보완에서는 패키지 버전을 변경하지 않았습니다. [Next.js 공식 보안 권고](https://github.com/vercel/next.js/security/advisories)를 참고하세요.

## 로컬에서 처음 실행하기

### 1. 필요한 프로그램 확인

Git, Node.js **22 이상**, npm, 실행 중인 Docker, PATH에서 실행되는 [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)가 필요합니다.

```sh
git --version
node --version
npm --version
docker info
supabase --version
```

`npm ci`에는 Supabase CLI가 포함되지 않습니다. `supabase` 명령을 찾지 못하면 CLI 설치를 먼저 마치세요. `docker info`가 서버 연결 오류를 내면 Docker를 시작합니다. 아래 명령은 macOS·Linux·WSL 터미널 기준입니다.

### 2. 복제·의존성 설치·환경 파일 복사

```sh
git clone https://github.com/9ood2s/noonchi.git
cd noonchi
npm ci
cp .env.example .env.local
```

Windows PowerShell에서는 마지막 줄을 `Copy-Item .env.example .env.local`로 실행할 수 있습니다. `.env.local`은 Git에서 제외됩니다.

### 3. 자신의 지도 키 입력

지도까지 보려면 **서버를 실행하기 전에** `.env.local`을 편집합니다.

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_NCP_MAPS_CLIENT_ID=YOUR_NAVER_MAPS_CLIENT_ID
```

`YOUR_NAVER_MAPS_CLIENT_ID`를 NAVER Maps의 **본인 애플리케이션 client ID**로 바꿉니다. 해당 애플리케이션에서 **Web Dynamic Map**을 활성화하고 허용 웹 서비스 URL에 `http://localhost:3000`을 등록합니다. 서버 비밀키 `NCP_MAPS_KEY`를 이 칸에 넣지 않습니다. 지도 스타일 ID는 선택 사항이므로 처음에는 비워 두세요.

외부 키 없이 먼저 설치만 확인할 때는 지도 키도 비워 둡니다. 로컬 DB를 사용하는 이 단계에서는 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SERVICE_ROLE_KEY` 세 값도 비워 둘 수 있습니다.

### 4. 로컬 DB와 개발 서버 실행

```sh
npm run local:up
npm run local:dev
```

첫 `local:up`은 마이그레이션과 **합성 테스트 사용자·평가가 담긴 seed**를 자동 적용합니다. 첫 기동에는 `local:reset`을 따로 실행할 필요가 없습니다. 이미지 다운로드·DB 준비가 끝나 명령이 성공한 다음 `local:dev`를 실행합니다.

접속 주소는 **http://localhost:3000**입니다. 기본 로컬 Supabase API는 `http://127.0.0.1:55321`입니다. 지도 허용 URL과 일치하도록 브라우저에서는 `localhost:3000`을 사용합니다.

- 지도 키 설정 완료: `http://localhost:3000/map`에서 실제 지도와 학교가 표시되는지 확인합니다.
- 지도 키 미설정: 첫 화면에 「지도를 띄울 수 없습니다 / 네이버 지도 키가 없습니다」가 표시됩니다. 이때도 [학교 목록](http://localhost:3000/school)·[계산기](http://localhost:3000/calc)를 직접 열어 DB와 화면 기동을 확인할 수 있습니다.
- 기본 로컬 설정은 손님 로그인을 지원합니다. Google 로그인은 아래 추가 설정을 마쳐야 사용할 수 있습니다.

`local:dev`는 3000 포트가 사용 중이면 중단하고 기존 프로세스를 종료하지 않습니다. DB에 테스트 seed가 없다는 안내가 나올 때만, 보존할 로컬 데이터가 없는지 확인한 뒤 `npm run local:reset`을 실행합니다. 이 명령은 **로컬 DB를 초기화**합니다.

종료할 때 개발 서버 터미널에서 `Ctrl+C`를 누른 다음 `npm run local:down`을 실행합니다. 이 명령은 `noonchi-local` 스택만 종료합니다.

## 기능별로 추가할 본인 API 설정

| 기능 | 본인 설정 | 추가 조건 |
|---|---|---|
| 지도 표시 | `NEXT_PUBLIC_NCP_MAPS_CLIENT_ID` | NAVER Web Dynamic Map 활성화·허용 URL 등록 |
| 집 주소 검색 | `KAKAO_REST_KEY` | Kakao **Local REST API 키**. JavaScript 키가 아님 |
| 새 자동차 경로 조회 | `NCP_MAPS_KEY_ID`·`NCP_MAPS_KEY` | NAVER Directions 5 활성화 + **정식 로그인** 필요. 손님은 새 경로 조회 불가 |
| 조회 기록·통근 캐시·길찾기 사용량 제한 | `SUPABASE_SERVICE_ROLE_KEY` | 같은 DB 프로젝트의 서버 키. 로컬에서는 자동 주입, 클라우드에서는 직접 설정 |
| Google 로그인 | 본인 Google OAuth 클라이언트와 Supabase Auth | 클라이언트 비밀은 Supabase Auth 설정에 보관 |
| 학교 자료 갱신 | `NEIS_API_KEY`·`SCHOOLINFO_API_KEY` | 포함된 학교 자료로 처음 실행할 때는 불필요 |

서버 전용 키에 `NEXT_PUBLIC_`을 붙이지 않습니다. 클라우드에서 자동차 길찾기를 운영할 때는 서버 키도 함께 설정하세요. 코드의 주간 사용량 제한·캐시 쓰기에 사용되며, 서버 키가 없으면 사용량 제한 검사를 수행하지 않습니다. 공급자 콘솔의 이용량·과금 설정도 본인 계정에서 확인합니다.

환경변수를 바꾼 뒤에는 개발 서버를 다시 시작합니다. 배포된 `NEXT_PUBLIC_*` 값은 빌드에 포함되므로 다시 빌드·배포해야 반영됩니다. NAVER 로그인·대중교통 길찾기는 현재 기본 비활성 상태이며, 키만 넣어서는 켜지지 않습니다.

### 로컬 Google 로그인까지 확인하려면

클라우드 Supabase 대시보드에서 Google을 켜도 Docker의 로컬 Auth에는 적용되지 않습니다. [로컬 Google 설정 안내](docs/SELF_HOSTING.md#로컬-개발)와 [Supabase 공식 예시](https://supabase.com/docs/guides/auth/social-login/auth-google#local-development)에 따라 `supabase/config.toml`에 본인 Google 제공자를 설정하고, client secret은 TOML에 직접 적지 말고 CLI 실행 환경변수로 전달합니다. Next.js의 `.env.local` 편집만으로 제공자가 활성화되지는 않습니다.

| 설정 위치 | 기본 로컬 주소 |
|---|---|
| Google Authorized JavaScript origins | `http://localhost:3000` |
| Google Authorized redirect URIs | `http://127.0.0.1:55321/auth/v1/callback` |
| 로컬 Supabase Auth의 허용 앱 복귀 URL | `http://localhost:3000/auth/callback` |

이 프로젝트는 Supabase 기본 포트 54321 대신 **55321**을 사용합니다. Google의 테스트 모드에서는 로그인할 본인 Google 계정도 테스트 사용자로 허용해야 합니다. 설정 후 **이 프로젝트의** 로컬 스택을 재시작해 반영하고, 손님 관심학교가 Google 로그인 후에도 유지되는지 확인합니다.

## 본인 클라우드 DB로 실행·배포하기

1. 본인 계정에 **빈 새 Supabase 프로젝트**를 만들고, [설치 안내](docs/SELF_HOSTING.md#새-supabase-프로젝트)의 `link` → `db push --dry-run` → `db push` 순서로 마이그레이션을 적용합니다. 로컬 시험용 `seed.sql`을 운영에 넣는 `--include-seed` 옵션은 사용하지 않습니다.
2. `.env.local` 또는 새 배포 프로젝트에 같은 프로젝트의 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`·`SUPABASE_SERVICE_ROLE_KEY`를 설정합니다. 필요한 지도·주소·길찾기 키도 본인 값을 넣습니다.
3. Supabase Auth에서 Anonymous sign-ins·manual identity linking·Google 제공자를 활성화합니다. Google의 redirect URI는 **본인 Supabase 프로젝트의** `/auth/v1/callback`, Supabase의 앱 복귀 주소는 **본인 앱의** `/auth/callback`입니다. [Google 설정 절차](docs/SELF_HOSTING.md#google-로그인)를 따릅니다.
4. `NEXT_PUBLIC_SITE_URL`, Supabase Site URL·허용 복귀 URL, NAVER Maps 허용 URL을 실제 접속 주소와 맞춥니다. 본인 클라우드 DB를 보며 로컬에서 개발할 때는 앱 주소를 `http://localhost:3000`으로 두고 `npm run dev`를 사용합니다.
5. 공개 배포 전 의존성 보안 권고를 해결·검증하고, 아래 빌드와 실제 화면 확인을 진행합니다.

```sh
npm run checks
npm run selftest:deployment
npm run build
npm start
```

Vercel 등에는 **별도 새 배포 프로젝트**를 만들고 본인 환경변수를 설정합니다. 기존 운영 서비스의 배포 연결은 포함되지 않습니다. Google 로그인·주소 검색·새 자동차 경로·새로고침 후 관심학교 유지·[관리자 권한 부여](docs/SELF_HOSTING.md#관리자-권한)를 본인 계정으로 확인하세요.

`build`·`verify`에는 `local:dev`의 키 자동 주입이 적용되지 않습니다. 로컬 DB로 빌드하려면 `supabase status`에서 **본인 로컬 스택의** API URL·공개 키·서버 키를 확인해 `.env.local`의 해당 세 변수에 직접 설정한 뒤 실행합니다. 실제 키가 포함된 터미널 출력·환경 파일을 이슈나 PR에 붙이지 마세요.

## 설치 중 막히는 경우

| 증상 | 먼저 확인할 것 |
|---|---|
| `supabase: command not found` | CLI 별도 설치 후 `supabase --version`이 동작하는지 확인 |
| Docker daemon 연결 실패 | Docker 실행 여부와 `docker info` 확인 |
| 3000·5532x 포트 충돌 | 이 프로젝트와 다른 로컬 스택의 사용 포트 확인. 다른 서비스를 임의로 종료하지 않음 |
| 지도 키 없음·지도 인증 실패 | 본인 client ID·Web Dynamic Map·`http://localhost:3000` 허용 URL·서버 재시작 확인. SDK HTTP 200만으로 인증 성공을 판단하지 않음 |
| `NEXT_PUBLIC_SUPABASE_…가 없다` | `build`·`verify`·`dev`에 DB 환경변수를 직접 설정했는지 확인. 자동 주입은 `local:dev`에만 적용 |
| Google provider disabled·redirect mismatch | 사용하는 DB가 로컬/클라우드 중 어느 쪽인지 확인하고 해당 Auth 제공자·두 callback 주소 설정 |
| 경로 열쇠 없음·로그인 필요 | Directions 키와 정식 로그인 확인. Kakao 키만으로 자동차 길찾기는 동작하지 않음 |

`npm ci`의 peer 경고와 실제 설치 실패는 종료 코드로 구분하되, 보안 권고는 별도로 `npm audit`에서 확인합니다. `npm audit fix --force`는 호환되지 않는 버전 변경도 할 수 있으므로 권고 내용을 확인하지 않고 실행하지 않습니다.

## 지역 확장과 검증

- 원문 배치·적용 학년도: [data/source/README.md](data/source/README.md)
- 설계와 과거 결정: [docs/DESIGN.md](docs/DESIGN.md). 과거 운영 기록은 현재 설정의 근거가 아닙니다.
- 지역별 계산: `lib/transfer.mjs`, `lib/transfer-incheon.mjs`, `docs/rules-*.md`
- 학교 공개 범위: `lib/sido.mjs`, `lib/schools.ts`. 학교 목록을 열어도 계산 규칙이 자동으로 생기지는 않습니다.

`npm run checks`·`npm run selftest:deployment`로 코드 검사를 실행합니다. 원문 판독까지 포함한 `npm run verify`에는 Poppler의 `pdftotext`와 빌드용 DB 설정이 추가로 필요합니다. 테스트 명령 통과는 외부 API 인증 성공을 뜻하지 않으므로 실제 지도·로그인·경로도 확인합니다.

## 공개 전 검사

`.env*` 실파일, `.vercel`, 개인 도구 설정, DB 덤프, 사용자 제보·평가·로그를 커밋하지 않습니다. [SECURITY.md](SECURITY.md)의 검사와 공개 절차를 따릅니다. 현재 파일 정리만으로 과거 Git 기록이 지워지지는 않습니다.

## 라이선스

이 프로젝트가 작성한 코드와 문서는 [MIT](LICENSE)입니다. 교육청 원문·공공데이터·외부 라이브러리·외부 서비스 및 브랜드의 권리는 원 권리자에게 있으며, MIT로 재허가하는 대상이 아닙니다. [외부 자료 안내](THIRD_PARTY_NOTICES.md)를 확인하세요.
