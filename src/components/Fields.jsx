import { useAllData } from '../hooks';
import { COLLECTION_DEFS, recordTitle } from '../modules/config';
import { todayStr, cls } from '../utils';

export function defaultFor(field) {
  if (typeof field.default === 'function') return field.default();
  if (field.default !== undefined) return field.default;
  if (field.type === 'sublist' || field.type === 'tags') return [];
  if (field.type === 'bool') return false;
  return '';
}

export function Field({ field, value, onChange }) {
  const id = 'f-' + field.key;
  const label = (
    <label className="field-label" htmlFor={id}>
      {field.label}
      {field.required && <span className="req"> *</span>}
    </label>
  );
  const help = field.help && <div className="field-help">{field.help}</div>;

  let input;
  switch (field.type) {
    case 'textarea':
      input = (
        <textarea
          id={id}
          rows={field.rows || 4}
          value={value || ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case 'number':
    case 'money':
      input = (
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={field.min}
          max={field.max}
          step={field.step || (field.type === 'money' ? 1 : 1)}
          value={value ?? ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
      break;
    case 'date':
      input = (
        <div className="row gap-s">
          <input id={id} type="date" value={value || ''} onChange={(e) => onChange(e.target.value)} />
          <button type="button" className="btn ghost small" onClick={() => onChange(todayStr())}>
            Today
          </button>
          {value && (
            <button type="button" className="btn ghost small" onClick={() => onChange('')} aria-label="Clear date">
              ✕
            </button>
          )}
        </div>
      );
      break;
    case 'select':
      input =
        field.options.length <= 4 ? (
          <div className="segmented" role="radiogroup" aria-labelledby={id}>
            {field.options.map((o) => (
              <button
                type="button"
                key={o}
                role="radio"
                aria-checked={value === o}
                className={cls('seg', value === o && 'on')}
                onClick={() => onChange(value === o && !field.required ? '' : o)}
              >
                {o}
              </button>
            ))}
          </div>
        ) : (
          <select id={id} value={value || ''} onChange={(e) => onChange(e.target.value)}>
            {!field.required && <option value="">—</option>}
            {field.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        );
      break;
    case 'bool':
      return (
        <div className="field">
          <label className="toggle">
            <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />
            <span className="track" />
            <span>{field.label}</span>
          </label>
          {help}
        </div>
      );
    case 'rating':
      input = (
        <div className="rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              className={cls('star', value >= n && 'on')}
              aria-label={`${n} of 5`}
              onClick={() => onChange(value === n ? '' : n)}
            >
              {n}
            </button>
          ))}
        </div>
      );
      break;
    case 'tags':
      input = (
        <input
          id={id}
          type="text"
          defaultValue={(value || []).join(', ')}
          placeholder="comma, separated"
          onBlur={(e) =>
            onChange(
              e.target.value
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
      );
      break;
    case 'sublist':
      input = <SubList field={field} value={value || []} onChange={onChange} />;
      break;
    case 'ref':
      input = <RefSelect id={id} field={field} value={value} onChange={onChange} />;
      break;
    case 'url':
    case 'tel':
    case 'text':
    default:
      input = (
        <input
          id={id}
          type={field.type === 'url' ? 'url' : field.type === 'tel' ? 'tel' : 'text'}
          inputMode={field.type === 'url' ? 'url' : field.type === 'tel' ? 'tel' : undefined}
          value={value || ''}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }

  return (
    <div className="field">
      {label}
      {input}
      {help}
    </div>
  );
}

function SubList({ field, value, onChange }) {
  const update = (i, k, v) => onChange(value.map((item, j) => (j === i ? { ...item, [k]: v } : item)));
  const remove = (i) => onChange(value.filter((_, j) => j !== i));
  const add = () => onChange([...value, Object.fromEntries(field.fields.map((f) => [f.key, defaultFor(f)]))]);
  return (
    <div className="sublist">
      {value.map((item, i) => (
        <div className="subitem" key={i}>
          {field.fields.map((f) => (
            <Field key={f.key} field={{ ...f, help: undefined }} value={item[f.key]} onChange={(v) => update(i, f.key, v)} />
          ))}
          <button type="button" className="btn ghost small danger" onClick={() => remove(i)}>
            Remove {field.itemLabel}
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost small" onClick={add}>
        + Add {field.itemLabel}
      </button>
    </div>
  );
}

function RefSelect({ id, field, value, onChange }) {
  const all = useAllData();
  const current = value ? `${value.c}:${value.id}` : '';
  return (
    <select
      id={id}
      value={current}
      onChange={(e) => {
        if (!e.target.value) return onChange(null);
        const [c, rid] = e.target.value.split(':');
        onChange({ c, id: rid });
      }}
    >
      <option value="">— none —</option>
      {all &&
        field.targets.map((c) => (
          <optgroup key={c} label={COLLECTION_DEFS[c].label}>
            {(all[c] || [])
              .slice()
              .sort((a, b) => recordTitle(c, a).localeCompare(recordTitle(c, b)))
              .map((r) => (
                <option key={r.id} value={`${c}:${r.id}`}>
                  {recordTitle(c, r)}
                </option>
              ))}
          </optgroup>
        ))}
    </select>
  );
}
