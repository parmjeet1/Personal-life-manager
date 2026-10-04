// Small summary panels shown above each module's list.
import { useState } from 'react';
import { useMeta, useAllData, go } from '../hooks';
import { setMeta } from '../db';
import { todayStr, addDays, daysUntil, fmtShort, fmtDate, inr, inrShort, parseDate } from '../utils';
import {
  projectIsStale,
  projectIdeaAgeDays,
  japaStreak,
  loanRemaining,
  loanStatus,
  loanNextDue,
  loanDueAmount,
  isTaken,
  avalancheOrder,
  snowballOrder,
  debtFreeProjection,
  personNextDue,
  accountsTotal,
  incomeMonthly,
  budgetTotals,
  runwayMonths,
  goalProgress,
  repaymentPlan,
} from '../modules/logic';
import { promptOfTheDay } from '../modules/prompts';
import { cls } from '../utils';

const Stat = ({ label, value, tone }) => (
  <div className={cls('stat', tone)}>
    <div className="stat-value">{value}</div>
    <div className="stat-label">{label}</div>
  </div>
);

function Projects({ records }) {
  const ongoing = records.filter((p) => p.stage === 'Ongoing').length;
  const stale = records.filter(projectIsStale).length;
  const cooling = records.filter((p) => p.stage === 'Just idea' && projectIdeaAgeDays(p) < 7).length;
  return (
    <div className="stats">
      <Stat label="Ongoing (limit 3)" value={`${ongoing}/3`} tone={ongoing > 3 ? 'bad' : ongoing === 3 ? 'warn' : ''} />
      <Stat label="Ideas cooling (<7 days)" value={cooling} />
      <Stat label="Stale (14+ days)" value={stale} tone={stale ? 'bad' : ''} />
    </div>
  );
}

function Sadhana({ records, open }) {
  const target = useMeta('japaTarget', 16);
  const today = records.find((s) => s.date === todayStr());
  const streak = japaStreak(records);
  const last7 = [...Array(7)].map((_, i) => {
    const d = addDays(todayStr(), i - 6);
    const r = records.find((s) => s.date === d);
    return { d, rounds: r ? Number(r.rounds) || 0 : 0 };
  });
  const max = Math.max(target || 16, ...last7.map((x) => x.rounds), 1);
  return (
    <div className="panel">
      <div className="stats">
        <Stat label="Japa streak (days)" value={streak} tone={streak ? 'good' : ''} />
        <Stat label="Today" value={today ? `${today.rounds || 0} rounds` : 'Not logged'} tone={today ? 'good' : 'warn'} />
      </div>
      <div className="bars" aria-label="Rounds over the last 7 days">
        {last7.map((x) => (
          <div key={x.d} className="bar-col" title={`${fmtShort(x.d)}: ${x.rounds}`}>
            <div className="bar-num">{x.rounds || ''}</div>
            <div className={cls('bar', x.rounds >= target && 'full')} style={{ height: `${(x.rounds / max) * 56 + 2}px` }} />
            <div className="bar-day">{parseDate(x.d).toLocaleDateString('en-IN', { weekday: 'narrow' })}</div>
          </div>
        ))}
      </div>
      <button className="btn primary small" onClick={() => open(today ? today.id : 'new')}>
        {today ? 'Edit today’s sadhana' : 'Log today’s sadhana'}
      </button>
    </div>
  );
}

