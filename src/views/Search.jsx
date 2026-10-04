import { useState } from 'react';
import { useAllData, useModuleOn, go } from '../hooks';
import { COLLECTION_DEFS, moduleOf, recordTitle } from '../modules/config';
import { Chips } from '../components/RecordCard';

// Searches every text value of every record, across all enabled modules.
export default function Search() {
  const all = useAllData();
  const on = useModuleOn();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();

  const results = [];
  if (all && needle.length >= 2) {
    for (const [c, records] of Object.entries(all)) {
      const mod = moduleOf(c);
      if (!mod || !on(mod.key)) continue;
      if (mod.locked) continue; // journal stays private; search inside the Journal module
      for (const r of records) {
        const text = Object.entries(r)
          .filter(([k]) => !['id', 'createdAt', 'updatedAt', 'deletedAt'].includes(k))
          .map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')))
          .join(' ')
          .toLowerCase();
        if (text.includes(needle)) results.push({ c, r, mod });
      }
    }
  }

  return (
    <div className="screen">
      <h1>Search</h1>
      <input
        className="search-big"
        type="search"
        autoFocus
        placeholder="Search everything…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {needle.length >= 2 && (
        <div className="small muted mb-s">
          {results.length} result{results.length === 1 ? '' : 's'} · Journal is searched inside its own module
        </div>
      )}
      <div className="list">
        {results.slice(0, 100).map(({ c, r, mod }) => (
          <button key={c + r.id} className="card record record-main" onClick={() => go(`/m/${mod.key}/edit/${c}/${r.id}`)}>
            <div className="small muted">
              {mod.label}
              {mod.tabs.length > 1 ? ` · ${COLLECTION_DEFS[c].label}` : ''}
            </div>
            <div className="record-title">{recordTitle(c, r)}</div>
            <Chips chips={COLLECTION_DEFS[c].meta ? COLLECTION_DEFS[c].meta(r) : []} />
          </button>
        ))}
      </div>
    </div>
  );
}
