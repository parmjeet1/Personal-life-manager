// To-do screen: today's queue (drag to prioritise), upcoming, done, and the urgent/important matrix.
import { useRef, useState } from 'react';
import { useCollection, go } from '../hooks';
import { addRecord, updateRecord, db } from '../db';
import { todayStr, fmtShort, relDay, cls } from '../utils';
import { inToday, doneToday, isOverdue, quadrant, timeRange, isNow, toggleDone, downloadIcs, isRepeating } from '../modules/todo';

const VIEWS = ['Today', 'Upcoming', 'Done', 'Matrix'];

export default function TodoScreen() {
  const todos = useCollection('todos');
  const [view, setView] = useState('Today');
  const today = todayStr();
  const open = (id) => go(`/m/todo/edit/todos/${id}`);

  if (!todos) return <div className="empty">Loading…</div>;
  const byOrder = [...todos].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const todayList = byOrder.filter((t) => inToday(t, today));
  const pending = todayList.filter((t) => !doneToday(t, today));
  const doneCount = todayList.length - pending.length;

  return (
    <div className="todo">
      <div className="segmented mb-s" role="tablist">
        {VIEWS.map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={cls('seg', view === v && 'on')} onClick={() => setView(v)}>
            {v}
          </button>
        ))}
      </div>

      {view === 'Today' && (
        <>
          <div className="panel">
            <div className="row-between">
              <b>
                {doneCount}/{todayList.length} done today
              </b>
              <span className="small muted">Drag ≡ to set priority</span>
            </div>
            <div className="progress thin">
              <div style={{ width: `${todayList.length ? (doneCount / todayList.length) * 100 : 0}%` }} />
            </div>
            <QuickAdd count={byOrder.length} />
          </div>
          {pending.length === 0 ? (
            <div className="empty">{todayList.length ? 'All done for today. 🎉' : 'Nothing planned. Add your first task above.'}</div>
          ) : (
            <DragList items={pending} onOpen={open} />
          )}
          {doneCount > 0 && (
            <details className="details mt-s">
              <summary>Done today ({doneCount})</summary>
              <div className="list">
                {todayList
                  .filter((t) => doneToday(t, today))
                  .map((t) => (
                    <TaskRow key={t.id} t={t} onOpen={() => open(t.id)} />
                  ))}
              </div>
            </details>
          )}
        </>
      )}

      {view === 'Upcoming' && <Upcoming todos={byOrder} onOpen={open} />}

      {view === 'Done' && (
        <div className="list">
          {byOrder
            .filter((t) => !isRepeating(t) && t.status === 'Done')
            .sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
            .slice(0, 100)
            .map((t) => (
              <TaskRow key={t.id} t={t} onOpen={() => open(t.id)} />
            ))}
        </div>
      )}

      {view === 'Matrix' && <Matrix todos={byOrder.filter((t) => !doneToday(t, today))} onOpen={open} />}

      <button className="fab" aria-label="Add task" onClick={() => open('new')}>
        +
      </button>
    </div>
  );
}

function QuickAdd({ count }) {
  const [title, setTitle] = useState('');
  async function add(e) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    await addRecord('todos', { title: t, date: todayStr(), repeat: 'None', status: 'To do', order: Date.now(), urgent: false, important: false, alarm: false });
    setTitle('');
  }
  return (
    <form className="quick-add" onSubmit={add}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task for today…" aria-label="New task" />
      <button className="btn primary small" type="submit">
        Add
      </button>
    </form>
  );
}

export function TaskRow({ t, onOpen, handle, style, dragging }) {
  const done = doneToday(t);
  const now = !done && isNow(t);
  return (
    <div className={cls('task', done && 'done', now && 'now', dragging && 'dragging', t.urgent && 'urgent')} style={style} data-id={t.id}>
      <button className="task-check" aria-label={done ? 'Mark not done' : 'Mark done'} onClick={() => toggleDone(t)}>
        {done ? '✓' : ''}
      </button>
      <button className="task-main" onClick={onOpen}>
        <span className="task-title">{t.title}</span>
        <span className="task-meta">
          {timeRange(t) && <span className={cls('chip', now ? 'good' : 'muted')}>{now ? `Now · ${timeRange(t)}` : timeRange(t)}</span>}
          {t.urgent && <span className="chip bad">Urgent</span>}
          {t.important && <span className="chip warn">Important</span>}
          {isRepeating(t) && <span className="chip muted">↻ {t.repeat}</span>}
          {t.alarm && <span className="chip muted">⏰</span>}
          {isOverdue(t) && <span className="chip bad">From {fmtShort(t.date)}</span>}
        </span>
      </button>
      {handle}
    </div>
  );
}

