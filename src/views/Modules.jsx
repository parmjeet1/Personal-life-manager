import { useAllData, useMeta, go } from '../hooks';
import { MODULES } from '../modules/config';

export default function Modules() {
  const all = useAllData();
  const enabled = useMeta('enabledModules', null);
  const list = MODULES.filter((m) => !enabled || enabled.includes(m.key));
  return (
    <div className="screen">
      <h1>Modules</h1>
      <div className="module-grid">
        {list.map((m) => {
          const count = all ? m.tabs.reduce((s, t) => s + (all[t] || []).length, 0) : null;
          return (
            <button key={m.key} className="module-tile" onClick={() => go(`/m/${m.key}`)}>
              <span className="module-icon" style={{ background: m.color }}>
                {m.icon}
              </span>
              <span className="module-name">{m.label}</span>
              {count !== null && !m.locked && <span className="muted small">{count} items</span>}
            </button>
          );
        })}
        <button className="module-tile" onClick={() => go('/review')}>
          <span className="module-icon" style={{ background: '#6b5b4b' }}>
            ✓
          </span>
          <span className="module-name">Weekly review</span>
          <span className="muted small">Sunday, 15 min</span>
        </button>
      </div>
    </div>
  );
}
