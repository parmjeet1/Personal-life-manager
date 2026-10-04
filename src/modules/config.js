// Module definitions. Each module = one or more collections described by fields.
// The generic UI (list, card, form) is driven entirely by this file.
import { updateRecord } from '../db';
import { toText } from '../components/RichEditor';
import { todayStr, fmtShort, relDay, daysUntil, inr, daysSince, fmtDate } from '../utils';
import {
  PROJECT_STAGES,
  projectIdeaAgeDays,
  projectIsStale,
  loanRemaining,
  loanStatus,
  loanNextDue,
  loanDueAmount,
  isTaken,
  personNextDue,
  personRhythm,
  goalProgress,
} from './logic';

const PRIORITY = ['P1', 'P2', 'P3'];
const ORDER = (list) => (v) => {
  const i = list.indexOf(v);
  return i === -1 ? 99 : i;
};
const byDate = (k) => (a, b) => (a[k] || '9999').localeCompare(b[k] || '9999');
const newest = (k) => (a, b) => (b[k] || '').localeCompare(a[k] || '');

const dueChip = (date, label = 'Due') => {
  if (!date) return null;
  const n = daysUntil(date);
  return { text: `${label} ${fmtShort(date)}`, tone: n < 0 ? 'bad' : n <= 7 ? 'warn' : 'muted' };
};

