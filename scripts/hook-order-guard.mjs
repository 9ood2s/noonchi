#!/usr/bin/env node
/**
 * 가드 ④ — 훅을 조건 뒤에 둔 자리를 센다 (CLAUDE.md §11-2 · BACKLOG ②)
 *
 * 리액트는 훅을 **부른 순서**로 기억한다. 그래서 조건이 참인 렌더에서만 훅을 건너뛰면
 * 「Rendered fewer hooks than expected」 로 던지고 **화면이 통째로 갈린다.**
 * 2026-08-22 지도에서 실제로 났다 — `if (failed) return <Fail/>` 이 useMemo 넷 위에 있었다.
 * 준비해 둔 「지도를 띄울 수 없습니다」는 한 번도 안 그려졌다.
 *
 * ⛔ **왜 손으로 세나** — `npx eslint` 의 `react-hooks/rules-of-hooks` 가 이 결함을 잡는다.
 *    그런데 typescript-eslint 가 TypeScript 7.0 을 아직 못 받아 **멈춘다.**
 *    그래서 이 결함을 **아무도 안 세고 있었다.** typescript-eslint 가 TS 7 을 받으면
 *    이 파일을 지우고 eslint 를 켠다.
 *
 * ⛔ **정규식으로는 못 센다.** 중괄호가 어디서 닫히는지, 저 `return` 이 컴포넌트의 것인지
 *    콜백 안의 것인지를 글자만 보고는 못 가린다. Next 가 안고 있는 SWC 파서로 구문 트리를 받아 센다.
 *    ⚠️ `next/dist/build/swc` 는 Next 내부 통로다. Next 를 올린 뒤 이 가드가 멈추면
 *       그건 결함이 아니라 통로가 바뀐 것이다 — 그때는 **조용히 통과시키지 말고** 여기를 고친다.
 *
 * 두 가지를 센다.
 *   1. 조건부return아래훅 — 일찍 돌아선 뒤에 부르는 훅 (2026-08-22 에 난 그것)
 *   2. 조건문안의훅       — if·삼항·&&·반복문·try 안에서 부르는 훅 (같은 뿌리, 반대 방향)
 *
 * ⚠️ 래칫이다. 베이스라인보다 늘면 실패한다.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE = path.join(ROOT, 'scripts/hook-order-guard.baseline.json');
const DIRS = ['app', 'components'];

/** 훅 이름 — `use` 다음이 대문자. ⛔ 맨몸 `use()` 는 뺀다: 리액트 19 의 `use` 는 조건 안에서 불러도 된다. */
const HOOK = /^use[A-Z]/;

/** 함수 경계 — 여기부터는 **다른 스코프**다. 안쪽 `return` 은 컴포넌트의 것이 아니다. */
const FN = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

/** 이 안에 들어가면 「조건부」다. 훅이 여기 있으면 렌더마다 부르는 횟수가 달라진다. */
const COND = {
  IfStatement: ['consequent', 'alternate'],
  ConditionalExpression: ['consequent', 'alternate'],
  SwitchStatement: ['cases'],
  ForStatement: ['body'],
  ForInStatement: ['body'],
  ForOfStatement: ['body'],
  WhileStatement: ['body'],
  DoWhileStatement: ['body'],
  TryStatement: ['block', 'handler', 'finalizer'],
};

/**
 * ⛔ **SWC 는 `&&`·`||`·`??` 를 `LogicalExpression` 이라 부르지 않는다.**
 *    `BinaryExpression` 에 operator 로 담는다. ESTree 이름으로 찾으면 조용히 놓친다
 *    (실제로 `bad && useMemo(...)` 를 한 번 놓쳤다).
 */
const SHORT_CIRCUIT = new Set(['&&', '||', '??']);
const condKeysOf = (n) =>
  n.type === 'BinaryExpression'
    ? SHORT_CIRCUIT.has(n.operator)
      ? ['right']
      : []
    : (COND[n.type] ?? []);

const walkDir = (d) =>
  fs.existsSync(d)
    ? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
        const p = path.join(d, e.name);
        return e.isDirectory() ? walkDir(p) : /\.(tsx|ts)$/.test(e.name) ? [p] : [];
      })
    : [];

const isNode = (v) => v && typeof v === 'object' && typeof v.type === 'string';
const kids = (n) =>
  Object.entries(n).flatMap(([k, v]) =>
    k === 'span' || k === 'type' ? [] : Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]],
  );

/** 이 호출이 훅인가 — `useMemo(...)` 도 `React.useMemo(...)` 도 잡는다 */
function hookName(n) {
  if (n.type !== 'CallExpression') return null;
  const c = n.callee;
  if (c?.type === 'Identifier' && HOOK.test(c.value)) return c.value;
  if (c?.type === 'MemberExpression' && c.property?.type === 'Identifier' && HOOK.test(c.property.value))
    return c.property.value;
  return null;
}

/** 컴포넌트·커스텀훅으로 볼 이름인가 — 대문자로 시작하거나 `use` 로 시작한다 */
const isReactName = (name) => /^[A-Z]/.test(name) || HOOK.test(name);