function Loans({ records, open }) {
  const plan = useMeta('monthlyPlan', {}) || {};
  const all = useAllData();
  const [order, setOrder] = useState('avalanche');
  const openLoans = records.filter((l) => loanStatus(l) !== 'Closed');
  const taken = openLoans.filter(isTaken);
  const given = openLoans.filter((l) => !isTaken(l));
  const owed = taken.reduce((s, l) => s + loanRemaining(l), 0);
  const receivable = given.reduce((s, l) => s + loanRemaining(l), 0);
  const dueSoon = taken.filter((l) => {
    const d = loanNextDue(l);
    return d && daysUntil(d) <= 7;
  });
  const rp = repaymentPlan(plan, all?.income, all?.budget);
  const available = rp.available;
  const projection = debtFreeProjection(taken, available);
  const ordered = order === 'avalanche' ? avalancheOrder(taken) : snowballOrder(taken);
  const setPlan = (k, v) => setMeta('monthlyPlan', { ...plan, [k]: v });

  return (
    <div className="panel">
      <div className="stats">
        <Stat label="I owe" value={inrShort(owed)} tone={owed ? 'warn' : 'good'} />
        <Stat label="Owed to me" value={inrShort(receivable)} />
        <Stat label="Due in 7 days" value={dueSoon.length} tone={dueSoon.length ? 'bad' : ''} />
      </div>

      {dueSoon.length > 0 && (
        <div className="mini-list">
          {dueSoon.map((l) => (
            <button key={l.id} className="mini-item" onClick={() => open(l.id)}>
              <span>{l.party}</span>
              <span className={daysUntil(loanNextDue(l)) < 0 ? 'text-bad' : 'text-warn'}>
                {inr(loanDueAmount(l))} · {fmtShort(loanNextDue(l))}
              </span>
            </button>
          ))}
        </div>
      )}

      <details className="details">
        <summary>Monthly plan &amp; debt-free date</summary>
        <div className="grid-3">
          <label>
            <span className="field-label">Income / month (₹)</span>
            <input type="number" inputMode="decimal" placeholder={String(rp.autoIncome)} value={plan.income ?? ''} onChange={(e) => setPlan('income', e.target.value)} />
          </label>
          <label>
            <span className="field-label">Monthly costs (₹)</span>
            <input type="number" inputMode="decimal" placeholder={String(rp.autoFixed)} value={plan.fixed ?? ''} onChange={(e) => setPlan('fixed', e.target.value)} />
          </label>
          <label>
            <span className="field-label">For repayment (₹)</span>
            <input
              type="number"
              inputMode="decimal"
              placeholder={String(Math.max(0, rp.income - rp.fixed))}
              value={plan.repay ?? ''}
              onChange={(e) => setPlan('repay', e.target.value)}
            />
          </label>
        </div>
        <p className="small muted">Empty boxes use your Income and Budget tabs (EMIs are not double-counted). Type a number to override.</p>
        <p>
          {owed === 0
            ? 'No open debt.'
            : projection
              ? (
                <>
                  Paying {inr(available)}/month: <b>debt-free by {fmtDate(projection.date)}</b> ({projection.months} months).
                </>
              )
              : 'Set an amount for repayment that covers the monthly interest to see a debt-free date.'}
        </p>
      </details>

      {taken.length > 1 && (
        <details className="details">
          <summary>Which loan to clear first</summary>
          <div className="segmented mb-s">
            <button className={cls('seg', order === 'avalanche' && 'on')} onClick={() => setOrder('avalanche')}>
              Avalanche
            </button>
            <button className={cls('seg', order === 'snowball' && 'on')} onClick={() => setOrder('snowball')}>
              Snowball
            </button>
          </div>
          <p className="small muted">
            {order === 'avalanche'
              ? 'Highest interest first — saves the most money.'
              : 'Smallest balance first — quick wins build momentum.'}
          </p>
          <ol className="order-list">
            {ordered.map((l) => (
              <li key={l.id}>
                <button className="link-btn" onClick={() => open(l.id)}>
                  {l.party}
                </button>{' '}
                <span className="muted small">
                  {inr(loanRemaining(l))} · {Number(l.interestRate) || 0}%
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function Learn({ records }) {
  const learning = records.filter((r) => r.status === 'Learning').length;
  const done = records.filter((r) => r.status === 'Done').length;
  const hours = records.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  return (
    <div className="stats">
      <Stat label="Learning now (limit 2)" value={`${learning}/2`} tone={learning > 2 ? 'bad' : ''} />
      <Stat label="Done with proof" value={done} tone={done ? 'good' : ''} />
      <Stat label="Total hours" value={hours} />
    </div>
  );
}

function Try({ records, open }) {
  const [pick, setPick] = useState(null);
  const month = todayStr().slice(0, 7);
  const triedThisMonth = records.filter((r) => r.status === 'Tried' && (r.triedOn || '').slice(0, 7) === month).length;
  const pickOne = () => {
    const pool = records.filter((r) => r.status !== 'Tried');
    const small = pool.filter((r) => r.effort === 'Small');
    const from = small.length ? small : pool;
    setPick(from.length ? from[Math.floor(Math.random() * from.length)] : false);
  };
  return (
    <div className="panel">
      <div className="stats">
        <Stat label="Tried this month (goal 1+)" value={triedThisMonth} tone={triedThisMonth ? 'good' : 'warn'} />
      </div>
      <button className="btn small" onClick={pickOne}>
        🎲 Pick for me
      </button>
      {pick && (
        <button className="pick" onClick={() => open(pick.id)}>
          Try this: <b>{pick.idea}</b>
        </button>
      )}
      {pick === false && <p className="small muted">Nothing left to try — add some ideas.</p>}
    </div>
  );
}

function Journal({ records, open }) {
  const today = todayStr();
  const onThisDay = records.filter((r) => r.date && r.date !== today && r.date.slice(5) === today.slice(5));
  const lastMonthSameDay = records.filter((r) => r.date && r.date.slice(8) === today.slice(8) && r.date.slice(0, 7) !== today.slice(0, 7) && r.date.slice(5) !== today.slice(5));
  const days = [...Array(30)].map((_, i) => addDays(today, i - 29));
  const byDay = days.map((d) => {
    const es = records.filter((r) => r.date === d);
    const avg = (k) => {
      const v = es.map((e) => Number(e[k])).filter(Boolean);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    return { d, mood: avg('mood'), energy: avg('energy') };
  });
  const hasTrend = byDay.some((x) => x.mood || x.energy);
  const looking = [...onThisDay, ...lastMonthSameDay].slice(0, 3);
  return (
    <div className="panel">
      <div className="prompt-hint">Today’s prompt: {promptOfTheDay()}</div>
      {hasTrend && <Trend data={byDay} />}
      {looking.length > 0 && (
        <div className="mini-list">
          <div className="field-label">On this day</div>
          {looking.map((r) => (
            <button key={r.id} className="mini-item" onClick={() => open(r.id)}>
              <span>{fmtDate(r.date)}</span>
              <span className="muted ellipsis">{(r.entry || '').slice(0, 60)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Trend({ data }) {
  const W = 300;
  const H = 70;
  const x = (i) => (i / (data.length - 1)) * (W - 10) + 5;
  const y = (v) => H - 8 - ((v - 1) / 4) * (H - 16);
  const line = (k) =>
    data
      .map((p, i) => (p[k] ? `${x(i)},${y(p[k])}` : null))
      .filter(Boolean)
      .join(' ');
  return (
    <div className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Mood and energy over 30 days">
        <polyline points={line('energy')} className="trend-energy" />
        <polyline points={line('mood')} className="trend-mood" />
        {data.map((p, i) => p.mood && <circle key={i} cx={x(i)} cy={y(p.mood)} r="2.5" className="trend-dot" />)}
      </svg>
      <div className="small muted">
        <span className="legend mood" /> Mood <span className="legend energy" /> Energy · last 30 days
      </div>
    </div>
  );
}

function Affirmations({ records }) {
  const active = records.filter((r) => r.active).length;
  return (
    <div className="stats">
      <Stat label="Active (keep 3–5)" value={active} tone={active > 5 ? 'bad' : active < 3 ? 'warn' : 'good'} />
      <Stat label="Review" value="Monthly" />
    </div>
  );
}

function People({ records, open }) {
  const today = todayStr();
  const due = records.filter((p) => daysUntil(personNextDue(p)) <= 7);
  const month = today.slice(0, 7);
  const dueThisMonth = records
    .filter((p) => personNextDue(p).slice(0, 7) <= month)
    .sort((a, b) => personNextDue(a).localeCompare(personNextDue(b)));
  // Spread this month's due people across the 4 weeks of the month.
  const weeks = [[], [], [], []];
  dueThisMonth.forEach((p, i) => weeks[i % 4].push(p));
  return (
    <div className="panel">
      <div className="stats">
        <Stat label="Due this week" value={due.length} tone={due.length ? 'warn' : 'good'} />
        <Stat label="Due this month" value={dueThisMonth.length} />
      </div>
      {dueThisMonth.length > 0 && (
        <details className="details">
          <summary>Monthly planner</summary>
          {weeks.map((w, i) =>
            w.length ? (
              <div key={i} className="planner-week">
                <div className="field-label">Week {i + 1}</div>
                {w.map((p) => (
                  <button key={p.id} className="mini-item" onClick={() => open(p.id)}>
                    <span>{p.name}</span>
                    <span className="muted small">{p.channel || 'Call'}</span>
                  </button>
                ))}
              </div>
            ) : null,
          )}
        </details>
      )}
    </div>
  );
}

// Money overview — first tab of Finance.
function Accounts({ records }) {
  const all = useAllData();
  if (!all) return null;
  const total = accountsTotal(records);
  const income = incomeMonthly(all.income);
  const bt = budgetTotals(all.budget, all.loans);
  const surplus = income - bt.full;
  const runway = runwayMonths(records, all.budget, all.loans);
  const owed = all.loans.filter((l) => isTaken(l) && loanStatus(l) !== 'Closed').reduce((s, l) => s + loanRemaining(l), 0);
  const stale = records.filter((a) => a.asOf && daysUntil(a.asOf) < -30).length;
  return (
    <div className="panel">
      <div className="stats">
        <Stat label="Money in accounts" value={inrShort(total)} tone="good" />
        <Stat label="Owed (loans)" value={inrShort(owed)} tone={owed ? 'warn' : ''} />
        <Stat label="Net position" value={inrShort(total - owed)} tone={total - owed < 0 ? 'bad' : 'good'} />
      </div>
      <div className="stats">
        <Stat label="Income / month" value={inrShort(income)} />
        <Stat label="Spend / month (incl. EMIs)" value={inrShort(bt.full)} />
        <Stat label={surplus >= 0 ? 'Left each month' : 'Short each month'} value={inrShort(Math.abs(surplus))} tone={surplus >= 0 ? 'good' : 'bad'} />
      </div>
      <div className="runway">
        {runway === null ? (
          <span className="small muted">Add your survival budget in the Budget tab to see how many months your money lasts.</span>
        ) : (
          <>
            <b className={runway < 3 ? 'text-bad' : runway < 6 ? 'text-warn' : ''}>{runway.toFixed(1)} months</b>
            <span className="small muted"> you can survive on current balance with the survival budget ({inr(bt.survival)}/month). Aim for 6+.</span>
          </>
        )}
      </div>
      {stale > 0 && <div className="small text-warn">{stale} account balance(s) not updated in 30+ days.</div>}
    </div>
  );
}

function Goals({ records }) {
  const active = records.filter((g) => g.status !== 'Achieved' && g.status !== 'Paused');
  const perMonth = active.reduce((s, g) => s + (goalProgress(g).perMonth || 0), 0);
  const saved = records.reduce((s, g) => s + goalProgress(g).saved, 0);
  const achieved = records.filter((g) => g.status === 'Achieved').length;
  return (
    <div className="stats">
      <Stat label="Saved across goals" value={inrShort(saved)} tone="good" />
      <Stat label="Needed per month" value={inrShort(perMonth)} tone={perMonth ? 'warn' : ''} />
      <Stat label="Achieved" value={achieved} />
    </div>
  );
}

function Budget({ records }) {
  const all = useAllData();
  if (!all) return null;
  const bt = budgetTotals(records, all.loans);
  const income = incomeMonthly(all.income);
  const byCat = {};
  for (const b of records) byCat[b.category || 'Other'] = (byCat[b.category || 'Other'] || 0) + (Number(b.amount) || 0);
  if (bt.emi) byCat['Loan EMIs (auto)'] = bt.emi;
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...cats.map((c) => c[1]));
  const gap = income - bt.full;
  return (
    <div className="panel">
      <div className="stats">
        <Stat label="Survival / month" value={inrShort(bt.survival)} tone="warn" />
        <Stat label="Full budget / month" value={inrShort(bt.full)} />
        <Stat label={gap >= 0 ? 'Income left over' : 'Income short by'} value={inrShort(Math.abs(gap))} tone={gap >= 0 ? 'good' : 'bad'} />
      </div>
      {bt.emi > 0 && <div className="small muted">Includes {inr(bt.emi)} of loan EMIs from the Loans tab — don’t add EMIs here again.</div>}
      {cats.length > 0 && (
        <div className="hbars">
          {cats.map(([c, v]) => (
            <div key={c} className="hbar-row">
              <span className="hbar-label">{c}</span>
              <span className="hbar-track">
                <span className="hbar" style={{ width: `${(v / max) * 100}%` }} />
              </span>
              <span className="hbar-val">{inr(v)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Income({ records }) {
  const active = incomeMonthly(records);
  const expected = records.filter((i) => i.status === 'Expected').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  return (
    <div className="stats">
      <Stat label="Active income / month" value={inrShort(active)} tone="good" />
      <Stat label="Expected (not yet)" value={inrShort(expected)} />
      <Stat label="Sources" value={records.filter((i) => i.status !== 'Ended').length} />
    </div>
  );
}

function Seva({ records }) {
  const month = todayStr().slice(0, 7);
  const thisMonth = records.filter((r) => (r.date || '').slice(0, 7) === month);
  const hours = thisMonth.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const given = thisMonth.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  // Weeks (of the last 4) with at least one selfless act.
  const weeks = [0, 1, 2, 3].filter((w) => {
    const from = addDays(todayStr(), -7 * (w + 1) + 1);
    const to = addDays(todayStr(), -7 * w);
    return records.some((r) => r.date >= from && r.date <= to);
  }).length;
  return (
    <div className="panel">
      <div className="stats">
        <Stat label="Acts this month" value={thisMonth.length} tone={thisMonth.length ? 'good' : 'warn'} />
        <Stat label="Hours given" value={hours} />
        <Stat label="Money given" value={inrShort(given)} />
      </div>
      <div className="small muted">
        Goal: one selfless act every week — <b className={weeks >= 4 ? 'text-good' : ''}>{weeks}/4</b> weeks done lately. Act without expecting anything back.
      </div>
    </div>
  );
}

export const SUMMARIES = {
  seva: Seva,
  accounts: Accounts,
  goals: Goals,
  budget: Budget,
  income: Income,
  projects: Projects,
  sadhana: Sadhana,
  loans: Loans,
  learn: Learn,
  tryItems: Try,
  journal: Journal,
  affirmations: Affirmations,
  people: People,
};
