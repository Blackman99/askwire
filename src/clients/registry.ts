import { claude } from "./claude.js";
import { codex } from "./codex.js";
import { opencode } from "./opencode.js";
import type { Adapter } from "./index.js";
export const ADAPTERS: Adapter[] = [claude, codex, opencode];
export const adapterById = (id: string) => ADAPTERS.find((a) => a.id === id);
