# Changelog

## [Unreleased]

- Gemini CLI adapter (`gemini -p` and interactive) in a throwaway `HOME`, pointed at the stand-in through `GOOGLE_GEMINI_BASE_URL`.
- Stand-in model speaks Gemini `generateContent` / `streamGenerateContent`.
- Measured: Gemini CLI 0.65.0 does not advertise elicitation; a raw request gets `-32601`.
- Site: blog article "Decline vs cancel, and who is actually answering" in English and Chinese, linked from the README, landing page and docs.

## [0.1.0] - 2026-10-25

First release.

- Probe MCP server with `form`, `url` and `unadvertised` elicitation scenarios, each tagged with a per-run nonce.
- Local stand-in model (Anthropic Messages, OpenAI Responses, Chat Completions), so no account, API key or tokens are needed.
- Client adapters for Claude Code (`claude -p` and interactive), Codex (`codex exec` and interactive) and opencode (`opencode run` and interactive), each in a throwaway home directory.
- `--tui` mode: runs the interactive client in tmux, checks the question is drawn on screen, presses Esc.
- Report card, `--json`, `--markdown`, `--strict` exit code for CI, `--bin` to test a specific build, `--keep` to keep the run directory.
- `askwire server` to run only the probe server and add it to any client by hand.
