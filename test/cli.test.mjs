import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, parseScenarios, orderScenarios, parseSeconds, defaultWaitMs } from "../dist/cli.js";
import { renderText, renderMarkdown } from "../dist/report.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

test("parseArgs: clients, flags, --bin, subcommands", () => {
  const a = parseArgs(["claude", "codex", "--tui", "--timeout", "5", "--bin", "claude=/x/claude", "--scenarios=form"]);
  assert.equal(a.cmd, "run");
  assert.deepEqual(a.clients, ["claude", "codex"]);
  assert.equal(a.flags.get("--tui"), true);
  assert.equal(a.flags.get("--timeout"), "5");
  assert.equal(a.flags.get("--scenarios"), "form");
  assert.equal(a.bins.get("claude"), "/x/claude");
  assert.equal(parseArgs(["server", "--log", "f"]).cmd, "server");
  assert.equal(parseArgs(["clients"]).cmd, "clients");
  assert.throws(() => parseArgs(["--bin", "claude"]), /<client>=<path>/);
  assert.throws(() => parseArgs(["--timeout"]), /needs a value/);
});

test("parseScenarios validates names", () => {
  assert.deepEqual(parseScenarios(undefined), ["form", "url", "unadvertised"]);
  assert.deepEqual(parseScenarios("url, form"), ["url", "form"]);
  assert.throws(() => parseScenarios("forms"), /unknown scenario "forms"/);
  assert.deepEqual(parseScenarios("all"), ["form", "url", "unadvertised", "timeout"]);
  assert.deepEqual(parseScenarios("form,form"), ["form"]);
  assert.throws(() => parseScenarios(" , "), /empty/);
  assert.throws(() => parseScenarios(true), /needs a value/);
});

test("--wait adds the timeout scenario, refuses a list without it, and timeout always runs last", () => {
  assert.deepEqual(parseScenarios(undefined, true), ["form", "url", "unadvertised", "timeout"]);
  assert.deepEqual(parseScenarios("timeout", true), ["timeout"]);
  assert.throws(() => parseScenarios("form", true), /--scenarios form,timeout/);
  assert.deepEqual(orderScenarios(["timeout", "url", "form"]), ["url", "form", "timeout"]);
  assert.equal(parseSeconds("--wait", "45", 1), 45000);
  assert.equal(parseSeconds("--wait", undefined, 60000), 60000);
  assert.throws(() => parseSeconds("--wait", "soon", 1), /--wait must be a number of seconds/);
  assert.throws(() => parseSeconds("--wait", "0", 1), /between 0 and 3600/);
  assert.equal(defaultWaitMs({}), 60000);
  assert.equal(defaultWaitMs({ CI: "true" }), 30000);
  assert.equal(defaultWaitMs({ CI: "false" }), 60000);
});

test("--wait with a scenario list that leaves timeout out is a usage error", () => {
  const r = spawnSync(process.execPath, [cli, "--wait", "5", "--scenarios", "form"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--wait only applies to the timeout scenario/);
});

test("usage errors exit 2 with a hint", () => {
  const r = spawnSync(process.execPath, [cli, "nopeclient"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown client "nopeclient" \(supported: claude, codex, opencode, gemini\)/);
  assert.match(r.stderr, /--help/);
});

test("--version and --help", () => {
  assert.equal(execFileSync(process.execPath, [cli, "--version"], { encoding: "utf8" }).trim(), "0.1.0");
  const help = execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.match(help, /--tui/);
  assert.match(help, /--wait <seconds>/);
});

test("missing explicit binary is reported, not crashed", () => {
  const r = spawnSync(process.execPath, [cli, "--bin", "claude=/definitely/not/here", "claude", "--json"], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.match(j.runs[0].problem, /not found/);
});

const runs = [
  { client: "claude", version: "2.1.310", mode: "headless", command: "claude -p", advertised: { form: true, url: true, raw: {} },
    results: [{ scenario: "form", outcome: { kind: "answered", action: "cancel", ms: 2 } }, { scenario: "unadvertised", outcome: { kind: "not-needed" } }] },
  { client: "codex", version: "0.164.0", mode: "headless", command: "codex exec", advertised: { form: true, url: true, raw: {} },
    results: [{ scenario: "form", outcome: { kind: "answered", action: "decline", ms: 1 } }] },
];

test("text report: no ANSI without color, verdicts and takeaways present", () => {
  const t = renderText(runs, { color: false, nonce: "AW-TEST", when: "now" });
  assert.doesNotMatch(t, /\x1b\[/);
  assert.match(t, /claude 2\.1\.310/);
  assert.match(t, /cancel\s+in 2 ms/);
  assert.match(t, /spec: decline = the user explicitly said no/);
  assert.match(t, /ANSWERS WITHOUT A HUMAN/);
  assert.match(t, /Treat both as "do not proceed"/);
  assert.doesNotMatch(t, /not-needed|skipped: client advertises/);
});

test("markdown report is a pipe table", () => {
  const m = renderMarkdown(runs, { nonce: "AW-TEST", when: "now" });
  assert.match(m, /^\| client \| command \| advertises \| scenario \| answer \|$/m);
  assert.equal(m.split("\n").filter((l) => l.startsWith("| claude")).length, 1);
});

test("text report: timeout scenario rows say what was measured", () => {
  const tuiRuns = [
    { client: "claude", version: "2.1.310", mode: "tui", command: "claude (interactive)", advertised: { form: true, url: true, raw: {} },
      results: [{ scenario: "timeout", seen: true, seenAfterMs: 103, escPressed: false, stillOnScreen: true, outcome: { kind: "timeout", ms: 60012, limitMs: 60000 } }] },
    { client: "codex", version: "0.164.0", mode: "tui", command: "codex (interactive)", advertised: { form: true, url: true, raw: {} },
      results: [{ scenario: "timeout", seen: true, seenAfterMs: 201, escPressed: false, stillOnScreen: false, outcome: { kind: "timeout", ms: 60008, limitMs: 60000 } }] },
    { client: "x", version: "1", mode: "tui", command: "x", advertised: { form: true, url: false, raw: {} },
      results: [{ scenario: "timeout", seen: true, seenAfterMs: 50, escPressed: false, outcome: { kind: "answered", action: "cancel", ms: 30000 } }] },
  ];
  const t = renderText(tuiRuns, { color: false, nonce: "AW-TEST", when: "now" });
  assert.match(t, /timeout\s+silence\s+no answer within 60 s · on screen after 103 ms, nobody pressed a key, the client kept waiting; still on screen 10 s after the server gave up/);
  assert.match(t, /taken down within 10 s of the server giving up/);
  assert.match(t, /WAITS FOR A PERSON/);
  assert.match(t, /cancel\s+in 30\.0 s · on screen after 50 ms, nobody pressed a key, the client answered by itself/);
  assert.match(t, /claude and codex kept the question open for 60 s with nobody there/);
  assert.match(t, /x answered a question nobody touched/);
  assert.match(t, /claude still showed the question 10 s after your server stopped waiting/);
  const headless = renderText([{ ...tuiRuns[0], mode: "headless", results: [{ scenario: "timeout", outcome: { kind: "timeout", ms: 5000, limitMs: 5000 } }] }], { color: false, nonce: "AW-TEST", when: "now" });
  assert.match(headless, /no answer within 5 s · no terminal and no answer/);
  assert.match(headless, /QUESTION NEVER ANSWERED/);
});
