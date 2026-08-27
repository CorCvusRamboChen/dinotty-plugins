# Claude Remote

An interactive Claude Code pane for dinotty — streaming output, interrupt, and
visible permission controls.

> Status: sending, streaming, resume and interrupt work. Reconnecting to a turn
> after the browser drops, and per-call permission prompts, do not. See
> [Roadmap](#roadmap).

## How this differs from Session Browser

[Session Browser](../session-browser) is a read-only history browser with no
composer. This plugin is the other half: an actual conversation surface.

A previous attempt at that (`claude-code`, formerly `cc-chat-manager`) was
removed from this repository in `ea45026` as deprecated. It drove the CLI with a
single blocking call — `claude -p <prompt> --output-format json` through
`execFile` with a 300 s timeout — so there was no streaming, no way to interrupt
a running turn, and permissions were fixed at `--permission-mode acceptEdits`
with nothing shown to the user. It was also Unix-only: its `findClaude` shelled
out to `which`.

This plugin exists to do those four things properly:

| | deprecated `claude-code` | `claude-remote` |
|---|---|---|
| Output | one blocking call, buffered JSON | `--output-format stream-json`, incremental |
| Interrupt | none | SIGINT on POSIX; hard kill on Windows |
| Permissions | hardcoded `acceptEdits` | surfaced and user-controlled |
| Platforms | `which`, POSIX only | `where.exe` + `.cmd` handling, native Windows launcher |

## Requirements

- dinotty 0.19.0 or newer
- [Claude Code CLI](https://code.claude.com/docs) 2.0.0 or newer, on `PATH`
- Node.js on `PATH` (the sidecar is a Node bundle)

The plugin drives the `claude` that is already installed and signed in on your
machine. It never reads, stores, or forwards your credentials — authentication
happens inside the `claude` process, and the plugin only sees the event stream.

## Install (development)

```bash
git clone https://github.com/xichan96/dinotty-plugins.git
cd dinotty-plugins/claude-remote
npm install
npm run build
```

Then point dinotty at the directory:

```bash
curl -X POST http://127.0.0.1:8999/api/plugins/dev-link \
  -H "Content-Type: application/json" \
  -d '{"path": "/absolute/path/to/dinotty-plugins/claude-remote"}'
```

Open it with **Add Pane → Claude Remote**, or the `claude-remote.open` command.

### Windows

`npm run build` does not rebuild the native launcher. `dist/cli-wrapper.exe` is
committed; rebuild it only after editing `native/windows-launcher.rs`:

```powershell
npm run build:windows-launcher
```

The launcher exists because dinotty resolves `bin.entries` through
`CreateProcess`, which cannot execute a `.cmd` or a shebang script. It forwards
argv straight to `node dist/cli` with no command interpreter in between.

## Architecture

```
pane component (browser, dist/main.js)
        |  ctx.storage.set(turnId, {prompt, ...})   <- the prompt
        |  ctx.exec.spawn(['turn', turnId, ...])    <- only the key
        v
sidecar (node, dist/cli — launched via cli-wrapper[.exe])
        |  child process, prompt on stdin, NDJSON on stdout
        v
claude -p --output-format stream-json
```

Everything that touches the machine lives in the sidecar. That is not a
preference: a dinotty plugin's JS runs in the browser with no network
permission and no HTTP proxy in `PluginContext`, and `exec` can only launch the
binary the plugin declares in `bin` — there is no arbitrary-command channel.
`bin.lifecycle.scope: "host"` keeps the sidecar alive across UI hot reloads and
browser disconnects, which is what makes a phone that drops its connection
recoverable.

The prompt is written to the child's **stdin**, never argv. It is untrusted
text, and on Windows an argv prompt would have to survive `cmd.exe` quoting.
Verified against Claude Code 2.1.150: `claude -p` with no prompt argument takes
the prompt from stdin.

It does not travel in the sidecar's argv either. `ctx.exec.spawn` serialises its
args into a WebSocket URL query string, so a long or multi-line prompt would run
into URL length limits and encoding edge cases. The pane stages the whole
request with `ctx.storage.set()` — which the host writes to
`$DINOTTY_PLUGIN_DATA_DIR/<key>.json` — and passes only the key. The sidecar
deletes that file as soon as it reads it.

### Interrupting

`SpawnHandle.kill()` closes the WebSocket, and the host responds by hard-killing
the sidecar, which would leave the turn unfinished in the session transcript.
The graceful path is `ctx.process.stop(pid)`: that triggers the `stdinLease`
protocol, the sidecar receives `{"type":"shutdown"}` on stdin, and it sends
SIGINT to Claude so the turn ends cleanly. The turn id is in the process args,
which is how the right pid is found in `ctx.process.list()`.

Windows has no POSIX signals, so interrupting there is still a hard kill and the
pane says so rather than pretending the turn ended cleanly.

## Stream quirks this handles

Captured from real runs against Claude Code 2.1.150 (see `fixtures/`), all of
which break the obvious implementation:

1. **`system/init` is not the first line.** A `SessionStart` hook emits
   `system/hook_started` ahead of it.
2. **`result` is not the last line.** `system/hook_response` arrives after it,
   so end-of-stream is process exit, never the result message.
3. **An API failure arrives as a successful-looking `result`.** The CLI exits 0
   with `subtype: "success"`, `is_error: true`, and `api_error_status`. You have
   to check `is_error` explicitly.
4. **New `system` subtypes appear over time.** A live run produced
   `system/status`, which the recorded fixture does not contain. Unknown event
   types are ignored rather than treated as errors.

`capabilities` in `system/init` requires Claude Code v2.1.205+. On older builds
the field is simply absent, so feature detection falls back to comparing
`claude_code_version`, and the pane header shows a warning marker.

`crypto.randomUUID()` is not used anywhere: it is undefined on insecure origins,
and reaching dinotty from a phone means plain `http://<lan-ip>:8999`.

## Roadmap

- [x] **M1** — pane shell, environment probe, three explicit failure states
      (not installed / too old / cannot run)
- [x] **M2** — send a message, read `session_id` from `system/init`, resume with
      `--resume`, session persisted per pane
- [x] **M3a** — `--include-partial-messages` incremental rendering, interrupt via
      the stdin lease
- [ ] **M3b** — reconnect to a running turn after the browser drops. The sidecar
      already survives (`lifecycle.scope: "host"`), but the pane cannot yet
      re-attach to its output.
- [x] **M4a** — permission-mode selector
- [ ] **M4b** — allowed-tools UI
- [ ] **M5** — per-call Allow / Deny. `claude -p` has no callback for this, so it
      needs the Agent SDK's `canUseTool`, or `--permission-prompt-tool` if it can
      route prompts to stdout.

## Development

```bash
npm run typecheck
npm test          # replays fixtures through the parser; exercises prompt staging
npm run build
```

Tests run against recorded NDJSON rather than a live model, so they work
offline and in CI.
