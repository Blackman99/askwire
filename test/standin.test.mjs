import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext, startStandin } from "../dist/standin.js";

const order = ["form", "url", "unadvertised"];

test("pickNext follows scenario order and matches client-prefixed names", () => {
  const tools = ["Read", "mcp__askwire__askwire_url", "mcp__askwire__askwire_form"];
  assert.equal(pickNext(tools, [], order), "mcp__askwire__askwire_form");
  assert.equal(pickNext(tools, ["mcp__askwire__askwire_form"], order), "mcp__askwire__askwire_url");
  assert.equal(pickNext(tools, ["mcp__askwire__askwire_form", "mcp__askwire__askwire_url"], order), null);
  assert.equal(pickNext(["Bash"], [], order), null);
});

async function post(url, body) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json();
}

test("Anthropic Messages: calls each probe tool, then finishes; ignores trailing system messages", async () => {
  const s = await startStandin(order);
  try {
    const tools = [{ name: "mcp__askwire__askwire_form" }, { name: "mcp__askwire__askwire_url" }];
    const r1 = await post(`${s.url}/v1/messages`, { tools, messages: [{ role: "user", content: "go" }] });
    const use = r1.content.find((c) => c.type === "tool_use");
    assert.equal(use.name, "mcp__askwire__askwire_form");
    const r2 = await post(`${s.url}/v1/messages`, { tools, messages: [
      { role: "user", content: "go" },
      { role: "assistant", content: [use] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: use.id, content: "ok" }] },
      { role: "system", content: "reminder" }] });
    assert.equal(r2.content.find((c) => c.type === "tool_use").name, "mcp__askwire__askwire_url");
    assert.ok(s.stats.toolNames.has("mcp__askwire__askwire_url"));
    assert.ok(s.stats.apis.has("anthropic"));
  } finally { await s.close(); }
});

test("OpenAI Responses: understands namespace tools (Codex) and echoes the namespace", async () => {
  const s = await startStandin(order);
  try {
    const tools = [{ type: "namespace", name: "mcp__askwire", tools: [{ type: "function", name: "askwire_form" }] }];
    const r = await post(`${s.url}/v1/responses`, { tools, input: [{ role: "user", content: "go" }], stream: false });
    const call = (r.output ?? []).find((o) => o.type === "function_call");
    assert.ok(call, JSON.stringify(r).slice(0, 300));
    assert.equal(call.name, "askwire_form");
    assert.equal(call.namespace, "mcp__askwire");
  } finally { await s.close(); }
});

test("Chat Completions: tool_calls then a final message", async () => {
  const s = await startStandin(["form"]);
  try {
    const tools = [{ type: "function", function: { name: "askwire_askwire_form" } }];
    const r1 = await post(`${s.url}/v1/chat/completions`, { tools, messages: [{ role: "user", content: "go" }] });
    const tc = r1.choices[0].message.tool_calls[0];
    assert.equal(tc.function.name, "askwire_askwire_form");
    const r2 = await post(`${s.url}/v1/chat/completions`, { tools, messages: [
      { role: "user", content: "go" }, { role: "assistant", tool_calls: [tc] }, { role: "tool", tool_call_id: tc.id, content: "ok" }] });
    assert.match(r2.choices[0].message.content, /finished/);
  } finally { await s.close(); }
});

test("Gemini generateContent: functionCall per probe tool, plain text for tool-less side requests", async () => {
  const s = await startStandin(["form", "url"]);
  try {
    const tools = [{ functionDeclarations: [{ name: "mcp_askwire_askwire_form" }, { name: "mcp_askwire_askwire_url" }] }];
    const u = `${s.url}/v1beta/models/gemini-2.5-flash:generateContent`;
    const r1 = await post(u, { tools, contents: [{ role: "user", parts: [{ text: "go" }] }] });
    const fc = r1.candidates[0].content.parts[0].functionCall;
    assert.equal(fc.name, "mcp_askwire_askwire_form");
    const r2 = await post(u, { tools, contents: [
      { role: "user", parts: [{ text: "go" }] }, { role: "model", parts: [{ functionCall: fc }] },
      { role: "user", parts: [{ functionResponse: { name: fc.name, response: {} } }] }] });
    assert.equal(r2.candidates[0].content.parts[0].functionCall.name, "mcp_askwire_askwire_url");
    const side = await post(u, { contents: [{ role: "user", parts: [{ text: "classify" }] }] });
    assert.ok(side.candidates[0].content.parts[0].text !== undefined);
    const sr = await fetch(`${s.url}/v1beta/models/x:streamGenerateContent?alt=sse`, { method: "POST", body: JSON.stringify({ tools, contents: [] }) });
    assert.match(await sr.text(), /^data: .*functionCall/);
    assert.ok(s.stats.apis.has("gemini"));
  } finally { await s.close(); }
});
