import { useLiveQuery } from 'dexie-react-hooks';
import { COLLECTIONS, listArchived, restoreRecord, deleteForever } from '../db';
import { COLLECTION_DEFS, moduleOf, recordTitle } from '../modules/config';
import { fmtDate } from '../utils';

export default function Archive() {
  const items = useLiveQuery(async () => {
    const out = [];
    for (const c of COLLECTIONS) {
      if (!moduleOf(c)) continue; // feature switched off
      for (const r of await listArchived(c)) out.push({ c, r });
    }
    return out.sort((a, b) => b.r.deletedAt.localeCompare(a.r.deletedAt));
  }, []);

  return (
    <div className="screen">
      <h1>Archive</h1>
      {!items ? (
        <div className="empty">Loading…</div>
      ) : items.length === 0 ? (
        <div className="empty">Nothing archived.</div>
      ) : (
        <div className="list">
          {items.map(({ c, r }) => (
            <div key={r.id} className="card record">
              <div className="record-main static">
                <div className="small muted">
                  {moduleOf(c).label} · {COLLECTION_DEFS[c].label} · archived {fmtDate(r.deletedAt.slice(0, 10))}
                </div>
                <div className="record-title">{moduleOf(c).locked ? 'Journal entry' : recordTitle(c, r)}</div>
              </div>
              <div className="record-actions">
                <button className="btn ghost small" onClick={() => restoreRecord(c, r.id)}>
                  Restore
                </button>
                <button
                  className="btn ghost small danger"
                  onClick={() => window.confirm('Delete forever? This cannot be undone.') && deleteForever(c, r.id)}
                >
                  Delete forever
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
