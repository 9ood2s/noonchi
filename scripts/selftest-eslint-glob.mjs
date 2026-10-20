import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const adapter = require('../tools/next-eslint-glob/index.cjs');
const fixture = mkdtempSync(path.join(tmpdir(), 'noonchi-eslint-glob-'));

for (const directory of [
  'app',
  'apps/web/app',
  'apps/admin/app',
  'apps/.hidden/app',
  'packages/ui',
  'docs',
  '.hidden',
]) {
  mkdirSync(path.join(fixture, directory), { recursive: true });
}
for (const filename of [
  'README.md',
  '.env.example',
  'apps/web/package.json',
  'apps/admin/package.json',
  'app/page.jsx',
  'apps/web/app/page.jsx',
  'apps/admin/app/page.jsx',
]) {
  writeFileSync(path.join(fixture, filename), 'export default function Page() { return null; }\n');
}

process.on('exit', () => rmSync(fixture, { recursive: true, force: true }));

function directories(patterns, options = {}) {
  return adapter.globSync(patterns, {
    cwd: fixture,
    onlyDirectories: true,
    ...options,
  }).sort();
}

test('the installed Next.js ESLint plugin resolves the scoped adapter', () => {
  const pluginRequire = createRequire(require.resolve('@next/eslint-plugin-next'));
  assert.equal(pluginRequire('fast-glob').globSync, adapter.globSync);
  assert.deepEqual(Object.keys(pluginRequire('fast-glob')), ['globSync']);
});

const cases = [
  ['literal directory does not expand to descendants', 'apps/web', ['apps/web']],
  ['literal file is excluded by onlyDirectories', 'README.md', []],
  ['the current directory remains a literal root', '.', ['.']],
  ['a trailing slash on a literal current directory is preserved', './', ['./']],
  ['a trailing slash on a literal directory is preserved', 'apps/', ['apps/']],
  ['single wildcard excludes hidden directories', 'apps/*', ['apps/admin', 'apps/web']],
  ['globstar finds descendants', 'apps/**', ['apps/admin', 'apps/admin/app', 'apps/web', 'apps/web/app']],
  ['a root globstar excludes the current directory', '**', [
    'app', 'apps', 'apps/admin', 'apps/admin/app', 'apps/web', 'apps/web/app',
    'docs', 'packages', 'packages/ui',
  ]],
  ['globstar suffix finds app directories', 'apps/**/app', ['apps/admin/app', 'apps/web/app']],
  ['trailing slash on a globstar excludes its base', 'apps/**/', ['apps/admin', 'apps/admin/app', 'apps/web', 'apps/web/app']],
  ['a globstar after a wildcard can match zero segments', 'apps/**/app/**', ['apps/admin/app', 'apps/web/app']],
  ['a globstar after a single wildcard includes its directory roots', 'apps/*/**', [
    'apps/admin', 'apps/admin/app', 'apps/web', 'apps/web/app',
  ]],
  ['consecutive globstars exclude the static base', 'apps/**/**', [
    'apps/admin', 'apps/admin/app', 'apps/web', 'apps/web/app',
  ]],
  ['brace alternatives match directory roots', 'apps/{web,admin}', ['apps/admin', 'apps/web']],
  ['globstars after brace alternatives exclude each base', 'apps/{web,admin}/**', ['apps/admin/app', 'apps/web/app']],
  ['negative patterns exclude matching roots', ['apps/*', '!apps/admin'], ['apps/web']],
  ['a negative globstar also excludes its base', ['**', '!apps/**'], ['app', 'docs', 'packages', 'packages/ui']],
  ['trailing slash preserves directory roots', 'apps/*/', ['apps/admin', 'apps/web']],
  ['explicit hidden paths remain supported', 'apps/.hidden', ['apps/.hidden']],
  ['dot-prefixed wildcard finds hidden roots', '.*', ['.hidden']],
  ['nonexistent roots yield no matches', 'does-not-exist', []],
];

for (const [description, patterns, expected] of cases) {
  test(description, () => assert.deepEqual(directories(patterns), expected));
}

test('absolute directory patterns remain absolute', () => {
  assert.deepEqual(directories(path.join(fixture, 'apps/*')), [
    path.join(fixture, 'apps/admin'),
    path.join(fixture, 'apps/web'),
  ].sort());
});

