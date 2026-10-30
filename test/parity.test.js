// The JS port must produce exactly what the reference Python rules.py produces.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkConfig, checkDescription, analyzeHistory, configFromText, RULES } from "../src/rules.js";

const fx = JSON.parse(readFileSync(new URL("./fixtures/parity.json", import.meta.url), "utf8"));
const NOW = new Date(fx.now);

test("15 rules", () => assert.equal(RULES.length, 15));

fx.config.forEach((c, i) =>
  test(`config parity #${i}`, () => assert.deepEqual(checkConfig(c.input).asDict(), c.expected)));

fx.description.forEach((c, i) =>
  test(`description parity #${i}`, () => {
    assert.deepEqual(configFromText(c.input), c.config);
    assert.deepEqual(checkDescription(c.input).asDict(), c.expected);
  }));

fx.history.forEach((c, i) =>
  test(`history parity #${i}`, () => assert.deepEqual(analyzeHistory(c.input, c.interval, NOW).asDict(), c.expected)));

fx.errors.forEach((c, i) =>
  test(`error parity #${i} (${c.kind})`, () => {
    const fn = { config: checkConfig, description: checkDescription, history: analyzeHistory }[c.kind];
    assert.throws(() => fn(c.input), { message: c.message });
  }));

test("'nobody works on weekends' and similar phrasings flag missing after-hours coverage", () => {
  for (const t of ["Nobody works on weekends.", "No one answers at night.", "No after-hours cover."])
    assert.equal(configFromText(t).routing.after_hours_coverage, false);
});
