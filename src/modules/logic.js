// Business rules shared by modules, home and search. Pure functions only.
import { todayStr, addDays, daysUntil, parseDate, nextAnniversary } from '../utils';

// ---------- Loans ----------

export const paidTotal = (loan) =>
  (loan.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

// If the bank's outstanding figure is entered, trust it (it includes interest)
// and subtract only payments recorded after that date. Otherwise principal − payments.
export function loanRemaining(loan) {
  const bank = loan.outstandingBank;
  if (bank !== '' && bank != null && !isNaN(Number(bank))) {
    const asOf = loan.outstandingAsOf || '';
    const at = loan.outstandingAt || '';
    // Exact time when known (payments recorded with the button), else by date.
    const isAfter = (p) => (p.at && at ? p.at > at : (p.date || '') > asOf);
    const after = (loan.payments || [])
      .filter(isAfter)
      .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return Math.max(0, Number(bank) - after);
  }
  return Math.max(0, (Number(loan.principal) || 0) - paidTotal(loan));
}

export const isTaken = (loan) => loan.direction !== 'Given (owed to me)';

export function loanStatus(loan) {
  if (loan.status === 'Closed' || loanRemaining(loan) <= 0) return 'Closed';
  if (loan.dueDate && daysUntil(loan.dueDate) < 0) return 'Overdue';
  return 'Active';
}

// Next date money is due: next EMI day, else the final due date.
export function loanNextDue(loan) {
  if (loanStatus(loan) === 'Closed') return null;
  if (loan.repaymentType === 'EMI' && loan.emiDay) {
    const day = Math.min(28, Math.max(1, Number(loan.emiDay)));
    const t = parseDate(todayStr());
    let d = new Date(t.getFullYear(), t.getMonth(), day);
    // Already paid this month's EMI? then next month.
    const paidThisMonth = (loan.payments || []).some((p) => p.date && p.date.slice(0, 7) === todayStr().slice(0, 7));
    if (d < t || paidThisMonth) d = new Date(t.getFullYear(), t.getMonth() + 1, day);
    const s = todayStr(d);
    if (loan.dueDate && s > loan.dueDate) return loan.dueDate;
    return s;
  }
  return loan.dueDate || null;
}

export function loanDueAmount(loan) {
  if (loan.repaymentType === 'EMI' && loan.emi) return Math.min(Number(loan.emi), loanRemaining(loan));
  return loanRemaining(loan);
}

export const avalancheOrder = (loans) =>
  [...loans].sort((a, b) => (Number(b.interestRate) || 0) - (Number(a.interestRate) || 0) || loanRemaining(a) - loanRemaining(b));

export const snowballOrder = (loans) => [...loans].sort((a, b) => loanRemaining(a) - loanRemaining(b));

// Months to clear all debt paying `monthly` per month, avalanche order, monthly interest.
export function debtFreeProjection(loans, monthly) {
  const pay = Number(monthly) || 0;
  let balances = loans
    .map((l) => ({ bal: loanRemaining(l), rate: (Number(l.interestRate) || 0) / 1200 }))
    .filter((b) => b.bal > 0);
  if (!balances.length) return { months: 0, date: todayStr() };
  if (pay <= 0) return null;
  let months = 0;
  while (balances.length && months < 600) {
    months++;
    balances.forEach((b) => (b.bal += b.bal * b.rate));
    let left = pay;
    balances.sort((a, b) => b.rate - a.rate);
    for (const b of balances) {
      const p = Math.min(left, b.bal);
      b.bal -= p;
      left -= p;
      if (left <= 0) break;
    }
    balances = balances.filter((b) => b.bal > 0.5);
  }
  if (months >= 600) return null;
  const t = parseDate(todayStr());
  return { months, date: todayStr(new Date(t.getFullYear(), t.getMonth() + months, t.getDate())) };
}

// ---------- People ----------

const RHYTHM_DAYS = { Weekly: 7, Monthly: 30, Quarterly: 90 };
const CIRCLE_DEFAULT = { Inner: 'Weekly', Close: 'Monthly', Network: 'Quarterly' };

export function personRhythm(p) {
  if (p.rhythm && p.rhythm !== 'Auto (by circle)') return p.rhythm;
  return CIRCLE_DEFAULT[p.circle] || 'Monthly';
}

export function personNextDue(p) {
  if (!p.lastContacted) return todayStr();
  return addDays(p.lastContacted, RHYTHM_DAYS[personRhythm(p)] || 30);
}

export function upcomingDates(p, withinDays = 14) {
  const out = [];
  for (const [key, label] of [
    ['birthday', 'Birthday'],
    ['anniversary', 'Anniversary'],
  ]) {
    const next = nextAnniversary(p[key]);
    if (next && daysUntil(next) <= withinDays) out.push({ label, date: next });
  }
  return out;
}

// ---------- Bhakti ----------

export function japaStreak(sadhana) {
  const days = new Set(sadhana.filter((s) => Number(s.rounds) > 0).map((s) => s.date));
  let d = todayStr();
  if (!days.has(d)) d = addDays(d, -1); // today not logged yet doesn't break the streak
  let n = 0;
  while (days.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- Projects ----------

export const PROJECT_STAGES = ['Just idea', 'R&D', 'Fresh (R&D required)', 'Ongoing', 'Paused', 'Done', 'Dropped'];

export function projectIdeaAgeDays(p) {
  const since = p.stageSince || p.createdAt;
  return since ? Math.max(0, -daysUntil(since.slice(0, 10))) : 0;
}

export function projectIsStale(p) {
  return p.stage === 'Ongoing' && p.updatedAt && -daysUntil(p.updatedAt.slice(0, 10)) > 14;
}

// ---------- Money: accounts, goals, budget, income ----------

export const accountsTotal = (accounts) =>
  accounts.filter((a) => a.inTotal !== false).reduce((s, a) => s + (Number(a.balance) || 0), 0);

export const incomeMonthly = (income) =>
  income.filter((i) => (i.status || 'Active') === 'Active').reduce((s, i) => s + (Number(i.amount) || 0), 0);

// EMIs of active loans you owe — counted in the budget automatically.
export const emiMonthly = (loans) =>
  loans
    .filter((l) => isTaken(l) && loanStatus(l) !== 'Closed' && l.repaymentType === 'EMI')
    .reduce((s, l) => s + (Number(l.emi) || 0), 0);

export function budgetTotals(budget, loans) {
  const essential = budget.filter((b) => b.essential !== false).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const all = budget.reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const emi = emiMonthly(loans);
  return { essential, all, emi, survival: essential + emi, full: all + emi };
}

// Months you can live on current balance with the survival budget.
export function runwayMonths(accounts, budget, loans) {
  const { survival } = budgetTotals(budget, loans);
  if (!survival) return null;
  return accountsTotal(accounts) / survival;
}

export const goalSaved = (g) =>
  (Number(g.startAmount) || 0) + (g.contributions || []).reduce((s, c) => s + (Number(c.amount) || 0), 0);

export function goalProgress(g) {
  const target = Number(g.targetAmount) || 0;
  const saved = goalSaved(g);
  const left = Math.max(0, target - saved);
  const pct = target ? Math.min(100, Math.round((saved / target) * 100)) : 0;
  let monthsLeft = null;
  let perMonth = null;
  if (g.targetDate && left > 0) {
    const days = daysUntil(g.targetDate);
    monthsLeft = Math.max(0, days / 30.44);
    perMonth = monthsLeft > 0 ? Math.ceil(left / monthsLeft) : left;
  }
  return { target, saved, left, pct, monthsLeft, perMonth, done: target > 0 && saved >= target };
}

// Money available each month to repay loans.
// Manual values in the monthly plan win; otherwise Income and Budget tabs are used.
export function repaymentPlan(plan, income, budget) {
  const p = plan || {};
  const has = (v) => v !== '' && v != null;
  const autoIncome = incomeMonthly(income || []);
  const autoFixed = (budget || []).reduce((s, b) => s + (Number(b.amount) || 0), 0);
  const inc = has(p.income) ? Number(p.income) : autoIncome;
  const fixed = has(p.fixed) ? Number(p.fixed) : autoFixed;
  const available = has(p.repay) ? Number(p.repay) : inc - fixed;
  return { income: inc, fixed, available, autoIncome, autoFixed };
}
