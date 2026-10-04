// Data layer — the ONLY file that talks to storage.
// Swap IndexedDB for an API later without touching the UI.
import Dexie from 'dexie';

export const SCHEMA_VERSION = 1;

export const COLLECTIONS = [
  'projects',
  'bhaktiNotes',
  'sadhana',
  'verses',
  'bhaktiEvents',
  'loans',
  'learn',
  'tryItems',
  'journal',
  'affirmations',
  'people',
  'links',
];

export const db = new Dexie('majaagya');
db.version(1).stores({
  ...Object.fromEntries(COLLECTIONS.map((c) => [c, '&id, updatedAt, deletedAt'])),
  meta: '&key',
});

const now = () => new Date().toISOString();
const uuid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);

// ---------- Records ----------

export async function addRecord(collection, data) {
  const t = now();
  const rec = { ...data, id: uuid(), createdAt: t, updatedAt: t, deletedAt: null };
  await db.table(collection).add(rec);
  return rec;
}

export async function updateRecord(collection, id, changes) {
  await db.table(collection).update(id, { ...changes, updatedAt: now() });
}

// Archive instead of delete — can be restored from Settings → Archive.
export async function archiveRecord(collection, id) {
  await db.table(collection).update(id, { deletedAt: now(), updatedAt: now() });
}

export async function restoreRecord(collection, id) {
  await db.table(collection).update(id, { deletedAt: null, updatedAt: now() });
}

export async function deleteForever(collection, id) {
  await db.table(collection).delete(id);
}

export async function listActive(collection) {
  const all = await db.table(collection).toArray();
  return all.filter((r) => !r.deletedAt);
}

export async function listArchived(collection) {
  const all = await db.table(collection).toArray();
  return all.filter((r) => r.deletedAt);
}

// ---------- Meta (settings, key-value) ----------

export async function getMeta(key, fallback = null) {
  const row = await db.meta.get(key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  await db.meta.put({ key, value });
}

// ---------- Export / import ----------

export async function exportAll() {
  const data = {};
  for (const c of COLLECTIONS) data[c] = await db.table(c).toArray();
  const meta = (await db.meta.toArray()).filter((m) => m.key !== 'journalPinHash');
  const payload = {
    app: 'majaagya',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now(),
    data,
    meta,
  };
  await setMeta('lastBackupAt', payload.exportedAt);
  return payload;
}

export function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `majaagya-backup-${payload.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Merge import: for each record, the newer updatedAt wins. Nothing is lost.
export async function importAll(payload) {
  if (!payload || payload.app !== 'majaagya' || !payload.data) {
    throw new Error('This is not a Majaagya backup file.');
  }
  if (payload.schemaVersion > SCHEMA_VERSION) {
    throw new Error('This backup is from a newer version of the app. Update the app first.');
  }
  let added = 0;
  let updated = 0;
  await db.transaction('rw', [...COLLECTIONS.map((c) => db.table(c)), db.meta], async () => {
    for (const c of COLLECTIONS) {
      for (const rec of payload.data[c] || []) {
        if (!rec || !rec.id) continue;
        const existing = await db.table(c).get(rec.id);
        if (!existing) {
          await db.table(c).put(rec);
          added++;
        } else if ((rec.updatedAt || '') > (existing.updatedAt || '')) {
          await db.table(c).put(rec);
          updated++;
        }
      }
    }
    for (const m of payload.meta || []) {
      if (m.key === 'lastBackupAt' || m.key === 'journalPinHash') continue;
      const existing = await db.meta.get(m.key);
      if (!existing) await db.meta.put(m);
    }
  });
  return { added, updated };
}

// Ask the browser not to evict our data (works best once installed).
export async function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return null;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
