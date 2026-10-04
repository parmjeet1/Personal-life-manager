import { useState } from 'react';
import { useAllData, useMeta, useModuleOn, go } from '../hooks';
import { updateRecord, exportAll, downloadJson } from '../db';
import { MODULES, COLLECTION_DEFS, FEATURES, openLink } from '../modules/config';
import { inToday, doneToday } from '../modules/todo';
import { TaskRow } from './Todo';
import {
  personNextDue,
  upcomingDates,
  loanNextDue,
  loanDueAmount,
  loanRemaining,
  loanStatus,
  isTaken,
  debtFreeProjection,
  japaStreak,
  repaymentPlan,
  accountsTotal,
  runwayMonths,
  goalProgress,
} from '../modules/logic';
import { todayStr, daysUntil, fmtShort, fmtDate, inr, inrShort, relDay, daysSince, cls } from '../utils';

const edit = (mod, c, id) => go(`/m/${mod}/edit/${c}/${id}`);

export default function Home() {
  const all = useAllData();
  const on = useModuleOn();
  const lastBackup = useMeta('lastBackupAt', null);
  const plan = useMeta('monthlyPlan', {});
  const [adding, setAdding] = useState(false);

  if (!all) return <div className="empty">Loading…</div>;
  const today = todayStr();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // ---- Today & this week ----
  const todayItems = [];
  const weekItems = [];
  const bucket = (date, item) => {
    const n = daysUntil(date);
    if (n === null) return;
    if (n <= 0) todayItems.push({ ...item, n });
    else if (n <= 7) weekItems.push({ ...item, n });
  };

  if (on('people')) {
    for (const p of all.people) {
      const due = personNextDue(p);
      bucket(due, {
        key: 'p' + p.id,
        label: `${p.channel === 'WhatsApp' ? 'Message' : 'Call'} ${p.name}`,
        when: daysUntil(due) < 0 ? `overdue ${-daysUntil(due)}d` : relDay(due),
        tone: daysUntil(due) < 0 ? 'bad' : '',
        onClick: () => edit('people', 'people', p.id),
      });
      for (const u of upcomingDates(p, 14)) {
        const n = daysUntil(u.date);
        const item = {
          key: 'd' + p.id + u.label,
          label: `${p.name}’s ${u.label.toLowerCase()}`,
          when: relDay(u.date),
          tone: 'good',
          onClick: () => edit('people', 'people', p.id),
        };
        if (n === 0) todayItems.push({ ...item, n });
        else weekItems.push({ ...item, n });
      }
    }
  }
  if (on('finance')) {
    for (const l of all.loans.filter(isTaken)) {
      const d = loanNextDue(l);
      if (!d) continue;
      bucket(d, {
        key: 'l' + l.id,
        label: `Pay ${inr(loanDueAmount(l))} to ${l.party}`,
        when: daysUntil(d) < 0 ? `overdue ${-daysUntil(d)}d` : relDay(d),
        tone: daysUntil(d) < 0 ? 'bad' : 'warn',
        onClick: () => edit('finance', 'loans', l.id),
      });
    }
  }
  if (on('projects')) {
    for (const p of all.projects.filter((p) => !['Done', 'Dropped'].includes(p.stage))) {
      if (p.deadline)
        bucket(p.deadline, {
          key: 'pr' + p.id,
          label: `${p.title} — deadline`,
          when: relDay(p.deadline),
          tone: daysUntil(p.deadline) < 0 ? 'bad' : '',
          onClick: () => edit('projects', 'projects', p.id),
        });
      for (const ph of p.phases || []) {
        if (ph.deadline && ph.status !== 'Done')
          bucket(ph.deadline, {
            key: 'ph' + p.id + ph.name,
            label: `${p.title}: ${ph.name || 'phase'}`,
            when: relDay(ph.deadline),
            tone: daysUntil(ph.deadline) < 0 ? 'bad' : '',
            onClick: () => edit('projects', 'projects', p.id),
          });
      }
    }
  }
  if (on('bhakti')) {
    for (const e of all.bhaktiEvents) {
      const n = daysUntil(e.date);
      if (n >= 0 && n <= 7)
        (n === 0 ? todayItems : weekItems).push({
          key: 'e' + e.id,
          label: e.name,
          when: relDay(e.date),
          tone: 'good',
          n,
          onClick: () => edit('bhakti', 'bhaktiEvents', e.id),
        });
    }
  }
  if (on('learn')) {
    for (const l of all.learn.filter((x) => x.status !== 'Done' && x.targetDate)) {
      bucket(l.targetDate, {
        key: 'le' + l.id,
        label: `Learn: ${l.topic}`,
        when: relDay(l.targetDate),
        tone: daysUntil(l.targetDate) < 0 ? 'bad' : '',
        onClick: () => edit('learn', 'learn', l.id),
      });
    }
  }
  todayItems.sort((a, b) => a.n - b.n);
  weekItems.sort((a, b) => a.n - b.n);

  // ---- Sadhana ----
  const sadhanaToday = all.sadhana.find((s) => s.date === today);
  const streak = japaStreak(all.sadhana);

  // ---- To-do ----
  const todoToday = all.todos.filter((t) => inToday(t, today)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const todoPending = todoToday.filter((t) => !doneToday(t, today));

  // ---- Nishkama: one selfless act per week ----
  const sevaThisWeek = all.seva.some((r) => r.date && daysUntil(r.date) > -7 && daysUntil(r.date) <= 0);

  // ---- Affirmations ----
  const affirmations = all.affirmations.filter((a) => a.active);

  // ---- Projects ----
  const ongoing = all.projects.filter((p) => p.stage === 'Ongoing');

  // ---- Debt ----
  const taken = all.loans.filter((l) => isTaken(l) && loanStatus(l) !== 'Closed');
  const owed = taken.reduce((s, l) => s + loanRemaining(l), 0);
  const nextPay = taken
    .map((l) => ({ l, d: loanNextDue(l) }))
    .filter((x) => x.d)
    .sort((a, b) => a.d.localeCompare(b.d))[0];
  const available = repaymentPlan(plan, all.income, all.budget).available;
  const projection = owed ? debtFreeProjection(taken, available) : null;

  // ---- Money ----
  const bankTotal = accountsTotal(all.accounts);
  const runway = runwayMonths(all.accounts, all.budget, all.loans);
  const activeGoals = all.goals.filter((g) => g.status !== 'Achieved' && g.status !== 'Paused').slice(0, 3);
  const showMoney = on('finance') && (owed > 0 || all.accounts.length > 0 || activeGoals.length > 0);

  // ---- Links & backup ----
  const pinned = all.links.filter((l) => l.pinned);
  const backupAge = lastBackup ? daysSince(lastBackup) : null;
  const totalRecords = Object.values(all).reduce((s, a) => s + a.length, 0);

  return (
    <div className="screen home">
      <header className="home-head">
        <div className="muted small">{fmtDate(today)}</div>
        <h1>{greeting}</h1>
      </header>

      {on('affirmations') && affirmations.length > 0 && (
        <section className="affirm-card">
          {affirmations.map((a) => (
            <button key={a.id} className="affirm" onClick={() => updateRecord('affirmations', a.id, { timesRead: (Number(a.timesRead) || 0) + 1 })}>
              <span>{a.text}</span>
              <span className="affirm-count">{a.timesRead || 0}×</span>
            </button>
          ))}
          <div className="affirm-hint">Tap an affirmation after reading it aloud.</div>
        </section>
      )}

      <section className="card">
        <h2 className="section-title">Today</h2>
        {FEATURES.sadhana && on('bhakti') && (
          <button className={cls('today-row', sadhanaToday ? 'done' : '')} onClick={() => go(sadhanaToday ? `/m/bhakti/edit/sadhana/${sadhanaToday.id}` : '/m/bhakti/edit/sadhana/new')}>
            <span className="check">{sadhanaToday ? '✓' : '○'}</span>
            <span className="grow">{sadhanaToday ? `Sadhana logged · ${sadhanaToday.rounds || 0} rounds` : 'Log today’s sadhana'}</span>
            {streak > 0 && <span className="chip good">{streak}-day streak</span>}
          </button>
        )}
        {on('bhakti') && !sevaThisWeek && (
          <button className="today-row" onClick={() => go('/m/bhakti/edit/seva/new')}>
            <span className="check">♡</span>
            <span className="grow">Do one selfless act this week</span>
            <span className="chip muted">Nishkama</span>
          </button>
        )}
        {todayItems.length === 0 ? (
          <div className="muted small pad-s">{on('bhakti') && !sevaThisWeek ? 'Nothing else due today.' : 'Nothing due today.'}</div>
        ) : (
          todayItems.map((i) => <AgendaRow key={i.key} item={i} />)
        )}
      </section>

      {on('todo') && todoToday.length > 0 && (
        <section className="card">
          <h2 className="section-title row-between">
            <span>
              To-do <span className="muted small">{todoToday.length - todoPending.length}/{todoToday.length}</span>
            </span>
            <button className="link-btn small" onClick={() => go('/m/todo')}>
              Open queue
            </button>
          </h2>
          {todoPending.length === 0 ? (
            <div className="muted small pad-s">All tasks done today.</div>
          ) : (
            <div className="list">
              {todoPending.slice(0, 5).map((t) => (
                <TaskRow key={t.id} t={t} onOpen={() => edit('todo', 'todos', t.id)} />
              ))}
              {todoPending.length > 5 && (
                <button className="link-btn small" onClick={() => go('/m/todo')}>
                  +{todoPending.length - 5} more
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {weekItems.length > 0 && (
        <section className="card">
          <h2 className="section-title">Coming up</h2>
          {weekItems.map((i) => (
            <AgendaRow key={i.key} item={i} />
          ))}
        </section>
      )}

      {on('projects') && ongoing.length > 0 && (
        <section className="card">
          <h2 className="section-title">
            Ongoing projects <span className="muted small">{ongoing.length}/3</span>
          </h2>
          {ongoing.map((p) => (
            <button key={p.id} className="agenda" onClick={() => edit('projects', 'projects', p.id)}>
              <span className="grow">
                <b>{p.title}</b>
                <span className="block small muted">Next: {p.nextAction}</span>
              </span>
              {p.deadline && <span className="chip muted">{fmtShort(p.deadline)}</span>}
            </button>
          ))}
        </section>
      )}

      {showMoney && (
        <section className="card">
          <h2 className="section-title">Money</h2>
          <button className="stats plain" onClick={() => go('/m/finance')}>
            <div className="stat good">
              <div className="stat-value">{inrShort(bankTotal)}</div>
              <div className="stat-label">{runway !== null ? `In accounts · lasts ${runway.toFixed(1)} mo` : 'In accounts'}</div>
            </div>
            <div className={cls('stat', owed ? 'warn' : '')}>
              <div className="stat-value">{inrShort(owed)}</div>
              <div className="stat-label">{nextPay ? `Owed · next ${fmtShort(nextPay.d)}` : 'Owed'}</div>
            </div>
            <div className="stat">
              <div className="stat-value">{owed ? (projection ? fmtShort(projection.date) : '—') : 'Free'}</div>
              <div className="stat-label">{owed ? (projection ? `Debt-free (${projection.months} mo)` : 'Add income & budget') : 'No debt'}</div>
            </div>
          </button>
          {activeGoals.map((g) => {
            const p = goalProgress(g);
            return (
              <button key={g.id} className="goal-row" onClick={() => edit('finance', 'goals', g.id)}>
                <span className="row-between">
                  <span>{g.name}</span>
                  <span className="small muted">
                    {p.pct}% · {inr(p.saved)} / {inr(p.target)}
                  </span>
                </span>
                <span className="progress thin">
                  <span style={{ width: `${p.pct}%` }} />
                </span>
              </button>
            );
          })}
        </section>
      )}

      {on('links') && pinned.length > 0 && (
        <section className="card">
          <h2 className="section-title">Pinned links</h2>
          <div className="pins">
            {pinned.map((l) => (
              <button key={l.id} className="pin" onClick={() => openLink(l)}>
                {l.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {totalRecords === 0 && (
        <section className="card welcome">
          <h2 className="section-title">Welcome to Majaagya</h2>
          <p>Start small: add one ongoing project, your loans, and 3 affirmations. The home screen fills itself from there.</p>
          <button className="btn primary" onClick={() => setAdding(true)}>
            Add something
          </button>
        </section>
      )}

      <section className={cls('card backup', (backupAge === null || backupAge > 7) && totalRecords > 0 && 'warn')}>
        <div className="grow">
          <div className="small">
            <b>Backup</b> · {lastBackup ? `last ${relDay(lastBackup.slice(0, 10))}` : 'never'}
          </div>
          {(backupAge === null || backupAge > 7) && totalRecords > 0 && (
            <div className="small text-warn">Export weekly and keep the file in Google Drive.</div>
          )}
        </div>
        <button className="btn small" onClick={async () => downloadJson(await exportAll())}>
          Export
        </button>
      </section>

      <button className="fab" aria-label="Quick add" onClick={() => setAdding(true)}>
        +
      </button>
      {adding && <QuickAdd onClose={() => setAdding(false)} on={on} />}
    </div>
  );
}

function AgendaRow({ item }) {
  return (
    <button className="agenda" onClick={item.onClick}>
      <span className="grow">{item.label}</span>
      <span className={cls('chip', item.tone || 'muted')}>{item.when}</span>
    </button>
  );
}

function QuickAdd({ onClose, on }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Quick add">
        <div className="sheet-title">Add to…</div>
        <div className="quick-grid">
          {MODULES.filter((m) => on(m.key)).flatMap((m) =>
            m.tabs.map((t) => (
              <button
                key={t}
                className="quick"
                onClick={() => {
                  onClose();
                  go(`/m/${m.key}/edit/${t}/new`);
                }}
              >
                <span className="module-icon small" style={{ background: m.color }}>
                  {m.icon}
                </span>
                {m.tabs.length > 1 ? `${m.label} · ${COLLECTION_DEFS[t].label}` : m.label}
              </button>
            )),
          )}
        </div>
      </div>
    </div>
  );
}
