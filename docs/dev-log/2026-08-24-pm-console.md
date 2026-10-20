# 2026-08-24 — 운영 화면 `/admin`

사장님 — 「noonchischool.com의 **사용자 패턴과 방문자수, 활동내역, 신규가입자** 등을 보고
고객 패턴을 연구할 수 있는 **pm용 관리 페이지**를 만들어라. 기존에 개발자 계정에서 받던
**제안 사항을 이 페이지에서** 받아볼 수 있도록 공간을 만들어라.」

범위 밖으로 못박으신 것 — 「기존의 원본소스와 데이터 자체는 수정하지 않는다.
**새로운 패키지도 설치하지 않는다.** 사용자 합계나 도식화 등에 필요한 경우 pm에게 제안과 대안,
사유 등을 상세히 보고하고 **confirm 을 획득한 후에** 작업을 진행한다.」

## 0. 시작할 때 정리한 것 (git)

세션을 열었더니 상태가 어긋나 있었다. **작업 전에 멈추고 보고했다**(CLAUDE.md §10).

| | |
|---|---|
| 로컬 `main` | `c4c4f85` — `origin/main`(`7773b86`)보다 **10 커밋 뒤** |
| 미커밋 | `components/map/panel-views.tsx` · `lib/home-school.ts` — 비로그인 소속교 오류 막기 |
| 워크트리 | `.claude/worktrees/run-away-2` (브랜치 `worktree-run-away-2`) — 다 밀고 깨끗 |

⛔ **뒤처진 까닭** — 그 10 커밋을 워크트리에서 만들어 밀었는데 로컬 `main` 이 안 당겨왔다.

건드리기 전에 **3-way 시험만** 돌려 봤다(`git stash create` + `git merge-tree`) —
`panel-views.tsx` 는 저절로 합쳐지고 `lib/home-school.ts` 만 충돌 하나. 사장님 확인 뒤
당기고 충돌을 풀었다(`clearHomeSchool` 과 새 `readable()` 을 **둘 다** 남긴다).

⛔ **`readable()` 을 쓰는 문 둘에 다 붙였다**(§11-3). `saveHomeSchool` 만 고치면
「소속교 지우기」에서 `permission denied` 가 영어 그대로 뜬다 — 같은 결함을 한 곳만 고치지 않는다.

워크트리는 다 썼으므로 제거했다(`git worktree remove` + 브랜치 삭제).

## 1. 먼저 센 것 — 무엇이 이미 있나

새로 모을 것이 거의 없었다.

| 무엇 | 표 | 그때 줄 수 |
|---|---|---|
| 학교별 조회 기록(날짜·사람 단위) | `school_views` | 1,236줄 · 137명 · 8/23~8/24 |
| 별점 6축 | `ratings` | 9줄 |
| 관심목록 | `watchlist` | 9줄 |
| 제보 | `reports` | 0줄 |
| 권한 판별 | `staff` + `is_staff()` | 1명 |
| 회원 | `auth.users` 14 (실계정 5 · 손님 9) | |

**없는 것 넷을 사장님께 물었고 넷 다 확인받았다.**

| | 물은 것 | 정해진 것 |
|---|---|---|
| ① | 「방문자」를 어디까지 세나 | **`school_views` 만** — 새 기록 표를 안 만든다 |
| ② | 회원 메일을 어디까지 내나 | **가려서**(`op***@example.invalid`) |
| ③ | 운영 화면도 표본 3 문턱을 지키나 | **운영 화면만 푼다** — 교사 화면은 그대로 |
| ④ | 지우기·바꾸기 | **안 둔다** — 조회 전용 |

## 2. DB — 운영 전용 뷰 여덟 · 마이그레이션 셋

| 파일 | 무엇 |
|---|---|
| `20260824112001_pm-console.sql` | `mask_email()` · 뷰 여섯(`admin_overview`·`admin_daily`·`admin_school_rank`·`admin_school_ratings`·`admin_members`·`admin_reports`) |
| `20260824112302_pm-console-revoke-anon.sql` | ⛔ `anon` 권한을 **뺏는다**(아래) |
| `20260824112452_pm-console-activity.sql` | 온전한 학교 이름(`official_name`) · `admin_activity` · `admin_hourly` |

### ⛔⛔ 내가 틀렸던 자리 — 「주지 않는 것」과 「뺏는 것」은 다르다

