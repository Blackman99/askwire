import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gemini } from "../dist/clients/gemini.js";

test("gemini adapter: throwaway HOME, stand-in base URL, fake key, probe server trusted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aw-gem-"));
  const p = gemini.prepare({ dir, workDir: path.join(dir, "work"), standinUrl: "http://127.0.0.1:9", probe: { command: "node", args: ["cli.js", "server"] },
    bin: "gemini", mode: "headless", prompt: "go", baseEnv: { PATH: "/bin" } });
  assert.equal(p.env.HOME, path.join(dir, "home"));
  assert.equal(p.env.GOOGLE_GEMINI_BASE_URL, "http://127.0.0.1:9");
  assert.match(p.env.GEMINI_API_KEY, /not-a-real-key/);
  assert.deepEqual(p.argv.slice(0, 4), ["gemini", "-p", "go", "--yolo"]);
  const s = JSON.parse(fs.readFileSync(path.join(dir, "home", ".gemini", "settings.json"), "utf8"));
  assert.equal(s.security.auth.selectedType, "gemini-api-key");
  assert.deepEqual(s.mcpServers.askwire, { command: "node", args: ["cli.js", "server"], trust: true });
  const t = gemini.prepare({ dir, workDir: dir, standinUrl: "x", probe: { command: "n", args: [] }, bin: "g", mode: "tui", prompt: "go", baseEnv: {} });
  assert.ok(!t.argv.includes("-p"));
});
