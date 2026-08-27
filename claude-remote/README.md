# Claude Remote

An interactive Claude Code pane for dinotty — streaming output, interrupt, and
visible permission controls.

> Status: feature-complete for the roadmap below — sending, streaming, resume,
> interrupt, reconnect, a tool allowlist, and per-call Allow / Deny. Per-call
> approval needs Claude Code 2.1.199 or newer; the pane disables the control and
> says so on older builds.

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
| Permissions | hardcoded `acceptEdits` | mode selector, per-pane tool allowlist, and per-call Allow / Deny |
| Platforms | `which`, POSIX only | `where.exe` + `.cmd` handling, native Windows launcher |
| Disconnect | turn dies with the request | turn keeps running; any device can reattach |

## Requirements

- dinotty 0.19.0 or newer
- [Claude Code CLI](https://code.claude.com/docs) 2.0.0 or newer, on `PATH`
- Node.js on `PATH` (the sidecar is a Node bundle)

The plugin drives the `claude` that is already installed and signed in on your
machine. It never reads, stores, or forwards your credentials — authentication
happens inside the `claude` process, and the plugin only sees the event stream.

Approving this plugin's permissions is not an OS-level sandbox: its native
binaries still run as your user and can reach other files and networks. The tool
allowlist and the Allow / Deny prompt govern what *Claude* is permitted to do
within a turn; they are not a confinement boundary around the sidecar itself.

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
        |  ctx.storage.set(turnId, {prompt, ...})       <- request in
        |  ctx.process.start(['turn', turnId, ...])     <- only the key in argv
        |  ctx.storage.get(turnId + '-log')  (polled)   <- state out
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

### Why a turn is not run with `exec.spawn`

`exec.spawn` is the obvious API for streaming output, and it is the wrong one
here. The spawn WebSocket owns the child's lifetime: when that socket closes,
the host kills the process, and `lifecycle.scope` does not change that. A phone
locking its screen mid-turn would kill the turn.

`ctx.process.start` is supervised independently and survives, but its stdout is
drained into a bounded host-side buffer with no API in front of it — a managed
process cannot stream anything back. So the sidecar publishes its own state: it
reduces the event stream to a snapshot and writes `<turnId>-log.json` into the
plugin's data directory, which the pane reads with `ctx.storage.get()` every
250 ms.

That reduction happens in the sidecar rather than the pane for two reasons. With
`--include-partial-messages` a turn emits one event per token, so persisting the
raw log and rewriting it on every event would be quadratic. And the snapshot has
to stand alone — it carries the user's prompt too, so a device that never
watched the turn happen can still render it.

Reconnecting then costs nothing: the pane records the turn id before starting
the process, and picking the turn back up is just resuming the poll. If the
snapshot stops advancing and no matching process is running, the pane reports
the turn as stopped rather than spinning forever.

The prompt is written to the child's **stdin**, never argv. It is untrusted
text, and on Windows an argv prompt would have to survive `cmd.exe` quoting.
Verified against Claude Code 2.1.150: `claude -p` with no prompt argument takes
the prompt from stdin.

It does not travel in the sidecar's argv either. Process args are visible in
`ctx.process.list()`, and `ctx.exec.spawn` would serialise them into a WebSocket
URL query string, where a long or multi-line prompt runs into length limits and
encoding edge cases. The pane stages the whole request with `ctx.storage.set()`
— which the host writes to `$DINOTTY_PLUGIN_DATA_DIR/<key>.json` — and passes
only the key. The sidecar deletes that file as soon as it reads it.

### Per-call Allow / Deny

`claude -p` has no permission callback, so the pane cannot simply be asked. What
it does have is `--permission-prompt-tool`, which names an MCP tool to consult
whenever a call reaches the prompt step. This plugin ships that server: the same
sidecar binary, re-entered as `mcp-permission`, spawned by `claude` rather than
by dinotty and inheriting the plugin's data directory through it.

The exchange is two files beside the turn's other state:

```
<turnId>-ask.json       written by the permission server, polled by the pane
<turnId>-decision.json  written by the pane, consumed by the permission server
```

A separate file rather than the snapshot, because the snapshot is rewritten
wholesale by the turn runner and two writers would race.

Claude blocks on the MCP call until it returns, which is the point — but it
cannot block forever, so an unanswered prompt denies itself after ten minutes
instead of wedging the session. A leftover decision from an earlier prompt in
the same turn is cleared before a new one is published, or the second prompt
would be answered instantly by the first one's answer.

Turning per-call approval on **forces `--permission-mode default`**. Permission
modes are evaluated before the prompt tool, so under `acceptEdits` (or `auto`,
or `bypassPermissions`) the call is resolved at the mode step and the pane is
never asked — the toggle would silently do nothing.

An allow always sends `updatedInput`: before Claude Code v2.1.207 an allow
without it was rejected as a validation error, which reads to the user as a
mysterious denial. The config deliberately omits `--strict-mcp-config`, which
would drop the user's own MCP servers for the turn.

No Agent SDK dependency is involved. The SDK's `canUseTool` is the other way to
do this, and it would mean bundling a second copy of the harness; this keeps the
plugin driving the `claude` the user already has.

### Continuing an existing session

Claude Code keeps one JSONL transcript per session under
`~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`, where the encoding
replaces every non-`[a-zA-Z0-9]` character with a dash. The sidecar lists that
directory, reads only the head of each file for a title, and the pane resumes
the chosen id with `--resume`.

Only the id is adopted. The history stays in Claude's own transcript and comes
back into context on the next turn, so the pane does not have to reproduce it.

The list is scoped to the pane's working directory: before Claude Code v2.1.223
`--resume` only finds an id inside the current project, so showing sessions from
elsewhere would offer rows that cannot be resumed from here.

### Interrupting

`ctx.process.stop(pid)` triggers the `stdinLease` protocol: the sidecar receives
`{"type":"shutdown"}` on stdin and sends SIGINT to Claude, so the turn ends
cleanly rather than being left unfinished in the session transcript. The turn id
is in the process args, which is how the right pid is found in
`ctx.process.list()`.

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

`capabilities` in `system/init` requires Claude Code v2.1.205+, and the field is
simply absent on older builds. Every gate here is currently a version compare
(`src/versions.ts`): `system/init` only arrives once a turn is already running,
whereas the gates are needed before one starts, to decide what the pane offers.
The header shows a marker when the build predates the field.

`crypto.randomUUID()` is not used anywhere: it is undefined on insecure origins,
and reaching dinotty from a phone means plain `http://<lan-ip>:8999`.

Version gates live in `src/versions.ts`, which imports nothing from Node — the
pane needs them to explain why a control is disabled, and importing them from
the sidecar module drags `node:child_process` into the browser bundle.

## Roadmap

- [x] **M1** — pane shell, environment probe, three explicit failure states
      (not installed / too old / cannot run). Note: the plan asked for a
      *logged-out* state; `claude --version` succeeds when logged out, so being
      signed out currently surfaces as an auth error on the first turn instead
      of up front.
- [x] **M2** — send a message, read `session_id` from `system/init`, resume with
      `--resume`, session persisted per pane
- [x] **M3a** — `--include-partial-messages` incremental rendering, interrupt via
      the stdin lease
- [x] **M3b** — turns survive a disconnect and any device can reattach, via a
      managed process plus a polled snapshot
- [x] **M4** — permission-mode selector and a per-pane tool allowlist, built
      from the tool list `system/init` reports
- [x] **M4b** — per-call Allow / Deny, through a bundled MCP permission server
- [x] **M4c** — continue a session started anywhere else on the machine (the
      CLI, Claude Desktop, an earlier pane) by picking it from a list and
      resuming it. This is a *handoff*, not a live join: continuing a session
      that is still open elsewhere forks its transcript, and the picker says so.
- [ ] **M5** — *live* takeover of a session that is still running elsewhere,
      with both surfaces attached at once.
      This is the plan's M5 and the only part that needs the reverse-engineered
      protocol; nothing here implements it yet.

Not done yet within the milestones above: editing a tool's input before
allowing it (the wire format supports it, the pane has no editor), "allow and
remember" rules, and a `--include-partial-messages` fixture (the recorded
stream covers the error path only).

## Development

```bash
npm run typecheck
npm test          # replays fixtures through the parser; exercises prompt staging
npm run build
```

Tests run against recorded NDJSON rather than a live model, so they work
offline and in CI. They cover the stream parser, the reduction to a snapshot,
and the prompt-staging contract.
