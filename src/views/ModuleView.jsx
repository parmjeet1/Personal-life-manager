import { useState } from 'react';
import { COLLECTION_DEFS, MODULES } from '../modules/config';
import { useCollection, useMeta, go } from '../hooks';
import RecordCard from '../components/RecordCard';
import RecordForm from '../components/RecordForm';
import { SUMMARIES } from './Summaries';
import PinGate from '../components/PinGate';
import { cls } from '../utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, setMeta } from '../db';
import DragList, { manualSort, saveOrder } from '../components/DragList';
import TodoScreen, { TaskFormExtras } from './Todo';

// Collections with their own screen instead of the generic list.
const CUSTOM_LIST = { todos: TodoScreen };

export default function ModuleView({ moduleKey, path, query }) {
  const mod = MODULES.find((m) => m.key === moduleKey);
  if (!mod) return <div className="empty">Module not found.</div>;

  const body =
    path[2] === 'edit' ? (
      <EditScreen mod={mod} collection={path[3]} id={path[4]} />
    ) : (
      <ListScreen mod={mod} tab={query.t && mod.tabs.includes(query.t) ? query.t : mod.tabs[0]} />
    );

  return mod.locked ? <PinGate>{body}</PinGate> : body;
}

function EditScreen({ mod, collection, id }) {
  const def = COLLECTION_DEFS[collection];
  if (!def) return <div className="empty">Unknown section.</div>;
  const back = () => window.history.back();
  return (
    <div className="screen">
      <h2 className="screen-title">{id === 'new' ? `New ${def.singular}` : `Edit ${def.singular}`}</h2>
      {collection === 'todos' && id !== 'new' && <TodoExtras id={id} />}
      <RecordForm key={collection + id} collection={collection} id={id} onDone={back} />
    </div>
  );
}

function TodoExtras({ id }) {
  const rec = useLiveQuery(() => db.todos.get(id), [id]);
  return <TaskFormExtras record={rec} />;
}

function ListScreen({ mod, tab }) {
  const Custom = CUSTOM_LIST[tab];
  if (Custom) {
    return (
      <div className="screen">
        <div className="module-head">
          <span className="module-icon" style={{ background: mod.color }}>
            {mod.icon}
          </span>
          <h1>{mod.label}</h1>
        </div>
        <Custom />
      </div>
    );
  }
  return <GenericList mod={mod} tab={tab} />;
}

function GenericList({ mod, tab }) {
  const def = COLLECTION_DEFS[tab];
  const records = useCollection(tab);
  const [filterBy, setFilterBy] = useState({});
  const [q, setQ] = useState('');
  const Summary = SUMMARIES[tab];
  const canDrag = def.manualOrder !== false;
  const sortMode = useMeta('sort:' + tab, 'manual');
  const manual = canDrag && sortMode === 'manual';

  const filters = def.filters;
  const chipLabels = filters
    ? [...(def.activeFilter ? [filters.default] : []), 'All', ...filters.options.filter((o) => o !== filters.default || !def.activeFilter)]
    : [];
  const selected = filterBy[tab] ?? (filters ? filters.default || 'All' : 'All');

  let list = records || [];
  if (filters && selected !== 'All') {
    if (def.activeFilter && selected === filters.default) list = list.filter(def.activeFilter);
    else list = list.filter((r) => (filters.get ? filters.get(r) : r[filters.key]) === selected);
  }
  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    list = list.filter((r) => JSON.stringify(r).toLowerCase().includes(needle));
  }
  list = [...list].sort(manual ? manualSort(def.sort) : def.sort || (() => 0));

  const open = (id) => go(`/m/${mod.key}/edit/${tab}/${id}`);

  return (
    <div className="screen">
      <div className="module-head">
        <span className="module-icon" style={{ background: mod.color }}>
          {mod.icon}
        </span>
        <h1>{mod.label}</h1>
      </div>

      {mod.tabs.length > 1 && (
        <div className="tabs" role="tablist">
          {mod.tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={t === tab}
              className={cls('tab', t === tab && 'on')}
              onClick={() => go(`/m/${mod.key}?t=${t}`)}
            >
              {COLLECTION_DEFS[t].label}
            </button>
          ))}
        </div>
      )}

      {Summary && records && <Summary records={records} open={open} />}

      <div className="list-tools">
        {chipLabels.length > 0 && (
          <div className="filter-chips">
            {chipLabels.map((l) => (
              <button key={l} className={cls('fchip', selected === l && 'on')} onClick={() => setFilterBy({ ...filterBy, [tab]: l })}>
                {l}
              </button>
            ))}
          </div>
        )}
        {canDrag && (records || []).length > 1 && (
          <div className="row-between">
            <span className="small muted">{manual ? 'Drag ≡ to set priority' : 'Sorted automatically'}</span>
            <div className="segmented mini" role="radiogroup" aria-label="Sort order">
              <button role="radio" aria-checked={manual} className={cls('seg', manual && 'on')} onClick={() => setMeta('sort:' + tab, 'manual')}>
                ≡ My order
              </button>
              <button role="radio" aria-checked={!manual} className={cls('seg', !manual && 'on')} onClick={() => setMeta('sort:' + tab, 'auto')}>
                Auto
              </button>
            </div>
          </div>
        )}
        {(records || []).length > 6 && (
          <input className="search-inline" type="search" placeholder={`Search ${def.label.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        )}
      </div>

      {records === undefined ? (
        <div className="empty">Loading…</div>
      ) : list.length === 0 ? (
        <div className="empty">
          {records.length === 0 ? `No ${def.label.toLowerCase()} yet. Tap + to add the first ${def.singular}.` : 'Nothing matches this filter.'}
        </div>
      ) : manual ? (
        <DragList
          items={list}
          onReorder={(next) => saveOrder(tab, records, next, def.sort)}
          renderItem={(r, i, drag) => (
            <RecordCard key={r.id} collection={tab} record={r} onOpen={() => open(r.id)} {...drag} />
          )}
        />
      ) : (
        <div className="list">
          {list.map((r) => (
            <RecordCard key={r.id} collection={tab} record={r} onOpen={() => open(r.id)} />
          ))}
        </div>
      )}

      <button className="fab" aria-label={`Add ${def.singular}`} onClick={() => open('new')}>
        +
      </button>
    </div>
  );
}
