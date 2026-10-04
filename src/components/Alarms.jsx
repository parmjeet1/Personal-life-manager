// In-app alarms for to-do tasks: sound + vibration + system notification.
// Works while the app is open or recently backgrounded. For alarms when the app is
// fully closed, tasks can be added to the phone calendar (.ics) instead.
import { useEffect, useRef, useState } from 'react';
import { useCollection } from '../hooks';
import { updateRecord } from '../db';
import { todayStr } from '../utils';
import { alarmAt, inToday, doneToday, timeRange } from '../modules/todo';

let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Browsers only allow sound after a tap — unlock audio on the first interaction.
if (typeof window !== 'undefined') {
  const unlock = () => {
    ctx();
    window.removeEventListener('pointerdown', unlock);
  };
  window.addEventListener('pointerdown', unlock);
}

function beep(ac, at, freq) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  o.connect(g).connect(ac.destination);
  o.start(at);
  o.stop(at + 0.3);
}

// One ring cycle: three rising beeps.
export function ringOnce() {
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime + 0.05;
  beep(ac, t, 880);
  beep(ac, t + 0.3, 988);
  beep(ac, t + 0.6, 1175);
}

async function notify(task) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    const opts = {
      body: timeRange(task) ? `${timeRange(task)}${task.notes ? ' · ' + task.notes : ''}` : task.notes || 'Time to start',
      tag: 'task-' + task.id,
      renotify: true,
      silent: false,
      requireInteraction: true,
      vibrate: [400, 200, 400, 200, 400],
      icon: 'icon-192.png',
    };
    if (reg) reg.showNotification(`⏰ ${task.title}`, opts);
    else new Notification(`⏰ ${task.title}`, opts);
  } catch {
    /* notifications are best-effort */
  }
}

const firedKey = (t, at) => `alarm:${t.id}:${at.toISOString()}`;
const memFired = new Set();
function wasFired(k) {
  if (memFired.has(k)) return true;
  try {
    return localStorage.getItem(k) === '1';
  } catch {
    return false;
  }
}
function markFired(k) {
  memFired.add(k);
  try {
    localStorage.setItem(k, '1');
  } catch {
    /* private mode — memory only */
  }
}

export default function Alarms() {
  const todos = useCollection('todos');
  const [ringing, setRinging] = useState(null);
  const snoozes = useRef({}); // id -> Date
  const loop = useRef(null);

  // Check every 10 seconds, and immediately when the app comes back to the screen.
  // Android freezes web apps in the background, so alarms that passed while the
  // app was closed are shown as "missed" instead of being skipped silently.
  useEffect(() => {
    if (!todos) return;
    const check = () => {
      if (ringing) return;
      const now = new Date();
      const today = todayStr();
      for (const t of todos) {
        if (!inToday(t, today) || doneToday(t, today)) continue;
        const snooze = snoozes.current[t.id];
        const at = snooze || alarmAt(t, today);
        if (!at) continue;
        const late = now - at;
        if (late < 0) continue;
        const k = firedKey(t, at);
        if (wasFired(k)) continue;
        if (late < 5 * 60000) {
          markFired(k);
          delete snoozes.current[t.id];
          setRinging(t);
          notify(t);
          return;
        }
        // Missed: only if the alarm was set before it was due (not a task created later today).
        markFired(k);
        if (late < 12 * 3600000 && (!t.updatedAt || new Date(t.updatedAt) < at)) {
          setRinging({ ...t, _missed: at });
          return;
        }
      }
    };
    check();
    const id = setInterval(check, 10000);
    const onVis = () => document.visibilityState === 'visible' && check();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onVis);
    };
  }, [todos, ringing]);

  // Settings → "Test alarm in 10 seconds".
  useEffect(() => {
    const onTest = () => {
      const t = { id: 'test-' + Date.now(), title: 'Test alarm', notes: 'If you can see and hear this, alarms work.' };
      setRinging(t);
      notify(t);
    };
    window.addEventListener('majaagya:test-alarm', onTest);
    return () => window.removeEventListener('majaagya:test-alarm', onTest);
  }, []);

  // Ring and vibrate until handled (max 60 seconds).
  useEffect(() => {
    if (!ringing) return;
    if (ringing._missed) {
      ringOnce();
      navigator.vibrate?.(200);
      return;
    }
    let n = 0;
    ringOnce();
    navigator.vibrate?.([400, 200, 400, 200, 400]);
    loop.current = setInterval(() => {
      n++;
      if (n >= 30) return stop();
      ringOnce();
      if (n % 3 === 0) navigator.vibrate?.([400, 200, 400]);
    }, 2000);
    return () => clearInterval(loop.current);
  }, [ringing]);

  function stop() {
    clearInterval(loop.current);
    navigator.vibrate?.(0);
    setRinging(null);
  }

  if (!ringing) return null;
  return (
    <div className="sheet-backdrop alarm-backdrop">
      <div className="sheet alarm" role="alertdialog" aria-label="Task alarm">
        <div className="alarm-bell">{ringing._missed ? '🔕' : '⏰'}</div>
        {ringing._missed && (
          <div className="chip warn">Missed at {ringing._missed.toTimeString().slice(0, 5)} — app was closed</div>
        )}
        <div className="alarm-title">{ringing.title}</div>
        {timeRange(ringing) && <div className="muted">{timeRange(ringing)}</div>}
        {ringing.notes && <div className="small muted mt-s">{ringing.notes}</div>}
        <div className="alarm-actions">
          <button
            className="btn primary"
            onClick={() => {
              if (!String(ringing.id).startsWith('test-') && (!ringing.repeat || ringing.repeat === 'None')) {
                updateRecord('todos', ringing.id, { status: 'Doing' });
              }
              stop();
            }}
          >
            Start now
          </button>
          {!ringing._missed && (
            <button
              className="btn"
              onClick={() => {
                snoozes.current[ringing.id] = new Date(Date.now() + 5 * 60000);
                stop();
              }}
            >
              Snooze 5 min
            </button>
          )}
          <button className="btn ghost" onClick={stop}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
