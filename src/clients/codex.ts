import path from "node:path";
import { Adapter, tomlStr, writeFile } from "./index.js";

export const codex: Adapter = {
  id: "codex",
  title: "Codex CLI",
  defaultBin: "codex",
  headlessLabel: "codex exec",
  prepare(ctx) {
    const codexHome = path.join(ctx.dir, "codex-home");
    const args = "[" + ctx.probe.args.map(tomlStr).join(", ") + "]";
    writeFile(path.join(codexHome, "config.toml"), [
      `model = "askwire-standin"`,
      `model_provider = "askwire"`,
      `check_for_update_on_startup = false`,
      ``,
      `[model_providers.askwire]`,
      `name = "askwire stand-in"`,
      `base_url = ${tomlStr(ctx.standinUrl + "/v1")}`,
      `wire_api = "responses"`,
      `env_key = "ASKWIRE_STANDIN_KEY"`,
      ``,
      `[mcp_servers.askwire]`,
      `command = ${tomlStr(ctx.probe.command)}`,
      `args = ${args}`,
      // Without this, `codex exec` (approval: never) fails every MCP tool call before it reaches the server.
      `default_tools_approval_mode = "approve"`,
      ``,
      `[projects.${tomlStr(ctx.workDir)}]`,
      `trust_level = "trusted"`,
      ``,
    ].join("\n"));
    const env = { ...ctx.baseEnv, HOME: path.join(ctx.dir, "home"), CODEX_HOME: codexHome, ASKWIRE_STANDIN_KEY: "askwire-standin" };
    const argv = ctx.mode === "headless"
      ? [ctx.bin, "exec", "--skip-git-repo-check", "-C", ctx.workDir, ctx.prompt]
      : [ctx.bin, "-C", ctx.workDir];
    return { argv, env, cwd: ctx.workDir, display: ctx.mode === "headless" ? "codex exec" : "codex (interactive)" };
  },
};
