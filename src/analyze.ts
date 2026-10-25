import fs from "node:fs";
import type { ClientRun, Outcome, ProbeEvent, Scenario, ScenarioResult } from "./types.js";

export function readLog(file: string): ProbeEvent[] {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l) as ProbeEvent]; } catch { return []; }
  });
}

export function advertised(events: ProbeEvent[]): ClientRun["advertised"] & { clientInfo?: { name?: string; version?: string } } {
  const init = [...events].reverse().find((e) => e.ev === "initialized") as Extract<ProbeEvent, { ev: "initialized" }> | undefined;
  if (!init) return { form: false, url: false, raw: null };
  const el = init.caps.elicitation as { form?: object; url?: object } | undefined;
  return {
    form: !!el && (!!el.form || (!el.form && !el.url)),
    url: !!el?.url,
    raw: init.caps,
    clientInfo: init.client,
  };
}

/** Last terminal event per scenario → outcome. */
export function outcomeFor(events: ProbeEvent[], s: Scenario): Outcome | null {
  const mine = events.filter((e) => "scenario" in e && e.scenario === s);
  const last = [...mine].reverse().find((e) => e.ev !== "sent");
  if (!last) return null;
  switch (last.ev) {
    case "result": return { kind: "answered", action: last.action, ms: last.ms, content: last.content };
    case "error": return { kind: "error", code: last.code, message: last.message, ms: last.ms };
    case "timeout": return { kind: "timeout", ms: last.ms };
    case "skipped": return last.reason === "not-advertised" ? { kind: "not-advertised" } : { kind: "not-needed" };
    default: return null;
  }
}

export function pendingScenario(events: ProbeEvent[]): { scenario: Scenario; t: number } | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.ev === "sent") {
      const done = events.slice(i + 1).some((x) => "scenario" in x && x.scenario === e.scenario && x.ev !== "sent");
      return done ? null : { scenario: e.scenario, t: e.t };
    }
  }
  return null;
}

export function results(events: ProbeEvent[], scenarios: Scenario[], notReached: (s: Scenario) => string): ScenarioResult[] {
  return scenarios.map((s) => ({ scenario: s, outcome: outcomeFor(events, s) ?? { kind: "not-reached", why: notReached(s) } }));
}

export type Verdict = "human" | "no-human" | "honest" | "hung" | "broken" | "unknown";

/** One-word judgement for a scenario row, from the server author's point of view. */
export function verdictOf(r: ScenarioResult, mode: "headless" | "tui"): Verdict {
  const o = r.outcome;
  if (o.kind === "not-advertised" || o.kind === "not-needed") return "honest";
  if (o.kind === "timeout") return "hung";
  if (o.kind === "not-reached") return "unknown";
  if (o.kind === "error") return r.scenario === "unadvertised" ? "honest" : "broken";
  if (mode === "tui") return r.seen ? "human" : "no-human";
  return "no-human"; // headless: no terminal to show anything on
}

export function clientVerdict(run: ClientRun): { word: string; tone: "bad" | "good" | "warn" | "dim" } {
  if (run.problem) return { word: "COULD NOT RUN", tone: "dim" };
  const v = run.results.map((r) => verdictOf(r, run.mode));
  const claims = run.advertised.form || run.advertised.url;
  if (v.includes("hung")) return { word: "QUESTION NEVER ANSWERED", tone: "bad" };
  if (claims && v.includes("no-human")) return { word: "CLAIMS SUPPORT · ANSWERS WITHOUT A HUMAN", tone: "bad" };
  if (v.includes("broken")) return { word: "ADVERTISED BUT ERRORS", tone: "bad" };
  if (claims && v.every((x) => x === "human" || x === "honest")) return { word: "SHOWN TO A HUMAN", tone: "good" };
  if (!claims && v.every((x) => x === "honest")) return { word: "NO SUPPORT · SAYS SO", tone: "warn" };
  return { word: "INCOMPLETE", tone: "dim" };
}