// Pointer-based drag (works with touch and mouse). Drag the ≡ handle; order is saved on drop.
function DragList({ items, onOpen }) {
  const [drag, setDrag] = useState(null);
  const rects = useRef([]);
  const listRef = useRef(null);

  function start(e, index) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    rects.current = [...listRef.current.querySelectorAll('.task')].map((el) => el.getBoundingClientRect());
    setDrag({ index, over: index, startY: e.clientY, dy: 0 });
    if (navigator.vibrate) navigator.vibrate(15);
  }
  function move(e) {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const r = rects.current[drag.index];
    const center = r.top + r.height / 2 + dy;
    let over = 0;
    rects.current.forEach((rc, i) => {
      if (i !== drag.index && rc.top + rc.height / 2 < center) over++;
    });
    setDrag({ ...drag, dy, over });
  }
  async function end() {
    if (!drag) return;
    const { index, over } = drag;
    setDrag(null);
    if (index === over) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(over, 0, moved);
    // Keep the new queue order before tasks not shown here.
    await db.transaction('rw', db.todos, async () => {
      for (let i = 0; i < next.length; i++) await updateRecord('todos', next[i].id, { order: i });
    });
  }

  const shiftFor = (i) => {
    if (!drag || i === drag.index) return 0;
    const h = rects.current[drag.index] ? rects.current[drag.index].height + 8 : 0;
    if (drag.index < drag.over && i > drag.index && i <= drag.over) return -h;
    if (drag.index > drag.over && i < drag.index && i >= drag.over) return h;
    return 0;
  };

  return (
    <div className="list task-list" ref={listRef}>
      {items.map((t, i) => (
        <TaskRow
          key={t.id}
          t={t}
          onOpen={() => onOpen(t.id)}
          dragging={drag && drag.index === i}
          style={{
            transform: `translateY(${drag && drag.index === i ? drag.dy : shiftFor(i)}px)`,
            transition: drag && drag.index === i ? 'none' : 'transform 0.15s',
          }}
          handle={
            <span
              className="task-handle"
              aria-label={`Drag to reorder. Position ${i + 1}`}
              role="button"
              onPointerDown={(e) => start(e, i)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <span className="task-rank">{i + 1}</span>≡
            </span>
          }
        />
      ))}
    </div>
  );
}

function Upcoming({ todos, onOpen }) {
  const today = todayStr();
  const list = todos
    .filter((t) => !isRepeating(t) && t.status !== 'Done' && t.date && t.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.order ?? 0) - (b.order ?? 0));
  const repeating = todos.filter(isRepeating);
  if (!list.length && !repeating.length) return <div className="empty">Nothing scheduled ahead.</div>;
  const groups = {};
  list.forEach((t) => (groups[t.date] = [...(groups[t.date] || []), t]));
  return (
    <div>
      {Object.entries(groups).map(([d, ts]) => (
        <div key={d} className="mb-s">
          <div className="field-label">
            {fmtShort(d)} · {relDay(d)}
          </div>
          <div className="list">
            {ts.map((t) => (
              <TaskRow key={t.id} t={t} onOpen={() => onOpen(t.id)} />
            ))}
          </div>
        </div>
      ))}
      {repeating.length > 0 && (
        <div className="mb-s">
          <div className="field-label">Repeating</div>
          <div className="list">
            {repeating.map((t) => (
              <div key={t.id}>
                <TaskRow t={t} onOpen={() => onOpen(t.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Matrix({ todos, onOpen }) {
  const Q = ['Do now', 'Schedule', 'Delegate / quick', 'Later / drop'];
  const hint = {
    'Do now': 'Urgent + important',
    Schedule: 'Important, not urgent',
    'Delegate / quick': 'Urgent, not important',
    'Later / drop': 'Neither',
  };
  return (
    <div className="matrix">
      {Q.map((q) => {
        const ts = todos.filter((t) => quadrant(t) === q);
        return (
          <div key={q} className={cls('quad', 'q' + Q.indexOf(q))}>
            <div className="quad-title">{q}</div>
            <div className="small muted">{hint[q]}</div>
            {ts.length === 0 ? (
              <div className="small muted mt-s">—</div>
            ) : (
              ts.map((t) => (
                <button key={t.id} className="quad-item" onClick={() => onOpen(t.id)}>
                  {t.title}
                </button>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}

// Extra buttons on the task edit form.
export function TaskFormExtras({ record }) {
  if (!record || !record.id) return null;
  return (
    <div className="related">
      <button type="button" className="btn small" onClick={() => downloadIcs(record)} disabled={!record.startTime}>
        📅 Add to phone calendar (reliable alarm)
      </button>
      {!record.startTime && <div className="field-help">Set a start time first.</div>}
    </div>
  );
}
