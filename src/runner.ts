import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { startStandin } from "./standin.js";
import { advertised, pendingScenario, readLog, results } from "./analyze.js";
import type { Adapter, Mode } from "./clients/index.js";
import type { ClientRun, Scenario, ScenarioResult } from "./types.js";

export interface RunOptions {
  adapter: Adapter;
  bin: string;
  version: string;
  mode: Mode;
  scenarios: Scenario[];
  timeoutMs: number;   // per elicitation request
  waitMs: number;      // timeout scenario: how long the question is left untouched
  nonce: string;
  root: string;        // parent dir for throwaway dirs
  answer: "esc" | "none";
  onStep?: (msg: string) => void;
}

const PROMPT = "Run the askwire probe tools.";
const CLI = fileURLToPath(new URL("./cli.js", import.meta.url));

function baseEnv(): Record<string, string> {
  const keep = ["PATH", "LANG", "LC_ALL", "TERM", "TMPDIR", "USER", "LOGNAME", "SHELL", "SYSTEMROOT", "COMSPEC", "PATHEXT", "APPDATA", "LOCALAPPDATA", "NODE_EXTRA_CA_CERTS", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy"];
  const env: Record<string, string> = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k]!;
  env.TERM ??= "xterm-256color";
  return env;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shq = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;

export async function runClient(o: RunOptions): Promise<ClientRun> {
  const dir = fs.mkdtempSync(path.join(o.root, `${o.adapter.id}-${o.mode}-`));
  const workDir = path.join(dir, "work");
  fs.mkdirSync(workDir, { recursive: true });
  const log = path.join(dir, "probe.jsonl");
  const standin = await startStandin(o.scenarios);
  const probe = {
    command: process.execPath,
    args: [CLI, "server", "--log", log, "--nonce", o.nonce, "--timeout", String(o.timeoutMs / 1000), "--wait", String(o.waitMs / 1000), "--scenarios", o.scenarios.join(",")],
  };
  const prep = o.adapter.prepare({ dir, workDir, standinUrl: standin.url, probe, bin: o.bin, mode: o.mode, prompt: PROMPT, baseEnv: baseEnv() });
  const run: ClientRun = {
    client: o.adapter.id, version: o.version, mode: o.mode, command: prep.display,
    advertised: { form: false, url: false, raw: null }, results: [], logDir: dir,
  };
  const seen = new Map<Scenario, number>();
  const escs = new Set<Scenario>();
  const lingering = new Map<Scenario, boolean>();
  try {
    if (o.mode === "headless") await headless(o, prep, dir);
    else {
      const problem = await tui(o, prep, dir, log, seen, escs, lingering);
      if (problem) run.problem = problem;
    }
  } finally {
    await standin.close();
  }
  const events = readLog(log);
  const adv = advertised(events);
  run.advertised = { form: adv.form, url: adv.url, raw: adv.raw };
  run.clientInfo = adv.clientInfo;
  const out = safeRead(path.join(dir, "client.out"));
  const notReached = (s: Scenario) => {
    if (!events.some((e) => e.ev === "initialized")) return "the client never connected to the probe server";
    if (standin.stats.requests === 0) return "the client never called the model endpoint";
    if (![...standin.stats.toolNames].some((n) => n.endsWith(`askwire_${s}`))) return "the client did not offer the probe tool to the model";
    const hint = out.split("\n").find((l) => /approv|permission|denied|not allowed|blocked/i.test(l));
    return hint ? `tool call blocked by the client: ${hint.trim().slice(0, 140)}` : "the tool call never reached the probe server";
  };
  run.results = results(events, o.scenarios, notReached).map((r): ScenarioResult => {
    if (o.mode !== "tui") return r;
    const sent = events.find((e) => e.ev === "sent" && e.scenario === r.scenario);
    const at = seen.get(r.scenario);
    const out: ScenarioResult = { ...r, seen: at !== undefined, seenAfterMs: at !== undefined && sent ? Math.max(0, at - sent.t) : undefined, escPressed: escs.has(r.scenario) };
    if (lingering.has(r.scenario)) out.stillOnScreen = lingering.get(r.scenario);
    return out;
  });
  if (!run.problem && !events.some((e) => e.ev === "initialized")) {
    const tail = out.trim().split("\n").slice(-3).join(" ").slice(0, 200);
    run.problem = `client never started the probe server${tail ? ` — last output: ${tail}` : ""}`;
  }
  return run;
}

/** worst-case time the probe itself may spend waiting for answers */
export function budget(o: Pick<RunOptions, "scenarios" | "timeoutMs" | "waitMs">): number {
  return o.scenarios.reduce((sum, s) => sum + (s === "timeout" ? o.waitMs : o.timeoutMs), 0);
}

function safeRead(p: string) { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } }

async function headless(o: RunOptions, prep: { argv: string[]; env: Record<string, string>; cwd: string }, dir: string) {
  const outFd = fs.openSync(path.join(dir, "client.out"), "w");
  const child = spawn(prep.argv[0], prep.argv.slice(1), { cwd: prep.cwd, env: prep.env, stdio: ["ignore", outFd, outFd] });
  const limit = budget(o) + 90_000;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => { child.kill("SIGTERM"); setTimeout(() => child.kill("SIGKILL"), 3000); }, limit);
    child.on("exit", () => { clearTimeout(timer); resolve(); });
    child.on("error", () => { clearTimeout(timer); resolve(); });
  });
  fs.closeSync(outFd);
}

