// To-do rules: what shows today, done-state for repeating tasks, alarms, calendar export.
import { todayStr, parseDate } from '../utils';
import { updateRecord } from '../db';

export const REPEATS = ['None', 'Daily', 'Weekdays'];
export const ALARM_BEFORE = { 'At start time': 0, '5 min before': 5, '10 min before': 10, '15 min before': 15, '30 min before': 30 };

const isWeekday = (d = new Date()) => d.getDay() >= 1 && d.getDay() <= 5;
export const isRepeating = (t) => t.repeat === 'Daily' || t.repeat === 'Weekdays';

export function doneToday(t, today = todayStr()) {
  if (isRepeating(t)) return (t.doneDates || []).includes(today);
  return t.status === 'Done';
}

// Shows in today's queue: repeating tasks due today, undated tasks,
// tasks dated today, and overdue tasks carried over.
export function inToday(t, today = todayStr()) {
  if (t.repeat === 'Daily') return true;
  if (t.repeat === 'Weekdays') return isWeekday(parseDate(today));
  if (t.status === 'Done') return (t.completedAt || '').slice(0, 10) === today;
  return !t.date || t.date <= today;
}

export const isOverdue = (t, today = todayStr()) => !isRepeating(t) && t.status !== 'Done' && t.date && t.date < today;

export function quadrant(t) {
  if (t.urgent && t.important) return 'Do now';
  if (!t.urgent && t.important) return 'Schedule';
  if (t.urgent && !t.important) return 'Delegate / quick';
  return 'Later / drop';
}

export function timeRange(t) {
  if (!t.startTime) return '';
  return t.endTime ? `${t.startTime}–${t.endTime}` : t.startTime;
}

// Is the current time inside the task's start–end window?
export function isNow(t, now = new Date()) {
  if (!t.startTime) return false;
  const hm = now.toTimeString().slice(0, 5);
  return hm >= t.startTime && hm < (t.endTime || t.startTime);
}

export function alarmAt(t, today = todayStr()) {
  if (!t.alarm || !t.startTime) return null;
  const [h, m] = t.startTime.split(':').map(Number);
  const d = parseDate(today);
  d.setHours(h, m - (ALARM_BEFORE[t.alarmBefore] || 0), 0, 0);
  return d;
}

export async function toggleDone(t) {
  const today = todayStr();
  if (isRepeating(t)) {
    const set = new Set(t.doneDates || []);
    if (set.has(today)) set.delete(today);
    else set.add(today);
    // keep the last 400 days only
    const doneDates = [...set].sort().slice(-400);
    return updateRecord('todos', t.id, { doneDates });
  }
  const done = t.status !== 'Done';
  return updateRecord('todos', t.id, {
    status: done ? 'Done' : 'To do',
    completedAt: done ? new Date().toISOString() : null,
  });
}

// ---------- Calendar (.ics) — the reliable alarm, rings even when the app is closed ----------

const pad = (n) => String(n).padStart(2, '0');
const icsLocal = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const esc = (s) => String(s || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');

export function icsFor(t) {
  const day = t.date && !isRepeating(t) ? t.date : todayStr();
  const start = parseDate(day);
  const [sh, sm] = (t.startTime || '09:00').split(':').map(Number);
  start.setHours(sh, sm, 0, 0);
  const end = new Date(start);
  if (t.endTime) {
    const [eh, em] = t.endTime.split(':').map(Number);
    end.setHours(eh, em, 0, 0);
    if (end <= start) end.setTime(start.getTime() + 30 * 60000);
  } else end.setTime(start.getTime() + 30 * 60000);
  const before = ALARM_BEFORE[t.alarmBefore] || 0;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Majaagya//To-do//EN',
    'BEGIN:VEVENT',
    `UID:${t.id}@majaagya`,
    `DTSTAMP:${icsLocal(new Date())}`,
    `DTSTART:${icsLocal(start)}`,
    `DTEND:${icsLocal(end)}`,
    `SUMMARY:${esc(t.title)}`,
    t.notes ? `DESCRIPTION:${esc(t.notes)}` : null,
    t.repeat === 'Daily' ? 'RRULE:FREQ=DAILY' : null,
    t.repeat === 'Weekdays' ? 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' : null,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(t.title)}`,
    `TRIGGER:-PT${before}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.join('\r\n');
}

export function downloadIcs(t) {
  const blob = new Blob([icsFor(t)], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(t.title || 'task').replace(/[^\w-]+/g, '-').slice(0, 40)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