// ---------------------------------------------------------------------------
export const COLLECTION_DEFS = {
  // ---------------- 0. To-do ----------------
  todos: {
    label: 'To-do',
    singular: 'task',
    title: (r) => r.title,
    fields: [
      { key: 'title', label: 'Task', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', default: () => todayStr(), help: 'Leave empty to keep it in today’s queue until done.', showIf: (r) => !r.repeat || r.repeat === 'None' },
      { key: 'repeat', label: 'Repeat', type: 'select', options: ['None', 'Daily', 'Weekdays'], default: 'None', required: true },
      { key: 'startTime', label: 'Start time', type: 'time' },
      { key: 'endTime', label: 'End time', type: 'time' },
      { key: 'urgent', label: 'Urgent', type: 'bool' },
      { key: 'important', label: 'Important', type: 'bool' },
      { key: 'alarm', label: 'Alarm (sound + notification)', type: 'bool', help: 'Rings while the app is open or recently used. For a guaranteed alarm, use “Add to phone calendar”.' },
      { key: 'alarmBefore', label: 'Ring', type: 'select', options: ['At start time', '5 min before', '10 min before', '15 min before', '30 min before'], default: 'At start time', required: true, showIf: (r) => r.alarm },
      { key: 'status', label: 'Status', type: 'select', options: ['To do', 'Doing', 'Done'], default: 'To do', required: true, showIf: (r) => !r.repeat || r.repeat === 'None' },
      { key: 'project', label: 'Project', type: 'ref', targets: ['projects'] },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 3 },
    ],
    beforeSave: (r, prev) => {
      if (!prev && r.order == null) r.order = Date.now();
      if (r.alarm && !r.startTime) r.alarm = false;
      if (r.status === 'Done' && (!prev || prev.status !== 'Done')) r.completedAt = new Date().toISOString();
      if (r.status !== 'Done') r.completedAt = null;
      return r;
    },
    validate: (r) => {
      const errors = [];
      if (r.alarm && !r.startTime) errors.push('Set a start time to use the alarm.');
      if (r.startTime && r.endTime && r.endTime <= r.startTime) errors.push('End time must be after start time.');
      return { errors, warnings: [] };
    },
    sort: (a, b) => (a.order ?? 0) - (b.order ?? 0),
    meta: (r) => [
      r.startTime && { text: r.endTime ? `${r.startTime}–${r.endTime}` : r.startTime, tone: 'muted' },
      r.urgent && { text: 'Urgent', tone: 'bad' },
      r.important && { text: 'Important', tone: 'warn' },
      r.repeat && r.repeat !== 'None' && { text: `↻ ${r.repeat}`, tone: 'muted' },
      r.alarm && { text: '⏰', tone: 'muted' },
    ],
    subtitle: (r) => r.notes,
  },
  // ---------------- 1. Projects ----------------
  projects: {
    label: 'Projects',
    singular: 'project',
    title: (r) => r.title,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'stage', label: 'Stage', type: 'select', options: PROJECT_STAGES, default: 'Just idea', required: true },
      { key: 'category', label: 'Category', type: 'select', options: ['SaaS', 'Client work', 'Personal', 'Other'] },
      { key: 'problem', label: 'Problem it solves', type: 'text', placeholder: 'One line: why this exists' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY, default: 'P2' },
      { key: 'nextAction', label: 'Next action', type: 'text', placeholder: 'The single next physical step', help: 'Required when Ongoing.' },
      { key: 'deadline', label: 'Deadline', type: 'date' },
      {
        key: 'phases',
        label: 'Phases',
        type: 'sublist',
        itemLabel: 'phase',
        fields: [
          { key: 'name', label: 'Phase', type: 'text' },
          { key: 'status', label: 'Status', type: 'select', options: ['Not started', 'In progress', 'Done'], default: 'Not started' },
          { key: 'deadline', label: 'Deadline', type: 'date' },
        ],
      },
      { key: 'revenue', label: 'Revenue potential', type: 'select', options: ['None', 'Low', 'Medium', 'High'] },
      { key: 'notes', label: 'Notes', type: 'textarea' },
      { key: 'dropReason', label: 'Reason dropped', type: 'text', showIf: (r) => r.stage === 'Dropped' },
      { key: 'lastReviewed', label: 'Last reviewed', type: 'date' },
    ],
    filters: { key: 'stage', options: PROJECT_STAGES, default: 'Active' },
    activeFilter: (r) => !['Done', 'Dropped'].includes(r.stage),
    sort: (a, b) =>
      ORDER(PROJECT_STAGES)(a.stage) - ORDER(PROJECT_STAGES)(b.stage) ||
      ORDER(PRIORITY)(a.priority) - ORDER(PRIORITY)(b.priority) ||
      byDate('deadline')(a, b),
    meta: (r) => {
      const phases = r.phases || [];
      const done = phases.filter((p) => p.status === 'Done').length;
      return [
        { text: r.stage, tone: r.stage === 'Ongoing' ? 'good' : 'muted' },
        r.priority && { text: r.priority, tone: r.priority === 'P1' ? 'warn' : 'muted' },
        phases.length && { text: `${done}/${phases.length} phases`, tone: 'muted' },
        !['Done', 'Dropped'].includes(r.stage) && dueChip(r.deadline),
        projectIsStale(r) && { text: 'No update in 14+ days', tone: 'bad' },
      ];
    },
    subtitle: (r) => (r.nextAction ? `Next: ${r.nextAction}` : r.problem),
    beforeSave: (r, prev) => {
      if (!prev || prev.stage !== r.stage) r.stageSince = new Date().toISOString();
      return r;
    },
    validate: (r, prev, all) => {
      const errors = [];
      const warnings = [];
      if (r.stage === 'Ongoing' && !r.nextAction) errors.push('An Ongoing project must have a next action.');
      if (r.stage === 'Dropped' && !r.dropReason) errors.push('Write a one-line reason for dropping it.');
      if (prev && prev.stage === 'Just idea' && ['R&D', 'Fresh (R&D required)', 'Ongoing'].includes(r.stage)) {
        const age = projectIdeaAgeDays(prev);
        if (age < 7) warnings.push(`Cooling period: this idea is only ${age} day(s) old. The rule is to wait 7 days before moving it forward.`);
      }
      if (r.stage === 'Ongoing' && (!prev || prev.stage !== 'Ongoing')) {
        const ongoing = all.filter((p) => p.stage === 'Ongoing' && p.id !== r.id).length;
        if (ongoing >= 3) warnings.push(`You already have ${ongoing} Ongoing projects. The limit is 2–3. Pause one first?`);
      }
      return { errors, warnings };
    },
  },

  // ---------------- 2. Bhakti ----------------
  // ---------------- 2. Nishkama: selfless acts ----------------
  seva: {
    label: 'Seva log',
    singular: 'selfless act',
    title: (r) => r.deed,
    fields: [
      { key: 'deed', label: 'What I did', type: 'text', required: true, placeholder: 'e.g. Taught a kid maths, fed a stray dog' },
      { key: 'date', label: 'Date', type: 'date', required: true, default: () => todayStr() },
      { key: 'forWhom', label: 'For whom', type: 'text', placeholder: 'Person, group or cause' },
      { key: 'kind', label: 'What I gave', type: 'select', options: ['Time', 'Money', 'Skill', 'Food', 'Help', 'Other'], default: 'Time' },
      { key: 'hours', label: 'Hours given', type: 'number', min: 0, step: 0.5, showIf: (r) => ['Time', 'Skill', 'Help'].includes(r.kind) },
      { key: 'amount', label: 'Amount given (₹)', type: 'money', showIf: (r) => ['Money', 'Food'].includes(r.kind) },
      { key: 'nothingBack', label: 'Expected nothing in return', type: 'bool', default: true, help: 'Be honest — that is the whole point.' },
      { key: 'reflection', label: 'How it felt / what I learned', type: 'textarea', rows: 3 },
    ],
    filters: { key: 'kind', options: ['Time', 'Money', 'Skill', 'Food', 'Help', 'Other'] },
    sort: (a, b) => (b.date || '').localeCompare(a.date || ''),
    meta: (r) => [
      { text: fmtShort(r.date), tone: 'muted' },
      r.kind && { text: r.kind, tone: 'muted' },
      Number(r.hours) > 0 && { text: `${r.hours} h`, tone: 'muted' },
      Number(r.amount) > 0 && { text: inr(r.amount), tone: 'muted' },
      r.nothingBack !== false ? { text: 'Nishkama', tone: 'good' } : { text: 'Expected something back', tone: 'warn' },
    ],
    subtitle: (r) => [r.forWhom && `For ${r.forWhom}`, r.reflection].filter(Boolean).join(' — '),
  },

  bhaktiNotes: {
    label: 'Notes',
    singular: 'note',
    title: (r) => r.title,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['Realization', 'Lecture note', 'Verse', 'Instruction', 'Question'], default: 'Realization' },
      { key: 'source', label: 'Source', type: 'text', placeholder: 'Book, chapter, speaker, date' },
      { key: 'content', label: 'Content', type: 'textarea', rows: 8 },
      { key: 'tags', label: 'Tags', type: 'tags' },
    ],
    filters: { key: 'type', options: ['Realization', 'Lecture note', 'Verse', 'Instruction', 'Question'] },
    sort: newest('updatedAt'),
    meta: (r) => [{ text: r.type, tone: 'muted' }, r.source && { text: r.source, tone: 'muted' }],
    subtitle: (r) => r.content,
  },

  sadhana: {
    label: 'Sadhana',
    singular: 'day',
    title: (r) => fmtDate(r.date),
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true, default: () => todayStr() },
      { key: 'rounds', label: 'Japa rounds', type: 'number', min: 0 },
      { key: 'readingBook', label: 'Reading — book', type: 'text' },
      { key: 'readingMinutes', label: 'Reading — minutes', type: 'number', min: 0 },
      { key: 'morningProgram', label: 'Morning program attended', type: 'bool' },
      { key: 'seva', label: 'Seva', type: 'text', placeholder: 'What service was done' },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    sort: newest('date'),
    meta: (r) => [
      { text: `${r.rounds || 0} rounds`, tone: Number(r.rounds) > 0 ? 'good' : 'muted' },
      r.readingMinutes && { text: `${r.readingMinutes} min reading`, tone: 'muted' },
      r.morningProgram && { text: 'Morning program', tone: 'good' },
      r.seva && { text: 'Seva', tone: 'muted' },
    ],
    subtitle: (r) => r.note,
    validate: (r, prev, all) => {
      const dup = all.find((s) => s.date === r.date && s.id !== r.id);
      return { errors: dup ? [`${fmtDate(r.date)} is already logged. Edit that entry instead.`] : [], warnings: [] };
    },
  },

  verses: {
    label: 'Verses',
    singular: 'verse',
    title: (r) => r.reference,
    fields: [
      { key: 'reference', label: 'Reference', type: 'text', required: true, placeholder: 'e.g. BG 2.13' },
      { key: 'verse', label: 'Verse', type: 'textarea' },
      { key: 'translation', label: 'Translation', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: ['Learning', 'Memorised'], default: 'Learning' },
      { key: 'lastRevised', label: 'Last revised', type: 'date' },
    ],
    filters: { key: 'status', options: ['Learning', 'Memorised'] },
    sort: byDate('lastRevised'),
    meta: (r) => [
      { text: r.status, tone: r.status === 'Memorised' ? 'good' : 'muted' },
      r.lastRevised && { text: `Revised ${relDay(r.lastRevised)}`, tone: 'muted' },
    ],
    subtitle: (r) => r.translation,
    actions: [{ label: 'Revised today', run: (r) => updateRecord('verses', r.id, { lastRevised: todayStr() }) }],
  },

  bhaktiEvents: {
    label: 'Calendar',
    singular: 'date',
    title: (r) => r.name,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Ekadashi, Janmashtami' },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['Ekadashi', 'Festival', 'Other'], default: 'Ekadashi' },
      { key: 'note', label: 'Note', type: 'text' },
    ],
    filters: { key: 'type', options: ['Ekadashi', 'Festival', 'Other'], default: 'Upcoming' },
    activeFilter: (r) => daysUntil(r.date) >= 0,
    sort: byDate('date'),
    meta: (r) => [{ text: r.type, tone: 'muted' }, { text: `${fmtShort(r.date)} · ${relDay(r.date)}`, tone: daysUntil(r.date) <= 3 ? 'warn' : 'muted' }],
    subtitle: (r) => r.note,
  },

  // ---------------- 3. Finance ----------------
  loans: {
    label: 'Loans',
    singular: 'loan',
    title: (r) => r.party,
    fields: [
      { key: 'direction', label: 'Direction', type: 'select', options: ['Taken (I owe)', 'Given (owed to me)'], default: 'Taken (I owe)', required: true },
      { key: 'party', label: 'Lender / borrower', type: 'text', required: true, placeholder: 'Person, bank or app name' },
      { key: 'partyType', label: 'Type', type: 'select', options: ['Family', 'Friend', 'Bank', 'App', 'Other'] },
      { key: 'person', label: 'Person in Relationships', type: 'ref', targets: ['people'], help: 'Link family/friend loans to the person.' },
      { key: 'principal', label: 'Principal (₹)', type: 'money', required: true },
      { key: 'interestRate', label: 'Interest rate (% per year)', type: 'number', min: 0, step: 0.1, help: '0 for family or friends.' },
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'dueDate', label: 'Final due date', type: 'date' },
      { key: 'repaymentType', label: 'Repayment type', type: 'select', options: ['EMI', 'Lump sum', 'Flexible'], default: 'Lump sum' },
      { key: 'emi', label: 'EMI amount (₹)', type: 'money', showIf: (r) => r.repaymentType === 'EMI' },
      { key: 'emiDay', label: 'EMI day of month', type: 'number', min: 1, max: 28, showIf: (r) => r.repaymentType === 'EMI' },
      {
        key: 'payments',
        label: 'Payments',
        type: 'sublist',
        itemLabel: 'payment',
        fields: [
          { key: 'date', label: 'Date', type: 'date', default: () => todayStr() },
          { key: 'amount', label: 'Amount (₹)', type: 'money' },
          { key: 'note', label: 'Note', type: 'text' },
        ],
      },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Closed'], default: 'Active', help: 'Overdue is set automatically.' },
      {
        key: 'outstandingBank',
        label: 'Outstanding as per bank (₹)',
        type: 'money',
        help: 'Optional. From your bank statement/app — includes interest. When set, "left" uses this instead of principal minus payments.',
      },
      { key: 'outstandingAsOf', label: 'Outstanding updated on', type: 'date', default: () => '', showIf: (r) => r.outstandingBank !== '' && r.outstandingBank != null },
      { key: 'planNote', label: 'Repayment plan', type: 'textarea', placeholder: 'How you intend to repay' },
    ],
    filters: { key: '_status', options: ['Active', 'Overdue', 'Closed'], default: 'Open', get: (r) => loanStatus(r) },
    activeFilter: (r) => loanStatus(r) !== 'Closed',
    sort: (a, b) => (loanNextDue(a) || '9999').localeCompare(loanNextDue(b) || '9999'),
    meta: (r) => {
      const st = loanStatus(r);
      return [
        { text: isTaken(r) ? 'I owe' : 'Owed to me', tone: isTaken(r) ? 'warn' : 'good' },
        r.outstandingBank !== '' && r.outstandingBank != null
          ? { text: `${inr(loanRemaining(r))} left · bank figure ${r.outstandingAsOf ? fmtShort(r.outstandingAsOf) : ''}`.trim(), tone: 'muted' }
          : { text: `${inr(loanRemaining(r))} left of ${inr(r.principal)}`, tone: 'muted' },
        Number(r.interestRate) > 0 && { text: `${r.interestRate}%`, tone: 'muted' },
        st === 'Overdue' && { text: 'Overdue', tone: 'bad' },
        st === 'Closed' && { text: 'Closed', tone: 'good' },
        st !== 'Closed' && dueChip(loanNextDue(r), 'Next'),
      ];
    },
    subtitle: (r) => r.planNote,
    beforeSave: (r, prev) => {
      const hasBank = r.outstandingBank !== '' && r.outstandingBank != null;
      if (hasBank && !r.outstandingAsOf) r.outstandingAsOf = todayStr();
      if (hasBank && (!prev || prev.outstandingBank !== r.outstandingBank || prev.outstandingAsOf !== r.outstandingAsOf)) {
        r.outstandingAt = new Date().toISOString();
      }
      return r;
    },
    actions: [
      {
        label: 'Record payment',
        show: (r) => loanStatus(r) !== 'Closed',
        run: async (r) => {
          const suggested = loanDueAmount(r);
          const v = window.prompt(`Amount paid today (₹) to/from ${r.party}`, suggested ? String(suggested) : '');
          if (v === null) return;
          const amount = Number(String(v).replace(/[^\d.]/g, ''));
          if (!amount) return;
          const payments = [...(r.payments || []), { date: todayStr(), amount, note: '', at: new Date().toISOString() }];
          const changes = { payments };
          if (loanRemaining({ ...r, payments }) <= 0) changes.status = 'Closed';
          await updateRecord('loans', r.id, changes);
        },
      },
    ],
  },

  // ---------------- 3b. Bank accounts ----------------
  accounts: {
    label: 'Accounts',
    singular: 'account',
    title: (r) => r.name,
    fields: [
      { key: 'name', label: 'Account name', type: 'text', required: true, placeholder: 'e.g. SBI savings, Cash in hand' },
      { key: 'type', label: 'Type', type: 'select', options: ['Savings', 'Current', 'Cash', 'Wallet / UPI', 'FD / RD', 'Other'], default: 'Savings' },
      { key: 'balance', label: 'Current balance (₹)', type: 'money', required: true },
      { key: 'asOf', label: 'Balance as of', type: 'date', default: () => todayStr() },
      { key: 'inTotal', label: 'Count in total money', type: 'bool', default: true, help: 'Turn off for money you must not touch (e.g. locked FD).' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
    sort: (a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0),
    meta: (r) => [
      { text: inr(r.balance), tone: 'good' },
      r.type && { text: r.type, tone: 'muted' },
      r.inTotal === false && { text: 'Not in total', tone: 'muted' },
      r.asOf && { text: `Updated ${relDay(r.asOf)}`, tone: daysUntil(r.asOf) < -30 ? 'warn' : 'muted' },
    ],
    subtitle: (r) => r.notes,
    actions: [
      {
        label: 'Update balance',
        run: async (r) => {
          const v = window.prompt(`Current balance in ${r.name} (₹)`, String(r.balance ?? ''));
          if (v === null) return;
          const balance = Number(String(v).replace(/[^\d.-]/g, ''));
          if (isNaN(balance)) return;
          await updateRecord('accounts', r.id, { balance, asOf: todayStr() });
        },
      },
    ],
  },

  // ---------------- 3c. Savings goals ----------------
  goals: {
    label: 'Goals',
    singular: 'savings goal',
    title: (r) => r.name,
    fields: [
      { key: 'name', label: 'Goal', type: 'text', required: true, placeholder: 'e.g. Emergency fund, Laptop, Wedding' },
      { key: 'targetAmount', label: 'Target amount (₹)', type: 'money', required: true },
      { key: 'targetDate', label: 'Target date', type: 'date' },
      { key: 'source', label: 'Money will come from', type: 'ref', targets: ['income', 'accounts'], help: 'Pick an income source or account.' },
      { key: 'sourceNote', label: 'Source note', type: 'text', placeholder: 'e.g. 20% of every freelance payment' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY, default: 'P2' },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Paused', 'Achieved'], default: 'Active' },
      { key: 'startAmount', label: 'Already saved (₹)', type: 'money', default: 0 },
      {
        key: 'contributions',
        label: 'Money added',
        type: 'sublist',
        itemLabel: 'deposit',
        fields: [
          { key: 'date', label: 'Date', type: 'date', default: () => todayStr() },
          { key: 'amount', label: 'Amount (₹)', type: 'money' },
          { key: 'note', label: 'Note', type: 'text' },
        ],
      },
    ],
    filters: { key: 'status', options: ['Active', 'Paused', 'Achieved'], default: 'Active' },
    sort: (a, b) => ORDER(PRIORITY)(a.priority) - ORDER(PRIORITY)(b.priority) || byDate('targetDate')(a, b),
    meta: (r) => {
      const g = goalProgress(r);
      return [
        { text: `${inr(g.saved)} of ${inr(g.target)} · ${g.pct}%`, tone: g.done ? 'good' : 'muted' },
        g.perMonth && { text: `${inr(g.perMonth)}/month needed`, tone: 'warn' },
        r.targetDate && !g.done && dueChip(r.targetDate, 'By'),
        g.done && { text: 'Achieved', tone: 'good' },
      ];
    },
    progress: (r) => goalProgress(r).pct,
    subtitle: (r) => r.sourceNote,
    beforeSave: (r) => {
      if (goalProgress(r).done && r.status === 'Active') r.status = 'Achieved';
      return r;
    },
    actions: [
      {
        label: 'Add money',
        show: (r) => r.status !== 'Achieved',
        run: async (r) => {
          const v = window.prompt(`Amount added to "${r.name}" (₹)`, '');
          if (v === null) return;
          const amount = Number(String(v).replace(/[^\d.]/g, ''));
          if (!amount) return;
          const contributions = [...(r.contributions || []), { date: todayStr(), amount, note: '' }];
          const changes = { contributions };
          if (goalProgress({ ...r, contributions }).done) changes.status = 'Achieved';
          await updateRecord('goals', r.id, changes);
        },
      },
    ],
  },

  // ---------------- 3d. Monthly budget ----------------
  budget: {
    label: 'Budget',
    singular: 'budget item',
    title: (r) => r.item,
    fields: [
      { key: 'item', label: 'Item', type: 'text', required: true, placeholder: 'e.g. Rent, Groceries, Phone, Travel' },
      { key: 'amount', label: 'Amount per month (₹)', type: 'money', required: true },
      { key: 'category', label: 'Category', type: 'select', options: ['Home', 'Food', 'Travel', 'Bills', 'Family', 'Bhakti / Seva', 'Health', 'Personal', 'Other'] },
      { key: 'essential', label: 'Needed to survive', type: 'bool', default: true, help: 'Off = nice-to-have. Survival budget counts only essentials.' },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
    filters: { key: '_kind', options: ['Essential', 'Nice-to-have'], get: (r) => (r.essential === false ? 'Nice-to-have' : 'Essential') },
    sort: (a, b) => Number(a.essential === false) - Number(b.essential === false) || (Number(b.amount) || 0) - (Number(a.amount) || 0),
    meta: (r) => [
      { text: `${inr(r.amount)}/month`, tone: 'muted' },
      r.category && { text: r.category, tone: 'muted' },
      { text: r.essential === false ? 'Nice-to-have' : 'Essential', tone: r.essential === false ? 'muted' : 'warn' },
    ],
    subtitle: (r) => r.notes,
  },

  // ---------------- 3e. Income ----------------
  income: {
    label: 'Income',
    singular: 'income source',
    title: (r) => r.source,
    fields: [
      { key: 'source', label: 'Source', type: 'text', required: true, placeholder: 'e.g. Freelance client, Salary, Tripa' },
      { key: 'type', label: 'Type', type: 'select', options: ['Salary', 'Freelance', 'Business', 'Rent', 'Other'] },
      { key: 'amount', label: 'Amount per month (₹)', type: 'money', required: true, help: 'For irregular income, use a realistic monthly average.' },
      { key: 'status', label: 'Status', type: 'select', options: ['Active', 'Expected', 'Ended'], default: 'Active', help: 'Only Active income counts in totals.' },
      { key: 'payDay', label: 'Usually paid on day', type: 'number', min: 1, max: 31 },
      { key: 'notes', label: 'Notes', type: 'text' },
    ],
    filters: { key: 'status', options: ['Active', 'Expected', 'Ended'] },
    sort: (a, b) => ORDER(['Active', 'Expected', 'Ended'])(a.status) - ORDER(['Active', 'Expected', 'Ended'])(b.status) || (Number(b.amount) || 0) - (Number(a.amount) || 0),
    meta: (r) => [
      { text: `${inr(r.amount)}/month`, tone: r.status === 'Active' ? 'good' : 'muted' },
      r.type && { text: r.type, tone: 'muted' },
      r.status !== 'Active' && { text: r.status, tone: 'muted' },
      r.payDay && { text: `Paid ~${r.payDay}th`, tone: 'muted' },
    ],
    subtitle: (r) => r.notes,
  },

  // ---------------- 4. Learn ----------------
  learn: {
    label: 'Learn',
    singular: 'topic',
    title: (r) => r.topic,
    fields: [
      { key: 'topic', label: 'Topic', type: 'text', required: true },
      { key: 'why', label: 'Why', type: 'text', placeholder: 'The goal or project it serves' },
      { key: 'category', label: 'Category', type: 'select', options: ['Tech', 'Business', 'Marketing', 'Spiritual', 'Life skill'] },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY, default: 'P2' },
      { key: 'status', label: 'Status', type: 'select', options: ['Queue', 'Learning', 'Paused', 'Done'], default: 'Queue', required: true },
      { key: 'project', label: 'Serves project', type: 'ref', targets: ['projects'] },
      {
        key: 'resources',
        label: 'Resources',
        type: 'sublist',
        itemLabel: 'resource',
        fields: [
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'url', label: 'Link', type: 'url' },
        ],
      },
      { key: 'hours', label: 'Hours spent', type: 'number', min: 0, step: 0.5 },
      { key: 'targetDate', label: 'Target date', type: 'date' },
      { key: 'proof', label: 'Proof', type: 'textarea', placeholder: 'What you built or wrote with it', help: 'Required to mark Done.' },
    ],
    filters: { key: 'status', options: ['Queue', 'Learning', 'Paused', 'Done'] },
    sort: (a, b) =>
      ORDER(['Learning', 'Queue', 'Paused', 'Done'])(a.status) - ORDER(['Learning', 'Queue', 'Paused', 'Done'])(b.status) ||
      ORDER(PRIORITY)(a.priority) - ORDER(PRIORITY)(b.priority),
    meta: (r) => [
      { text: r.status, tone: r.status === 'Learning' ? 'good' : 'muted' },
      r.priority && { text: r.priority, tone: 'muted' },
      Number(r.hours) > 0 && { text: `${r.hours} h`, tone: 'muted' },
      r.status !== 'Done' && dueChip(r.targetDate, 'Target'),
    ],
    subtitle: (r) => r.why,
    actions: [
      {
        label: '+1 hour',
        show: (r) => r.status === 'Learning',
        run: (r) => updateRecord('learn', r.id, { hours: (Number(r.hours) || 0) + 1 }),
      },
    ],
    validate: (r, prev, all) => {
      const errors = [];
      const warnings = [];
      if (r.status === 'Done' && !r.proof) errors.push('Done needs proof — what did you build or write with it? Watching a course is not done.');
      if (r.status === 'Learning' && (!prev || prev.status !== 'Learning')) {
        const n = all.filter((x) => x.status === 'Learning' && x.id !== r.id).length;
        if (n >= 2) warnings.push(`You are already learning ${n} topics. The limit is 2.`);
      }
      return { errors, warnings };
    },
  },

  // ---------------- 5. Try ----------------
  tryItems: {
    label: 'Try',
    singular: 'thing to try',
    title: (r) => r.idea,
    fields: [
      { key: 'idea', label: 'Idea', type: 'text', required: true },
      { key: 'category', label: 'Category', type: 'select', options: ['Food', 'Place', 'Habit', 'Skill', 'Experience', 'Tool'] },
      { key: 'effort', label: 'Effort', type: 'select', options: ['Small', 'Medium', 'Big'], default: 'Small' },
      { key: 'cost', label: 'Cost (₹)', type: 'money' },
      { key: 'when', label: 'When', type: 'select', options: ['This week', 'This month', 'Someday'], default: 'Someday' },
      { key: 'status', label: 'Status', type: 'select', options: ['Not tried', 'Tried'], default: 'Not tried' },
      { key: 'triedOn', label: 'Tried on', type: 'date', showIf: (r) => r.status === 'Tried' },
      { key: 'rating', label: 'Rating', type: 'rating', showIf: (r) => r.status === 'Tried' },
      { key: 'repeat', label: 'Would repeat?', type: 'select', options: ['Yes', 'No'], showIf: (r) => r.status === 'Tried' },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'What you learned' },
    ],
    filters: { key: 'status', options: ['Not tried', 'Tried'], default: 'Not tried' },
    sort: (a, b) => ORDER(['This week', 'This month', 'Someday'])(a.when) - ORDER(['This week', 'This month', 'Someday'])(b.when),
    meta: (r) => [
      r.category && { text: r.category, tone: 'muted' },
      r.effort && { text: r.effort, tone: 'muted' },
      r.status === 'Tried' ? { text: r.rating ? `Tried · ${'★'.repeat(r.rating)}` : 'Tried', tone: 'good' } : r.when && { text: r.when, tone: r.when === 'This week' ? 'warn' : 'muted' },
      Number(r.cost) > 0 && { text: inr(r.cost), tone: 'muted' },
    ],
    subtitle: (r) => r.notes,
    beforeSave: (r, prev) => {
      if (r.status === 'Tried' && !r.triedOn) r.triedOn = todayStr();
      return r;
    },
  },

  // ---------------- 6. Journal ----------------
  journal: {
    label: 'Journal',
    singular: 'entry',
    title: (r) => `${fmtDate(r.date)}`,
    fields: [
      { key: 'date', label: 'Date', type: 'date', required: true, default: () => todayStr() },
      { key: 'entry', label: 'Entry', type: 'richtext', promptHint: true, placeholder: 'Write freely…' },
      { key: 'mood', label: 'Mood', type: 'rating' },
      { key: 'energy', label: 'Energy', type: 'rating' },
      { key: 'gratitude', label: 'Gratitude (3 lines)', type: 'textarea', rows: 3 },
      { key: 'win', label: 'Win of the day', type: 'text' },
      { key: 'lesson', label: 'Lesson', type: 'text' },
      { key: 'linkedTo', label: 'About', type: 'ref', targets: ['projects', 'people'] },
      { key: 'tags', label: 'Tags', type: 'tags' },
    ],
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''),
    meta: (r) => [
      r.mood && { text: `Mood ${r.mood}/5`, tone: r.mood >= 4 ? 'good' : r.mood <= 2 ? 'warn' : 'muted' },
      r.energy && { text: `Energy ${r.energy}/5`, tone: 'muted' },
      ...(r.tags || []).slice(0, 3).map((t) => ({ text: '#' + t, tone: 'muted' })),
    ],
    subtitle: (r) => toText(r.entry),
  },

  // ---------------- 7. Affirmations ----------------
  affirmations: {
    label: 'Affirmations',
    singular: 'affirmation',
    title: (r) => r.text,
    fields: [
      { key: 'text', label: 'Affirmation', type: 'textarea', rows: 3, required: true, placeholder: 'Present tense, first person — "I am…", "I have…"' },
      { key: 'area', label: 'Life area', type: 'select', options: ['Wealth', 'Career', 'Health', 'Bhakti', 'Relationships', 'Other'] },
      { key: 'linkedTo', label: 'Supports goal', type: 'ref', targets: ['projects', 'loans', 'learn'] },
      { key: 'active', label: 'Active', type: 'bool', default: true },
      { key: 'startDate', label: 'Start date', type: 'date', default: () => todayStr() },
      { key: 'timesRead', label: 'Times read', type: 'number', min: 0, default: 0 },
    ],
    filters: { key: '_active', options: ['Active', 'Retired'], default: 'Active', get: (r) => (r.active ? 'Active' : 'Retired') },
    sort: (a, b) => Number(!!b.active) - Number(!!a.active),
    meta: (r) => [
      r.area && { text: r.area, tone: 'muted' },
      { text: `Read ${r.timesRead || 0}×`, tone: 'muted' },
      !r.active && { text: 'Retired', tone: 'muted' },
    ],
    actions: [{ label: 'Read ✓', show: (r) => r.active, run: (r) => updateRecord('affirmations', r.id, { timesRead: (Number(r.timesRead) || 0) + 1 }) }],
    validate: (r, prev, all) => {
      const warnings = [];
      if (r.active && (!prev || !prev.active)) {
        const n = all.filter((a) => a.active && a.id !== r.id).length;
        if (n >= 5) warnings.push(`You already have ${n} active affirmations. Keep 3–5; retire one first?`);
      }
      return { errors: [], warnings };
    },
  },

  // ---------------- 8. Relationships ----------------
  people: {
    label: 'People',
    singular: 'person',
    title: (r) => r.name,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'relation', label: 'Relation', type: 'select', options: ['Family', 'Friend', 'Mentor', 'Colleague', 'Client', 'Other'] },
      { key: 'circle', label: 'Circle', type: 'select', options: ['Inner', 'Close', 'Network'], default: 'Close', help: 'Inner = weekly, Close = monthly, Network = quarterly.' },
      { key: 'rhythm', label: 'Contact rhythm', type: 'select', options: ['Auto (by circle)', 'Weekly', 'Monthly', 'Quarterly'], default: 'Auto (by circle)' },
      { key: 'channel', label: 'Preferred channel', type: 'select', options: ['Call', 'WhatsApp', 'Meet', 'Other'] },
      { key: 'phone', label: 'Phone', type: 'tel' },
      { key: 'lastContacted', label: 'Last contacted', type: 'date' },
      { key: 'birthday', label: 'Birthday', type: 'date' },
      { key: 'anniversary', label: 'Anniversary', type: 'date' },
      { key: 'remember', label: 'Remember', type: 'textarea', placeholder: 'Things they told you — plans, family, what matters to them' },
      {
        key: 'log',
        label: 'Interaction log',
        type: 'sublist',
        itemLabel: 'interaction',
        fields: [
          { key: 'date', label: 'Date', type: 'date', default: () => todayStr() },
          { key: 'note', label: 'Note', type: 'text' },
        ],
      },
    ],
    filters: { key: 'circle', options: ['Inner', 'Close', 'Network'] },
    sort: (a, b) => personNextDue(a).localeCompare(personNextDue(b)),
    meta: (r) => {
      const due = personNextDue(r);
      const n = daysUntil(due);
      return [
        r.circle && { text: r.circle, tone: 'muted' },
        { text: personRhythm(r), tone: 'muted' },
        { text: n < 0 ? `Overdue ${-n}d` : n === 0 ? 'Due today' : `Due ${fmtShort(due)}`, tone: n < 0 ? 'bad' : n <= 7 ? 'warn' : 'muted' },
        r.lastContacted && { text: `Last ${relDay(r.lastContacted)}`, tone: 'muted' },
      ];
    },
    subtitle: (r) => r.remember,
    actions: [
      {
        label: 'Call',
        show: (r) => !!r.phone,
        run: (r) => {
          window.location.href = `tel:${r.phone}`;
        },
      },
      {
        label: 'WhatsApp',
        show: (r) => !!r.phone,
        run: (r) => {
          const digits = String(r.phone).replace(/[^\d]/g, '');
          const num = digits.length === 10 ? '91' + digits : digits;
          window.open(`https://wa.me/${num}`, '_blank', 'noopener');
        },
      },
      {
        label: 'Contacted today',
        run: async (r) => {
          const note = window.prompt(`Quick note about this contact with ${r.name} (optional)`, '');
          if (note === null) return;
          await updateRecord('people', r.id, {
            lastContacted: todayStr(),
            log: [{ date: todayStr(), note }, ...(r.log || [])],
          });
        },
      },
    ],
  },

  // ---------------- 9. Links ----------------
  links: {
    label: 'Links',
    singular: 'link',
    title: (r) => r.title,
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'url', label: 'URL', type: 'url', required: true },
      { key: 'type', label: 'Type', type: 'select', options: ['Google Sheet', 'Google Doc', 'Drive folder', 'Website', 'Tool', 'Account', 'Repo', 'Other'] },
      { key: 'category', label: 'Category', type: 'select', options: ['Work', 'Finance', 'Bhakti', 'Learning', 'Personal'] },
      { key: 'linkedTo', label: 'Linked to', type: 'ref', targets: ['projects', 'people', 'loans', 'learn'] },
      { key: 'account', label: 'Account', type: 'text', placeholder: 'Which email/login — name only', help: 'Never store passwords or keys here. Use a password manager.' },
      { key: 'pinned', label: 'Pin to home screen', type: 'bool' },
      { key: 'notes', label: 'Notes', type: 'textarea', placeholder: 'What it is for' },
    ],
    filters: { key: 'type', options: ['Google Sheet', 'Google Doc', 'Drive folder', 'Website', 'Tool', 'Account', 'Repo', 'Other'] },
    sort: (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || (b.lastOpened || '').localeCompare(a.lastOpened || ''),
    meta: (r) => [
      r.pinned && { text: 'Pinned', tone: 'good' },
      r.type && { text: r.type, tone: 'muted' },
      r.category && { text: r.category, tone: 'muted' },
      (r.lastOpened ? daysSince(r.lastOpened) > 90 : daysSince(r.createdAt) > 90) && { text: 'Not opened in 90+ days', tone: 'warn' },
    ],
    subtitle: (r) => r.notes || r.url,
    actions: [{ label: 'Open', run: (r) => openLink(r) }],
    validate: (r) => {
      const text = `${r.account || ''} ${r.notes || ''}`.toLowerCase();
      const warnings = /pass(word)?\s*[:=]|pwd|api[_ -]?key|secret|token/.test(text)
        ? ['This looks like it contains a password or key. Store secrets in a password manager, not here.']
        : [];
      return { errors: [], warnings };
    },
  },
};

