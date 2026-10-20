import { db } from "@/lib/supabase";
import { areaLabel, regionBonus } from "@/lib/areas.mjs";
import { SIDO_NAMES } from "@/lib/sido.mjs";

/**
 * 학교 마스터를 DB 에서 읽는다.
 *
 * 어디서 왔나 — 세 갈래가 한 줄로 합쳐져 있다(scripts/load-personnel-areas.mjs).
 *   인사구역   교육청 고시 표 · 표준학교코드 나이스 · 좌표와 교원수 학교알리미
 *
 * ⛔ 공공데이터다. 교사 입력(별점·TO 제보·모의지원)과 섞지 않는다(CLAUDE.md §2).
 * 교육청 고시는 연 1회 바뀌니 빌드할 때 읽어 정적으로 낸다 — 검색에 잡히고 폰에서 왕복이 없다.
 */
export type School = {
  sido: string;
  /**
   * 학교급 — 유치원 · 초등 · 특수.
   * ⛔ 지금은 초등뿐이지만 **처음부터 담아 둔다**(CLAUDE.md §7). 나중에 열 때 적재를 다시 돌리지 않는다.
   */
  level: string;
  office: string;
  city: string | null;
  /**
   * 인사구역 — 경기 갑/을/병 · 인천 Ⅰ/Ⅱ/Ⅲ.
   *
   * ⛔ **null 은 「인사구역이 없다」가 아니라 「우리가 아직 모른다」다.** 이 값은 교육청 고시
   *    원문을 읽어야 나오고, 지금 읽어 둔 곳은 경기·인천뿐이다(`SOURCES`). 나머지 15개 시·도는
   *    학교 정보만 공공 API 에서 받아 실었고 구역은 비어 있다 — 화면이 「인사구역 준비 중」이라 낸다.
   * ⛔ 짐작으로 채우지 마라. 화면이 확신을 갖고 틀린 말을 한다(docs/postmortems.md).
   */
  area: string | null;
  areaGrade: string | null;
  name: string;
  officialName: string | null;
  stdCode: string | null;
  lat: number | null;
  lng: number | null;
  /**
   * 교원 수. 모의지원의 「재직교사 1/2」 분모이고, **학교 상세에도 낸다**
   * (2026-08-23 사장님 — 「남녀교사숫자 이런것도 넣으라고 했는데 빼먹었더라」).
   * ⛔ 출처는 학교알리미(apiType 22)다 — 공공데이터라 출처·기준일과 함께 낸다(§2).
   */
  teachers: number | null;
  /** 그중 여교원 · 남교원. ⛔ 총계와 안 맞으면 판독기가 둘 다 버린다(fetch-schoolinfo.mjs) */
  teachersF: number | null;
  teachersM: number | null;
  /**
   * 학교 홈페이지 (나이스 `HMPG_ADRES`). 없는 학교가 있다 — 경기 1 · 인천 2.
   * ⛔ 적재할 때 `https://` 를 붙여 둔다 — 나이스는 앞머리 없는 줄을 섞어 준다
   *    (`kwonsun-e.goesw.kr`). 그대로 두면 링크가 우리 사이트 안의 경로로 읽힌다.
   */
  homepage: string | null;
  /**
   * 학년별 학생수 1~6학년 (학교알리미). 없으면 null.
   * ⛔ 여섯을 더해 총계와 맞을 때만 담는다 — 반만 맞는 표는 없느니만 못하다(§12-138).
   */
  studentsByGrade: number[] | null;
  /**
   * 학생·교원 숫자가 **몇 년 공시**인가 (학교알리미 `pbanYr`).
   * 올해 공시에 없어 작년 것으로 되돌아간 학교는 그 해가 적힌다 — 화면이 별표로 알린다(§12-142).
   */
  statYear: number | null;
  students: number | null;
  classes: number | null;
  branches: string[];
  /** 개교 예정 학년도. null 이면 이미 문을 연 학교다. */
  opensYear: number | null;
};

