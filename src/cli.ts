#!/usr/bin/env node
import fs from "node:fs";
import { ADAPTERS, adapterById } from "./clients/registry.js";
import { versionOf, which } from "./clients/index.js";
import { makeRoot, runClient } from "./runner.js";
import { runProbeServer } from "./probe-server.js";
import { renderMarkdown, renderText, paint } from "./report.js";
import { clientVerdict } from "./analyze.js";
import { ALL_SCENARIOS, type ClientRun, type Scenario } from "./types.js";
import { VERSION, DOCS_URL } from "./meta.js";

const HELP = `askwire ${VERSION} — does your MCP server's elicitation reach a human?

Drives the AI clients installed on this machine (Claude Code, Codex, opencode, Gemini CLI)
with a scripted stand-in model and a probe MCP server, then reports what each
client actually answered. No account, API key or tokens needed. Your own
client configs are never read or changed.

Usage
  askwire [clients...] [options]     run the probe (default: every client found)
  askwire clients                    list supported clients and what is installed
  askwire server [options]           run only the probe MCP server (stdio)

Options
  --tui                 run the interactive client inside tmux and check the
                        question is really drawn on screen (needs tmux)
  --scenarios <list>    form,url,unadvertised (default: all)
  --timeout <seconds>   how long the probe waits for each answer (default 20)
  --bin <id>=<path>     use a specific binary, e.g. --bin claude=./node_modules/.bin/claude
  --answer esc|none     TUI: press Esc once the question is visible (default) or leave it
  --json                print machine-readable results
  --markdown            print a table you can paste into an issue
  --strict              exit 1 if any client answered without a human
  --keep                keep the run directory (configs, probe log, screens) in ./
  --no-color            plain output (also NO_COLOR=1)
  -h, --help            this help
  -v, --version         print version

Examples
  npx github:Blackman99/askwire
  npx github:Blackman99/askwire claude codex --tui
  askwire server --log /tmp/askwire.jsonl     # add to any MCP client by hand

Docs: ${DOCS_URL}`;

interface Args { cmd: "run" | "server" | "clients" | "help" | "version"; clients: string[]; flags: Map<string, string | true>; bins: Map<string, string>; }

export function parseArgs(argv: string[]): Args {
  const a: Args = { cmd: "run", clients: [], flags: new Map(), bins: new Map() };
  const valued = new Set(["--scenarios", "--timeout", "--bin", "--answer", "--log", "--nonce"]);
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "-h" || x === "--help") { a.cmd = "help"; continue; }
    if (x === "-v" || x === "--version") { a.cmd = "version"; continue; }
    if (x.startsWith("--")) {
      const [k, inline] = x.includes("=") && valued.has(x.slice(0, x.indexOf("="))) ? [x.slice(0, x.indexOf("=")), x.slice(x.indexOf("=") + 1)] : [x, undefined];
      if (valued.has(k)) {
        const v = inline ?? argv[++i];
        if (v === undefined) throw new UsageError(`${k} needs a value`);
        if (k === "--bin") {
          const eq = v.indexOf("=");
          if (eq < 1) throw new UsageError(`--bin expects <client>=<path>, got "${v}"`);
          a.bins.set(v.slice(0, eq), v.slice(eq + 1));
        } else a.flags.set(k, v);
      } else a.flags.set(k, true);
      continue;
    }
    if (a.clients.length === 0 && (x === "server" || x === "clients" || x === "run") && a.cmd === "run") { a.cmd = x; continue; }
    a.clients.push(x);
  }
  return a;
}

class UsageError extends Error {}

export function parseScenarios(v: string | true | undefined): Scenario[] {
  if (v === undefined || v === true) return [...ALL_SCENARIOS];
  const list = v.split(",").map((s) => s.trim()).filter(Boolean);
  const bad = list.filter((s) => !ALL_SCENARIOS.includes(s as Scenario));
  if (bad.length) throw new UsageError(`unknown scenario "${bad[0]}" (choose from ${ALL_SCENARIOS.join(", ")})`);
  return list as Scenario[];
}

function parseTimeout(v: string | true | undefined, def: number): number {
  if (v === undefined || v === true) return def;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 3600) throw new UsageError(`--timeout must be a number of seconds between 0 and 3600, got "${v}"`);
  return Math.round(n * 1000);
}

