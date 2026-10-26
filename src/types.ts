export type Scenario = "form" | "url" | "unadvertised" | "timeout";
export const ALL_SCENARIOS: Scenario[] = ["form", "url", "unadvertised", "timeout"];
/** What runs when --scenarios is not given. `timeout` is opt-in because it can wait for a minute. */
export const DEFAULT_SCENARIOS: Scenario[] = ["form", "url", "unadvertised"];

/** One line of the probe log (JSONL written by the probe MCP server). */
export type ProbeEvent =
  | { ev: "start"; t: number; pid: number }
  | { ev: "initialized"; t: number; caps: Record<string, unknown>; client?: { name?: string; version?: string; title?: string } }
  | { ev: "sent"; t: number; scenario: Scenario; mode: "form" | "url"; limitMs?: number }
  | { ev: "result"; t: number; scenario: Scenario; ms: number; action: string; content?: unknown }
  | { ev: "error"; t: number; scenario: Scenario; ms: number; code?: number; message: string }
  | { ev: "timeout"; t: number; scenario: Scenario; ms: number; limitMs?: number }
  /** the client cancelled the tool call (notifications/cancelled) while the elicitation was still unanswered */
  | { ev: "abandoned"; t: number; scenario: Scenario; ms: number; reason?: string }
  | { ev: "skipped"; t: number; scenario: Scenario; reason: "not-advertised" | "advertised" };

export type Outcome =
  | { kind: "answered"; action: "accept" | "decline" | "cancel" | string; ms: number; content?: unknown }
  | { kind: "error"; code?: number; message: string; ms: number }
  /** nothing came back before the probe's own bound (limitMs); never an answer */
  | { kind: "timeout"; ms: number; limitMs?: number }
  /** the client gave up on the tool call without ever answering the elicitation */
  | { kind: "abandoned"; ms: number; reason?: string }
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
  /** TUI mode: askwire pressed Esc while this question was on screen */
  escPressed?: boolean;
  /**
   * TUI only, for a question that got no answer: was it still drawn on screen 10 s after the
   * probe stopped waiting (and the SDK sent notifications/cancelled)?
   */
  stillOnScreen?: boolean;
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
