import { useEffect, useRef, useState } from 'react';
import { useMeta, go } from '../hooks';
import { setMeta, exportAll, downloadJson, importAll, requestPersistence } from '../db';
import { MODULES } from '../modules/config';
import { fmtDate, relDay, sha256 } from '../utils';

export default function Settings() {
  const enabled = useMeta('enabledModules', null);
  const lastBackup = useMeta('lastBackupAt', null);
  const japaTarget = useMeta('japaTarget', 16);
  const pinHash = useMeta('journalPinHash', null);
  const [persisted, setPersisted] = useState(null);
  const [msg, setMsg] = useState('');
  const fileRef = useRef();

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted);
  }, []);

  const current = enabled || MODULES.map((m) => m.key);
  const toggleModule = (k) => {
    const next = current.includes(k) ? current.filter((x) => x !== k) : [...current, k];
    if (next.length === 0) return;
    setMeta('enabledModules', MODULES.map((m) => m.key).filter((x) => next.includes(x)));
  };

  async function onImport(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (!window.confirm(`Import backup from ${payload.exportedAt ? fmtDate(payload.exportedAt.slice(0, 10)) : 'unknown date'}? Newer versions of each item are kept; nothing is deleted.`)) return;
      const r = await importAll(payload);
      setMsg(`Imported: ${r.added} new, ${r.updated} updated.`);
    } catch (err) {
      setMsg('Import failed: ' + err.message);
    }
  }

  async function setPin() {
    if (pinHash) {
      const old = window.prompt('Current PIN');
      if (old === null) return;
      if ((await sha256(old)) !== pinHash) return setMsg('Wrong current PIN.');
    }
    const pin = window.prompt('New PIN (4+ digits)');
    if (pin === null) return;
    if (!/^\d{4,}$/.test(pin)) return setMsg('PIN must be at least 4 digits.');
    const again = window.prompt('Repeat new PIN');
    if (again !== pin) return setMsg('PINs did not match.');
    await setMeta('journalPinHash', await sha256(pin));
    setMsg('Journal PIN set.');
  }

  async function removePin() {
    const old = window.prompt('Current PIN');
    if (old === null) return;
    if ((await sha256(old)) !== pinHash) return setMsg('Wrong PIN.');
    await setMeta('journalPinHash', null);
    setMsg('Journal PIN removed.');
  }

  async function forgotPin() {
    const v = window.prompt('Type RESET to remove the journal PIN. Your entries are kept.');
    if (v !== 'RESET') return;
    await setMeta('journalPinHash', null);
    setMsg('Journal PIN removed.');
  }

  return (
    <div className="screen">
      <h1>Settings</h1>
      {msg && (
        <div className="notice" role="status" onClick={() => setMsg('')}>
          {msg}
        </div>
      )}

      <section className="card">
        <h2 className="section-title">Backup</h2>
        <p className="small">
          Last backup: <b>{lastBackup ? `${fmtDate(lastBackup.slice(0, 10))} (${relDay(lastBackup.slice(0, 10))})` : 'never'}</b>
        </p>
        <p className="small muted">Your data lives only on this device. Export weekly and keep the file in Google Drive.</p>
        <div className="row gap-s wrap">
          <button className="btn primary" onClick={async () => downloadJson(await exportAll())}>
            Export JSON
          </button>
          <button className="btn" onClick={() => fileRef.current.click()}>
            Import JSON
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onImport} />
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Storage</h2>
        <p className="small">
          {persisted
            ? 'Protected: the browser will not clear this data on its own.'
            : 'Not protected yet: the browser may clear data if space runs low. Install the app to the home screen, then tap Protect.'}
        </p>
        {!persisted && (
          <button className="btn small" onClick={async () => setPersisted(await requestPersistence())}>
            Protect my data
          </button>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Modules</h2>
        <p className="small muted">Turn off what you don’t use. Data is kept.</p>
        {MODULES.map((m) => (
          <label key={m.key} className="toggle row-between">
            <span>
              <span className="module-icon small" style={{ background: m.color }}>
                {m.icon}
              </span>{' '}
              {m.label}
            </span>
            <span className="row gap-s">
              <input type="checkbox" checked={current.includes(m.key)} onChange={() => toggleModule(m.key)} />
              <span className="track" />
            </span>
          </label>
        ))}
      </section>

      <section className="card">
        <h2 className="section-title">Bhakti</h2>
        <label className="field">
          <span className="field-label">Daily japa target (rounds)</span>
          <input type="number" inputMode="numeric" min="1" value={japaTarget ?? 16} onChange={(e) => setMeta('japaTarget', Number(e.target.value) || 16)} />
        </label>
      </section>

      <section className="card">
        <h2 className="section-title">Journal PIN</h2>
        <p className="small muted">{pinHash ? 'Journal is locked with a PIN.' : 'No PIN set.'}</p>
        <div className="row gap-s wrap">
          <button className="btn small" onClick={setPin}>
            {pinHash ? 'Change PIN' : 'Set PIN'}
          </button>
          {pinHash && (
            <>
              <button className="btn ghost small" onClick={removePin}>
                Remove PIN
              </button>
              <button className="btn ghost small" onClick={forgotPin}>
                Forgot PIN
              </button>
            </>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Archive</h2>
        <p className="small muted">Archived items are hidden everywhere but can be restored.</p>
        <button className="btn small" onClick={() => go('/archive')}>
          Open archive
        </button>
      </section>

      <section className="card">
        <h2 className="section-title">Install on phone</h2>
        <p className="small">
          Android (Chrome): menu ⋮ → <b>Install app</b> / <b>Add to Home screen</b>. iPhone (Safari): Share → <b>Add to Home Screen</b>. After that it opens like an app and works offline.
        </p>
      </section>

      <p className="small muted center">Majaagya v0.1 · data stays on this device</p>
    </div>
  );
}
