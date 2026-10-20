/**
 * 심볼 — 파란 캡슐 안에서 두 눈이 오른쪽을 본다(곁눈질).
 * **정본은 `public/brand/noonchi/noonchi-symbol.svg` 다**(2026-08-23 확정 · `CLAUDE_HANDOFF.md`).
 *
 * 레일처럼 선으로 그려야 하는 자리는 이것이 아니라 `noonchi-dock-icon.tsx` 를 쓴다.
 * 이쪽은 **채운 심볼**이라 화면 가운데 로딩·빈 상태·공유 그림처럼 큰 자리에 쓴다.
 *
 * ⛔ **캡슐은 `--key` 를 쓴다** — 밝을 때 `#2f6fd0`, 어두울 때 `#5d9bea`. 정본 두 파일과 같은 값이다.
 * ⛔ **흰자는 흰색, 눈동자는 잉크로 박는다.** 두 밝기 모두 그대로다(정본 `-dark.svg` 도 같다).
 *    캡슐 위에 얹히는 색이라 화면 밝기를 따라가면 안 된다 — 따라가면 어두운 화면에서 흰자가 사라진다.
 * ⛔ **로딩은 눈동자만 돈다.** 몸통·흰자는 고정이다(`globals.css` 의 `.noonchi-orbit`).
 * ⛔ **훅을 쓰지 않는다** — 서버 부품에서도 부를 수 있어야 한다(`noonchi-dock-icon.tsx` 와 같은 이유).
 */

type Props = Omit<React.SVGProps<SVGSVGElement>, "ref"> & {
  size?: number;
  /** 참이면 눈동자 둘이 굴러간다 */
  loading?: boolean;
  /** 읽어 줄 이름. 로딩 자리에서는 무엇을 기다리는 중인지 적는다 */
  label?: string;
};

export function NoonchiLogo({ size = 48, loading = false, label, className, ...rest }: Props) {
  const cls = [loading ? "noonchi-loading" : "", className].filter(Boolean).join(" ");

  return (
    <svg
      {...rest}
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={cls || undefined}
      role={label ? (loading ? "status" : "img") : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id="noonchi-mark-l">
          <circle cx="32" cy="48" r="14" />
        </clipPath>
        <clipPath id="noonchi-mark-r">
          <circle cx="64" cy="48" r="14" />
        </clipPath>
      </defs>
      <rect x="6" y="24" width="84" height="48" rx="24" fill="var(--key)" />
      <circle cx="32" cy="48" r="14" fill="#ffffff" />
      <circle cx="64" cy="48" r="14" fill="#ffffff" />
      <g className="noonchi-orbit" style={{ transformOrigin: "32px 48px" }} clipPath="url(#noonchi-mark-l)">
        <circle cx="40.5" cy="48" r="8" fill="#16202e" />
      </g>
      <g
        className="noonchi-orbit noonchi-orbit-right"
        style={{ transformOrigin: "64px 48px" }}
        clipPath="url(#noonchi-mark-r)"
      >
        <circle cx="72.5" cy="48" r="8" fill="#16202e" />
      </g>
    </svg>
  );
}
