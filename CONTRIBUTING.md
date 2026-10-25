# Contributing

Thanks for helping. The most useful contributions, in order:

1. **A run on a setup we haven't covered.** Run `askwire --markdown` (and `askwire --tui --markdown` if you have tmux) and paste the output into an issue with your OS and client versions.
2. **A wrong verdict.** If askwire says something your client doesn't do, open a bug with `askwire --keep --json` output. `--keep` leaves the run directory (configs, probe log, screen captures) in the current folder.
3. **A new client adapter.** See `src/clients/` for the existing ones. An adapter needs: how to detect the binary and version, how to point it at a custom model endpoint in a throwaway home directory, and the headless and interactive commands.

## Development

```sh
git clone https://github.com/Blackman99/askwire && cd askwire
npm ci
npm test           # builds and runs the unit tests
node dist/cli.js   # runs against the clients on your PATH
```

Keep changes small and focused, add a test for behavior changes, and update CHANGELOG.md under an "Unreleased" heading.

## Reports from real runs

Please paste real output only. If you edit anything (paths, hostnames), say so.
