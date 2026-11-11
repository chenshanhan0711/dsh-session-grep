# Changelog

## 1.0.2 — 2026-11-11

- Fixed: every row in one long conversation landed on the first occurrence of the needle. The transcript mounts only a window of turns, so counting occurrences in the DOM could never reach the real one.
- Added: the client calls loadThrough(seq) on the session face before locating, so the exact event is mounted first; the fallbacks are "page up until the history stops growing", ordinal counting, and finally matching the words around the hit.
- Fixed: locating was scoped to the whole document and could highlight the same word inside another, hidden session. It now stays inside the clicked session's own subtree.
- Added: opt-in diagnostics — localStorage.setItem('dsg:diag', '1') records the locate pipeline to %TEMP%\\dsh-session-grep-diag.log; silent by default.

## 1.0.1 — 2026-11-09

- Fixed: cross-session results were unreachable. Search stopped as soon as the row limit was reached, so the longest conversation (scanned first) filled the whole list. Hits are now collected per session and merged round-robin by newest match.
- Fixed: one row per event with an "N matches" count, instead of repeating the same event for every occurrence.
- Fixed: selecting a row could be swallowed by the input blur; selection now runs on `mousedown`.
- Fixed: side threads (`Side: …`) open through their durable `subagent.address` when a bare session id does not navigate.
- Changed: rows show the session suffix; a hit already on screen only scrolls and highlights instead of navigating.
- Added: `navFailed` string in both locales.

## 1.0.0 — 2026-11-09

First release.

- Host service `dsh-session-grep` with `GET /dsh-session-grep/api/search`, `/sessions` and `/health`.
- Decodes the multi-frame `session.v4.jsonl.zstd` log format and caches parses by `mtime + size`.
- Literal, case-insensitive substring matching (Chinese fragments included), 3 hits per message, 40 rows max.
- Client search pill in `conversation.header.leading`: debounced query, keyboard navigation, match highlight, open-and-flash on select.
- Optional tool call / tool result / reasoning coverage.
- English and Chinese interface strings.
