/**
 * 배포 주소는 각 운영자의 설정만 사용한다. 공개 저장소에 원 운영 주소를 기본값으로 두지 않는다.
 * NEXT_PUBLIC_SITE_URL 은 OAuth callback, canonical, sitemap 에서 함께 쓴다.
 *
 * @param {string | undefined} value
 * @returns {string | null}
 */
export function configuredSiteOrigin(value) {
  const raw = value?.trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL 에 올바른 http(s) 원점을 설정하세요.");
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL 은 경로·인증정보 없는 http(s) 원점이어야 합니다.");
  }
  return url.origin;
}

/**
 * Vercel 은 현재 배포의 호스트만 사용한다. 설정이 없으면 로컬 주소로 한정한다.
 * @param {string | undefined} siteUrl
 * @param {string | undefined} deploymentHost
 * @param {string} fallbackOrigin
 */
export function resolveSiteOrigin(siteUrl, deploymentHost, fallbackOrigin = "http://localhost:3000") {
  return configuredSiteOrigin(siteUrl)
    ?? configuredSiteOrigin(deploymentHost?.trim() ? `https://${deploymentHost.trim()}` : undefined)
    ?? configuredSiteOrigin(fallbackOrigin)
    ?? "http://localhost:3000";
}

/**
 * www 별칭 넘김은 대표 주소를 직접 설정한 배포에서만 만든다.
 * @param {string | undefined} siteUrl
 * @returns {Array<{ source: string, has: Array<{ type: "host", value: string }>, destination: string, permanent: true }>}
 */
export function canonicalRedirects(siteUrl) {
  const origin = configuredSiteOrigin(siteUrl);
  if (!origin) return [];
  const url = new URL(origin);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") return [];
  const alias = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
  return [{
    source: "/:path*",
    has: [{ type: "host", value: alias }],
    destination: `${origin}/:path*`,
    permanent: true,
  }];
}

/**
 * 로그인 뒤 돌아갈 경로는 같은 원점 안으로 한정한다.
 * URL 파서는 역슬래시를 슬래시로 바꾸므로 첫 글자 검사만으로는 외부 이동을 막지 못한다.
 * @param {unknown} raw
 */
export function safeNext(raw) {
  if (typeof raw !== "string" || !raw.startsWith("/")) return "/";
  if (raw.includes("\\") || Array.from(raw).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return "/";
  const origin = "https://redirect.invalid";
  try {
    return new URL(raw, origin).origin === origin ? raw : "/";
  } catch {
    return "/";
  }
}