/** 파일 전체를 훑어 「이름이 붙은 함수」를 다 모은다. 안에 중첩된 것도 모은다. */
function collectFunctions(root) {
  const out = [];
  const seen = new Set();
  const add = (name, fn) => {
    if (!fn || !FN.has(fn.type) || seen.has(fn)) return;
    seen.add(fn);
    out.push({ name, fn });
  };
  (function scan(n) {
    if (!isNode(n)) return;
    if (n.type === 'FunctionDeclaration' && n.identifier) add(n.identifier.value, n);
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier') add(n.id.value, n.init);
    // `export default function () {}` — 이름이 없어도 페이지·레이아웃은 컴포넌트다
    if (n.type === 'ExportDefaultDeclaration' && FN.has(n.decl?.type))
      add(n.decl.identifier?.value ?? 'default', n.decl);
    for (const [, c] of kids(n)) scan(c);
  })(root);
  return out.filter(({ name }) => isReactName(name));
}

/**
 * 함수 하나를 본다. ⛔ **중첩된 함수로는 안 들어간다** — 거기 `return` 은 이 컴포넌트의 것이 아니다.
 * 돌려주는 것: 일찍 돌아선 자리(early)와 훅을 부른 자리(hooks, 조건 안이었는지 표시).
 */
function inspect(fn) {
  const body = fn.body;
  if (body?.type !== 'BlockStatement') return { early: [], hooks: [] };
  const stmts = body.stmts ?? [];
  const last = stmts[stmts.length - 1];
  const early = [];
  const hooks = [];

  const visit = (n, cond) => {
    if (!isNode(n)) return;
    if (FN.has(n.type)) return; // 다른 스코프다
    if (n.type === 'ReturnStatement' && n !== last) early.push(n.span.start);
    const h = hookName(n);
    if (h) hooks.push({ pos: n.span.start, name: h, cond });
    const condKeys = condKeysOf(n);
    for (const [k, c] of kids(n)) visit(c, cond || condKeys.includes(k));
  };
  for (const s of stmts) visit(s, false);
  return { early, hooks };
}

// ── 세기 ────────────────────────────────────────────────────────────────────
const mod = await import('next/dist/build/swc/index.js');
const swc = mod.default ?? mod;
try {
  await swc.loadBindings();
} catch (e) {
  console.log('⛔ SWC 파서를 못 불렀다 — 가드 ④ 가 아무것도 못 센다:', e.message.split('\n')[0]);
  console.log('   Next 를 올린 뒤라면 next/dist/build/swc 통로가 바뀐 것이다. 조용히 통과시키지 않는다.');
  process.exit(1);
}

const hits = { 조건부return아래훅: [], 조건문안의훅: [] };
let parsed = 0;

for (const file of DIRS.flatMap((d) => walkDir(path.join(ROOT, d)))) {
  const rel = path.relative(ROOT, file);
  const src = fs.readFileSync(file, 'utf8');
  let ast;
  try {
    const raw = await swc.parse(src, {
      filename: file,
      isModule: true,
      syntax: 'typescript',
      tsx: file.endsWith('.tsx'),
    });
    ast = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    console.log(`⛔ ${rel} 을 못 읽었다:`, e.message.split('\n')[0]);
    process.exit(1);
  }
  parsed++;

  // ⛔ **SWC 의 자리값은 바이트다. 글자 수가 아니다.**
  //    한글은 UTF-8 에서 3바이트인데 자바스크립트 문자열은 1칸으로 센다. 그대로 자르면
  //    주석이 한글인 이 저장소에서 줄 번호가 통째로 밀린다(실제로 505줄이 646줄로 찍혔다).
  //    그래서 바이트로 줄머리 표를 만들어 놓고 이분법으로 찾는다.
  const base = ast.span?.start ?? 0;
  const buf = Buffer.from(src, 'utf8');
  const lineStarts = [0];
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) lineStarts.push(i + 1);
  const lineOf = (pos) => {
    const b = Math.max(0, pos - base);
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= b) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  for (const { name, fn } of collectFunctions(ast)) {
    const { early, hooks } = inspect(fn);
    const first = early.length ? Math.min(...early) : Infinity;
    for (const h of hooks) {
      if (h.pos > first)
        hits.조건부return아래훅.push(
          `${rel}:${lineOf(h.pos)}  ${name}() 의 ${h.name} — ${lineOf(first)}줄에서 이미 돌아선다`,
        );
      else if (h.cond) hits.조건문안의훅.push(`${rel}:${lineOf(h.pos)}  ${name}() 의 ${h.name}`);
    }
  }
}

const counts = Object.fromEntries(Object.entries(hits).map(([k, v]) => [k, v.length]));
const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;

if (process.argv.includes('--write')) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log('베이스라인을 새로 적었다', counts);
  process.exit(0);
}

// ⛔ 파일을 하나도 안 읽었으면 그건 「위반 0」이 아니라 가드가 안 돈 것이다
if (parsed === 0) {
  console.log('⛔ 읽은 파일이 0 이다. 가드 ④ 가 아무것도 안 센다.');
  process.exit(1);
}

console.log(
  `가드 ④ 훅 순서 (${parsed}개 파일)`,
  counts,
  base ? `(베이스라인 ${JSON.stringify(base)})` : '(베이스라인 없음)',
);
let failed = false;
for (const [k, v] of Object.entries(counts)) {
  const allowed = base?.[k] ?? 0;
  if (v > allowed) {
    failed = true;
    console.log(`\n⚠️ ${k} ${allowed} → ${v} 로 늘었다:`);
    for (const h of hits[k]) console.log(`  · ${h}`);
  }
}
if (failed) {
  console.log('\n훅은 다 부른 뒤에 돌아선다. 조건은 훅 아래로 내린다.');
  process.exit(1);
}
