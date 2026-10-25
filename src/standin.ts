/**
 * A scripted stand-in for a model API. It speaks just enough of the Anthropic
 * Messages, OpenAI Responses and OpenAI Chat Completions wire formats for a
 * coding agent to run one turn: call each askwire probe tool once, in order,
 * then reply with a short final message. No account, no tokens, no network.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Scenario } from "./types.js";

export interface StandinStats {
  requests: number;
  /** probe tool names the client exposed to the model, as the client named them */
  toolNames: Set<string>;
  calls: string[];
  apis: Set<string>;
}

export interface Standin {
  url: string;
  port: number;
  stats: StandinStats;
  close(): Promise<void>;
}

const suffix = (s: Scenario) => `askwire_${s}`;

export function pickNext(available: string[], alreadyCalled: string[], order: Scenario[]): string | null {
  for (const s of order) {
    const name = available.find((n) => n.endsWith(suffix(s)));
    if (name && !alreadyCalled.some((c) => c.endsWith(suffix(s)))) return name;
  }
  return null;
}

let seq = 0;
const id = (p: string) => `${p}_askwire_${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function startStandin(order: Scenario[], host = "127.0.0.1"): Promise<Standin> {
  const stats: StandinStats = { requests: 0, toolNames: new Set(), calls: [], apis: new Set() };
  const note = (names: string[]) => names.filter((n) => /askwire_/.test(n)).forEach((n) => stats.toolNames.add(n));

  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      stats.requests++;
      let j: any = {};
      try { j = body ? JSON.parse(body) : {}; } catch { /* ignore */ }
      const url = req.url ?? "";
      try {
        if (url.includes("/messages")) return anthropic(url, j, res);
        if (url.includes("/responses")) return responses(j, res);
        if (url.includes("/chat/completions")) return chat(j, res);
        if (url.includes("/models")) return json(res, { object: "list", data: [{ id: "askwire-standin", object: "model", owned_by: "askwire" }] });
        json(res, { error: { message: `askwire stand-in: unsupported path ${url}` } }, 404);
      } catch (e) {
        json(res, { error: { message: String(e) } }, 500);
      }
    });
  });

  function json(res: http.ServerResponse, obj: unknown, status = 200) {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(obj));
  }
  function sse(res: http.ServerResponse) {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  }
  const finalText = "askwire: probe run finished.";

  // ---------- Anthropic Messages ----------
  function anthropic(url: string, j: any, res: http.ServerResponse) {
    stats.apis.add("anthropic");
    if (url.includes("count_tokens")) return json(res, { input_tokens: 42 });
    const names: string[] = (j.tools ?? []).map((t: any) => t.name).filter(Boolean);
    note(names);
    const msgs: any[] = (j.messages ?? []).filter((m: any) => m.role !== "system");
    const called = msgs.filter((m) => m.role === "assistant" && Array.isArray(m.content))
      .flatMap((m) => m.content.filter((c: any) => c.type === "tool_use").map((c: any) => c.name));
    const next = pickNext(names, called, order);
    if (next) stats.calls.push(next);
    const block = next
      ? { type: "tool_use", id: id("toolu"), name: next, input: {} }
      : { type: "text", text: finalText };
    const stop = next ? "tool_use" : "end_turn";
    const mid = id("msg");
    const model = j.model ?? "askwire-standin";
    if (!j.stream) {
      return json(res, { id: mid, type: "message", role: "assistant", model, content: [block], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } });
    }
    sse(res);
    const ev = (e: string, d: unknown) => res.write(`event: ${e}\ndata: ${JSON.stringify(d)}\n\n`);
    ev("message_start", { type: "message_start", message: { id: mid, type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } });
    if (block.type === "text") {
      ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
      ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: finalText } });
    } else {
      ev("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: (block as any).id, name: next, input: {} } });
      ev("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } });
    }
    ev("content_block_stop", { type: "content_block_stop", index: 0 });
    ev("message_delta", { type: "message_delta", delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 1 } });
    ev("message_stop", { type: "message_stop" });
    res.end();
  }

  // ---------- OpenAI Responses (Codex) ----------
  function responses(j: any, res: http.ServerResponse) {
    stats.apis.add("responses");
    const names: string[] = (j.tools ?? []).flatMap((t: any) =>
      t.type === "namespace" ? (t.tools ?? []).map((x: any) => `${t.name}::${x.name}`) : [t.name ?? t.function?.name]).filter(Boolean);
    note(names);
    const items: any[] = Array.isArray(j.input) ? j.input : [];
    const called = items.filter((i) => i.type === "function_call").map((i) => (i.namespace ? `${i.namespace}::` : "") + i.name);
    const next = pickNext(names, called, order);
    if (next) stats.calls.push(next);
    const rid = id("resp");
    const item = next
      ? { type: "function_call", id: id("fc"), call_id: id("call"), ...(next.includes("::") ? { namespace: next.split("::")[0], name: next.split("::")[1] } : { name: next }), arguments: "{}", status: "completed" }
      : { type: "message", id: id("msg"), role: "assistant", status: "completed", content: [{ type: "output_text", text: finalText, annotations: [] }] };
    const usage = { input_tokens: 1, output_tokens: 1, total_tokens: 2, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } };
    if (j.stream === false) return json(res, { id: rid, object: "response", status: "completed", output: [item], usage });
    sse(res);
    const ev = (d: any) => res.write(`event: ${d.type}\ndata: ${JSON.stringify(d)}\n\n`);
    ev({ type: "response.created", response: { id: rid, object: "response", status: "in_progress" } });
    ev({ type: "response.output_item.added", output_index: 0, item });
    if (!next) ev({ type: "response.output_text.delta", output_index: 0, content_index: 0, item_id: (item as any).id, delta: finalText });
    ev({ type: "response.output_item.done", output_index: 0, item });
    ev({ type: "response.completed", response: { id: rid, object: "response", status: "completed", output: [item], usage } });
    res.end();
  }

  // ---------- OpenAI Chat Completions (opencode and friends) ----------
  function chat(j: any, res: http.ServerResponse) {
    stats.apis.add("chat");
    const names: string[] = (j.tools ?? []).map((t: any) => t.function?.name).filter(Boolean);
    note(names);
    const msgs: any[] = j.messages ?? [];
    const called = msgs.flatMap((m) => (m.tool_calls ?? []).map((c: any) => c.function?.name));
    const next = pickNext(names, called, order);
    if (next) stats.calls.push(next);
    const cid = id("chatcmpl");
    const created = Math.floor(Date.now() / 1000);
    const model = j.model ?? "askwire-standin";
    const usage = { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 };
    const call = next ? { id: id("call"), type: "function", function: { name: next, arguments: "{}" } } : null;
    if (!j.stream) {
      return json(res, { id: cid, object: "chat.completion", created, model, usage,
        choices: [{ index: 0, finish_reason: call ? "tool_calls" : "stop", message: call ? { role: "assistant", content: null, tool_calls: [call] } : { role: "assistant", content: finalText } }] });
    }
    sse(res);
    const w = (d: any) => res.write(`data: ${JSON.stringify({ id: cid, object: "chat.completion.chunk", created, model, ...d })}\n\n`);
    if (call) {
      w({ choices: [{ index: 0, delta: { role: "assistant", tool_calls: [{ index: 0, ...call }] }, finish_reason: null }] });
      w({ choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }] });
    } else {
      w({ choices: [{ index: 0, delta: { role: "assistant", content: finalText }, finish_reason: null }] });
      w({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
    }
    w({ choices: [], usage });
    res.write("data: [DONE]\n\n");
    res.end();
  }

  await new Promise<void>((resolve) => server.listen(0, host, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://${host}:${port}`,
    port,
    stats,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
  };
}
