# Changelog

## [Unreleased]

- Re-measured Claude Code 2.1.312 and Codex 0.165.0 (2026-10-28, Linux, stand-in model only): same answers as before. Headless, `claude -p` gives `cancel` in 2-5 ms and `codex exec` gives `decline` in 1-2 ms for form, url and timeout; in `--tui` the question is drawn and Esc gives `cancel` (Codex url: `decline`), and left untouched it gets no answer in 60 s.
- Re-measured Claude Code 2.1.311 (2026-10-27, Linux, stand-in model only): same answers as 2.1.310. Headless `cancel` in 2-4 ms for form, url and timeout; in `--tui` the question is drawn and Esc gives `cancel`, and left untouched it gets no answer in 60 s.
- Timeout scenario: one form question that nobody touches. Opt in with `--wait <seconds>` (default 60, 30 when `CI` is set) or `--scenarios timeout` / `--scenarios all`; it always runs last. In `--tui` nothing is pressed, and askwire records whether the question was on screen and whether the client takes it down within 10 s after the probe gives up (`stillOnScreen`).
- New outcomes and verdicts: `timeout` carries the bound that applied (`limitMs`); `abandoned` when the client cancels the tool call while its question is open; `SHOWN ON SCREEN · WAITS FOR A PERSON`; `GIVES UP · CANCELS THE TOOL CALL`.
- A TUI answer now only counts as a person's if askwire pressed a key for it. An answer to a question nobody touched counts as answering without a human.
- `--scenarios` accepts `all`, drops duplicates and explains empty or unknown lists.
- Measured (2026-10-26, Linux): left untouched in the TUI, Claude Code 2.1.310 and Codex 0.164.0 both kept the question open for the full 60 s with no answer and did not cancel the tool call (6 runs each). Headless, the same question got `cancel` in 2 ms (`claude -p`) and `decline` in 1 ms (`codex exec`). opencode 1.19.4 and Gemini CLI 0.65.0 do not advertise elicitation, so nothing was sent.
- CI real-clients job also runs the untouched question in `--tui` at 30 s.
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
