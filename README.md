# g2k — Granola to Knowledge

Watch [Granola](https://granola.ai) for finished meetings and capture them into an
Obsidian vault using a `claude -p` agent that writes structured notes and commits them.

## Requirements

- macOS (Granola stores its cache locally on macOS)
- Node ≥ 20
- The [Claude Code](https://claude.com/claude-code) CLI (`claude`) on your PATH
- The Granola MCP authenticated once (see **Auth**)

## Install

```bash
npm install -g g2k
g2k init        # writes ~/.config/g2k/config.json
g2k auth        # one-time Granola MCP OAuth
g2k doctor      # verify everything is wired
g2k install     # install + load the launchd daemon
```

## Auth

g2k reads meetings through the Granola MCP from inside the spawned agent. Authenticate once:

```text
cd <your vault> && claude
/mcp            # approve `granola`, complete OAuth in the browser
```

The token persists in `~/.claude.json` and is reused headlessly. If captures start
timing out (`KILLED ... likely Granola MCP auth hang` in the logs), re-run the flow.

## How the watcher works

g2k does **not** poll Granola's API. It watches a single local file — Granola's
write-ahead log:

```
~/Library/Application Support/Granola/granola.db-wal
```

Granola writes to this file whenever it records a transcript or generates a meeting
summary. g2k watches that exact filename (by polling, so it survives the WAL being
checkpointed/recreated). When the file goes quiet for `debounceMs` and then settles
for `settleMs` — i.e. a meeting has ended and Granola has finished its summary — g2k
fires a single capture. Overlapping triggers are dropped while a capture is in flight.

If Granola changes where it stores its cache, point `watchFile` in the config at the
new path. Only the *filename being watched* matters to g2k; the actual meeting data is
fetched by the agent through the Granola MCP.

## Configuration

Config lives at `~/.config/g2k/config.json`. See `config.example.json`. Point
`promptFile` at your own prompt to override the bundled generic one.

Key fields:

| Field | Meaning |
|---|---|
| `vaultPath` | Absolute path to your Obsidian vault |
| `watchFile` | The Granola file to watch (default: the WAL path above) |
| `promptFile` | Override prompt; `null` uses the bundled generic prompt |
| `commit` | Whether the agent should commit its changes |
| `timing.debounceMs` / `settleMs` | Silence then settle window before a capture fires |

## Commands

| Command | Description |
|---|---|
| `g2k init` | Create the config file interactively |
| `g2k config` | Print the resolved config |
| `g2k watch` | Run the watcher in the foreground |
| `g2k run` | Capture today's meetings once, now |
| `g2k install` / `g2k uninstall` | Manage the launchd daemon |
| `g2k doctor` | Health checks (incl. MCP reachability) |
| `g2k auth` | Print the Granola MCP auth instructions |

## Logs

`~/Library/Logs/g2k/watcher.log` and `watcher.err.log`.
