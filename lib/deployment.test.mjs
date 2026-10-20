import assert from "node:assert/strict";
import test from "node:test";
import { canonicalRedirects, configuredSiteOrigin, resolveSiteOrigin, safeNext } from "./deployment.mjs";

test("설정 없는 fork 는 로컬 원점을 쓰고 외부 도메인으로 넘기지 않는다", () => {
  assert.equal(resolveSiteOrigin(undefined, undefined), "http://localhost:3000");
  assert.deepEqual(canonicalRedirects(undefined), []);
  assert.deepEqual(canonicalRedirects(""), []);
});

test("canonical 과 OAuth 는 동일한 명시 주소 및 현재 Vercel 배포 주소를 쓴다", () => {
  const configured = " https://school.example.org/ ";
  const deployment = "school-fork-preview.vercel.app";
  assert.equal(resolveSiteOrigin(configured, deployment), "https://school.example.org");
  assert.equal(resolveSiteOrigin(configured, deployment, "https://request.example.org"), "https://school.example.org");
  assert.equal(resolveSiteOrigin(undefined, deployment), `https://${deployment}`);
  assert.equal(resolveSiteOrigin(undefined, deployment, "https://request.example.org"), `https://${deployment}`);
  assert.equal(resolveSiteOrigin(undefined, undefined, "https://request.example.org"), "https://request.example.org");
});

test("www redirect 는 해당 운영자가 설정한 origin 만 대상으로 한다", () => {
  const redirects = canonicalRedirects("https://school.example.org/");
  assert.equal(redirects.length, 1);
  assert.deepEqual(redirects[0].has, [{ type: "host", value: "www.school.example.org" }]);
  assert.equal(redirects[0].destination, "https://school.example.org/:path*");
  assert.equal(redirects[0].permanent, true);
  assert.deepEqual(canonicalRedirects("http://localhost:3000"), []);
  assert.deepEqual(canonicalRedirects("http://127.0.0.1:3000"), []);
  assert.deepEqual(canonicalRedirects("http://[::1]:3000"), []);
  assert.deepEqual(canonicalRedirects("https://www.school.example.org")[0].has, [{ type: "host", value: "school.example.org" }]);
});

test("인증정보나 경로가 섞인 설정은 공개 URL 에 흘리지 않고 거부한다", () => {
  for (const value of [
    "school.example.org", "javascript:alert(1)", "//school.example.org",
    "https://user:password@school.example.org", "https://school.example.org/path",
    "https://school.example.org/?key=example", "https://school.example.org/#example",
  ]) {
    assert.throws(() => configuredSiteOrigin(value), /NEXT_PUBLIC_SITE_URL/);
  }
});

test("OAuth next 는 역슬래시와 제어문자로 외부 원점으로 벗어나지 못한다", () => {
  for (const next of [null, "https://other.example.org", "//other.example.org", "/\\other.example.org", "/\t/other.example.org", "/\n/other.example.org"]) {
    assert.equal(safeNext(next), "/");
  }
  for (const next of ["/", "/map?sido=서울&school=123#details", "/school/123"]) {
    assert.equal(safeNext(next), next);
  }
});