export const YEAR = 2027;

/**
 * **지금 열어 둔 학교급.** 새 학교급을 열 때 여기에 줄을 더하면 목록·정적 화면·사이트맵이
 * 저절로 늘어난다 — 질의문을 찾아다니지 않는다(CLAUDE.md §7 「확장이 스위치가 되게」).
 *
 * ⛔ **대상 직종은 유치원·초등·특수 셋뿐이다**(CLAUDE.md §7). 영양·보건교사는 범위 밖이다.
 * ⛔ **점수 계산은 이 스위치를 안 탄다.** 시·도마다 인사관리기준이 다르고 중등은 초등과 또 다르다.
 *    여기서 여는 것은 **공공데이터를 그대로 내는 화면**까지다 — 계산 규칙은 기준 원문을 대조해 따로 넣는다.
 */
export const LEVELS = ["초등"] as const;
export type Level = (typeof LEVELS)[number];

export type Source = { title: string; revision: string };

/**
 * **인사구역 고시 원문을 읽은 시·도.** 여기 있는 곳만 구역·급지·지역가산·모의지원이 있다.
 *
 * ⛔ 시·도를 여기 더하는 것은 **스위치가 아니다.** 시·도마다 인사관리기준이 달라서
 *    계산 규칙을 따로 넣어야 한다(CLAUDE.md §7). 실증 — 경기는 전보년수 순인데
 *    인천은 평정점 합계 순이고 지역가산이 아예 없다.
 *    학교 목록만 여는 것은 `lib/sido.mjs` 에 줄을 더하는 것으로 끝나지만, 여기는 아니다.
 */
export const SOURCES: Partial<Record<Sido, Source>> = {
  경기: {
    title: "경기도교육청 2027학년도 교육공무원인사관리세부기준(유치원·초등)",
    revision: "67차 개정 2026. 7. 28.",
  },
  인천: {
    title: "인천광역시교육청 교육공무원 인사관리기준(유치원·초등·영양교사)",
    revision: "공고 제2026-290호 · 2026. 7. 7. 고시",
  },
};

/**
 * 시·도 이름. **목록은 `lib/sido.mjs` 한 곳에 있다** — 적재 스크립트가 같은 표를 읽는다(§11-3).
 * ⛔ 여기 있는 시·도라고 인사구역이 있는 게 아니다. 그것은 `SOURCES` 가 쥔다.
 */
export type Sido = (typeof SIDO_NAMES)[number];
export const SIDOS: readonly Sido[] = SIDO_NAMES;

/** 인사구역이 있는 시·도인가. 구역 배지·범례·필터·모의지원이 전부 이 하나를 본다. */
export const hasAreas = (sido: Sido): boolean => SOURCES[sido] != null;

/** 인사구역까지 읽어 둔 시·도. 모의지원 화면이 고를 수 있는 것이 이것뿐이다. */
export const RULED_SIDOS: readonly Sido[] = SIDOS.filter(hasAreas);

/**
 * 인사구역이 없는 시·도의 출처. 학교 정보는 공공 API 둘에서 온다.
 * ⛔ 고시문과 **같은 자리에 같은 꼴로** 낸다 — 화면에서 출처가 비는 칸이 생기지 않게(CLAUDE.md §2).
 * @param statYear 그 시·도에서 가장 최근 공시 연도(`newestStatYear`). 모르면 null.
 */
export const openDataSource = (statYear: number | null): Source => ({
  title: "나이스 개방포털 학교기본정보·학급정보 · 학교알리미 공시자료",
  revision: statYear ? `학교알리미 ${statYear}년 공시` : "학교알리미 공시자료",
});

