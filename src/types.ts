export type Scenario = "form" | "url" | "unadvertised";
export const ALL_SCENARIOS: Scenario[] = ["form", "url", "unadvertised"];

/** One line of the probe log (JSONL written by the probe MCP server). */
export type ProbeEvent =
  | { ev: "start"; t: number; pid: number }
  | { ev: "initialized"; t: number; caps: Record<string, unknown>; client?: { name?: string; version?: string; title?: string } }
  | { ev: "sent"; t: number; scenario: Scenario; mode: "form" | "url" }
  | { ev: "result"; t: number; scenario: Scenario; ms: number; action: string; content?: unknown }
  | { ev: "error"; t: number; scenario: Scenario; ms: number; code?: number; message: string }
  | { ev: "timeout"; t: number; scenario: Scenario; ms: number }
  | { ev: "skipped"; t: number; scenario: Scenario; reason: "not-advertised" | "advertised" };

export type Outcome =
  | { kind: "answered"; action: "accept" | "decline" | "cancel" | string; ms: number; content?: unknown }
  | { kind: "error"; code?: number; message: string; ms: number }
  | { kind: "timeout"; ms: number }
  | { kind: "not-advertised" }
  | { kind: "not-needed" }
  | { kind: "not-reached"; why: string };

export interface ScenarioResult {
  scenario: Scenario;
  outcome: Outcome;
  /** TUI only: was the probe nonce rendered on the terminal while the request was pending? */
  seen?: boolean;
  /** ms from request sent to nonce visible on screen (TUI only) */
  seenAfterMs?: number;
}

export interface ClientRun {
  client: string;
  version: string;
  mode: "headless" | "tui";
  command: string;
  advertised: { form: boolean; url: boolean; raw: Record<string, unknown> | null };
  clientInfo?: { name?: string; version?: string };
  results: ScenarioResult[];
  /** short human note when something prevented the run (missing tmux, client crashed...) */
  problem?: string;
  logDir?: string;
}
