# Goal

Tell an MCP server author, in one command and against the real AI clients installed on their machine, whether an `elicitation/create` request is ever seen by a human or silently answered by the client (accept, decline, cancel, error or never).

## Who it is for
1. MCP server authors adding elicitation: confirming destructive actions, asking for missing parameters, URL-mode sign-in.
2. People running Claude Code, Codex or opencode headless (CI, cron, `-p` / `exec` / `run`) who need to know which "are you sure?" prompts get answered automatically.
3. Client maintainers checking their own elicitation support for regressions.

## Principles
- Measure, don't guess. Every claim in the report comes from a real run of the real client.
- Never touch the user's own client config, account or tokens.
- Say what was measured and what wasn't. No verdict without evidence.

## Done looks like
A server author runs `npx github:Blackman99/askwire`, reads one screen, and knows what to do with decline, cancel and silence.
