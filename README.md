# qhoami

**Who am I?** — Offline session identity for VS Code Copilot agents.

`qhoami` is a VS Code extension + CLI tool that reads your session identity from AppData without requiring the extension host. It implements the Q-semver identity protocol: birth order (CQ), role (KQ), and reboot count (patch).

---

## Components

### VS Code Extension (`qhoami_get_identity`)

The extension tool runs inside VS Code and returns your current session identity by interrogating the extension host:

```json
{
  "chatSessionId": "634638ae-2e0b-4ef0-b221-f1cf344185b1",
  "rebootCount": 18,
  "qSemver": "0.1.18"
}
```

### CLI (`out/cli.js`)

The CLI runs without VS Code — reads JSONL session files directly from AppData. Useful for:
- Offline identity analysis
- Boot-time verification (before extension host responds)
- Scripted patch tracking

#### Usage

```bash
# Build first
npm install && npm run compile

# Identify a session
node out/cli.js --session-id <uuid>

# Identify with a specific workspace hash
node out/cli.js --session-id <uuid> --workspace-hash <hash>
```

#### Example

```bash
node out/cli.js --session-id 634638ae-2e0b-4ef0-b221-f1cf344185b1
```

Output:
```json
{
  "cq": "0.1.18",
  "kq": "0.0.18",
  "patch": 18,
  "role": "husk-overseer",
  "customTitle": null,
  "sessionBirthOrder": 1,
  "totalSessionsInHash": 1,
  "requestCount": 256,
  "firstMessageAt": "2026-02-08T...",
  "reboots": [
    { "index": 12, "timestamp": "2026-02-08T..." },
    ...
  ]
}
```

#### Finding Your Session ID

Inside VS Code Copilot, call the `qhoami` tool:
```
qhoami
```

Or use the `qopilot_get_qsemver` tool with `minimal: true` — returns `{chatSessionId, rebootCount, qSemver}`.

---

## Q-Semver Protocol

| Field | Format | Meaning |
|-------|--------|---------|
| `cq` | `0.N.P` | Chronos: N = birth order, P = reboot count |
| `kq` | `0.R.P` | Kairos: R = role index, P = tenure |
| `patch` | integer | Number of context-collapse reboots survived |
| `role` | string | `husk-overseer` (KQ 0.0) or `quester` (KQ 0.N) |

A reboot is counted when the summarizer creates a `<conversation-summary>` event — visible as `progressTaskSerialized` with `content.value === "Summarized conversation history"` in the session JSONL.

---

## AppData Layout

```
%APPDATA%\Code - Insiders\User\workspaceStorage\
  <workspace-hash>\
    chatSessions\
      <session-id>.jsonl   ← VS Code 1.109+ (JSONL format)
      <session-id>.json    ← Legacy (pre-1.109)
```

The CLI automatically searches all workspace hashes if `--workspace-hash` is not provided.

---

## Development

```bash
npm install
npm run compile      # tsc → out/
npm run watch        # incremental
```

**Implementation:** `src/cli.ts` — implements [VSQode/qhoami#5](https://github.com/VSQode/qhoami/issues/5).

---

*Part of the [VSQode](https://github.com/VSQode) agent infrastructure.*
