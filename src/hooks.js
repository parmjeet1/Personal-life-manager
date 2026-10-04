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

// Module on/off. Stored as a list of DISABLED modules, so new modules show up by default.
// Older versions stored 'enabledModules' — still honoured for the original nine.
const LEGACY_MODULES = ['projects', 'bhakti', 'finance', 'learn', 'try', 'journal', 'affirmations', 'people', 'links'];
export function useDisabledModules() {
  const disabled = useMeta('disabledModules', undefined);
  const legacyEnabled = useMeta('enabledModules', null);
  if (Array.isArray(disabled)) return disabled;
  if (Array.isArray(legacyEnabled)) return LEGACY_MODULES.filter((k) => !legacyEnabled.includes(k));
  return [];
}
export function useModuleOn() {
  const disabled = useDisabledModules();
  return (k) => !disabled.includes(k);
}
