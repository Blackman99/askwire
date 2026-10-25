import os from "node:os";
import path from "node:path";
import { Adapter, writeFile } from "./index.js";

export const opencode: Adapter = {
  id: "opencode",
  title: "opencode",
  defaultBin: "opencode",
  headlessLabel: "opencode run",
  prepare(ctx) {
    const cfg = path.join(ctx.dir, "opencode.json");
    writeFile(cfg, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      autoupdate: false,
      share: "disabled",
      model: "askwire/standin",
      provider: {
        askwire: {
          npm: "@ai-sdk/openai-compatible",
          name: "askwire stand-in",
          options: { baseURL: ctx.standinUrl + "/v1", apiKey: "askwire-standin" },
          models: { standin: { name: "askwire stand-in" } },
        },
      },
      mcp: { askwire: { type: "local", command: [ctx.probe.command, ...ctx.probe.args], enabled: true } },
    }, null, 2));
    const x = (n: string) => path.join(ctx.dir, "xdg", n);
    const env = {
      ...ctx.baseEnv,
      HOME: path.join(ctx.dir, "home"),
      XDG_CONFIG_HOME: x("config"),
      XDG_DATA_HOME: x("data"),
      XDG_STATE_HOME: x("state"),
      // shared cache so the provider package is downloaded once, not per run
      XDG_CACHE_HOME: path.join(os.homedir(), ".cache", "askwire", "opencode"),
      OPENCODE_CONFIG: cfg,
      OPENCODE_DISABLE_AUTOUPDATE: "1",
    };
    const argv = ctx.mode === "headless" ? [ctx.bin, "run", ctx.prompt] : [ctx.bin, ctx.workDir];
    return { argv, env, cwd: ctx.workDir, display: ctx.mode === "headless" ? "opencode run" : "opencode (interactive)" };
  },
};
