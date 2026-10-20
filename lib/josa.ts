/**
 * 조사를 앞말에 맞춰 고른다 — 「닉네임**은**」 · 「길찾기**는**」
 *
 * 2026-08-23 사장님이 화면에서 **「닉네임는 로그인이 필요합니다」**를 보셨다.
 * 앞말이 무엇이 올지 모르는 자리에 조사를 손으로 박아 두면 반은 틀린다.
 *
 * ⛔ **앞말을 바꿔서 피하지 않는다.** 「닉네임은」이 안 되니 「닉네임 항목」으로 늘리는 식은
 *    글자가 늘고 뜻이 흐려진다. 조사를 맞추는 것이 옳다.
 * ⛔ 받침이 있나로 가른다 — 한글 음절은 `(코드 - 0xAC00) % 28` 이 0이면 받침이 없다.
 *    한글이 아닌 글자(영문·숫자)로 끝나면 **받침이 없는 것으로 본다** — 우리 화면에서
 *    조사가 붙는 말은 전부 한글이라(관심목록·닉네임·길찾기·학교 이름) 그 자리가 안 온다.
 * ⛔ `으로/로` 만 규칙이 다르다 — **ㄹ 받침은 「로」**다(「서울로」). 그것만 따로 본다.
 */

const HANGUL_FIRST = 0xac00;
const HANGUL_LAST = 0xd7a3;

/** 마지막 글자의 받침 번호. 한글이 아니면 null (0 = 받침 없음, 8 = ㄹ) */
function finalConsonant(word: string): number | null {
  const last = word.trim().at(-1);
  if (!last) return null;
  const code = last.charCodeAt(0);
  if (code < HANGUL_FIRST || code > HANGUL_LAST) return null;
  return (code - HANGUL_FIRST) % 28;
}

export type JosaPair = "은는" | "이가" | "을를" | "와과" | "으로로";

/**
 * 앞말에 맞는 조사 한 글자(또는 두 글자)를 돌려준다.
 * ⛔ 앞말을 함께 돌려주지 않는다 — 부르는 쪽이 `{word}{josa(word,"은는")}` 로 잇는다.
 *    합쳐 돌려주면 사이에 다른 것(굵게·링크)을 못 끼운다.
 */
export function josa(word: string, pair: JosaPair): string {
  const f = finalConsonant(word);
  const has = f != null && f !== 0;
  switch (pair) {
    case "은는":
      return has ? "은" : "는";
    case "이가":
      return has ? "이" : "가";
    case "을를":
      return has ? "을" : "를";
    case "와과":
      return has ? "과" : "와";
    case "으로로":
      // ⛔ ㄹ 받침(8)은 「로」다 — 「서울로」이지 「서울으로」가 아니다
      return has && f !== 8 ? "으로" : "로";
  }
}