첫 마이그레이션에 「`anon` 에게 주지 않는다」고 적고 `grant select … to authenticated` 만 했다.
**틀렸다.** Supabase 는 `public` 스키마의 새 객체에 대해
`alter default privileges … grant all on tables to anon, authenticated, service_role` 을
미리 걸어 둔다 — **뷰를 만드는 순간 `anon` 은 이미 SELECT 를 갖고 태어난다.**

⚠️ **새지는 않았다.** 뷰 안의 `where public.is_staff()` 가 막아서 `anon` 이 읽어도 0줄이었다
(실제로 `set role anon` 으로 재 봤다).

⛔ **그래도 고쳤다.** 「두 겹으로 막았다」고 적어 두고 실제로 한 겹이면,
다음 사람이 그 주석을 믿고 `is_staff()` 를 빼는 날 통째로 샌다.

### 뚫어 본 것 (CLAUDE.md §12 — 가드는 한 번 뚫어 본다)

| 누구로 | 무엇이 나왔나 |
|---|---|
| 운영이 아닌 로그인 사용자(`sub` 를 바꿔 흉내) | 여섯 뷰 전부 **0줄** |
| `anon` (고치기 전) | 0줄 (권한은 있었다 — 그래서 고쳤다) |
| `anon` (고친 뒤) | **HTTP 401 `permission denied for view admin_members`** |
| 운영(`staff`) | 값이 나온다 (회원 14 · 오늘 방문 105 · 학교 열람 1,236) |
| PostgREST 로 여덟 뷰 | 전부 **HTTP 200** — 주소가 실제로 열린다 |

## 3. 화면

| 파일 | 무엇 |
|---|---|
| `app/admin/page.tsx` | 라우트. `robots: { index: false, follow: false }` |
| `components/admin/console.tsx` | 껍데기 · 권한 갈라내기 · 칸 고르기 |
| `components/admin/panels.tsx` | 칸 다섯 |
| `components/admin/chart.tsx` | 막대 그림 둘 |
| `lib/admin.ts` | 읽기 · 꼴 만들기 · 제보 답장 |
| `app/robots.ts` | `/admin` 을 크롤링 금지에 더한다 |

⛔ **새 패키지 0개.** 막대는 `div` 의 높이·너비 백분율로 직접 그린다.

⛔ **`/admin` 은 정적(`○`)이다.** 서버에서 로그인 상태를 안 본다 — 껍데기만 미리 만들고
브라우저가 자기 열쇠로 받는다(CLAUDE.md §13).

### 폰에서 잡은 것 — 막대 60개는 못 누른다

390px 폭에서 막대 하나가 **6px** 이다(시간대 24칸도 15px). 손가락은 그보다 굵다(§11-4).
⛔ 호버로 때우지 않았다 — 손가락은 누르기 전까지 아무 신호가 없다.
**막대는 단추로 두고**(대충 고르기) **44px 짜리 앞·뒤 단추**를 나란히 뒀다(맞추기).
칸이 30개를 넘으면 틈을 2px → 1px 로 줄인다.

## 4. 검증

- `npm run verify` **EXIT=0** — 판독기 셋 · 가드 넷 · `next build`
- 가드 넷 전부 **베이스라인 그대로**(이모지 0 / 내부용어 1 / 안내문 1 / 삼킨 실패 0·0 / 호버 1 / 훅 0·0)
- `/admin` HTTP 200 · `<meta name="robots" content="noindex, nofollow">` 확인
- `robots.txt` 에 `Disallow: /admin` 확인
- PostgREST 여덟 뷰 200 · 익명 401 확인

## 5. 다음 사람에게

⚠️ **아직 못 밟아 본 것 하나** — **로그인한 운영 계정으로 브라우저에서 여는 것.**
SQL 로 세 갈래를 다 재 봤고 HTTP 로도 익명 차단을 확인했지만,
진짜 세션으로 도는 것은 사장님이 `operator@example.invalid` 으로 로그인해 열어 보셔야 한다.
⛔ **시험용 계정을 만들지 않았다** — 운영 DB 에 없던 회원 줄이 생긴다(사장님 out of scope).

⚠️ **전체 방문자수는 2단계다**(§12-171-1). 지금 「방문자」는 **학교를 연 사람**이고,
홈·지도만 보고 나간 사람은 안 든다. 그것까지 세려면 `page_views` 표와
`app/layout.tsx` 의 기록 훅이 필요한데 **기존 소스를 건드리는 일**이라 미뤘다.
