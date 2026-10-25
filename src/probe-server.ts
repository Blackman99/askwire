import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ElicitResultSchema } from "@modelcontextprotocol/sdk/types.js";
import fs from "node:fs";
import type { ProbeEvent, Scenario } from "./types.js";
import { VERSION, PAGES_URL } from "./meta.js";

export interface ProbeOptions {
  log?: string;
  nonce: string;
  timeoutMs: number;
  /** which scenario tools to expose */
  scenarios: Scenario[];
}

type Dist<T> = T extends unknown ? Omit<T, "t"> : never;

export async function runProbeServer(opts: ProbeOptions): Promise<void> {
  const write = (e: Dist<ProbeEvent>) => {
    const line = JSON.stringify({ t: Date.now(), ...e });
    if (opts.log) fs.appendFileSync(opts.log, line + "\n");
    else process.stderr.write("[askwire] " + line + "\n");
  };

  const mcp = new McpServer({ name: "askwire", version: VERSION });
  const srv = mcp.server;
  srv.oninitialized = () => {
    write({ ev: "initialized", caps: (srv.getClientCapabilities() ?? {}) as Record<string, unknown>, client: srv.getClientVersion() });
  };

  const caps = () => (srv.getClientCapabilities() ?? {}) as { elicitation?: { form?: object; url?: object } };
  // Spec: an empty `elicitation: {}` object means form mode only (back-compat).
  const hasForm = () => { const e = caps().elicitation; return !!e && (!!e.form || (!e.form && !e.url)); };
  const hasUrl = () => !!caps().elicitation?.url;

  const message = (what: string) =>
    `askwire probe ${opts.nonce}: ${what} This is a test from askwire; nothing happens whichever you choose.`;

  async function send(scenario: Scenario, params: Record<string, unknown>) {
    const t0 = Date.now();
    write({ ev: "sent", scenario, mode: (params.mode as "form" | "url") ?? "form" });
    try {
      const r = await srv.request({ method: "elicitation/create", params } as never, ElicitResultSchema, { timeout: opts.timeoutMs });
      const ms = Date.now() - t0;
      write({ ev: "result", scenario, ms, action: String(r.action), content: r.content });
      return `client answered ${JSON.stringify(r)} after ${ms} ms`;
    } catch (err) {
      const ms = Date.now() - t0;
      const e = err as { code?: number; message?: string };
      // SDK maps its own timeout to McpError code -32001 (RequestTimeout)
      if (e.code === -32001 || /timed? ?out/i.test(String(e.message))) {
        write({ ev: "timeout", scenario, ms });
        return `no answer after ${ms} ms`;
      }
      write({ ev: "error", scenario, ms, code: e.code, message: String(e.message ?? err) });
      return `client returned an error after ${ms} ms: ${e.message ?? err}`;
    }
  }

  const text = (s: string) => ({ content: [{ type: "text" as const, text: s }] });

  if (opts.scenarios.includes("form")) {
    mcp.tool("askwire_form", "askwire probe: asks the user to confirm a harmless test action through an MCP form elicitation and reports what came back.", async () => {
      if (!hasForm()) { write({ ev: "skipped", scenario: "form", reason: "not-advertised" }); return text("client does not advertise form elicitation; nothing sent"); }
      return text(await send("form", {
        mode: "form",
        message: message("confirm a test action?"),
        requestedSchema: { type: "object", properties: { confirm: { type: "boolean", title: "Confirm the test action", default: false } }, required: ["confirm"] },
      }));
    });
  }
  if (opts.scenarios.includes("url")) {
    mcp.tool("askwire_url", "askwire probe: asks the user to open a URL through an MCP URL-mode elicitation and reports what came back.", async () => {
      if (!hasUrl()) { write({ ev: "skipped", scenario: "url", reason: "not-advertised" }); return text("client does not advertise URL elicitation; nothing sent"); }
      return text(await send("url", {
        mode: "url",
        message: message("open this page to continue."),
        url: `${PAGES_URL}probe.html?n=${encodeURIComponent(opts.nonce)}`,
        elicitationId: `askwire-${opts.nonce}`,
      }));
    });
  }
  if (opts.scenarios.includes("unadvertised")) {
    mcp.tool("askwire_unadvertised", "askwire probe: sends a form elicitation even if the client never advertised the capability, to see how it fails.", async () => {
      if (caps().elicitation) { write({ ev: "skipped", scenario: "unadvertised", reason: "advertised" }); return text("client advertises elicitation; covered by the form probe"); }
      return text(await send("unadvertised", {
        mode: "form",
        message: message("confirm a test action? (sent without the client advertising elicitation)"),
        requestedSchema: { type: "object", properties: { confirm: { type: "boolean", title: "Confirm" } }, required: ["confirm"] },
      }));
    });
  }

  await mcp.connect(new StdioServerTransport());
  write({ ev: "start", pid: process.pid });
}
