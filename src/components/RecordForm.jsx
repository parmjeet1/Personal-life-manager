import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, addRecord, updateRecord, archiveRecord, listActive } from '../db';
import { COLLECTION_DEFS, moduleOf, recordTitle } from '../modules/config';
import { useAllData, go } from '../hooks';
import { Field, defaultFor } from './Fields';
import { promptOfTheDay } from '../modules/prompts';

export default function RecordForm({ collection, id, onDone, initial }) {
  const def = COLLECTION_DEFS[collection];
  const isNew = id === 'new';
  const existing = useLiveQuery(() => (isNew ? null : db.table(collection).get(id)), [collection, id]);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (draft) return;
    if (isNew) {
      setDraft({ ...Object.fromEntries(def.fields.map((f) => [f.key, defaultFor(f)])), ...(initial || {}) });
    } else if (existing) {
      setDraft({ ...existing });
    }
  }, [existing, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isNew && existing === null) return <div className="empty">This record no longer exists.</div>;
  if (!draft) return <div className="empty">Loading…</div>;

  const set = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setWarnings([]);
  };

  async function save(force = false) {
    const errs = [];
    for (const f of def.fields) {
      if (f.required && (draft[f.key] === '' || draft[f.key] == null)) errs.push(`${f.label} is required.`);
    }
    const all = await listActive(collection);
    const v = def.validate ? def.validate(draft, isNew ? null : existing, all) : { errors: [], warnings: [] };
    errs.push(...v.errors);
    setErrors(errs);
    if (errs.length) return;
    if (v.warnings.length && !force) {
      setWarnings(v.warnings);
      return;
    }
    setSaving(true);
    let rec = { ...draft };
    if (def.beforeSave) rec = def.beforeSave(rec, isNew ? null : existing);
    const { id: _id, createdAt, updatedAt, deletedAt, ...data } = rec;
    let saved;
    if (isNew) saved = await addRecord(collection, data);
    else {
      await updateRecord(collection, id, data);
      saved = { ...existing, ...data, id };
    }
    setSaving(false);
    // afterSave may open another app; it returns 'navigated' if it left this page.
    const res = def.afterSave ? await def.afterSave(saved, isNew ? null : existing) : null;
    if (res !== 'navigated') onDone();
  }

  async function archive() {
    if (!window.confirm(`Archive this ${def.singular}? You can restore it from Settings → Archive.`)) return;
    await archiveRecord(collection, id);
    onDone();
  }

  const visible = def.fields.filter((f) => !f.showIf || f.showIf(draft));

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {visible.map((f) => (
        <div key={f.key}>
          {f.promptHint && <div className="prompt-hint">Prompt: {promptOfTheDay()}</div>}
          <Field field={f} value={draft[f.key]} onChange={(v) => set(f.key, v)} />
        </div>
      ))}

      {!isNew && <Related collection={collection} id={id} />}

      {errors.length > 0 && (
        <div className="notice bad" role="alert">
          {errors.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="notice warn" role="alert">
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
          <div className="row gap-s mt-s">
            <button type="button" className="btn small" onClick={() => save(true)}>
              Save anyway
            </button>
            <button type="button" className="btn ghost small" onClick={() => setWarnings([])}>
              Go back
            </button>
          </div>
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {isNew ? `Add ${def.singular}` : 'Save'}
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
        {!isNew && (
          <button type="button" className="btn ghost danger push-right" onClick={archive}>
            Archive
          </button>
        )}
      </div>
    </form>
  );
}

// Records in other collections that link to this one (e.g. links and learning items for a project).
function Related({ collection, id }) {
  const all = useAllData();
  if (!all) return null;
  const items = [];
  for (const [c, def] of Object.entries(COLLECTION_DEFS)) {
    const refFields = def.fields.filter((f) => f.type === 'ref' && f.targets.includes(collection));
    if (!refFields.length) continue;
    for (const r of all[c] || []) {
      if (refFields.some((f) => r[f.key] && r[f.key].c === collection && r[f.key].id === id)) items.push({ c, r });
    }
  }
  if (!items.length) return null;
  return (
    <div className="related">
      <div className="field-label">Linked here</div>
      {items.map(({ c, r }) => (
        <button
          type="button"
          key={r.id}
          className="related-item"
          onClick={() => go(`/m/${moduleOf(c).key}/edit/${c}/${r.id}`)}
        >
          <span className="muted small">{COLLECTION_DEFS[c].label}</span> {recordTitle(c, r)}
        </button>
      ))}
    </div>
  );
}