/**
 * 그 시·도의 자료 출처 한 줄. **화면은 이것만 부른다** — `SOURCES[sido]` 를 직접 집지 않는다.
 * ⛔ 직접 집으면 인사구역이 없는 시·도에서 `undefined` 가 되고, 그 화면은 출처가 빈 채로 나간다.
 *    공공데이터는 출처·기준일을 반드시 함께 낸다(CLAUDE.md §2).
 * @param statYear 그 시·도에서 가장 최근 공시 연도. 고시문이 있는 시·도에서는 안 쓴다.
 */
export const sourceOf = (sido: Sido, statYear: number | null = null): Source =>
  SOURCES[sido] ?? openDataSource(statYear);

type Row = {
  sido: string; level: string; office: string; city: string | null; area: string | null; area_grade: string | null;
  school_name: string; official_name: string | null; std_code: string | null;
  lat: number | null; lng: number | null; teachers: number | null;
  teachers_f: number | null; teachers_m: number | null; homepage: string | null; branches: string[];
  students: number | null; students_grade: number[] | null; stat_year: number | null; classes: number | null; opens_year: number | null;
};

const cache = new Map<string, School[]>();

/**
 * 표준학교코드 → 학교 색인. `allOf` 가 시·도를 읽을 때 함께 채운다.
 *
 * ⛔ **전국으로 늘 것을 감안한 자리다**(2026-08-23 사장님 — 「앞으로 추가해야할 전국의 학교들이
 *    겁나 많음」). 학교 한 곳을 보려고 시·도를 통째로 읽어 훑으면, 지금은 1,637교라 괜찮지만
 *    전국 2만교가 되는 순간 **요청 하나가 2만 행을 끌어온다.**
 *    그래서 ① 목록을 이미 읽었으면 여기서 바로 집고 ② 안 읽었으면 **그 한 줄만** 받아 온다.
 */
const byCode = new Map<string, School>();

/** PostgREST 가 한 번에 주는 최대 행수. 이 값으로 끊긴다. */
const PAGE = 1000;

/**
 * 받아 오는 컬럼. ⛔ **한 곳에만 적는다** — 목록 조회와 한 줄 조회가 다른 컬럼을 받으면
 * 어느 길로 왔느냐에 따라 화면이 달라진다(CLAUDE.md §11-3).
 */
const COLUMNS =
  "sido, level, office, city, area, area_grade, school_name, official_name, std_code, lat, lng, teachers, teachers_f, teachers_m, homepage, students, students_grade, stat_year, classes, branches, opens_year";

/**
 * 쓸 수 있는 표준학교코드인가 — **숫자만** 참이다.
 *
 * ⛔ **`null` 검사만으로는 모자란다.** 나이스가 코드 자리에 **공백을 채워** 보내는 학교가 있다
 *    (충남다우리학교(초) — 도교육청 직속 대안학교. 실제로 `"       "` 일곱 칸이 들어와 있었다).
 *    `null` 이 아니라 공백 문자열이라 `.not("std_code","is",null)` 도, `if (s.stdCode)` 도 다 지나간다.
 * ⚠️ 그대로 두면 **사이트맵에 `/school/       ` 이 실려 나가고 그 주소는 404 다** —
 *    검색에게 「이걸 크롤링해라」라고 준 주소가 없는 화면이다(서치 콘솔이 오류로 센다).
 *    빌드는 초록으로 통과한다. 전국을 열면서 처음 나왔다(2026-08-23).
 */
export const usableCode = (v: string | null | undefined): v is string => !!v && /^\d+$/.test(v.trim());

const toSchool = (r: Row): School => ({
  sido: r.sido, level: r.level, office: r.office, city: r.city, area: r.area, areaGrade: r.area_grade,
  // ⛔ 못 쓰는 코드는 **여기서 한 번에 null 로 만든다.** 아래로 흐르는 모든 화면이 같이 걸러진다
  name: r.school_name, officialName: r.official_name, stdCode: usableCode(r.std_code) ? r.std_code.trim() : null,
  lat: r.lat, lng: r.lng, teachers: r.teachers,
  teachersF: r.teachers_f, teachersM: r.teachers_m, homepage: r.homepage, branches: r.branches ?? [],
  students: r.students, studentsByGrade: r.students_grade, statYear: r.stat_year,
  classes: r.classes, opensYear: r.opens_year,
});

