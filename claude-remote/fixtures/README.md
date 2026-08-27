# Fixtures

Recorded `claude -p --output-format stream-json --verbose` output, replayed by
`test/protocol.test.mjs`. Tests run offline against these, so CI never needs a
model or an API key.

| File | What it covers |
|---|---|
| `error-org-disabled.ndjson` | The error path, plus three stream quirks: a `SessionStart` hook event before `system/init`, a `system/hook_response` after `result`, and an API failure reported as `subtype: "success"` with `is_error: true`. Recorded on Claude Code 2.1.150, which predates the `capabilities` field. |

## Recording a new fixture

```bash
echo "your prompt" | claude -p --output-format stream-json --verbose \
  > fixtures/<name>.ndjson 2>&1
```

**Then sanitize it before committing.** A raw recording embeds the machine it
came from: `system/init` alone carries `cwd`, `memory_paths`, and the full list
of the recording user's installed skills, slash commands, agents, and MCP
servers, and hook events can carry arbitrary command output. Replace at minimum

- `session_id` and every `uuid`
- `cwd` and `memory_paths`
- `skills`, `slash_commands`, `agents`, `mcp_servers`
- `stdout` / `stderr` / `output` on hook events

with neutral placeholders, keeping the event structure intact so the parser is
still exercised the same way.