export function openLink(r) {
  updateRecord('links', r.id, { lastOpened: new Date().toISOString() });
  window.open(r.url, '_blank', 'noopener');
}

// Feature switches. Turn one back on by setting it to true — code and data are kept.
export const FEATURES = {
  sadhana: false, // daily sadhana log (Bhakti tab, home check-in, japa target)
};

// ---------------------------------------------------------------------------
export const MODULES = [
  { key: 'todo', label: 'To-do', icon: '☑', color: '#d0461f', tabs: ['todos'] },
  { key: 'projects', label: 'Projects', icon: '◆', color: '#c2571a', tabs: ['projects'] },
  {
    key: 'bhakti', // internal key — keeps existing data linked
    label: 'Nishkama',
    icon: '❀',
    color: '#b8860b',
    tabs: ['seva', ...(FEATURES.sadhana ? ['sadhana'] : []), 'bhaktiNotes', 'verses', 'bhaktiEvents'],
  },
  { key: 'finance', label: 'Finance', icon: '₹', color: '#2e7d5b', tabs: ['accounts', 'loans', 'goals', 'budget', 'income'] },
  { key: 'learn', label: 'Learn', icon: '✎', color: '#3b6ea8', tabs: ['learn'] },
  { key: 'try', label: 'Try', icon: '✦', color: '#8a4fb0', tabs: ['tryItems'] },
  { key: 'journal', label: 'Journal', icon: '❝', color: '#5c6b73', tabs: ['journal'], locked: true },
  { key: 'affirmations', label: 'Affirmations', icon: '☀', color: '#d18b00', tabs: ['affirmations'] },
  { key: 'people', label: 'Relationships', icon: '♥', color: '#c0395b', tabs: ['people'] },
  { key: 'links', label: 'Links', icon: '⛓', color: '#4a6fa5', tabs: ['links'] },
];

export const moduleOf = (collection) => MODULES.find((m) => m.tabs.includes(collection));

export function recordTitle(collection, r) {
  const def = COLLECTION_DEFS[collection];
  const t = def && def.title(r);
  return t ? String(t).split('\n')[0].slice(0, 80) : 'Untitled';
}