/**
 * 한 시·도의 학교를 읽는다.
 *
 * ⛔ **Supabase 는 한 번에 1,000행만 준다.** `.limit(3000)` 을 걸어도 1,000 에서 끊고 **오류를 내지 않는다.**
 *    실제로 화면이 1,367교 중 1,000교만 보여주고 있었다(갑 893 이 730 으로 나왔다).
 *    그래서 두 가지를 한다 — 끝까지 넘겨 받고, **서버가 세어 준 총계와 받은 개수를 맞춰 본다.**
 *    조용히 모자란 채로 넘어가면 아무도 모른다(CLAUDE.md §11-1).
 */
async function allOf(sido: Sido): Promise<School[]> {
  const hit = cache.get(sido);
  if (hit) return hit;

  const base = () =>
    db
      .from("personnel_areas")
      .select(COLUMNS, { count: "exact" })
      .eq("sido", sido)
      .eq("school_year", YEAR)
      // ⛔ 학교급은 **상수 하나로 연다**(LEVELS). 여기에 '초등' 을 박으면 새 학교급을 열 때 질의문을 찾아다녀야 한다
      .in("level", LEVELS as unknown as string[])
      .eq("closed", false)
      .order("city")
      .order("school_name");

  const got: Row[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await base().range(from, from + PAGE - 1);
    // ⛔ 실패를 삼키지 않는다(CLAUDE.md §11-2). 빈 목록으로 조용히 넘어가면 아무도 모른다.
    if (error) throw new Error(`학교를 못 읽었다 (${sido}): ${error.message}`);
    if (count != null) total = count;
    const page = (data ?? []) as Row[];
    got.push(...page);
    if (page.length < PAGE) break;
  }

  if (total != null && got.length !== total) {
    throw new Error(`학교를 다 못 읽었다 (${sido}): 서버 총계 ${total} ↔ 받은 것 ${got.length}`);
  }

  const rows = got.map(toSchool);
  cache.set(sido, rows);
  for (const r of rows) if (r.stdCode) byCode.set(r.stdCode, r);
  return rows;
}

/**
 * 지금 갈 수 있는 학교 — 이미 문을 연 곳만.
 *
 * ⛔ 개교 예정교를 여기 섞지 않는다. 지원을 일반 전보와 **따로** 받는데 목록에 섞여 있으면
 *    지금 낼 수 있는 자리로 읽힌다. 그쪽은 openingSoonOf 로 따로 가져간다.
 */
export const schoolsOf = async (sido: Sido) => (await allOf(sido)).filter((s) => s.opensYear == null);

/** 개교 예정교. 인사구역은 이미 고시됐고 표준학교코드·좌표·교원수는 아직 없다. */
export const openingSoonOf = async (sido: Sido) =>
  (await allOf(sido)).filter((s) => s.opensYear != null);

/**
 * 학급당 학생수. 모르면 null.
 *
 * ⛔ **교사 1인당 학생수는 만들지 않는다.** 그 분모의 '교원'에는 보건·영양·사서·상담처럼
 *    수업을 하지 않는 인원이 섞여 있어 실제 학급 크기보다 훨씬 작게 나온다.
 *    실증 — 강화초는 학급당 19.0명인데 교사당으로 재면 10.0명이다. 교동초는 3.0 대 1.4다.
 *    담임이 맡는 것은 학급이다.
 */
export const perClass = (s: Pick<School, "students" | "classes">) =>
  s.students && s.classes ? s.students / s.classes : null;

