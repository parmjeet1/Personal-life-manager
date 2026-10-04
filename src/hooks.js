import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, COLLECTIONS, listActive } from './db';

// Live list of active (not archived) records in a collection.
export function useCollection(collection) {
  return useLiveQuery(() => listActive(collection), [collection]);
}

// Live map of every collection → active records. Used by Home and Search.
export function useAllData() {
  return useLiveQuery(async () => {
    const out = {};
    for (const c of COLLECTIONS) out[c] = await listActive(c);
    return out;
  }, []);
}

export function useMeta(key, fallback = null) {
  const row = useLiveQuery(() => db.meta.get(key), [key]);
  if (row === undefined) return fallback;
  return row ? row.value : fallback;
}

// Hash router: '#/m/projects?t=sadhana' → { path: ['m','projects'], query: {t:'sadhana'} }
export function useRoute() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const on = () => setHash(window.location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const raw = hash.replace(/^#\/?/, '');
  const [p, q = ''] = raw.split('?');
  const path = p.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(q));
  return { path, query };
}

export function go(to) {
  window.location.hash = to.startsWith('#') ? to : '#' + to;
}
