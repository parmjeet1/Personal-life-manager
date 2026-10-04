// Google-Doc-style writing for the journal: a clean page with a small formatting toolbar.
// Stores sanitized HTML. Old plain-text entries open fine (line breaks are kept).
import { useEffect, useRef, useState } from 'react';

const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'H1', 'H2', 'H3', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'HR', 'SPAN']);

// Keep only safe formatting tags and drop every attribute (no scripts, links or styles).
export function sanitize(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 1) {
        if (!ALLOWED.has(child.tagName)) {
          if (['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT'].includes(child.tagName)) child.remove();
          else {
            walk(child);
            child.replaceWith(...child.childNodes);
          }
          continue;
        }
        for (const a of [...child.attributes]) child.removeAttribute(a.name);
        walk(child);
      } else if (child.nodeType !== 3) child.remove();
    }
  };
  const root = doc.body.firstChild;
  walk(root);
  return root.innerHTML;
}

const looksLikeHtml = (s) => /<\/?(p|div|br|b|i|u|h[1-3]|ul|ol|li|strong|em|blockquote)\b/i.test(s || '');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtml(value) {
  if (!value) return '';
  return looksLikeHtml(value) ? sanitize(value) : escapeHtml(value).replace(/\n/g, '<br>');
}

// Plain text for previews and search.
export function toText(value) {
  if (!value) return '';
  if (!looksLikeHtml(value)) return value;
  const doc = new DOMParser().parseFromString(value.replace(/<(br|\/p|\/div|\/li|\/h[1-3])>/gi, '\n$&'), 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

const TOOLS = [
  { cmd: 'bold', label: 'B', title: 'Bold', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', title: 'Italic', style: { fontStyle: 'italic' } },
  { cmd: 'underline', label: 'U', title: 'Underline', style: { textDecoration: 'underline' } },
  { cmd: 'strikeThrough', label: 'S', title: 'Strikethrough', style: { textDecoration: 'line-through' } },
  { block: 'H1', label: 'H1', title: 'Heading' },
  { block: 'H2', label: 'H2', title: 'Subheading' },
  { block: 'P', label: '¶', title: 'Normal text' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Bullet list' },
  { cmd: 'insertOrderedList', label: '1.', title: 'Numbered list' },
  { block: 'BLOCKQUOTE', label: '❝', title: 'Quote' },
  { cmd: 'insertHorizontalRule', label: '―', title: 'Divider' },
  { cmd: 'undo', label: '↶', title: 'Undo' },
];

export default function RichEditor({ id, value, onChange, placeholder }) {
  const ref = useRef(null);
  const [words, setWords] = useState(0);
  const [focus, setFocus] = useState(false);

  // Load initial content once (don't overwrite while typing).
  useEffect(() => {
    if (ref.current && ref.current.innerHTML === '') {
      ref.current.innerHTML = toHtml(value);
      setWords(countWords(ref.current.innerText));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = () => {
    const html = sanitize(ref.current.innerHTML);
    setWords(countWords(ref.current.innerText));
    onChange(html === '<br>' ? '' : html);
  };

  const run = (t) => {
    ref.current.focus();
    if (t.block) document.execCommand('formatBlock', false, t.block);
    else document.execCommand(t.cmd, false, null);
    emit();
  };

  return (
    <div className={focus ? 'doc focus' : 'doc'}>
      <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            className="doc-tool"
            title={t.title}
            aria-label={t.title}
            style={t.style}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t)}
          >
            {t.label}
          </button>
        ))}
        <button
          type="button"
          className="doc-tool wide"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setFocus(!focus)}
          aria-pressed={focus}
          title="Focus mode"
        >
          {focus ? 'Exit focus' : 'Focus'}
        </button>
      </div>
      <div
        id={id}
        ref={ref}
        className="doc-page"
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
      <div className="doc-foot small muted">{words} words</div>
    </div>
  );
}

function countWords(t) {
  const m = (t || '').trim().match(/\S+/g);
  return m ? m.length : 0;
}