/**
 * 표준학교코드로 학교 하나. 학교별 정적 화면과 길찾기가 쓴다 — 그 코드가 별점·통근의 키다.
 *
 * ⛔ **시·도를 통째로 읽어 훑지 않는다.** 전에는 그렇게 했는데, 학교가 전국으로 늘면
 *    학교 한 곳을 그리려고 2만 행을 끌어오게 된다. 두 길로 가른다 —
 *    ① 목록을 이미 읽었으면(빌드 때 정적 화면을 다 만드는 경우) 색인에서 바로 집는다. 조회 0번.
 *    ② 아직 안 읽었으면(요청 하나만 도는 경우) **그 한 줄만** 받는다.
 * ⛔ 표준학교코드는 **전국에서 유일하다**(나이스). 그래서 시·도를 안 물어봐도 된다.
 */
export async function schoolByCode(stdCode: string): Promise<School | null> {
  const hit = byCode.get(stdCode);
  if (hit) return hit;

  const { data, error } = await db
    .from("personnel_areas")
    .select(COLUMNS)
    .eq("std_code", stdCode)
    .eq("school_year", YEAR)
    .in("level", LEVELS as unknown as string[])
    .eq("closed", false)
    .maybeSingle();

  // ⛔ 실패를 삼키지 않는다(CLAUDE.md §11-2). null 로 돌려주면 「없는 학교」와 구분이 안 된다
  if (error) throw new Error(`학교를 못 읽었다 (${stdCode}): ${error.message}`);
  if (!data) return null;

  const one = toSchool(data as unknown as Row);
  if (one.stdCode) byCode.set(one.stdCode, one);
  return one;
}

/**
 * 한 교육지원청의 학교.
 *
 * ⛔ **시·도를 통째로 읽어 거르지 않는다.** 지원청 하나는 아무리 커도 백 곳 남짓이라
 *    전국이 되어도 이 조회의 크기가 안 변한다 — 커지는 것은 지원청 **개수**뿐이다.
 * 목록을 이미 읽어 뒀으면(빌드 때) 그걸로 거르고, 아니면 그 지원청만 받는다.
 */
const officeCache = new Map<string, School[]>();
export async function schoolsOfOffice(sido: Sido, office: string): Promise<School[]> {
  const loaded = cache.get(sido);
  if (loaded) return loaded.filter((s) => s.office === office && s.opensYear == null);

  const key = `${sido}|${office}`;
  const hit = officeCache.get(key);
  if (hit) return hit;

  const { data, error } = await db
    .from("personnel_areas")
    .select(COLUMNS)
    .eq("sido", sido)
    .eq("office", office)
    .eq("school_year", YEAR)
    .in("level", LEVELS as unknown as string[])
    .eq("closed", false)
    .is("opens_year", null)
    .order("school_name");

  if (error) throw new Error(`지원청 학교를 못 읽었다 (${sido} ${office}): ${error.message}`);
  const rows = ((data ?? []) as unknown as Row[]).map(toSchool);
  officeCache.set(key, rows);
  for (const r of rows) if (r.stdCode) byCode.set(r.stdCode, r);
  return rows;
}

/**
 * 색인을 미리 채운다 — **빌드할 때 정적 화면을 통째로 만드는 자리에서만** 부른다.
 *
 * ⛔ 이것이 「빌드에서는 한 번에, 요청에서는 한 줄만」의 스위치다.
 *    지금은 학교 화면을 빌드 때 다 만들므로(`dynamicParams = false`) 여기서 시·도를 한 번씩 읽어
 *    두면 1,637번의 한 줄 조회가 **두 번의 목록 조회**로 줄어든다.
 * ⭐ **전국으로 늘어 빌드가 버거워지면** 학교 화면을 `dynamicParams = true` 로 바꾸고
 *    이 줄만 지우면 된다 — `schoolByCode` 가 그때부터 한 줄씩 받는다. 두 길이 다 깔려 있다.
 */
export async function warmIndex(): Promise<void> {
  await Promise.all(SIDOS.map((s) => allOf(s)));
}

