import Image from "next/image";

/** 관련 서비스 링크는 각 배포에서 명시적으로 설정한 경우에만 표시한다. */
const MADE = [
  { latin: "supapad", tail: "pad", what: "패들릿 대신", href: process.env.NEXT_PUBLIC_SUPAPAD_URL?.trim() },
  { latin: "supaclass", tail: "class", what: "학급경영", href: process.env.NEXT_PUBLIC_SUPACLASS_URL?.trim() },
].filter((item) => {
  if (!item.href) return false;
  try {
    const url = new URL(item.href);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
});

export function MadeBy() {
  if (!MADE.length) return null;
  return (
    <section className="mt-5 border-t border-divider pt-3">
      <p className="text-[12px] font-medium text-ink3">이것도 만들었습니다</p>
      <ul className="mt-1">
        {MADE.map((m) => (
          <li key={m.latin}>
            {/* ⛔ 44px 을 채운다(CLAUDE.md §11-4). 이 줄 전체가 손가락이 닿는 자리다 */}
            <a
              href={m.href}
              target="_blank"
              rel="noreferrer"
              className="flex min-h-11 items-center gap-2.5 active:opacity-60"
            >
              {/* ⛔ 로고는 두 서비스가 같이 쓴다. 파일 하나를 두 줄이 쓴다 */}
              <Image src="/brand/supa.svg" alt="" width={22} height={22} className="shrink-0 rounded-[5px]" aria-hidden />
              <span className="text-[14px] tracking-[-0.02em]">
                <b className="font-extrabold">supa</b>
                <span className="font-normal">{m.tail}</span>
              </span>
              <span className="ml-auto shrink-0 text-[12px] text-ink3">{m.what}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