test('absolute spellings of cwd with dot segments preserve their spelling', () => {
  for (const pattern of [fixture + '/.', fixture + '/./']) {
    assert.deepEqual(directories(pattern), [pattern]);
  }
});

test('directory symlink roots and their descendants remain discoverable', () => {
  const linkFixture = mkdtempSync(path.join(tmpdir(), 'noonchi-eslint-symlink-'));
  try {
    mkdirSync(path.join(linkFixture, 'apps/a/app'), { recursive: true });
    symlinkSync(path.join(linkFixture, 'apps/a'), path.join(linkFixture, 'apps/link'),
      process.platform === 'win32' ? 'junction' : 'dir');
    const options = { cwd: linkFixture, onlyDirectories: true };
    assert.deepEqual(adapter.globSync('apps/*', options).sort(), ['apps/a', 'apps/link']);
    for (const pattern of ['apps/**', 'apps/*/**']) {
      assert.deepEqual(adapter.globSync(pattern, options).sort(), [
        'apps/a', 'apps/a/app', 'apps/link', 'apps/link/app',
      ], pattern);
    }
    assert.deepEqual(adapter.globSync('**', options).sort(), [
      'apps', 'apps/a', 'apps/a/app', 'apps/link', 'apps/link/app',
    ]);
    assert.deepEqual(adapter.globSync('apps/link', options), ['apps/link']);
  } finally {
    rmSync(linkFixture, { recursive: true, force: true });
  }
});

test('onlyDirectories forwards explicit dot matching', () => {
  assert.deepEqual(directories('apps/*', { dot: true }), [
    'apps/.hidden', 'apps/admin', 'apps/web',
  ]);
});

test('file matching remains distinct from onlyDirectories', () => {
  assert.deepEqual(adapter.globSync('README.md', { cwd: fixture }), ['README.md']);
  assert.deepEqual(adapter.globSync('apps/web', { cwd: fixture }), []);
});

test('deeply nested brace input does not exhaust the call stack', () => {
  const nested = '{'.repeat(4_500) + 'x' + '}'.repeat(4_500);
  assert.doesNotThrow(() => directories(nested));
});

test('actual Next.js ESLint rootDir discovery still reports internal HTML links', () => {
  // A child process gives glob resolution the same cwd as ESLint, including
  // relative rootDir settings, without changing this test runner's cwd.
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    import path from 'node:path';
    const require = createRequire(${JSON.stringify(fileURLToPath(import.meta.url))});
    const { ESLint } = require('eslint');
    const nextPlugin = require('@next/eslint-plugin-next');
    const rootDirs = [
      '.',
      'apps/web',
      'apps/*',
      'apps/{web,admin}',
      path.join(process.cwd(), 'apps/web'),
      process.cwd() + '/.',
      process.cwd() + '/./',
      'apps/*/**',
      'apps/**/**',
      ['apps/web', 'apps/admin'],
    ];
    for (const rootDir of rootDirs) {
      const eslint = new ESLint({
        cwd: process.cwd(),
        overrideConfigFile: true,
        overrideConfig: [{
          files: ['**/*.jsx'],
          languageOptions: {
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
          plugins: { '@next/next': nextPlugin },
          settings: { next: { rootDir } },
          rules: { '@next/next/no-html-link-for-pages': 'error' },
        }],
      });
      const [internal] = await eslint.lintText(
        'export default function Example() { return <a href="/">Home</a>; }',
        { filePath: 'component.jsx' },
      );
      assert.equal(internal.fatalErrorCount, 0, JSON.stringify(rootDir));
      assert(internal.messages.some((message) =>
        message.ruleId === '@next/next/no-html-link-for-pages' && message.severity === 2
      ), 'Missing Next.js internal link diagnostic: ' + JSON.stringify(rootDir));
      const [external] = await eslint.lintText(
        'export default function Example() { return <a href="https://example.com/about">About</a>; }',
        { filePath: 'component.jsx' },
      );
      assert.equal(external.errorCount, 0, JSON.stringify(rootDir));
    }
    console.log('Next.js rootDir settings: ' + rootDirs.length + ' variants passed');
  `], {
    cwd: fixture,
    encoding: 'utf8',
    timeout: 15_000,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.match(child.stdout, /10 variants passed/);
});
