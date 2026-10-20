# 눈치 (Noonchi)

교사 인사이동을 위한 학교 정보·평가·전보 계산 서비스입니다. 전국 초등학교 목록을 제공하며, 인사구역·계산 규칙은 경기·인천에서 시작합니다. 다른 지역은 해당 교육청의 공식 원문을 확인한 뒤 확장해 주세요.

## 직접 운영하기

Node.js 22 이상이 필요합니다. 로컬 DB는 Docker와 `supabase` 명령을 사용할 수 있는 [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)를 사용합니다. CLI는 `npm ci`에 포함되지 않으므로 먼저 별도로 설치합니다.

```sh
git clone https://github.com/9ood2s/noonchi.git
cd noonchi
npm ci
cp .env.example .env.local
npm run local:up
npm run local:reset
npm run local:dev
```

`local:reset`은 이 프로젝트의 **로컬 DB**를 초기화하고 합성 테스트 자료를 넣습니다. 개인 데이터가 있는 로컬 DB에서는 먼저 백업하세요. `local:down`은 `noonchi-local` 스택만 종료합니다. 기본 API 포트는 55321입니다. `local:dev`는 Supabase CLI에서 현재 로컬 키를 읽고 DB 주소와 사이트 주소를 localhost로 고정합니다. 3000 포트가 사용 중이면 개발 서버 실행을 중단하며, 기존 프로세스를 종료하지 않습니다.

지도는 본인이 발급한 NAVER Maps 클라이언트 ID와 허용 도메인이 필요합니다. 주소 검색은 본인의 Kakao REST 키, 자동차 길찾기는 본인의 NAVER Directions 키가 필요합니다. `.env.example`에는 기존 운영자의 API 키·DB 주소가 들어 있지 않습니다. 설정하지 않은 외부 기능은 사용할 수 없습니다. [개인 계정 연결·설치 안내](docs/SELF_HOSTING.md)에서 기능별 필수 설정과 로그인 연결 순서를 확인하세요.

## 별도 배포

1. 자신의 Supabase 프로젝트에 `supabase/migrations`를 순서대로 적용합니다. `seed.sql`은 로컬 시험용이므로 운영에 넣지 않습니다.
2. `.env.example`의 필요한 항목을 자신의 배포 환경에 설정합니다. `NEXT_PUBLIC_SITE_URL`은 본인의 서비스 주소입니다. 서버 전용 키에 `NEXT_PUBLIC_` 접두사를 붙이지 않습니다.
3. Supabase Auth에서 Anonymous sign-ins와 manual identity linking, Google 로그인 제공자를 활성화하고, 본인의 서비스 `/auth/callback` 주소를 허용합니다. Google의 OAuth 설정에는 **본인 Supabase 프로젝트의** `/auth/v1/callback` 주소를 등록합니다. OAuth 제공자의 클라이언트 비밀은 Supabase에 설정합니다. NAVER 로그인은 기본적으로 숨겨져 있으며 별도 설정이 필요합니다.
4. NAVER Maps·길찾기, Kakao 등은 각각 본인 계정과 도메인으로 발급합니다.
5. 관리자 권한은 [운영 설정](docs/SELF_HOSTING.md)에 따라 직접 부여합니다. 특정 이메일에 권한을 자동으로 주지 않습니다.

Vercel 사용 시 환경변수는 프로젝트 대시보드나 `vercel env`로 설정합니다. 기존 서비스의 배포 연결·환경변수·도메인은 이 소스에 포함되지 않습니다.

`npm run build`에도 자신의 Supabase URL·공개 키와 마이그레이션 적용 DB 설정이 필요합니다. `local:dev`의 자동 키 주입은 `build`에는 적용되지 않습니다. `NEXT_PUBLIC_*` 값을 바꾸면 다시 빌드·배포해야 합니다. NAVER 지도 ID가 없으면 첫 화면 `/map`은 지도 설정 오류를 표시합니다. 무설정 오프라인 실행 모드는 없습니다. 대중교통 길찾기는 기본적으로 비활성화되어 있습니다.

## 지역 확장과 검증

- 원문 배치·적용 학년도: [data/source/README.md](data/source/README.md)
- 설계와 과거 결정: [docs/DESIGN.md](docs/DESIGN.md). 과거 운영 기록은 현재 설정의 근거가 아닙니다.
- 지역별 계산: `lib/transfer.mjs`, `lib/transfer-incheon.mjs`, `docs/rules-*.md`
- 학교 공개 범위: `lib/sido.mjs`, `lib/schools.ts`. 학교 목록을 열어도 계산 규칙이 자동으로 생기지는 않습니다.

```sh
npm run verify
npm run selftest:deployment
```

`verify`의 원문 판독에는 Poppler의 `pdftotext`가 필요합니다. DB·화면 변경은 로컬 Supabase와 실제 화면에서도 확인합니다. 운영 DB를 테스트에 사용하지 않습니다.

## 공개 전 검사

`.env*` 실파일, `.vercel`, 개인 도구 설정, DB 덤프, 사용자 제보·평가·로그를 커밋하지 않습니다. [SECURITY.md](SECURITY.md)의 검사와 공개 절차를 따릅니다. 현재 파일 정리만으로 과거 Git 기록이 지워지지는 않습니다.

## 라이선스

이 프로젝트가 작성한 코드와 문서는 [MIT](LICENSE)입니다. 교육청 원문·공공데이터·외부 라이브러리·외부 서비스 및 브랜드의 권리는 원 권리자에게 있으며, MIT로 재허가하는 대상이 아닙니다. [외부 자료 안내](THIRD_PARTY_NOTICES.md)를 확인하세요.
