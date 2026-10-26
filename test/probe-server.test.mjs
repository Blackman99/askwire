import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readLog } from "../dist/analyze.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));

async function connect(caps, handler, timeout = "5", extra = []) {
  const log = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "aw-test-")), "probe.jsonl");
  const client = new Client({ name: "askwire-test", version: "0" }, { capabilities: caps });
  if (handler) client.setRequestHandler(ElicitRequestSchema, handler);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [cli, "server", "--log", log, "--nonce", "AW-TEST", "--timeout", timeout, ...extra] }));
  return { client, log };
}

test("form probe: accept is logged with content, message carries the nonce", async () => {
  let seen;
  const { client, log } = await connect({ elicitation: { form: {} } }, async (req) => { seen = req.params; return { action: "accept", content: { confirm: true } }; });
  const tools = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(tools, ["askwire_form", "askwire_timeout", "askwire_unadvertised", "askwire_url"]);
  const r = await client.callTool({ name: "askwire_form", arguments: {} });
  assert.match(r.content[0].text, /accept/);
  assert.match(seen.message, /AW-TEST/);
  await client.close();
  const ev = readLog(log);
  const res = ev.find((e) => e.ev === "result");
  assert.equal(res.action, "accept");
  assert.deepEqual(res.content, { confirm: true });
  assert.ok(ev.find((e) => e.ev === "initialized").caps.elicitation);
});

test("url probe is skipped when only form is advertised; unadvertised probe skipped when elicitation is advertised", async () => {
  const { client, log } = await connect({ elicitation: {} }, async () => ({ action: "cancel" }));
  await client.callTool({ name: "askwire_url", arguments: {} });
  await client.callTool({ name: "askwire_unadvertised", arguments: {} });
  await client.close();
  const skipped = readLog(log).filter((e) => e.ev === "skipped").map((e) => `${e.scenario}:${e.reason}`);
  assert.deepEqual(skipped, ["url:not-advertised", "unadvertised:advertised"]);
});

test("client without elicitation: unadvertised probe gets -32601", async () => {
  const { client, log } = await connect({}, null);
  await client.callTool({ name: "askwire_unadvertised", arguments: {} });
  await client.close();
  const err = readLog(log).find((e) => e.ev === "error");
  assert.equal(err.code, -32601);
});

test("a client that never answers is logged as timeout", async () => {
  const { client, log } = await connect({ elicitation: { form: {} } }, () => new Promise(() => {}), "0.5");
  await client.callTool({ name: "askwire_form", arguments: {} }, undefined, { timeout: 10_000 });
  await client.close();
  const t = readLog(log).find((e) => e.ev === "timeout");
  assert.ok(t && t.ms >= 400, JSON.stringify(readLog(log)));
});

test("timeout scenario: an answer that never comes is logged as timeout with the --wait bound, not as an answer", async () => {
  let msg;
  const { client, log } = await connect({ elicitation: { form: {} } }, (req) => { msg = req.params.message; return new Promise(() => {}); }, "5", ["--wait", "0.6", "--scenarios", "timeout"]);
  const r = await client.callTool({ name: "askwire_timeout", arguments: {} }, undefined, { timeout: 10_000 });
  assert.match(r.content[0].text, /no answer within 1 s/);
  await client.close();
  const ev = readLog(log);
  assert.equal(ev.find((e) => e.ev === "sent").limitMs, 600);
  const t = ev.find((e) => e.ev === "timeout");
  assert.ok(t && t.ms >= 550 && t.limitMs === 600, JSON.stringify(ev));
  assert.ok(!ev.some((e) => e.ev === "result"));
  assert.match(msg, /AW-TEST: timeout check/);
});

test("timeout scenario: a client that answers later is recorded with its real latency", async () => {
  const { client, log } = await connect({ elicitation: { form: {} } }, () => new Promise((res) => setTimeout(() => res({ action: "cancel" }), 300)), "5", ["--wait", "5", "--scenarios", "timeout"]);
  await client.callTool({ name: "askwire_timeout", arguments: {} });
  await client.close();
  const res = readLog(log).find((e) => e.ev === "result");
  assert.equal(res.action, "cancel");
  assert.ok(res.ms >= 250 && res.ms < 5000, String(res.ms));
});

test("timeout scenario: cancelling the tool call while the question is open is logged as abandoned", async () => {
  const { client, log } = await connect({ elicitation: { form: {} } }, () => new Promise(() => {}), "5", ["--wait", "30", "--scenarios", "timeout"]);
  const ac = new AbortController();
  setTimeout(() => ac.abort("user gave up"), 300);
  await assert.rejects(client.callTool({ name: "askwire_timeout", arguments: {} }, undefined, { signal: ac.signal }));
  for (let i = 0; i < 40 && !readLog(log).some((e) => e.ev === "abandoned"); i++) await new Promise((r) => setTimeout(r, 50));
  await client.close();
  const ab = readLog(log).find((e) => e.ev === "abandoned");
  assert.ok(ab && ab.ms >= 250 && ab.ms < 5000, JSON.stringify(readLog(log)));
});

test("timeout scenario is skipped, not sent, when form elicitation is not advertised", async () => {
  const { client, log } = await connect({}, null, "5", ["--scenarios", "timeout"]);
  await client.callTool({ name: "askwire_timeout", arguments: {} });
  await client.close();
  assert.deepEqual(readLog(log).filter((e) => e.ev !== "start" && e.ev !== "initialized").map((e) => `${e.ev}:${e.reason ?? ""}`), ["skipped:not-advertised"]);
});
