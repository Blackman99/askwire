// CI guard: every installed client must produce a verdict (no "could not run",
// no unreached scenario). It does NOT pin the answers: those are the measurement.
import fs from "node:fs";
const j = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
let bad = 0;
for (const r of j.runs) {
  const rows = r.results.map((x) => `${x.scenario}=${x.outcome.kind === "answered" ? x.outcome.action : x.outcome.kind}${x.outcome.ms != null ? `(${x.outcome.ms}ms)` : ""}${x.stillOnScreen != null ? (x.stillOnScreen ? ",still-on-screen" : ",taken-down") : ""}`);
  console.log(`${r.client} ${r.version} [${r.mode}] ${r.problem ? "PROBLEM: " + r.problem : rows.join(" ")}`);
  if (r.problem || r.results.some((x) => x.outcome.kind === "not-reached")) bad++;
}
if (j.runs.length < 4) { console.log(`expected 4 clients, got ${j.runs.length}`); bad++; }
process.exit(bad ? 1 : 0);
