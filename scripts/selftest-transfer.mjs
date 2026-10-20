#!/usr/bin/env node
/**
 * 전보년수 계산 셀프체크.  node scripts/selftest-transfer.mjs
 *
 * ⛔ 계산기는 눈으로 못 본다. 값이 조금 틀려도 화면은 멀쩡해 보인다.
 *    그래서 규칙 문서에 적힌 예시와 손으로 따져 본 자리를 여기에 박아 둔다.
 *    규칙을 고치면 여기가 먼저 깨져야 한다.
 */
import { transferYears, toMonths, label, CAP_MONTHS } from '../lib/transfer.mjs';
import { regionBonus, areaFact } from '../lib/areas.mjs';

let pass = 0;
const fails = [];
const eq = (name, got, want) => {
  if (got === want) { pass++; return; }
  fails.push(`${name} — 나온 값 ${got} · 기대 ${want}`);
};

// ── docs/rules-gyeonggi-2027.md 의 계산 예시 ────────────────────────────
// 을구역 4년 근무 · 부장 2년 · 6학년 담임 1년 · 세 자녀 이상 → 전보년수 8년 9월
{
  const r = transferYears({
    area: '을',
    serviceMonths: toMonths(4),
    headTeacherMonths: toMonths(2),
    grade6Months: toMonths(1),
    threeChildren: true,
  });
  eq('문서 예시 · 지역가산', r.parts.find((p) => p.label === '지역가산')?.months, 24);
  eq('문서 예시 · 부장교사', r.parts.find((p) => p.label === '부장교사')?.months, 6);
  eq('문서 예시 · 6학년 담임', r.parts.find((p) => p.label === '6학년 담임')?.months, 3);
  eq('문서 예시 · 세 자녀', r.parts.find((p) => p.label === '세 자녀 이상')?.months, 24);
  eq('문서 예시 · 가산년수 합', r.addMonths, toMonths(4, 9));
  eq('문서 예시 · 전보년수', r.months, toMonths(8, 9));
  eq('문서 예시 · 글자', label(r.months), '8년 9월');
}

// ── 기준값 5년 상한 — 합계 상한이 아니라 비율 가산의 **기준값** 상한이다 ──
{
  const r = transferYears({ area: '을', serviceMonths: toMonths(7) });
  eq('7년 근무라도 지역가산은 5년 기준', r.parts.find((p) => p.label === '지역가산')?.months, CAP_MONTHS / 2);
  eq('전보년수는 실제 근무 7년 + 가산', r.months, toMonths(7) + 30);
}

// ── 갑구역 — 지역가산이 없고 부장은 1년당 1월 ───────────────────────────
{
  const r = transferYears({ area: '갑', serviceMonths: toMonths(3), headTeacherMonths: toMonths(2) });
  eq('갑구역 지역가산 없음', r.parts.find((p) => p.label === '지역가산'), undefined);
  eq('갑구역 부장 2년 = 2월', r.parts.find((p) => p.label === '부장교사')?.months, 2);
}

// ── 병구역 급지 ────────────────────────────────────────────────────────
{
  const 나 = transferYears({ area: '병', areaGrade: '나', serviceMonths: toMonths(4) });
  const 라 = transferYears({ area: '병', areaGrade: '라', serviceMonths: toMonths(4) });
  eq('병-나 100%', 나.parts.find((p) => p.label === '지역가산')?.months, 48);
  eq('병-라 70%', 라.parts.find((p) => p.label === '지역가산')?.months, Math.floor(48 * 0.7));
}

// ── 김포 석정이 병-라 → 병-나 로 올라간 값 차이 (2026 → 2027) ──────────
{
  const 전 = transferYears({ area: '병', areaGrade: '라', serviceMonths: toMonths(5) });
  const 후 = transferYears({ area: '병', areaGrade: '나', serviceMonths: toMonths(5) });
  eq('김포 4개교 · 5년 근무 기준 차이', 후.months - 전.months, 60 - 42);
}

