import { COLLECTION_DEFS, recordTitle } from '../modules/config';
import { cls } from '../utils';

export function Chips({ chips }) {
  const list = (chips || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <div className="chips">
      {list.map((c, i) => (
        <span key={i} className={cls('chip', c.tone)}>
          {c.text}
        </span>
      ))}
    </div>
  );
}

export default function RecordCard({ collection, record, onOpen, compact }) {
  const def = COLLECTION_DEFS[collection];
  const actions = (def.actions || []).filter((a) => !a.show || a.show(record));
  const subtitle = def.subtitle && def.subtitle(record);
  return (
    <div className="card record">
      <button type="button" className="record-main" onClick={onOpen}>
        <div className="record-title">{recordTitle(collection, record)}</div>
        {subtitle && !compact && <div className="record-sub">{subtitle}</div>}
        {def.progress && (
          <div className="progress thin" aria-label={`${def.progress(record)}% done`}>
            <div style={{ width: `${def.progress(record)}%` }} />
          </div>
        )}
        <Chips chips={def.meta ? def.meta(record) : []} />
      </button>
      {actions.length > 0 && (
        <div className="record-actions">
          {actions.map((a) => (
            <button
              type="button"
              key={a.label}
              className="btn ghost small"
              onClick={(e) => {
                e.stopPropagation();
                a.run(record);
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
