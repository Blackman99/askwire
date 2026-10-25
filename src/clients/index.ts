import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";

export type Mode = "headless" | "tui";

export interface PrepareCtx {
  dir: string;        // throwaway root for this client run
  workDir: string;    // cwd the client runs in (empty dir)
  standinUrl: string;
  probe: { command: string; args: string[] };
  bin: string;
  mode: Mode;
  prompt: string;
  baseEnv: Record<string, string>;
}

export interface Prepared {
  argv: string[];
  env: Record<string, string>;
  cwd: string;
  /** human-readable command shown in the report */
  display: string;
}

export interface Adapter {
  id: string;
  title: string;
  defaultBin: string;
  headlessLabel: string;
  prepare(ctx: PrepareCtx): Prepared;
}

export function writeFile(p: string, s: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
}

/** TOML basic string; JSON string escaping is a valid subset for our inputs. */
export const tomlStr = (s: string) => JSON.stringify(s);

export function versionOf(bin: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 20000, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => {
      if (err && !stdout) return resolve(null);
      const m = `${stdout}\n${stderr}`.match(/\d+\.\d+\.\d+(?:[-.][0-9A-Za-z.]+)?/);
      resolve(m ? m[0] : "unknown");
    });
  });
}

export function which(bin: string): string | null {
  if (bin.includes("/")) return fs.existsSync(bin) ? path.resolve(bin) : null;
  for (const d of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!d) continue;
    for (const ext of process.platform === "win32" ? ["", ".cmd", ".exe"] : [""]) {
      const p = path.join(d, bin + ext);
      try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ }
    }
  }
  return null;
}
