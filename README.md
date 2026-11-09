# dsh-session-grep

Substring search across every message in a DeepSeek Harness workspace — the kind of search where `搜索输出` finds the sentence `…只能搜索输出`, and `插件` finds words inside longer words.

## Why this exists

The built-in session search (sidebar `Ctrl+K`) runs on an SQLite FTS5 index created with the `unicode61` tokenizer. That tokenizer matches **whole tokens and phrases**, not arbitrary substrings:

- Contiguous Chinese has no spaces, so an entire clause is one token. `搜索输出` is a fragment of the token `只能搜索输出` and therefore matches nothing.
- The upstream documentation says it plainly: *"`unicode61` tokenizer matches tokens and phrases rather than arbitrary substrings"* (`@deepseek-ai/dsh-session-query-sqlite`, README line 63).

This plugin keeps its own literal index instead: it reads the session logs, decompresses them and does a case-insensitive `indexOf`. Any fragment matches, Chinese included.

## What it looks like

- A **搜索 / Search** pill in the conversation header (the same slot the session title sits next to).
- Click it, type, and get one row per matching message: role, title, session suffix, snippet with the match highlighted.
- Results rotate across sessions, so one very long conversation cannot crowd out the others.
- `↑` `↓` to move, `Enter` to open, `Esc` to close.
- Picking a row opens that conversation and flashes the matched text for ~2.6 s. A hit in the conversation already on screen only scrolls and highlights — no pointless navigation.
- Toggle **工具输出 / Tool output** to also search tool calls, tool results and reasoning.
- Results are scoped to the current workspace, 40 rows max.

## Install

From npm:

```
dsh plugin --profile <profile> add dsh-session-grep
```

From a clone:

```
git clone https://github.com/chenshanhan0711/dsh-session-grep
dsh plugin --profile <profile> add ./dsh-session-grep
```

Or in the app: **Plugins → Add plugin** and point it at that folder. The bundle adds one Host service and one client slot; the pill appears after a restart.

Remove it the same way you removed any plugin; it never touches the DSH install directory.

## How it works

**Host** (`index.js`)

- Finds logs at `$DSH_HOME/sessions/<cwd-key>/<session-id>/session.v4.jsonl.zstd`.
- Each file is a sequence of concatenated zstd frames with no length prefix: split on the zstd magic, inflate each frame, and merge a slice into the next candidate when inflation fails (so a stray magic inside compressed bytes costs a retry, not an event).
- Parses the JSONL, extracts text per event type (`user/message`, `assistant/message`, optionally `tool/call` / `tool/result` / reasoning), and caches parses by `mtime + size` (max 64 sessions).
- One hit per event with an "N matches" count; each session collects up to `max(10, limit/2)` first, then the sessions are merged round-robin by their newest match — a long conversation cannot swallow the list.
- Serves three read-only routes under `/dsh-session-grep/api`: `search`, `sessions`, `health`.
- Scanning a 900-event / 3 MB session takes ~20 ms; a query over it is single-digit milliseconds.

**Client** (`client.js`)

- Registers into the `conversation.header.leading` slot.
- 200 ms debounce, one in-flight request at a time (the previous one is aborted).
- Results panel is `position: fixed` from the input rect, so it is never clipped by the header.
- Clicking a result calls `uiWorkspace.openSession(...)`; for a side thread it first retains the session and opens through the durable `subagent.address` from its snapshot. If the view has not switched after 1 s it retries once, and only then reports failure.
- Then it walks the rendered text nodes to wrap the match in a `<mark>`, scrolling it into view; if the message is not rendered yet it retries for ~9 s and then says so.
- Selection runs on `mousedown`, not `click`, so a blur cannot unmount the row before the handler runs.

## Limits

- Matches **text**, not rendered Markdown: a match split across `**bold**` boundaries may be found by the scanner but not highlighted on screen.
- Tool output, reasoning and JSON payloads are off by default; switch on **Tool output** to include them.
- Only sessions of the current workspace directory are scanned.
- Live sessions are re-parsed when the file changes; there is no incremental tailing yet.
- Very large histories are scanned fully per query (no persistent on-disk index), which is why results cap at 40.
- Changing the **Host** half needs an app restart; changing only `client.js` needs a page refresh (the Host hot-loads client bundles).
- Archived sessions still match; the app refuses to open them.

## Privacy

Zero network requests. The Host reads local session files and answers its own loopback route; the client only calls that route. No telemetry, no remote endpoints, no hardcoded credentials.

## License

MIT
