import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

// Run the actual browser helpers against a small browser API fixture.
const { outputText } = ts.transpileModule(
  readFileSync(new URL("../components/theme-toggle.tsx", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
);

function browser(storageBlocked) {
  const dataset = { theme: "light" };
  const saved = new Map();
  const events = [];
  const fixtureModule = { exports: {} };
  vm.runInNewContext(outputText, {
    module: fixtureModule, exports: fixtureModule.exports,
    document: { documentElement: { dataset } },
    localStorage: {
      getItem(key) {
        if (storageBlocked) throw new Error("Storage blocked");
        return saved.get(key) ?? null;
      },
      setItem(key, value) {
        if (storageBlocked) throw new Error("Storage blocked");
        saved.set(key, value);
      },
    },
    window: { dispatchEvent(event) { events.push(event.type); } },
    CustomEvent: class { constructor(type) { this.type = type; } },
  });
  return { ...fixtureModule.exports, dataset, saved, events };
}

for (const blocked of [false, true]) {
  for (const theme of ["light", "dark", "auto"]) {
    test(`theme ${theme} keeps its applied selection with storage ${blocked ? "blocked" : "available"}`, () => {
      const b = browser(blocked);
      b.apply(theme);
      assert.equal(b.readAppliedTheme(), theme);
      assert.deepEqual(b.events, ["runaway:theme"]);
      assert.equal(b.dataset.theme, theme === "auto" ? undefined : theme);
      assert.equal(b.saved.get("runaway.theme"), blocked ? undefined : theme);
    });
  }
}

test("unconfigured and blocked storage preserve the original light preference fallback", () => {
  assert.equal(browser(false).readTheme(), "light");
  assert.equal(browser(true).readTheme(), "light");
});

test("repeated theme changes follow the current document despite storage failure", () => {
  const b = browser(true);
  for (const theme of ["dark", "auto", "light", "dark"]) {
    b.apply(theme);
    assert.equal(b.readAppliedTheme(), theme);
  }
  assert.equal(b.events.length, 4);
});
