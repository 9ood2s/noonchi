#!/usr/bin/env node
/** 인천 전보 순위 점수 셀프체크.  node scripts/selftest-incheon.mjs */
import { transferScore, toMonths, score, ratingPointInMonths, TENURE_CAP, CAREER_CAP } from '../lib/transfer-incheon.mjs';

let pass = 0;
const fails = [];
const eq = (name, got, want) => { if (got === want) pass++; else fails.push(`${name} — 나온 값 ${got} · 기대 ${want}`); };
const part = (r, l) => r.parts.find((p) => p.label === l)?.hundredths;

// ── 근속 — 월 0.05점 ────────────────────────────────────────────────────
{
  const r = transferScore({ cityMonths: 100, officeMonths: 40, step: 20, rating: 95, sameSchoolMonths: 24 });
  eq('시교육청 근속 100달 = 5.00', score(part(r, '인천시교육청 근속')), '5.00');
  eq('지원청 근속 40달 = 2.00', score(part(r, '교육지원청 근속')), '2.00');
  eq('20호봉 = 2.00', score(part(r, '교육총경력')), '2.00');
  eq('근무성적 95점 = 9.50', score(part(r, '근무성적')), '9.50');
  eq('합계 = 18.50', score(r.total), '18.50');
}

// ── 상한 셋 ────────────────────────────────────────────────────────────
{
  const r = transferScore({ cityMonths: toMonths(30), officeMonths: toMonths(20), step: 40, rating: 100 });
  eq('시교육청 근속 상한 9점', part(r, '인천시교육청 근속'), TENURE_CAP);
  eq('지원청 근속 상한 9점', part(r, '교육지원청 근속'), TENURE_CAP);
  eq('호봉 40이어도 상한 3점', part(r, '교육총경력'), CAREER_CAP);
  eq('만점 = 31.00', score(r.total), '31.00');
}
{
  // 상한에 닿는 지점 — 근속 180달(15년)이 9점이다
  const r = transferScore({ cityMonths: 180, officeMonths: 179, step: 30 });
  eq('180달이 딱 9점', part(r, '인천시교육청 근속'), TENURE_CAP);
  eq('179달은 8.95', score(part(r, '교육지원청 근속')), '8.95');
  eq('30호봉이 딱 3점', part(r, '교육총경력'), CAREER_CAP);
}

// ── 근무성적을 모를 때 — 범위로 낸다 ────────────────────────────────────
{
  const r = transferScore({ cityMonths: 100, officeMonths: 40, step: 20, rating: null });
  eq('모르면 합계는 없다', r.total, null);
  eq('근무성적 뺀 점수 = 9.00', score(r.known), '9.00');
  eq('가장 낮게 봐도 9.00', score(r.min), '9.00');
  eq('가장 높게 보면 19.00', score(r.max), '19.00');
}

// ── ⛔ 헷갈리는 자리 — 조정점 1점과 평정점 1점은 다르다 ─────────────────
{
  eq('최종 조정점 1점 = 근속 2달', ratingPointInMonths(1), 2);
  eq('평정점 1점(= 조정점 10점) = 근속 20달', ratingPointInMonths(10), 20);
}

// ── 자격 — 동일교 1년 이상 (경기는 2년이다) ────────────────────────────
{
  eq('11달이면 못 낸다', transferScore({ sameSchoolMonths: 11 }).canApply, false);
  eq('12달이면 낼 수 있다', transferScore({ sameSchoolMonths: 12 }).canApply, true);
}

// ── 실수 오차가 쌓이지 않는지 ──────────────────────────────────────────
{
  const r = transferScore({ cityMonths: 37, officeMonths: 0, step: 0 });
  eq('37달 = 1.85 (0.05 를 실수로 더하면 어긋난다)', score(part(r, '인천시교육청 근속')), '1.85');
}

console.log(`인천 순위 점수 셀프체크 — ${pass}개 통과${fails.length ? ` · ${fails.length}개 실패` : ''}`);
if (fails.length) { for (const f of fails) console.log(`  ✗ ${f}`); process.exit(1); }
