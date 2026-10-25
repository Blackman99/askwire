# Changelog

## [0.1.0] - 2026-10-25

First release.

- Probe MCP server with `form`, `url` and `unadvertised` elicitation scenarios, each tagged with a per-run nonce.
- Local stand-in model (Anthropic Messages, OpenAI Responses, Chat Completions), so no account, API key or tokens are needed.
- Client adapters for Claude Code (`claude -p` and interactive), Codex (`codex exec` and interactive) and opencode (`opencode run` and interactive), each in a throwaway home directory.
- `--tui` mode: runs the interactive client in tmux, checks the question is drawn on screen, presses Esc.
- Report card, `--json`, `--markdown`, `--strict` exit code for CI, `--bin` to test a specific build, `--keep` to keep the run directory.
- `askwire server` to run only the probe server and add it to any client by hand.
