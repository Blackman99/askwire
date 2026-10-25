import path from "node:path";
import { Adapter, writeFile } from "./index.js";

export const gemini: Adapter = {
  id: "gemini",
  title: "Gemini CLI",
  defaultBin: "gemini",
  headlessLabel: "gemini -p",
  prepare(ctx) {
    const home = path.join(ctx.dir, "home");
    writeFile(path.join(home, ".gemini", "settings.json"), JSON.stringify({
      security: { auth: { selectedType: "gemini-api-key" }, folderTrust: { enabled: false } },
      general: { disableAutoUpdate: true, disableUpdateNag: true },
      privacy: { usageStatisticsEnabled: false },
      telemetry: { enabled: false },
      model: { name: "gemini-2.5-flash" },
      mcpServers: { askwire: { command: ctx.probe.command, args: ctx.probe.args, trust: true } },
    }, null, 2));
    const env = {
      ...ctx.baseEnv,
      HOME: home,
      GEMINI_API_KEY: "askwire-standin-not-a-real-key",
      GOOGLE_GEMINI_BASE_URL: ctx.standinUrl,
      GEMINI_CLI_NO_RELAUNCH: "true",
    };
    const common = ["--allowed-mcp-server-names", "askwire"];
    const argv = ctx.mode === "headless" ? [ctx.bin, "-p", ctx.prompt, "--yolo", ...common] : [ctx.bin, ...common];
    return { argv, env, cwd: ctx.workDir, display: ctx.mode === "headless" ? "gemini -p" : "gemini (interactive)" };
  },
};
