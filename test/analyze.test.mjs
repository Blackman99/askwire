import { test } from "node:test";
import assert from "node:assert/strict";
import { advertised, outcomeFor, pendingScenario, results, verdictOf, clientVerdict } from "../dist/analyze.js";

const init = (caps) => ({ ev: "initialized", t: 1, caps });

test("empty elicitation object means form only (spec back-compat)", () => {
  assert.deepEqual(
    { ...advertised([init({ elicitation: {} })]), raw: undefined, clientInfo: undefined },
    { form: true, url: false, raw: undefined, clientInfo: undefined });
  const both = advertised([init({ elicitation: { form: {}, url: {} } })]);
  assert.equal(both.form && both.url, true);
  const urlOnly = advertised([init({ elicitation: { url: {} } })]);
  assert.equal(urlOnly.form, false);
  assert.equal(urlOnly.url, true);
  assert.equal(advertised([init({ roots: {} })]).form, false);
  assert.equal(advertised([]).raw, null);
});

test("outcome comes from the last terminal event for the scenario", () => {
  const ev = [
    init({ elicitation: {} }),
    { ev: "sent", t: 2, scenario: "form", mode: "form" },
    { ev: "result", t: 4, scenario: "form", ms: 2, action: "cancel" },
    { ev: "sent", t: 5, scenario: "url", mode: "url" },
    { ev: "timeout", t: 9, scenario: "url", ms: 4 },
    { ev: "skipped", t: 9, scenario: "unadvertised", reason: "advertised" },
  ];
  assert.deepEqual(outcomeFor(ev, "form"), { kind: "answered", action: "cancel", ms: 2, content: undefined });
  assert.deepEqual(outcomeFor(ev, "url"), { kind: "timeout", ms: 4 });
  assert.deepEqual(outcomeFor(ev, "unadvertised"), { kind: "not-needed" });
  assert.equal(pendingScenario(ev), null);
  assert.deepEqual(pendingScenario(ev.slice(0, 4)), { scenario: "url", t: 5 });
});

test("unreached scenarios carry the reason", () => {
  const r = results([], ["form"], (s) => `never got to ${s}`);
  assert.deepEqual(r[0].outcome, { kind: "not-reached", why: "never got to form" });
});

test("verdicts: headless answer = no human, tui seen = human, unadvertised error = honest", () => {
  const ans = { scenario: "form", outcome: { kind: "answered", action: "cancel", ms: 3 } };
  assert.equal(verdictOf(ans, "headless"), "no-human");
  assert.equal(verdictOf({ ...ans, seen: true }, "tui"), "human");
  assert.equal(verdictOf({ ...ans, seen: false }, "tui"), "no-human");
  assert.equal(verdictOf({ scenario: "unadvertised", outcome: { kind: "error", code: -32601, message: "x", ms: 1 } }, "headless"), "honest");
  assert.equal(verdictOf({ scenario: "form", outcome: { kind: "error", code: -32603, message: "x", ms: 1 } }, "headless"), "broken");
  assert.equal(verdictOf({ scenario: "form", outcome: { kind: "timeout", ms: 1 } }, "headless"), "hung");
});

test("client verdict words", () => {
  const base = { client: "x", version: "1", command: "x", advertised: { form: true, url: true, raw: {} } };
  const headless = { ...base, mode: "headless", results: [{ scenario: "form", outcome: { kind: "answered", action: "decline", ms: 2 } }] };
  assert.match(clientVerdict(headless).word, /WITHOUT A HUMAN/);
  assert.equal(clientVerdict(headless).tone, "bad");
  const tui = { ...base, mode: "tui", results: [{ scenario: "form", seen: true, outcome: { kind: "answered", action: "cancel", ms: 2000 } }] };
  assert.equal(clientVerdict(tui).tone, "good");
  const none = { ...base, advertised: { form: false, url: false, raw: {} }, mode: "headless", results: [
    { scenario: "form", outcome: { kind: "not-advertised" } },
    { scenario: "unadvertised", outcome: { kind: "error", code: -32601, message: "Method not found", ms: 3 } }] };
  assert.match(clientVerdict(none).word, /SAYS SO/);
  assert.match(clientVerdict({ ...base, mode: "headless", results: [], problem: "boom" }).word, /COULD NOT RUN/);
});