/**
 * 정적 화면을 만들 목록 — **표준학교코드만** 받는다.
 *
 * ⛔ 컬럼 스물을 다 받지 않는다. 전국 2만교가 되면 그 자체로 무거워지는데,
 *    `generateStaticParams` 와 사이트맵이 쓰는 것은 코드 하나뿐이다.
 * ⛔ 개교 예정교는 뺀다 — 아직 표준학교코드가 없고, 갈 수 있는 자리가 아니다(`schoolsOf` 와 같은 뜻).
 * ⛔ 여기서도 1,000행에서 끊긴다. 끝까지 넘겨 받고 총계와 맞춰 본다.
 */
export async function schoolCodesOf(sido: Sido): Promise<string[]> {
  const base = () =>
    db
      .from("personnel_areas")
      .select("std_code", { count: "exact" })
      .eq("sido", sido)
      .eq("school_year", YEAR)
      .in("level", LEVELS as unknown as string[])
      .eq("closed", false)
      .is("opens_year", null)
      .not("std_code", "is", null)
      .order("std_code");

  const got: string[] = [];
  let total: number | null = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error, count } = await base().range(from, from + PAGE - 1);
    if (error) throw new Error(`학교 코드를 못 읽었다 (${sido}): ${error.message}`);
    if (count != null) total = count;
    const page = (data ?? []) as { std_code: string }[];
    // ⛔ 총계와 맞춰 보는 것은 **받은 개수**다. 거르는 것은 그 뒤에 한다 —
    //    여기서 걸러 버리면 「다 못 읽었다」로 잘못 던진다(공백 코드가 하나라도 있으면 늘 터진다)
    got.push(...page.map((r) => r.std_code));
    if (page.length < PAGE) break;
  }
  if (total != null && got.length !== total) {
    throw new Error(`학교 코드를 다 못 읽었다 (${sido}): 서버 총계 ${total} ↔ 받은 것 ${got.length}`);
  }
  // ⛔ 못 쓰는 코드는 정적 화면도 사이트맵도 만들지 않는다(위 `usableCode` 참고)
  return got.filter(usableCode).map((c) => c.trim());
}

/**
 * 그 시·도에서 **가장 최근 공시 연도**.
 *
 * 학교마다 `statYear` 가 붙어 있는데 그것이 이 해와 같으면 화면에 알릴 것이 없다 —
 * 늘 붙어 있는 별표는 아무 말도 안 한다. 되돌아간 학교에만 별표를 단다(§12-142).
 * ⛔ 올해를 `new Date()` 로 재지 않는다. 공시가 늦어지면 우리가 가진 최신 해가 곧 「올해」다.
 * ⛔ 여기도 두 길이다 — 목록을 이미 읽었으면 그걸로 세고, 아니면 **한 줄만** 받는다.
 *    전국이 되어도 이 함수가 시·도를 통째로 끌어오지 않게 한다.
 */
const newestYear = new Map<string, number>();
export async function newestStatYear(sido: Sido): Promise<number> {
  const hit = newestYear.get(sido);
  if (hit != null) return hit;

  const loaded = cache.get(sido);
  if (loaded) {
    const v = Math.max(0, ...loaded.map((s) => s.statYear ?? 0));
    newestYear.set(sido, v);
    return v;
  }

  const { data, error } = await db
    .from("personnel_areas")
    .select("stat_year")
    .eq("sido", sido)
    .eq("school_year", YEAR)
    .in("level", LEVELS as unknown as string[])
    .eq("closed", false)
    .not("stat_year", "is", null)
    .order("stat_year", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`공시 연도를 못 읽었다 (${sido}): ${error.message}`);
  const v = (data as { stat_year: number } | null)?.stat_year ?? 0;
  newestYear.set(sido, v);
  return v;
}

export const officesOf = async (sido: Sido) =>
  [...new Set((await schoolsOf(sido)).map((s) => s.office))].sort((a, b) => a.localeCompare(b, "ko"));

export { areaLabel, regionBonus };
