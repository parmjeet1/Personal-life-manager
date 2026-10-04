// Small shared helpers. Dates are stored as 'YYYY-MM-DD' strings in local time.

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return todayStr(d);
}

// Whole days from today until date s (negative = past).
export function daysUntil(s) {
  if (!s) return null;
  const a = parseDate(todayStr());
  const b = parseDate(s);
  return Math.round((b - a) / 86400000);
}

export function daysSince(iso) {
  if (!iso) return null;
  return -daysUntil(iso.slice(0, 10));
}

export function fmtDate(s) {
  if (!s) return '';
  const d = parseDate(s);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtShort(s) {
  if (!s) return '';
  return parseDate(s).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function relDay(s) {
  const n = daysUntil(s);
  if (n === null) return '';
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}

export function inr(n) {
  const v = Number(n) || 0;
  return '₹' + v.toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

// Next occurrence (this year or next) of a yearly date like a birthday.
export function nextAnniversary(s) {
  if (!s) return null;
  const today = parseDate(todayStr());
  const d = parseDate(s);
  let next = new Date(today.getFullYear(), d.getMonth(), d.getDate());
  if (next < today) next = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
  return todayStr(next);
}

// ISO week key like '2026-W40', used for the weekly review checklist.
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function cls(...parts) {
  return parts.filter(Boolean).join(' ');
}
