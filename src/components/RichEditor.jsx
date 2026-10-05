// Google-Doc-style writing: a clean page with a formatting toolbar (bold, italic, colours, highlight…).
// Stores sanitized HTML. Old plain-text values open fine (line breaks are kept).
import { useEffect, useRef, useState } from 'react';

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'H1', 'H2', 'H3', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'SPAN', 'FONT']);
const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\))$/i;

// Keep only safe formatting: no scripts, links or attributes — except text and highlight colours.
export function sanitize(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED'].includes(child.tagName)) child.remove();
          else {
            walk(child);
            child.replaceWith(...child.childNodes);
          }
          continue;
        }
        let el = child;
        if (el.tagName === 'SPAN' || el.tagName === 'FONT') {
          const color = el.style.color || el.getAttribute('color') || '';
          const bg = el.style.backgroundColor || '';
          if (el.tagName === 'FONT') {
            const span = doc.createElement('span');
            span.append(...el.childNodes);
            el.replaceWith(span);
            el = span;
          }
          for (const a of [...el.attributes]) el.removeAttribute(a.name);
          if (SAFE_COLOR.test(color.trim())) el.style.color = color.trim();
          if (SAFE_COLOR.test(bg.trim())) el.style.backgroundColor = bg.trim();
          if (!el.getAttribute('style')) {
            walk(el);
            el.replaceWith(...el.childNodes);
            continue;
          }
        } else {
          for (const a of [...el.attributes]) el.removeAttribute(a.name);
        }
        walk(el);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  const root = doc.body.firstChild;
  walk(root);
  return root.innerHTML;
}

const looksLikeHtml = (s) => /<\/?(p|div|br|b|i|u|s|h[1-3]|ul|ol|li|strong|em|blockquote|span|font)\b/i.test(s || '');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtml(value) {
  if (!value) return '';
  return looksLikeHtml(value) ? sanitize(value) : escapeHtml(value).replace(/\n/g, '<br>');
}

