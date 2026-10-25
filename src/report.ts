import { clientVerdict, verdictOf } from "./analyze.js";
import type { ClientRun, ScenarioResult } from "./types.js";
import { VERSION, REPO_URL } from "./meta.js";

export interface Paint { red(s: string): string; green(s: string): string; yellow(s: string): string; dim(s: string): string; bold(s: string): string; }
export function paint(on: boolean): Paint {
  const w = (a: number, b: number) => (s: string) => (on ? `\x1b[${a}m${s}\x1b[${b}m` : s);
  return { red: w(31, 39), green: w(32, 39), yellow: w(33, 39), dim: w(2, 22), bold: w(1, 22) };
}

const fmtMs = (ms: number) => (ms < 1 ? "<1 ms" : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

export function rowText(r: ScenarioResult, run: ClientRun): { action: string; detail: string } {
  const o = r.outcome;
  switch (o.kind) {
    case "answered": {
      const spec = o.action === "decline" ? " (spec: decline = the user explicitly said no)" : "";
      let detail: string;
      if (run.mode === "headless") detail = `in ${fmtMs(o.ms)} · no terminal, so the client answered, not a person${spec}`;
      else if (r.seen && r.escPressed) detail = `in ${fmtMs(o.ms)} · on screen after ${fmtMs(r.seenAfterMs ?? 0)}, askwire pressed Esc${o.action === "decline" ? " (spec: dismissing without a choice is cancel, not decline)" : o.action === "accept" ? " and the client still accepted" : ""}`;
      else if (r.seen) detail = `in ${fmtMs(o.ms)} · on screen after ${fmtMs(r.seenAfterMs ?? 0)}`;
      else detail = `in ${fmtMs(o.ms)} · the question never appeared on screen${spec}`;
      return { action: o.action, detail };
    }
    case "error": return { action: "error", detail: `${o.code ?? ""} ${o.message.replace(/^MCP error -?\d+:\s*/, "")}`.trim().slice(0, 120) + ` (after ${fmtMs(o.ms)})` };
    case "timeout": return { action: "silence", detail: `no answer within ${fmtMs(o.ms)}; the tool call just waits` };
    case "not-advertised": return { action: "—", detail: "not advertised at initialize, so nothing was sent" };
    case "not-needed": return { action: "—", detail: "skipped: client advertises elicitation" };
    case "not-reached": return { action: "?", detail: `not reached: ${o.why}` };
  }
}

export function renderText(runs: ClientRun[], opts: { color: boolean; nonce: string; when: string }): string {
  const p = paint(opts.color);
  const out: string[] = [];
  out.push(`${p.bold("askwire")} ${VERSION} ${p.dim("·")} does your MCP server's question reach a human?`);
  out.push(p.dim(`probe ${opts.nonce} · ${opts.when} · ${runs.length} client run${runs.length === 1 ? "" : "s"}`));
  out.push("");
  for (const run of runs) {
    const v = clientVerdict(run);
    const tone = { bad: p.red, good: p.green, warn: p.yellow, dim: p.dim }[v.tone];
    out.push(`${p.bold(`${run.client} ${run.version}`)}  ${p.dim(run.command)}`);
    if (run.problem) {
      out.push(`  ${p.dim("│")} ${p.yellow("could not run:")} ${run.problem}`);
      if (run.logDir) out.push(`  ${p.dim("│")} ${p.dim(`logs: ${run.logDir}`)}`);
      out.push(`  ${p.dim("└")} ${tone(v.word)}`, "");
      continue;
    }
    const adv = [run.advertised.form && "form", run.advertised.url && "url"].filter(Boolean).join(" + ");
    out.push(`  ${p.dim("│")} ${"initialize".padEnd(13)}${adv ? `advertises elicitation: ${adv}` : p.yellow("does not advertise elicitation")}`);
    for (const r of run.results) {
      if (r.outcome.kind === "not-needed") continue;
      const t = rowText(r, run);
      const vv = verdictOf(r, run.mode);
      const col = vv === "human" ? p.green : vv === "honest" ? p.dim : vv === "unknown" ? p.yellow : p.red;
      out.push(`  ${p.dim("│")} ${r.scenario.padEnd(13)}${col(t.action.padEnd(9))}${t.detail}`);
    }
    out.push(`  ${p.dim("└")} ${tone(v.word)}`, "");
  }
  const lines = takeaways(runs);
  if (lines.length) {
    out.push(p.bold("What your server should assume"));
    for (const l of lines) out.push(`  ${l}`);
    out.push("");
  }
  out.push(p.dim(`--json for raw results · --markdown for an issue · ${REPO_URL}`));
  return out.join("\n");
}

export function takeaways(runs: ClientRun[]): string[] {
  const t: string[] = [];
  const answered = runs.filter((r) => !r.problem && (r.advertised.form || r.advertised.url));
  const actions = new Set(answered.flatMap((r) => r.results.flatMap((x) => (x.outcome.kind === "answered" ? [x.outcome.action] : []))));
  if (answered.some((r) => r.mode === "headless" && r.results.some((x) => x.outcome.kind === "answered")))
    t.push("Advertising `elicitation` does not mean a person is there. Headless runs answer for them.");
  if (actions.has("decline") && actions.has("cancel"))
    t.push("decline and cancel are not used consistently across clients. Treat both as \"do not proceed\".");
  if (runs.some((r) => r.results.some((x) => x.outcome.kind === "timeout")))
    t.push("At least one client never answers. Always pass a timeout to elicitInput.");
  t.push("Only `accept` with the content you asked for counts as consent. Hooks can accept too, so log it.");
  return t;
}

export function renderMarkdown(runs: ClientRun[], opts: { nonce: string; when: string }): string {
  const rows = runs.flatMap((run) => run.problem
    ? [`| ${run.client} ${run.version} | \`${run.command}\` | — | — | could not run: ${run.problem.replace(/\|/g, "\\|")} |`]
    : run.results.filter((r) => r.outcome.kind !== "not-needed").map((r) => {
      const t = rowText(r, run);
      const adv = [run.advertised.form && "form", run.advertised.url && "url"].filter(Boolean).join("+") || "none";
      return `| ${run.client} ${run.version} | \`${run.command}\` | ${adv} | ${r.scenario} | **${t.action}** ${t.detail.replace(/\|/g, "\\|")} |`;
    }));
  return [
    `Measured with [askwire](${REPO_URL}) ${VERSION} (probe ${opts.nonce}, ${opts.when}):`,
    "",
    "| client | command | advertises | scenario | answer |",
    "|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
