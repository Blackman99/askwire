import path from "node:path";
import { Adapter, writeFile } from "./index.js";

const FAKE_KEY = "sk-ant-askwire-standin-not-a-real-key-000000";

export const claude: Adapter = {
  id: "claude",
  title: "Claude Code",
  defaultBin: "claude",
  headlessLabel: "claude -p",
  prepare(ctx) {
    const home = path.join(ctx.dir, "home");
    // Seed a fresh profile: skip onboarding, approve the stand-in key, trust the empty work dir.
    writeFile(path.join(home, ".claude.json"), JSON.stringify({
      hasCompletedOnboarding: true,
      theme: "dark",
      numStartups: 5,
      autoUpdates: false,
      customApiKeyResponses: { approved: [FAKE_KEY.slice(-20)], rejected: [] },
      projects: { [ctx.workDir]: { hasTrustDialogAccepted: true, allowedTools: [] } },
    }, null, 2));
    const mcp = path.join(ctx.dir, "mcp.json");
    writeFile(mcp, JSON.stringify({ mcpServers: { askwire: { command: ctx.probe.command, args: ctx.probe.args } } }, null, 2));
    const env = {
      ...ctx.baseEnv,
      HOME: home,
      ANTHROPIC_BASE_URL: ctx.standinUrl,
      ANTHROPIC_API_KEY: FAKE_KEY,
      // MCP tools are deferred behind ToolSearch by default; expose them directly to the stand-in model.
      ENABLE_TOOL_SEARCH: "false",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
      DISABLE_AUTOUPDATER: "1",
    };
    const common = ["--mcp-config", mcp, "--strict-mcp-config", "--allowedTools", "mcp__askwire"];
    const argv = ctx.mode === "headless" ? [ctx.bin, "-p", ctx.prompt, ...common] : [ctx.bin, ...common];
    return { argv, env, cwd: ctx.workDir, display: ctx.mode === "headless" ? "claude -p" : "claude (interactive)" };
  },
};
