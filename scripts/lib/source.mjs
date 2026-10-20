/**
 * 원자료가 어디 있나 — **주소를 손으로 적지 않는다** (`data/source/README.md` · `DESIGN.md §12-96`)
 *
 * 구조는 세 칸이다.  `data/source/<시도>/<발행기관>/<적용학년도>/<파일>`
 *
 *   gyeonggi/sido/2027/standards.pdf     경기도교육청 본청 · 2027학년도 · 원문
 *   gyeonggi/sido/2027/diff.pdf                                       · 신구대조표
 *   incheon/nambu/2027/standards.pdf     인천 남부교육지원청 · 2027학년도 · 원문
 *
 * ⛔ **연도가 폴더다.** 파일 이름에 연도를 적으면 매년 이름이 바뀌고, 스크립트가 그 이름을
 *    문자열로 조립하게 된다. 폴더로 두면 이름은 늘 같고 **연도만 갈아 끼운다.**
 * ⛔ **적용 학년도**로 가른다. 고시 날짜가 아니다(CLAUDE.md §7) —
 *    경기는 「2027학년도 …」, 인천은 「2026.7.7. 개정」인데 **둘 다 2027학년도에 적용**된다.
 *    날짜로 가르면 1년 어긋난 기준을 나란히 쓰게 된다.
 * ⛔ **`sido` 는 시·도교육청 본청**이다. 지원청은 그 옆에 나란히 선다 — 위아래가 아니다.
 *    본청 기준과 지원청 세부기준은 **서로 다른 문서**이고 개정 주기도 따로 돈다.
 *
 * 늘리는 법 — 폴더 하나를 더 만든다. 코드는 안 고친다.
 *   서울을 열면          `seoul/sido/2028/standards.pdf`
 *   인천 동부가 고시되면 `incheon/dongbu/2027/standards.pdf`
 *   경기 지원청이 생기면 `gyeonggi/suwon/2028/standards.pdf`
 */

import path from 'node:path';
import fs from 'node:fs';

export const SOURCE_ROOT = path.resolve(import.meta.dirname, '../../data/source');

/** 시·도교육청 본청을 가리키는 이름. 지원청과 같은 칸에 선다 */
export const SIDO = 'sido';

/**
 * 원자료 한 개의 자리.
 * @param {string} sido   `gyeonggi` · `incheon`
 * @param {string} office `sido`(본청) 또는 지원청 — `nambu` · `bukbu` · `seobu` · `dongbu` · `ganghwa`
 * @param {number|string} year 적용 학년도
 * @param {string} file   `standards.pdf` · `diff.hwpx` 처럼 **연도가 안 든 이름**
 */
export const sourcePath = (sido, office, year, file) =>
  path.join(SOURCE_ROOT, sido, office, String(year), file);

/**
 * 있어야 할 파일을 집는다. ⛔ **없으면 조용히 넘어가지 않고 어디를 봐야 하는지 적어 던진다** —
 * 원자료가 빠진 채로 도는 판독기는 0건을 「정상」으로 낸다(나이스 5행과 같은 종류의 사고다).
 */
export function needSource(sido, office, year, file) {
  const p = sourcePath(sido, office, year, file);
  if (!fs.existsSync(p))
    throw new Error(
      `원자료가 없다: ${path.relative(path.join(SOURCE_ROOT, '../..'), p)}\n` +
        `  받아서 그 자리에 두어라. 구조는 data/source/README.md 를 본다.`,
    );
  return p;
}

/** 그 시·도에 자료가 있는 발행기관들 — 폴더가 곧 목록이다 */
export const officesOf = (sido) => {
  const dir = path.join(SOURCE_ROOT, sido);
  return fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : [];
};

/** 그 발행기관에 있는 적용 학년도들 — 새로 받으면 폴더만 늘어난다 */
export const yearsOf = (sido, office) => {
  const dir = path.join(SOURCE_ROOT, sido, office);
  return fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
        .map((e) => Number(e.name))
        .sort((a, b) => a - b)
    : [];
};
