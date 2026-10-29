import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import src from "../src/worker.js";
import bundled from "../dist/worker.js";

const SECRET = "test-secret-not-real";
const ENV = { PROXY_SECRET: SECRET };
const example = readFileSync(new URL("../examples/pipeline.json", import.meta.url), "utf8");
const csv = readFileSync(new URL("../examples/run_history.csv", import.meta.url), "utf8");

for (const [label, worker] of [["src", src], ["dist bundle", bundled]]) {
  const call = (path, init = {}, env = ENV) => worker.fetch(new Request("https://x.test" + path, init), env);
  const auth = (h = {}) => ({ "x-origin-key": SECRET, ...h });

  test(`${label}: health and openapi are public`, async () => {
    assert.equal((await call("/health")).status, 200);
    const o = await (await call("/openapi.json")).json();
    assert.equal(o.openapi, "3.1.0");
    assert.ok(o.paths["/v1/check"].get && o.paths["/v1/check"].post);
  });

  test(`${label}: secret required`, async () => {
    assert.equal((await call("/v1/rules")).status, 401);
    assert.equal((await call("/v1/rules", { headers: { "x-origin-key": "wrong" } })).status, 401);
    assert.equal((await call("/v1/rules", { headers: { "X-RapidAPI-Proxy-Secret": SECRET } })).status, 200);
    assert.equal((await call("/v1/rules", { headers: auth() })).status, 200);
    assert.equal((await call("/v1/rules", { headers: auth() }, {})).status, 503, "fails closed when PROXY_SECRET is unset");
    assert.equal((await call("/v1/rules", {}, { ALLOW_OPEN: "true" })).status, 200);
    assert.equal((await call("/v1/rules", { headers: { "x-custom": SECRET } }, { ...ENV, SECRET_HEADERS: "x-custom" })).status, 200);
  });

  test(`${label}: POST and GET /v1/check agree`, async () => {
    const a = await (await call("/v1/check", { method: "POST", headers: auth({ "content-type": "application/json" }), body: example })).json();
    const b = await (await call("/v1/check?config=" + encodeURIComponent(example), { headers: auth() })).json();
    assert.deepEqual(a, b);
    assert.equal(a.risk_score, 100);
    assert.equal(a.findings[0].severity, "high");
    assert.ok(!a.report_markdown.includes("http"), "no URL by default");
    const wrapped = await (await call("/v1/check", { method: "POST", headers: auth({ "content-type": "application/json" }), body: JSON.stringify({ config: JSON.parse(example) }) })).json();
    assert.deepEqual(wrapped, a);
  });

  test(`${label}: description GET/POST/plain text`, async () => {
    const text = "Typeform leads go to Google Sheets via Zapier on the free plan. Nobody is assigned. No error alerts.";
    const g = await (await call("/v1/check-description?include_markdown=false&text=" + encodeURIComponent(text), { headers: auth() })).json();
    const p = await (await call("/v1/check-description?include_markdown=false", { method: "POST", headers: auth({ "content-type": "application/json" }), body: JSON.stringify({ text }) })).json();
    const t = await (await call("/v1/check-description?include_markdown=false", { method: "POST", headers: auth({ "content-type": "text/plain" }), body: text })).json();
    assert.deepEqual(g, p); assert.deepEqual(p, t);
    assert.equal(g.report_markdown, undefined);
    assert.ok(g.findings.some((f) => f.id === "no-owner" && f.severity === "high"));
  });

  test(`${label}: analyze-history`, async () => {
    const r = await (await call("/v1/analyze-history", { method: "POST", headers: auth({ "content-type": "text/csv" }), body: csv })).json();
    assert.ok(r.findings.some((f) => f.id === "failed-runs"));
    const j = await (await call("/v1/analyze-history", { method: "POST", headers: auth({ "content-type": "application/json" }), body: JSON.stringify({ csv, expected_interval_minutes: 30 }) })).json();
    assert.ok(j.findings.length >= 1);
    assert.equal((await call("/v1/analyze-history?expected_interval_minutes=-1&csv=status%0Aok", { headers: auth() })).status, 400);
  });

  test(`${label}: errors`, async () => {
    assert.equal((await call("/v1/check?config=%5B%5D", { headers: auth() })).status, 400);
    assert.equal((await call("/v1/check?config=nope", { headers: auth() })).status, 400);
    assert.equal((await call("/v1/check", { headers: auth() })).status, 400);
    assert.equal((await call("/v1/check-description?text=%20", { headers: auth() })).status, 400);
    assert.equal((await call("/v1/analyze-history?csv=foo%2Cbar%0A1%2C2", { headers: auth() })).status, 400);
    assert.equal((await call("/v1/nope", { headers: auth() })).status, 404);
    assert.equal((await call("/v1/rules", { method: "DELETE", headers: auth() })).status, 405);
    const big = "x".repeat(1_000_001);
    assert.equal((await call("/v1/check-description", { method: "POST", headers: auth({ "content-type": "text/plain" }), body: big })).status, 413);
  });

  test(`${label}: optional footer URL`, async () => {
    const r = await (await call("/v1/check?config=%7B%7D", { headers: auth() }, { ...ENV, FOOTER_URL: "https://example.com/x" })).json();
    assert.ok(r.report_markdown.trim().endsWith("https://example.com/x_"));
  });
}
