# 공개 소스 인수인계

이 소스는 각 지역 운영자가 자신의 API·DB·로그인 계정과 도메인을 설정해 사용할 수 있도록 분리한 배포본이다. 기존 운영 환경의 자격 증명과 사용자 데이터는 포함하지 않는다.

- 설치와 지역 확장: `README.md`, `docs/SELF_HOSTING.md`
- 환경변수 이름과 용도: `.env.example`
- 공개 검사와 이력 처리: `SECURITY.md`
- 계산 근거: `data/source/README.md`, `docs/rules-*.md`
- 과거 제품 결정: `docs/DESIGN.md` (설정은 현재 코드와 `.env.example`을 따른다)

운영 중인 설치를 업그레이드할 때에는 기존 환경변수·OAuth 허용 주소·지도 도메인·관리자 권한을 먼저 확인한다. 과거 마이그레이션을 운영 DB에 다시 적용하지 않는다. 공개본의 `seed.sql`은 합성 로컬 시험 자료다.
