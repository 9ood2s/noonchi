-- 전국 17개 시·도 학교를 같은 표에 담는다.
--
-- 왜 — 사장님(2026-08-23) 「일단 다른 모든 지역 학교들도 api에서 받아올 수 있는 데이터들은
-- 우리 레이아웃에 맞춰서 때려넣자. 그뒤에 사람들에게 제보를 받거나 문서를 받아서
-- 단계적으로 채워나가고 공지를 띄우는 방식으로 운영하면 될 것 같음.」
--
-- 무엇이 달라지나 — 두 가지다.
--   ① `sido` 검사가 경기·인천 둘만 받고 있었다. 17개를 다 받는다.
--   ② `area`(인사구역)에 NOT NULL 이 걸려 있었다. **푼다.**
--
-- ⛔ **②가 이 마이그레이션의 핵심이고, 조심할 자리다.**
--    인사구역은 교육청 고시 원문을 읽어야 나오는 값이다. 지금 읽어 둔 곳은 경기·인천뿐이고
--    나머지 15개 시·도는 **원문이 없다.** 여기서 짐작으로 채우면 화면이 확신을 갖고 틀린 말을 한다.
--    그래서 `null` 로 두고 화면이 「인사구역 준비 중」이라고 낸다.
--    ⛔ null 을 「인사구역이 없는 학교」로 읽지 마라. 「우리가 아직 모른다」는 뜻이다.
--
-- ⛔ 값은 안 건드린다. 이미 들어 있는 경기·인천 1,638교의 `area` 는 그대로다.
--    NOT NULL 을 푸는 것은 **넓히는 변경**이라 기존 행이 다 그대로 통과한다.

alter table public.personnel_areas
  drop constraint if exists personnel_areas_sido_ck;

alter table public.personnel_areas
  add constraint personnel_areas_sido_ck check (
    sido in (
      '경기', '인천', '서울', '부산', '대구', '광주', '대전', '울산', '세종',
      '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
    )
  );

alter table public.personnel_areas
  alter column area drop not null;

comment on column public.personnel_areas.area is
  '인사구역. 경기 갑/을/병 · 인천 Ⅰ/Ⅱ/Ⅲ. ⛔ null 은 「없다」가 아니라 「교육청 고시 원문을 아직 안 읽었다」는 뜻이다 — 화면이 「인사구역 준비 중」으로 낸다';

comment on table public.personnel_areas is
  '학교 마스터. 전국 17개 시·도 공립 초등. 인사구역은 고시 원문을 읽은 시·도(경기·인천)만 채워져 있고 나머지는 null 이다. 공공데이터이며 교사 입력과 섞지 않는다. 학년도는 적용 학년도 기준.';
