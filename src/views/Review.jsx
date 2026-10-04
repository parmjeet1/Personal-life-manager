import { useMeta, go } from '../hooks';
import { setMeta, exportAll, downloadJson } from '../db';
import { weekKey, cls } from '../utils';

const STEPS = [
  { key: 'projects', label: 'Update project stages and next actions', to: '/m/projects' },
  { key: 'loans', label: 'Log loan payments made this week', to: '/m/finance' },
  { key: 'calls', label: 'Plan calls for next week', to: '/m/people' },
  { key: 'journal', label: 'Read last week’s journal entries', to: '/m/journal' },
  { key: 'try', label: 'Pick one thing to try', to: '/m/try' },
  { key: 'affirm', label: 'Check affirmations still feel true (monthly)', to: '/m/affirmations' },
  { key: 'backup', label: 'Export a JSON backup to Google Drive', action: 'backup' },
];

export default function Review() {
  const wk = weekKey();
  const done = useMeta('review:' + wk, []);
  const toggle = (k) => setMeta('review:' + wk, done.includes(k) ? done.filter((x) => x !== k) : [...done, k]);
  const count = STEPS.filter((s) => done.includes(s.key)).length;

  return (
    <div className="screen">
      <h1>Weekly review</h1>
      <p className="muted small">
        {wk} · {count}/{STEPS.length} done · resets every week
      </p>
      <div className="progress">
        <div style={{ width: `${(count / STEPS.length) * 100}%` }} />
      </div>
      <div className="card">
        {STEPS.map((s) => (
          <div key={s.key} className={cls('review-row', done.includes(s.key) && 'done')}>
            <label className="review-check">
              <input type="checkbox" checked={done.includes(s.key)} onChange={() => toggle(s.key)} />
              <span>{s.label}</span>
            </label>
            {s.to && (
              <button className="btn ghost small" onClick={() => go(s.to)}>
                Open
              </button>
            )}
            {s.action === 'backup' && (
              <button
                className="btn ghost small"
                onClick={async () => {
                  downloadJson(await exportAll());
                  if (!done.includes('backup')) toggle('backup');
                }}
              >
                Export
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
