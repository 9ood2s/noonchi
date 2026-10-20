'use strict';

// Next.js loads this adapter through CommonJS require('fast-glob').
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { globSync: tinyGlobSync, isDynamicPattern } = require('tinyglobby');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { isAbsolute, relative, resolve } = require('node:path');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { realpathSync, statSync } = require('node:fs');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const picomatch = require('picomatch');

function unmarkDirectory(entry) {
  // tinyglobby marks directory matches with a slash. fast-glob does not unless
  // markDirectories is requested. Keep filesystem roots intact.
  return entry.length > 1 && entry.endsWith('/') && !/^[A-Za-z]:\/$/.test(entry)
    ? entry.slice(0, -1)
    : entry;
}

// This package is scoped by npm overrides to @next/eslint-plugin-next only.
// Next.js 16.3.8 uses just globSync(pattern, { onlyDirectories: true }) in
// dist/utils/get-root-dirs.js. It is not a replacement for the full fast-glob API.
// tinyglobby otherwise expands literal directories recursively by default.
function globSync(patterns, options = {}) {
  const source = Array.isArray(patterns) ? patterns : [patterns];
  const isNegative = (pattern) => pattern.startsWith('!') && !pattern.startsWith('!(');
  const negatives = source.filter(isNegative);
  const results = new Set();
  for (const pattern of source.filter((entry) => !isNegative(entry))) {
    const directoryLinks = new Set();
    const cwd = resolve(options.cwd || process.cwd());
    const globOptions = {
      ...options,
      ...(isAbsolute(pattern) ? { absolute: true } : {}),
      expandDirectories: false,
      fs: {
        ...options.fs,
        realpathSync(filename, ...args) {
          const resolved = (options.fs?.realpathSync || realpathSync)(filename, ...args);
          directoryLinks.add(String(filename));
          return resolved;
        },
      },
    };
    // tinyglobby turns an absolute spelling of cwd into an empty pattern.
    const query = (value) => isAbsolute(value) && resolve(value) === cwd ? '.' : value;
    const dynamic = isDynamicPattern(pattern);
    const excludedBases = new Set();
    const normalized = pattern.replace(/\/$/, '');
    if (dynamic) {
      // Exclude the static task base even when a pattern has several globstars.
      // Brace-only components expand to separate bases in fast-glob.
      const segments = normalized.split('/');
      const firstWildcard = segments.findIndex((segment) => /[*?[\]()]/.test(segment));
      const basePattern = segments.slice(0, firstWildcard).join('/') || (isAbsolute(pattern) ? '/' : '.');
      for (const base of tinyGlobSync(query(basePattern), globOptions)) {
        excludedBases.add(resolve(cwd, unmarkDirectory(base)));
      }
    }
    const matches = tinyGlobSync([query(pattern), ...negatives], globOptions);
    // A final globstar can match zero segments after an earlier wildcard.
    if (dynamic && normalized.endsWith('/**')) {
      const prefix = normalized.slice(0, -3);
      if (isDynamicPattern(prefix)) {
        matches.push(...tinyGlobSync([query(prefix), ...negatives], globOptions));
      }
    }
    // fdir follows a directory symlink but omits the link itself. Add only
    // matching links encountered by that same traversal; its cycle guard stays
    // active and no extra directory traversal is started here.
    if (options.onlyDirectories && options.followSymbolicLinks !== false) {
      const matchOptions = {
        dot: options.dot,
        nobrace: options.braceExpansion === false,
        nocase: options.caseSensitiveMatch === false,
        noextglob: options.extglob === false,
        noglobstar: options.globstar === false,
      };
      const accepts = picomatch(normalized, matchOptions);
      const rejects = negatives.map((entry) => ({
        absolute: isAbsolute(entry.slice(1)),
        matches: picomatch(entry.slice(1), matchOptions),
      }));
      for (const link of directoryLinks) {
        const absolutePath = resolve(link).replace(/\\/g, '/');
        const relativePath = relative(cwd, link).replace(/\\/g, '/') || '.';
        const candidate = isAbsolute(pattern) ? absolutePath : relativePath;
        if (!accepts(candidate) && !accepts(candidate + '/')) continue;
        if (rejects.some((entry) => {
          const rejected = entry.absolute ? absolutePath : relativePath;
          return entry.matches(rejected) || entry.matches(rejected + '/');
        })) continue;
        try {
          if ((options.fs?.statSync || statSync)(link).isDirectory()) {
            matches.push(globOptions.absolute ? absolutePath : relativePath);
          }
        } catch (error) {
          if (!['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code)) throw error;
        }
      }
    }
    for (const entry of matches) {
      const unmarked = unmarkDirectory(entry);
      if (dynamic && (unmarked === '.' || excludedBases.has(resolve(cwd, unmarked)))) continue;
      // Static paths preserve spelling such as './' and a trailing slash.
      const match = !dynamic && !options.absolute ? pattern : unmarked;
      results.add(options.markDirectories ? entry : match);
    }
  }
  return [...results];
}

module.exports = { globSync };