function tmux(args: string[], sock: string): string {
  return execFileSync("tmux", ["-L", sock, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** How long the question is watched after the probe gives up on it (see ScenarioResult.stillOnScreen). */
export const LINGER_MS = 10_000;

async function tui(o: RunOptions, prep: { argv: string[]; env: Record<string, string>; cwd: string }, dir: string, log: string, seen: Map<Scenario, number>, escs: Set<Scenario>, lingering: Map<Scenario, boolean>): Promise<string | undefined> {
  try { execFileSync("tmux", ["-V"], { stdio: "ignore" }); } catch { return "--tui needs tmux on PATH"; }
  const sock = `askwire-${process.pid}-${o.adapter.id}`;
  const launch = path.join(dir, "launch.sh");
  fs.writeFileSync(launch, [
    "#!/bin/sh",
    "# re-run this to watch the same client session yourself",
    `cd ${shq(prep.cwd)} || exit 1`,
    // stderr must stay on the terminal: some clients (codex) refuse to start their TUI otherwise
    `exec env -i ${Object.entries({ ...prep.env, TERM: "xterm-256color" }).map(([k, v]) => `${k}=${shq(v)}`).join(" ")} ${prep.argv.map(shq).join(" ")}`,
    "",
  ].join("\n"), { mode: 0o755 });
  tmux(["new-session", "-d", "-s", "aw", "-x", "160", "-y", "48", `sh ${shq(launch)}`], sock);
  try { tmux(["set-option", "-t", "aw", "remain-on-exit", "on"], sock); } catch { /* exited already */ }
  const screen = () => { try { return tmux(["capture-pane", "-p", "-t", "aw"], sock); } catch { return ""; } };
  const alive = () => { try { return tmux(["display-message", "-p", "-t", "aw", "#{pane_dead}"], sock).trim() !== "1"; } catch { return false; } };
  const key = (...k: string[]) => { try { tmux(["send-keys", "-t", "aw", ...k], sock); } catch { /* gone */ } };
  const start = Date.now();
  let prompted = false, escAt = 0, lastScreen = "", stableSince = Date.now();
  const done = (evs: ReturnType<typeof readLog>) => o.scenarios.every((s) => evs.some((e) => "scenario" in e && e.scenario === s && e.ev !== "sent"));
  let problem: string | undefined;
  try {
    while (true) {
      await sleep(250);
      if (!alive()) { lastScreen = screen() || lastScreen; problem = problem ?? `the client exited early; last screen: ${lastScreen.trim().split("\n").filter(Boolean).slice(-2).join(" ").slice(0, 200) || "(empty)"}`; break; }
      const evs = readLog(log);
      const scr = screen();
      if (scr !== lastScreen) { lastScreen = scr; stableSince = Date.now(); }
      if (!prompted) {
        const init = evs.some((e) => e.ev === "initialized");
        if (init && Date.now() - stableSince > 1500) {
          key("-l", PROMPT); await sleep(300); key("Enter"); prompted = true;
          o.onStep?.("prompt sent");
          fs.writeFileSync(path.join(dir, "screen-ready.txt"), scr);
        } else if (Date.now() - start > 90_000) { problem = "client UI never became ready (screen-ready.txt has the last screen)"; fs.writeFileSync(path.join(dir, "screen-ready.txt"), scr); break; }
        continue;
      }
      const pend = pendingScenario(evs);
      if (pend) {
        if (!seen.has(pend.scenario) && scr.includes(o.nonce)) {
          seen.set(pend.scenario, Date.now());
          fs.writeFileSync(path.join(dir, `screen-${pend.scenario}.txt`), scr);
          o.onStep?.(pend.scenario === "timeout"
            ? `timeout: question is on screen; leaving it untouched for up to ${Math.round(o.waitMs / 1000)} s`
            : `${pend.scenario}: question is on screen`);
        }
        // the timeout scenario is about what happens when nobody touches the question: never press anything
        if (pend.scenario !== "timeout" && seen.has(pend.scenario) && o.answer === "esc" && Date.now() - seen.get(pend.scenario)! > 1500 && Date.now() - escAt > 2000) {
          key("Escape"); escAt = Date.now(); escs.add(pend.scenario);
        }
      }
      if (done(evs)) {
        // If the last question went unanswered, look again once the probe has given up on it
        // (the SDK sends notifications/cancelled): does the client take it down, or leave it up?
        const lastSent = [...evs].reverse().find((e) => e.ev === "sent");
        const end = lastSent && [...evs].reverse().find((e) => "scenario" in e && e.scenario === lastSent.scenario && e.ev !== "sent");
        if (lastSent && "scenario" in lastSent && end?.ev === "timeout" && seen.has(lastSent.scenario)) {
          // Watch for LINGER_MS: some clients clear the question once their turn finishes, so one glance is not enough.
          let after = screen() || lastScreen;
          for (const until = Date.now() + LINGER_MS; after.includes(o.nonce) && Date.now() < until; ) {
            await sleep(250);
            after = screen() || after;
          }
          lastScreen = after;
          lingering.set(lastSent.scenario, after.includes(o.nonce));
          fs.writeFileSync(path.join(dir, "screen-after-timeout.txt"), after);
        } else await sleep(500);
        break;
      }
      if (Date.now() - start > budget(o) + 120_000) { problem = "overall time limit reached"; break; }
    }
  } finally {
    fs.writeFileSync(path.join(dir, "screen-last.txt"), lastScreen);
    try { tmux(["kill-server"], sock); } catch { /* already gone */ }
  }
  return problem;
}

export function makeRoot(keep: boolean): string {
  const base = keep ? path.resolve(`.askwire-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`) : fs.mkdtempSync(path.join(os.tmpdir(), "askwire-"));
  fs.mkdirSync(base, { recursive: true });
  return base;
}
