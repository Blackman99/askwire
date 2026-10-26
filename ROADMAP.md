# Roadmap

askwire answers one question: when an MCP server sends `elicitation/create`, does a human see it, and what comes back? Everything here serves that question.

## v0.2: more clients, more transports
- Adapters for Cursor agent CLI, GitHub Copilot CLI and Kiro CLI. (Gemini CLI: done.)
- Streamable HTTP probe server (not only stdio).
- Elicitation inside MCP Tasks (`tasks/*`).
- Timeout scenario: does the client ever answer if nobody touches it? (Done: `--wait`.)
- Defaults scenario: does `accept` carry schema defaults (SEP-1034)?

- Spec 2026-07-28: the stateless protocol replaces server-initiated `elicitation/create` with `InputRequiredResult` / `inputResponses` (MRTR). Probe both paths once clients and the TypeScript SDK ship it.

## v0.3: answering, not only dismissing
- Scripted TUI answers (accept with a value), checking that content round-trips and that schema validation happens.
- Per-client notes on which settings make a headless run ask a person instead of answering itself.

## v0.4: a public table
- A GitHub Action and a CI matrix that rerun the probe on every new client release and publish a compatibility table.
- A small guard snippet for servers: treat non-accept as no, add a timeout, refuse risky actions when the client is headless.

Ideas outside this list are welcome as issues. If a change doesn't help answer "did a human see it?", it probably belongs somewhere else.
