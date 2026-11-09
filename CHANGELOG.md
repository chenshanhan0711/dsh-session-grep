# Changelog

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