function nonce(): string {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "AW-";
  for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function nowLabel(): string {
  const d = new Date();
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0"), mm = String(Math.abs(off) % 60).padStart(2, "0");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} UTC${sign}${hh}:${mm}`;
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const color = !args.flags.has("--no-color") && !process.env.NO_COLOR && (process.stdout.isTTY || !!process.env.FORCE_COLOR);
  const p = paint(color);
  const errp = paint(!process.env.NO_COLOR && !!process.stderr.isTTY);
  if (args.cmd === "help") { console.log(HELP); return 0; }
  if (args.cmd === "version") { console.log(VERSION); return 0; }

  if (args.cmd === "server") {
    const log = args.flags.get("--log");
    await runProbeServer({
      log: typeof log === "string" ? log : undefined,
      nonce: typeof args.flags.get("--nonce") === "string" ? String(args.flags.get("--nonce")) : nonce(),
      timeoutMs: parseTimeout(args.flags.get("--timeout"), 120_000),
      scenarios: parseScenarios(args.flags.get("--scenarios")),
    });
    return -1; // keep running until stdin closes
  }

  if (args.cmd === "clients") {
    for (const ad of ADAPTERS) {
      const bin = which(args.bins.get(ad.id) ?? ad.defaultBin);
      const v = bin ? await versionOf(bin) : null;
      console.log(`${ad.id.padEnd(10)}${ad.title.padEnd(14)}${bin ? `${p.green(v ?? "?")}  ${p.dim(bin)}` : p.dim("not found on PATH")}`);
    }
    return 0;
  }

  // run
  for (const c of args.clients) if (!adapterById(c)) throw new UsageError(`unknown client "${c}" (supported: ${ADAPTERS.map((a) => a.id).join(", ")})`);
  for (const c of args.bins.keys()) if (!adapterById(c)) throw new UsageError(`--bin: unknown client "${c}"`);
  const answer = args.flags.get("--answer") ?? "esc";
  if (answer !== "esc" && answer !== "none") throw new UsageError(`--answer must be esc or none`);
  const mode = args.flags.has("--tui") ? "tui" : "headless";
  const scenarios = parseScenarios(args.flags.get("--scenarios"));
  const timeoutMs = parseTimeout(args.flags.get("--timeout"), 20_000);
  const wanted = args.clients.length ? args.clients.map((c) => adapterById(c)!) : ADAPTERS;
  const n = nonce();
  const root = makeRoot(args.flags.has("--keep"));
  const quiet = args.flags.has("--json") || args.flags.has("--markdown");
  const say = (s: string) => { if (!quiet || process.stderr.isTTY) process.stderr.write(s + "\n"); };

  const runs: ClientRun[] = [];
  for (const ad of wanted) {
    const explicit = args.bins.get(ad.id);
    const bin = which(explicit ?? ad.defaultBin);
    if (!bin) {
      if (args.clients.includes(ad.id) || explicit) runs.push({ client: ad.id, version: "?", mode, command: explicit ?? ad.defaultBin, advertised: { form: false, url: false, raw: null }, results: [], problem: `${explicit ?? ad.defaultBin} not found${explicit ? "" : " on PATH (use --bin " + ad.id + "=<path>)"}` });
      else say(errp.dim(`· ${ad.id}: not installed, skipped`));
      continue;
    }
    const version = (await versionOf(bin)) ?? "?";
    say(errp.dim(`· ${ad.id} ${version}: running ${mode === "tui" ? "interactive session in tmux" : ad.headlessLabel}…`));
    const run = await runClient({ adapter: ad, bin, version, mode, scenarios, timeoutMs, nonce: n, root, answer, onStep: (m) => say(errp.dim(`    ${m}`)) });
    if (!args.flags.has("--keep") && !run.problem) { try { fs.rmSync(run.logDir!, { recursive: true, force: true }); } catch { /* ignore */ } run.logDir = undefined; }
    runs.push(run);
  }
  if (!args.flags.has("--keep")) { try { fs.rmdirSync(root); } catch { /* keep dirs with problems */ } }

  if (runs.length === 0) {
    process.stderr.write(`askwire: none of ${wanted.map((a) => a.id).join(", ")} found on PATH.\nInstall one, or point at a binary with --bin claude=/path/to/claude.\n`);
    return 2;
  }
  const when = nowLabel();
  if (args.flags.has("--json")) console.log(JSON.stringify({ askwire: VERSION, probe: n, when, runs }, null, 2));
  else if (args.flags.has("--markdown")) console.log(renderMarkdown(runs, { nonce: n, when }));
  else console.log(renderText(runs, { color, nonce: n, when }));
  if (args.flags.has("--strict") && runs.some((r) => clientVerdict(r).tone === "bad")) return 1;
  return 0;
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname);
if (isMain) {
  main(process.argv.slice(2)).then((code) => { if (code >= 0) process.exit(code); }).catch((e) => {
    if (e instanceof UsageError) { process.stderr.write(`askwire: ${e.message}\nRun askwire --help for usage.\n`); process.exit(2); }
    process.stderr.write(`askwire: ${e?.stack ?? e}\n`); process.exit(2);
  });
}