// Plain text for previews, titles and search.
export function toText(value) {
  if (!value) return '';
  if (!looksLikeHtml(value)) return value;
  const doc = new DOMParser().parseFromString(value.replace(/<(br|\/p|\/div|\/li|\/h[1-3])>/gi, '\n$&'), 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

// Mid-tone colours that read well on light and dark backgrounds.
export const TEXT_COLORS = ['#d93025', '#e8710a', '#b8860b', '#188038', '#1a73e8', '#9334e6', '#d01884', '#5f6368'];
export const HIGHLIGHTS = ['#fff3a3', '#ffd8a8', '#c3f0ca', '#c6e2ff', '#ead7ff', '#ffd1e8'];

const T = {
  bold: { cmd: 'bold', label: 'B', title: 'Bold', style: { fontWeight: 800 } },
  italic: { cmd: 'italic', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
  underline: { cmd: 'underline', label: 'U', title: 'Underline', style: { textDecoration: 'underline' } },
  strike: { cmd: 'strikeThrough', label: 'S', title: 'Strikethrough', style: { textDecoration: 'line-through' } },
  color: { palette: 'color', label: 'A', title: 'Text colour' },
  highlight: { palette: 'highlight', label: '🖍', title: 'Highlight' },
  h1: { block: 'H1', label: 'H1', title: 'Heading' },
  h2: { block: 'H2', label: 'H2', title: 'Subheading' },
  big: { block: 'H2', label: 'Big', title: 'Big text' },
  normal: { block: 'P', label: '¶', title: 'Normal text' },
  ul: { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
  ol: { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' },
  quote: { block: 'BLOCKQUOTE', label: '❝', title: 'Quote' },
  hr: { cmd: 'insertHorizontalRule', label: '―', title: 'Divider' },
  clear: { cmd: 'removeFormat', label: 'Tx', title: 'Clear formatting', style: { textDecoration: 'line-through', opacity: 0.7 } },
  undo: { cmd: 'undo', label: '↶', title: 'Undo' },
};
const TOOLSETS = {
  full: ['bold', 'italic', 'underline', 'strike', 'color', 'highlight', 'h1', 'h2', 'normal', 'ul', 'ol', 'quote', 'hr', 'clear', 'undo'],
  compact: ['bold', 'italic', 'underline', 'color', 'highlight', 'big', 'normal', 'clear', 'undo'],
};

export default function RichEditor({ id, value, onChange, placeholder, variant = 'full' }) {
  const ref = useRef(null);
  const saved = useRef(null);
  const [words, setWords] = useState(0);
  const [focus, setFocus] = useState(false);
  const [palette, setPalette] = useState(null);
  const compact = variant === 'compact';

  // Load initial content once (don't overwrite while typing).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML === '') {
      ref.current.innerHTML = toHtml(value);
      setWords(countWords(ref.current.innerText));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Remember the selection so toolbar taps (which can blur the page on phones) still apply to it.
  useEffect(() => {
    const onSel = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount && ref.current && ref.current.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  const emit = () => {
    const html = sanitize(ref.current.innerHTML);
    setWords(countWords(ref.current.innerText));
    onChange(html === '<br>' ? '' : html);
  };

  // Only put the saved selection back if the editor actually lost it (e.g. a phone tap blurred it).
  // Re-setting a live selection would wipe Chrome's pending "type in bold" state.
  const restore = () => {
    const sel = window.getSelection();
    const inside = sel && sel.rangeCount && ref.current.contains(sel.anchorNode) && document.activeElement === ref.current;
    if (inside) return;
    ref.current.focus();
    if (saved.current) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(saved.current);
    }
  };

  const run = (t) => {
    if (t.palette) {
      setPalette(palette === t.palette ? null : t.palette);
      return;
    }
    restore();
    if (t.block) document.execCommand('formatBlock', false, t.block);
    else document.execCommand(t.cmd, false, null);
    emit();
  };

  const applyColor = (kind, color) => {
    restore();
    document.execCommand('styleWithCSS', false, true);
    if (kind === 'color') document.execCommand('foreColor', false, color || 'inherit');
    else document.execCommand('hiliteColor', false, color || 'transparent');
    document.execCommand('styleWithCSS', false, false);
    setPalette(null);
    emit();
  };

  const keep = (e) => e.preventDefault(); // keep the text selection when tapping the toolbar

  return (
    <div className={['doc', compact && 'compact', focus && 'focus'].filter(Boolean).join(' ')}>
      <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLSETS[variant].map((k) => {
          const t = T[k];
          return (
            <button
              key={k}
              type="button"
              className={['doc-tool', t.palette && palette === t.palette && 'on', k === 'color' && 'color-tool'].filter(Boolean).join(' ')}
              title={t.title}
              aria-label={t.title}
              aria-expanded={t.palette ? palette === t.palette : undefined}
              style={t.style}
              onMouseDown={keep}
              onClick={() => run(t)}
            >
              {t.label}
            </button>
          );
        })}
        {!compact && (
          <button
            type="button"
            className="doc-tool wide"
            onMouseDown={keep}
            onClick={() => setFocus(!focus)}
            aria-pressed={focus}
            title="Focus mode"
          >
            {focus ? 'Exit focus' : 'Focus'}
          </button>
        )}
      </div>
      {palette && (
        <div className="doc-palette" role="group" aria-label={palette === 'color' ? 'Text colour' : 'Highlight colour'}>
          {(palette === 'color' ? TEXT_COLORS : HIGHLIGHTS).map((c) => (
            <button
              key={c}
              type="button"
              className={palette === 'color' ? 'swatch text' : 'swatch'}
              style={palette === 'color' ? { color: c } : { background: c }}
              aria-label={c}
              onMouseDown={keep}
              onClick={() => applyColor(palette, c)}
            >
              {palette === 'color' ? 'A' : ''}
            </button>
          ))}
          <button type="button" className="swatch none" aria-label="No colour" onMouseDown={keep} onClick={() => applyColor(palette, null)}>
            ⌀
          </button>
        </div>
      )}
      <div
        id={id}
        ref={ref}
        className="doc-page rich"
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder || 'Start writing…'}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Paste as plain text to keep the page clean.
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        suppressContentEditableWarning
      />
      {!compact && <div className="doc-foot small muted">{words} words</div>}
    </div>
  );
}

function countWords(t) {
  const m = (t || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}
