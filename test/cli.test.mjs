import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs, parseScenarios } from "../dist/cli.js";
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
});

test("usage errors exit 2 with a hint", () => {
  const r = spawnSync(process.execPath, [cli, "nopeclient"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown client "nopeclient" \(supported: claude, codex, opencode, gemini\)/);
  assert.match(r.stderr, /--help/);
});

test("--version and --help", () => {
  assert.equal(execFileSync(process.execPath, [cli, "--version"], { encoding: "utf8" }).trim(), "0.1.0");
  assert.match(execFileSync(process.execPath, [cli, "--help"], { encoding: "utf8" }), /--tui/);
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
