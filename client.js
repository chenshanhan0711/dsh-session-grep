/**
 * dsh-session-grep — Client half.
 *
 * A search pill in the conversation header. Types into the Host's literal
 * substring index and shows one row per matching message; picking a row opens
 * that conversation and flashes the matched text in place.
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-grep',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-session-grep';
    const API = '/dsh-session-grep/api';
    const STYLE_ID = 'dsh-session-grep-style';
    const LIMIT = 40;

    const DICT = {
      en: {
        'meta.title': 'Conversation grep',
        'meta.description': 'Substring search across every message in this workspace — fragments inside a sentence match too.',
        search: 'Search',
        opened: 'Switched to',
        placeholder: 'Search all messages, e.g. 搜索输出',
        hint: 'Matches any fragment, including inside a Chinese sentence.',
        empty: 'No message contains that fragment.',
        failed: 'Search failed',
        tools: 'Tool output',
        hits: 'hits',
        ms: 'ms',
        truncated: 'stopped at limit',
        noHistory: 'No conversation history found in this workspace.',
        notLocated: 'Opened, but the text is not rendered yet — scroll up in that conversation.',
        navFailed: 'Could not open that conversation',
        loading: 'Searching…',
        user: 'you',
        assistant: 'assistant',
        tool: 'tool',
      },
      zh: {
        'meta.title': '对话正文搜索',
        'meta.description': '在工作区全部对话正文里做真正的子串搜索，中文句子中间的片段也能命中。',
        search: '搜索',
        opened: '已切换到',
        placeholder: '搜索所有对话正文，例如：搜索输出',
        hint: '任意片段都能命中，包括中文句子中间的字。',
        empty: '没有消息包含这个片段。',
        failed: '搜索失败',
        tools: '工具输出',
        hits: '处命中',
        ms: '毫秒',
        truncated: '已达条数上限',
        noHistory: '这个工作区还没有对话记录。',
        notLocated: '已打开对话，但这句还没渲染出来——往上翻一下。',
        navFailed: '没能打开那个对话',
        loading: '搜索中…',
        user: '我',
        assistant: '助手',
        tool: '工具',
      },
    };

    const runtime = {
      locale: null,
      notify: () => {},
      openSession: () => null,
      currentSession: () => null,
      t: (key) => DICT.en[key] ?? key,
    };

    // Never read the locale service while React renders: capture it at apply
    // time and keep it fresh through the locale subscription instead.
    let activeLocale = 'en';

    function translate(key) {
      try {
        const active = String(activeLocale).toLowerCase();
        const dict = active.startsWith('zh') ? DICT.zh : DICT.en;
        return dict[key] ?? DICT.en[key] ?? key;
      } catch {
        return DICT.en[key] ?? key;
      }
    }

    const ICON = h(
      'svg',
      { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
      h('circle', { cx: 7, cy: 7, r: 4.6, stroke: 'currentColor', strokeWidth: 1.4 }),
      h('path', { d: 'M10.6 10.6 L14 14', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }),
    );

    function ensureStyle() {
      if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
      const style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = `
.dsg-root{position:relative;display:inline-flex;align-items:center;min-width:0}
.dsg-trigger{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1;cursor:pointer;transition:color .12s,border-color .12s}
.dsg-trigger:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.dsg-field{display:flex;align-items:center;gap:6px;height:30px;width:340px;max-width:46vw;padding:0 9px;border:1px solid var(--dsw-alias-brand-primary);border-radius:9px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}
.dsg-field input{flex:1;min-width:0;border:0;outline:0;background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit}
.dsg-kbd{font-size:10px;color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:1px 4px}
.dsg-panel{position:fixed;z-index:80;display:flex;flex-direction:column;max-height:min(62vh,520px);border:1px solid var(--dsw-alias-border-l1);border-radius:11px;background:var(--dsw-alias-bg-overlay);box-shadow:0 14px 36px rgba(0,0,0,.26);overflow:hidden}
.dsg-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:11px;color:var(--dsw-alias-label-secondary)}
.dsg-chip{cursor:pointer;user-select:none;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);white-space:nowrap}
.dsg-chip[data-on="1"]{color:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dsg-list{overflow:auto;padding:4px}
.dsg-item{display:flex;flex-direction:column;gap:3px;padding:7px 9px;border-radius:7px;cursor:pointer;border-left:2px solid transparent}
.dsg-item[data-active="1"],.dsg-item:hover{background:var(--dsw-alias-bg-layer-1);border-left-color:var(--dsw-alias-brand-primary)}
.dsg-meta{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--dsw-alias-label-secondary);min-width:0}
.dsg-title{color:var(--dsw-alias-label-primary);font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsg-role{flex:none;padding:0 5px;border-radius:4px;border:1px solid var(--dsw-alias-border-l1);font-size:10px;line-height:15px}
.dsg-sid{flex:none;margin-left:auto;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:10px;color:var(--dsw-alias-label-secondary);opacity:.75;letter-spacing:.02em}
.dsg-snip{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary);word-break:break-word}
.dsg-snip mark{background:transparent;color:var(--dsw-alias-brand-primary);font-weight:600}
.dsg-empty,.dsg-err{padding:18px 12px;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-secondary);text-align:center}
.dsg-err{color:var(--dsw-alias-state-error-primary)}
.dsg-foot{display:flex;justify-content:space-between;gap:10px;padding:5px 10px;border-top:1px solid var(--dsw-alias-border-l1);font-size:10px;color:var(--dsw-alias-label-secondary)}
.dsg-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:90;max-width:70vw;padding:7px 14px;border-radius:999px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12px;box-shadow:0 8px 24px rgba(0,0,0,.22)}
mark.dsg-flash{background:var(--dsw-alias-brand-primary);color:#fff;border-radius:3px;padding:0 1px}
@media (max-width:720px){.dsg-trigger-label{display:none}}
`;
      document.head.appendChild(style);
    }

    function removeStyle() {
      document.getElementById(STYLE_ID)?.remove();
    }

    // ---------------------------------------------------------------- locate

    function clearFlash() {
      for (const mark of Array.from(document.querySelectorAll('mark.dsg-flash'))) {
        try {
          mark.replaceWith(document.createTextNode(mark.textContent || ''));
        } catch {
          mark.remove();
        }
      }
    }

    function isVisible(el) {
      if (!el) return false;
      if (el.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
      if (typeof el.checkVisibility === 'function') {
        return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
      }
      return el.getClientRects().length > 0;
    }

    /** The mounted transcript for one session (never another one's). */
    function sessionRoot(sessionId) {
      const all = Array.from(document.querySelectorAll('[data-conversation-session]'));
      if (!all.length) return null;
      const id = String(sessionId || '');
      if (id) {
        const exact = all.find((el) => el.getAttribute('data-conversation-session') === id);
        if (exact) return exact;
        const byPrefix = all.find((el) => id.startsWith(el.getAttribute('data-conversation-session') || 'no'));
        if (byPrefix) return byPrefix;
      }
      return null;
    }

    /** Wrap the `ordinal`-th (0-based) visible occurrence of `target` in a flashing mark. */
    function flashText(root, target, ordinal) {
      const needle = String(target || '').trim();
      const want = Math.max(0, Number(ordinal) || 0);
      if (!root || needle.length < 2) return false;
      const lowered = needle.toLowerCase();
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (parent.closest('.dsg-root') || parent.closest('mark.dsg-flash')) return NodeFilter.FILTER_REJECT;
          if (/^(SCRIPT|STYLE|TEXTAREA|INPUT|NOSCRIPT)$/.test(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (!isVisible(parent)) return NodeFilter.FILTER_REJECT;
          return (node.nodeValue || '').length >= needle.length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        },
      });
      let seen = 0;
      let node = walker.nextNode();
      while (node) {
        const text = node.nodeValue || '';
        const lowText = text.toLowerCase();
        let from = 0;
        let at = -1;
        for (;;) {
          const probe = lowText.indexOf(lowered, from);
          if (probe === -1) break;
          if (seen === want) {
            at = probe;
            break;
          }
          seen += 1;
          from = probe + lowered.length;
        }
        if (at !== -1) {
          try {
            const range = document.createRange();
            range.setStart(node, at);
            range.setEnd(node, at + needle.length);
            const mark = document.createElement('mark');
            mark.className = 'dsg-flash';
            range.surroundContents(mark);
            mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
            setTimeout(clearFlash, 2600);
            return true;
          } catch {
            // cross-element selection: keep looking
          }
        }
        node = walker.nextNode();
      }
      return false;
    }

    /** Best-effort breadcrumb to the host; never throws, never blocks. */
    /**
     * Opt-in breadcrumbs (`localStorage.setItem('dsg:diag', '1')`): silent by
     * default so the plugin never talks to the host unless asked to.
     */
    const DIAG_ON = (() => {
      try {
        return window.localStorage.getItem('dsg:diag') === '1';
      } catch {
        return false;
      }
    })();

    function diag(step, extra) {
      if (!DIAG_ON) return;
      try {
        fetch('/dsh-session-grep/api/diag', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ step, ...(extra || {}) }),
        }).catch(() => {});
      } catch {
        /* ignore */
      }
    }

    /** The scroll container that owns `root`. */
    function findScroller(root) {
      let node = root;
      while (node && node !== document.body) {
        const style = window.getComputedStyle(node);
        if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 40) return node;
        node = node.parentElement;
      }
      let best = null;
      for (const el of Array.from(root.querySelectorAll('div'))) {
        if (el.clientHeight < 150) continue;
        if (el.scrollHeight <= el.clientHeight + 200) continue;
        const style = window.getComputedStyle(el);
        if (!/(auto|scroll)/.test(style.overflowY)) continue;
        if (!best || el.scrollHeight > best.scrollHeight) best = el;
      }
      return best;
    }

    /**
     * Second, independent locator: pick the occurrence whose surrounding turn
     * text still contains the words from the result snippet. Survives a drift
     * between the indexed event order and what the transcript renders.
     */
    function flashByContext(root, snippet, matchStart, matchLength, needleLen) {
      const raw = String(snippet || '');
      const start = Math.max(0, Number(matchStart) || 0);
      const before = raw.slice(Math.max(0, start - 18), start).replace(/\s+/g, ' ').trim();
      const after = raw.slice(start + (Number(matchLength) || 0), start + (Number(matchLength) || 0) + 18).replace(/\s+/g, ' ').trim();
      const target = raw.slice(start, start + (Number(matchLength) || needleLen)).trim();
      if (!target || target.length < 2) return false;
      if (before.length < 3 && after.length < 3) return false;

      const needle = raw.slice(start, start + (Number(matchLength) || needleLen));
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      const candidates = [];
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !parent.closest('.dsg-root') && isVisible(parent)) {
          const text = node.nodeValue || '';
          const at = text.toLowerCase().indexOf(needle.toLowerCase());
          if (at !== -1) candidates.push({ node, at });
        }
        node = walker.nextNode();
      }
      for (const candidate of candidates) {
        const row = candidate.node.parentElement?.closest('[data-chat-turn]') || candidate.node.parentElement;
        const rowText = (row?.textContent || '').replace(/\s+/g, ' ');
        if (before.length >= 3 && !rowText.includes(before)) continue;
        if (after.length >= 3 && !rowText.includes(after)) continue;
        try {
          const range = document.createRange();
          range.setStart(candidate.node, candidate.at);
          range.setEnd(candidate.node, candidate.at + needle.length);
          const mark = document.createElement('mark');
          mark.className = 'dsg-flash';
          range.surroundContents(mark);
          mark.scrollIntoView({ block: 'center', behavior: 'smooth' });
          setTimeout(clearFlash, 2600);
          return true;
        } catch {
          // keep looking
        }
      }
      return false;
    }

    /**
     * Find `target` inside `wanted`'s transcript only.
     *
     * The transcript is paged: older turns mount only after the scroller has
     * been pulled towards the top, so the sweep first pages all the way up
     * (watching `scrollHeight` until it stops growing) and only then counts
     * the ordinal. Counting before the history is fully mounted would always
     * land on the first currently-rendered occurrence.
     */
    function locateAfterOpen(wanted, hit) {
      const needle = String(hit.match || hit.snippet || '').trim();
      const ordinal = Math.max(0, Number(hit.ordinal) || 0);
      diag('locate-start', { needle, wanted, ordinal });
      let waited = 0;

      const firstPass = setInterval(() => {
        waited += 300;
        const root = sessionRoot(wanted);
        if (root && flashText(root, needle, ordinal)) {
          clearInterval(firstPass);
          diag('located', { phase: 'direct', waited });
          return;
        }
        if (root && flashByContext(root, hit.snippet, hit.matchStart, hit.matchLength, needle.length)) {
          clearInterval(firstPass);
          diag('located', { phase: 'context-direct', waited });
          return;
        }
        if (waited < 900) return;
        clearInterval(firstPass);
        pageUpThenLocate(wanted, needle, ordinal, hit);
      }, 300);
    }

    function pageUpThenLocate(wanted, needle, ordinal, hit) {
      const root = sessionRoot(wanted);
      const scroller = root ? findScroller(root) : null;
      diag('sweep-start', {
        root: !!root,
        scroller: !!scroller,
        height: scroller ? Math.round(scroller.scrollHeight) : null,
        view: scroller ? Math.round(scroller.clientHeight) : null,
      });
      if (!root || !scroller) {
        runtime.notify?.();
        return;
      }

      let hops = 0;
      let stable = 0;
      let lastHeight = scroller.scrollHeight;

      const hop = () => {
        hops += 1;
        scroller.scrollTop = Math.max(0, scroller.scrollTop - Math.max(320, scroller.clientHeight * 0.9));
        setTimeout(() => {
          const height = scroller.scrollHeight;
          if (height > lastHeight + 10) {
            lastHeight = height;
            stable = 0;
          } else {
            stable += 1;
          }
          const atTop = scroller.scrollTop <= 1;
          if (hops < 200 && !(atTop && stable >= 2)) {
            setTimeout(hop, 150);
            return;
          }
          diag('paged', {
            hops,
            height: Math.round(scroller.scrollHeight),
            view: Math.round(scroller.clientHeight),
            atTop,
          });
          // Everything the app is willing to mount is mounted now.
          scroller.scrollTop = 0;
          setTimeout(() => {
            if (flashText(root, needle, ordinal)) {
              diag('located', { phase: 'sweep', hops });
              return;
            }
            const seen = countOccurrences(root, needle);
            const byContext = flashByContext(root, hit.snippet, hit.matchStart, hit.matchLength, needle.length);
            if (byContext) {
              diag('located', { phase: 'context', hops, ordinal, rendered: seen });
              return;
            }
            const fallback = flashText(root, needle, 0);
            diag('located', {
              phase: fallback ? 'miss-fallback' : 'miss',
              hops,
              ordinal,
              rendered: seen,
            });
            if (!fallback) runtime.notify?.();
          }, 260);
        }, 220);
      };
      setTimeout(hop, 200);
    }

    /** How many occurrences of `needle` the mounted transcript currently holds. */
    function countOccurrences(root, needle) {
      const lowered = String(needle || '').toLowerCase();
      if (!root || lowered.length < 2) return 0;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      let count = 0;
      let node = walker.nextNode();
      while (node) {
        const parent = node.parentElement;
        if (parent && !parent.closest('.dsg-root') && isVisible(parent)) {
          const text = (node.nodeValue || '').toLowerCase();
          let at = text.indexOf(lowered);
          while (at !== -1) {
            count += 1;
            at = text.indexOf(lowered, at + lowered.length);
          }
        }
        node = walker.nextNode();
      }
      return count;
    }

    // ------------------------------------------------------------- component

    function GrepWidget() {
      const [open, setOpen] = React.useState(false);
      const [text, setText] = React.useState('');
      const [tools, setTools] = React.useState(false);
      const [result, setResult] = React.useState({ status: 'idle', hits: [], tookMs: 0, truncated: false, scanned: 0 });
      const [cursor, setCursor] = React.useState(0);
      const [pos, setPos] = React.useState(null);
      const [toast, setToast] = React.useState('');
      const inputRef = React.useRef(null);
      const rootRef = React.useRef(null);
      const abortRef = React.useRef(null);
      const t = runtime.t;

      // 200 ms debounce, one in-flight request at a time.
      const [query, setQuery] = React.useState('');
      React.useEffect(() => {
        const timer = setTimeout(() => setQuery(text.trim()), 200);
        return () => clearTimeout(timer);
      }, [text]);

      React.useEffect(() => {
        if (!open) return;
        if (!query) {
          setResult({ status: 'idle', hits: [], tookMs: 0, truncated: false, scanned: 0 });
          return;
        }
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;
        setResult((prev) => ({ ...prev, status: 'loading' }));
        const url = `${API}/search?q=${encodeURIComponent(query)}&limit=${LIMIT}&context=70&tools=${tools ? 1 : 0}`;
        fetch(url, { signal: ac.signal, headers: { accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
          .then((data) => {
            setResult({
              status: 'done',
              hits: Array.isArray(data.hits) ? data.hits : [],
              tookMs: data.tookMs ?? 0,
              truncated: !!data.truncated,
              scanned: data.scannedEvents ?? 0,
            });
            setCursor(0);
          })
          .catch((error) => {
            if (error?.name === 'AbortError') return;
            setResult({ status: 'error', hits: [], tookMs: 0, truncated: false, scanned: 0, message: String(error?.message ?? error) });
          });
        return () => ac.abort();
      }, [query, tools, open]);

      const place = React.useCallback(() => {
        const el = inputRef.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const width = Math.max(rect.width, 440);
        const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8));
        setPos({ left, top: rect.bottom + 6, width });
      }, []);

      React.useEffect(() => {
        if (!open) return;
        place();
        const onScroll = () => place();
        window.addEventListener('resize', onScroll);
        window.addEventListener('scroll', onScroll, true);
        const focus = setTimeout(() => inputRef.current?.focus(), 0);
        return () => {
          clearTimeout(focus);
          window.removeEventListener('resize', onScroll);
          window.removeEventListener('scroll', onScroll, true);
        };
      }, [open, place]);

      React.useEffect(() => {
        if (!open) return;
        const onDown = (event) => {
          if (!rootRef.current?.contains(event.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
      }, [open]);

      React.useEffect(() => {
        runtime.notify = () => setToast(translate('notLocated'));
        return () => {
          runtime.notify = () => {};
        };
      }, []);

      React.useEffect(() => {
        if (!toast) return;
        const timer = setTimeout(() => setToast(''), 4200);
        return () => clearTimeout(timer);
      }, [toast]);

      React.useEffect(() => {
        clearFlash();
        return () => {
          abortRef.current?.abort();
          clearFlash();
        };
      }, []);

      const choose = React.useCallback((hit) => {
        if (!hit) return;
        setOpen(false);
        clearFlash();
        const wanted = String(hit.sessionId || '');
        const target = (hit.match && hit.match.length >= 2 ? hit.match : hit.snippet || '').trim();
        const ordinal = Math.max(0, Number(hit.ordinal) || 0);
        const current = runtime.currentSession();
        diag('choose', { wanted, current, same: current === wanted, ordinal, target: target.slice(0, 60) });
        const jump = () => {
          Promise.resolve(runtime.prepare ? runtime.prepare(wanted, hit.seq) : false).finally(() => {
            if (target) locateAfterOpen(wanted, hit);
          });
        };
        if (current && current === wanted) {
          jump();
          return;
        }
        const failure = runtime.openSession(wanted);
        diag('openSession', { wanted, failure });
        if (failure) {
          setToast(`${t('failed')}: ${failure}`);
          return;
        }
        setTimeout(() => {
          const now = runtime.currentSession();
          diag('after1s', { wanted, now, same: now === wanted });
          if (runtime.currentSession() === wanted) {
            jump();
            return;
          }
          // A subagent (side) Session is only addressable through its durable
          // direct-parent address, not by bare id: resolve it and try once more.
          runtime.openByAddress(wanted).then((opened) => {
            if (!opened) {
              setToast(`${t('navFailed')} ${wanted.slice(-6)}`);
              return;
            }
            setTimeout(() => {
              jump();
            }, 600);
          });
        }, 1000);
      }, []);

      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          setOpen(false);
          inputRef.current?.blur();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          setCursor((c) => Math.min(c + 1, Math.max(0, result.hits.length - 1)));
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          setCursor((c) => Math.max(c - 1, 0));
        } else if (event.key === 'Enter' && !event.nativeEvent?.isComposing) {
          event.preventDefault();
          choose(result.hits[cursor]);
        }
      };

      const roleLabel = (role) => (role === 'user' ? t('user') : role === 'assistant' ? t('assistant') : role === 'tool' ? t('tool') : role);

      const rows = result.hits.map((hit, index) => {
        const start = typeof hit.matchStart === 'number' && hit.matchStart >= 0 ? hit.matchStart : -1;
        const end = start >= 0 ? start + (hit.matchLength || 0) : -1;
        const snippet = hit.snippet || '';
        return h(
          'div',
          {
            key: `${hit.sessionId}:${hit.seq}:${index}`,
            className: 'dsg-item',
            'data-active': index === cursor ? '1' : '0',
            onMouseEnter: () => setCursor(index),
            onMouseDown: (event) => {
              event.preventDefault();
              choose(hit);
            },
          },
          h(
            'div',
            { className: 'dsg-meta' },
            h('span', { className: 'dsg-role' }, roleLabel(hit.role)),
            h('span', { className: 'dsg-title' }, hit.title || hit.sessionId.slice(0, 10)),
            h('span', { className: 'dsg-sid' }, String(hit.sessionId).slice(-6)),
            hit.count > 1 ? h('span', null, `×${hit.count}`) : null,
          ),
          h(
            'div',
            { className: 'dsg-snip' },
            start >= 0 && end <= snippet.length
              ? [
                  snippet.slice(0, start),
                  h('mark', { key: 'm' }, snippet.slice(start, end)),
                  snippet.slice(end),
                ]
              : snippet,
          ),
        );
      });

      const body = (() => {
        if (result.status === 'loading' && result.hits.length === 0) return h('div', { className: 'dsg-empty' }, t('loading'));
        if (result.status === 'error') return h('div', { className: 'dsg-err' }, `${t('failed')}: ${result.message || ''}`);
        if (result.status === 'done' && result.hits.length === 0) return h('div', { className: 'dsg-empty' }, t('empty'));
        if (result.status === 'idle') return h('div', { className: 'dsg-empty' }, t('hint'));
        return h('div', { className: 'dsg-list' }, rows);
      })();

      return h(
        'div',
        { className: 'dsg-root', ref: rootRef },
        open
          ? h(
              'div',
              { className: 'dsg-field' },
              ICON,
              h('input', {
                ref: inputRef,
                value: text,
                placeholder: t('placeholder'),
                onChange: (event) => setText(event.target.value),
                onKeyDown,
                spellCheck: false,
                'aria-label': t('placeholder'),
              }),
              h('span', { className: 'dsg-kbd' }, 'Esc'),
            )
          : h(
              'button',
              {
                type: 'button',
                className: 'dsg-trigger',
                title: t('placeholder'),
                onClick: () => setOpen(true),
              },
              ICON,
              h('span', { className: 'dsg-trigger-label' }, t('search')),
            ),
        open && pos
          ? h(
              'div',
              {
                className: 'dsg-panel',
                style: { left: `${pos.left}px`, top: `${pos.top}px`, width: `${pos.width}px` },
              },
              h(
                'div',
                { className: 'dsg-bar' },
                h('span', null, result.status === 'done' ? `${result.hits.length} ${t('hits')}` : t('hint')),
                h(
                  'span',
                  {
                    className: 'dsg-chip',
                    'data-on': tools ? '1' : '0',
                    role: 'switch',
                    'aria-checked': tools ? 'true' : 'false',
                    onClick: () => setTools((value) => !value),
                  },
                  t('tools'),
                ),
              ),
              body,
              result.status === 'done'
                ? h(
                    'div',
                    { className: 'dsg-foot' },
                    h('span', null, `${result.tookMs} ${t('ms')} · ${result.scanned} events`),
                    h('span', null, result.truncated ? t('truncated') : `${LIMIT} max`),
                  )
                : null,
            )
          : null,
        toast ? h('div', { className: 'dsg-toast' }, toast) : null,
      );
    }

    return {
      inject: ['slots', 'locale', 'uiWorkspace', 'sessions'],
      apply(ctx) {
        ensureStyle();
        runtime.locale = ctx.locale ?? null;
        runtime.t = translate;
        runtime.notify = () => {};
        runtime.currentSession = () => {
          try {
            const node =
              document.querySelector('[data-conversation-session]') ||
              document.querySelector('[data-session-id]');
            return (
              node?.getAttribute('data-conversation-session') ||
              node?.getAttribute('data-session-id') ||
              null
            );
          } catch {
            return null;
          }
        };
        runtime.openSession = (sessionId) => {
          try {
            ctx.uiWorkspace.openSession(sessionId);
            return null;
          } catch (error) {
            const message = error?.message || String(error);
            console.warn('[dsh-session-grep] openSession failed', message);
            return message;
          }
        };

        // Make sure one exact event is mounted before looking for it: the
        // transcript only keeps a window of turns in the DOM, and the session
        // face exposes loadThrough(seq) / loadOlder() for exactly this.
        runtime.prepare = async (sessionId, seq) => {
          try {
            const sessions =
              ctx.sessions || (typeof ctx.get === 'function' ? ctx.get('sessions') : null);
            if (!sessions || typeof sessions.retain !== 'function') return false;
            const reference = sessions.retain(sessionId, { source: 'controllerOperation' });
            try {
              await reference.ready;
              const session = reference.binding?.session;
              if (!session) return false;
              if (Number.isFinite(seq) && typeof session.loadThrough === 'function') {
                await session.loadThrough(seq);
              } else if (typeof session.loadOlder === 'function') {
                await session.loadOlder();
              }
              return true;
            } finally {
              if (typeof reference.release === 'function') reference.release();
            }
          } catch (error) {
            diag('prepare-failed', { sessionId, seq, error: String(error?.message ?? error) });
            return false;
          }
        };

        // Side Sessions are addressed by their durable direct-parent address.
        runtime.openByAddress = async (sessionId) => {
          try {
            const sessions =
              ctx.sessions || (typeof ctx.get === 'function' ? ctx.get('sessions') : null);
            if (!sessions || typeof sessions.retain !== 'function') return false;
            const reference = sessions.retain(sessionId, { source: 'controllerOperation' });
            try {
              await reference.ready;
              const snapshot = reference.binding?.session?.getSnapshot?.();
              const address = snapshot?.subagent?.address;
              if (!address) return false;
              ctx.uiWorkspace.openSession(address);
              return true;
            } finally {
              if (typeof reference.release === 'function') reference.release();
            }
          } catch (error) {
            console.warn('[dsh-session-grep] openByAddress failed', error?.message || error);
            return false;
          }
        };

        try {
          activeLocale = String(ctx.locale?.getLocale?.()?.active ?? 'en');
          if (typeof ctx.locale?.subscribe === 'function') {
            ctx.locale.subscribe(() => {
              try {
                activeLocale = String(ctx.locale?.getLocale?.()?.active ?? activeLocale);
              } catch {
                /* keep previous */
              }
            });
          }
        } catch (error) {
          console.warn('[dsh-session-grep] locale capture failed', error);
        }

        for (const [locale, dict] of [
          ['en', DICT.en],
          ['zh', DICT.zh],
          ['zh-CN', DICT.zh],
        ]) {
          try {
            ctx.locale.register(NS, locale, dict);
          } catch (error) {
            console.warn('[dsh-session-grep] locale register failed', locale, error);
          }
        }
        ctx.slots.inject('conversation.header.leading', () =>
          ctx.slots.register(
            {
              name: 'conversation.header.leading',
              id: 'dsh-session-grep',
              order: 10,
            },
            GrepWidget,
          ),
        );
      },
    };
  },
});