// ── 5학급 이하·분교장 30% ───────────────────────────────────────────────
// ⛔ 원문(제16조 ③)은 구역 비율과 겹칠 때 무엇이 우선인지 말하지 않는다.
//    예전엔 "30% 가 이긴다"고 박아 뒀는데 그건 근거가 없었다. 병구역 가·나는 법정 특수지라
//    대개 소규모교여서, 30% 가 이기면 벽지 근무자가 100% 대신 30% 만 받는다는 뜻이 된다.
//    높은 쪽을 쓰되 sure:false 로 표시하고 낮게 본 값도 같이 낸다.
{
  const 갑소 = transferYears({ area: '갑', serviceMonths: toMonths(4), smallSchool: true });
  eq('갑구역 5학급 이하는 30%', 갑소.parts.find((p) => p.label === '지역가산')?.months, Math.floor(48 * 0.3));

  const 병소 = transferYears({ area: '병', areaGrade: '가', serviceMonths: toMonths(4), smallSchool: true });
  eq('병 가급지 소규모교는 높은 쪽(100%)', 병소.parts.find((p) => p.label === '지역가산')?.months, 48);

  const b = regionBonus('병', '가', true);
  eq('겹치는 자리는 단정하지 않는다', b.sure, false);
  eq('낮게 본 값도 같이 낸다', b.alt, 30);

  const 갑모름 = regionBonus('갑', null);
  eq('학급수를 모르면 "없음"이라 하지 않는다', 갑모름.label, '—');
  eq('모르는 것은 모른다고 표시한다', 갑모름.sure, false);

  // 학급수가 있으면 그 "모름"이 닫힌다
  eq('36학급 갑구역은 지역가산 없음(확정)', areaFact('경기', '갑', null, 36).label, '지역가산 없음');
  eq('확정이면 단서를 안 붙인다', areaFact('경기', '갑', null, 36).note, null);
  eq('4학급 갑구역은 30%', areaFact('경기', '갑', null, 4).label, '지역가산 30%');
  eq('학급수가 없으면 여전히 "—"', areaFact('경기', '갑', null, null).label, '지역가산 —');
}

// ── 6월 이상 1년 미만 = 2월 · 6월 미만 미인정 ──────────────────────────
{
  const a = transferYears({ area: '을', serviceMonths: toMonths(3), grade6Months: 8 });
  const b = transferYears({ area: '을', serviceMonths: toMonths(3), grade6Months: 5 });
  eq('6학년 담임 8월 = 2월', a.parts.find((p) => p.label === '6학년 담임')?.months, 2);
  eq('6학년 담임 5월 = 미인정', b.parts.find((p) => p.label === '6학년 담임'), undefined);
}

// ── 내신 자격 — 현임교 2년 이상 ────────────────────────────────────────
{
  eq('23월이면 내신 불가', transferYears({ serviceMonths: 23 }).canApply, false);
  eq('24월이면 내신 가능', transferYears({ serviceMonths: 24 }).canApply, true);
}

// ── ⛔ 교사에게는 합산 상한이 없다 (제17조 ③ 은 교장 조항이다) ─────────
{
  const r = transferYears({
    area: '병', areaGrade: '나', serviceMonths: toMonths(5),
    threeChildren: true, coupleOfficials: true,
  });
  // 100% + 50% + 30% = 180% > 100%. 상한을 넣었다면 60 에서 잘렸을 것이다.
  eq('가산이 근무년수를 넘어도 자르지 않는다', r.addMonths, 60 + 30 + 18);
}

// ── 부장 가산 제외 학교 ────────────────────────────────────────────────
{
  const r = transferYears({ area: '을', serviceMonths: toMonths(3), headTeacherMonths: toMonths(3), headTeacherExcluded: true });
  eq('지역승진가산점 대상교면 부장 가산 없음', r.parts.find((p) => p.label === '부장교사'), undefined);
}

console.log(`전보년수 셀프체크 — ${pass}개 통과${fails.length ? ` · ${fails.length}개 실패` : ''}`);
if (fails.length) {
  for (const f of fails) console.log(`  ✗ ${f}`);
  process.exit(1);
}
