import { useState } from 'react';
import { useMeta } from '../hooks';
import { sha256 } from '../utils';

// Unlock lasts until the app is closed or reloaded.
let unlocked = false;

export default function PinGate({ children }) {
  const hash = useMeta('journalPinHash', undefined);
  const [ok, setOk] = useState(unlocked);
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');

  if (hash === undefined) return null; // loading
  if (!hash || ok) return children;

  async function check(e) {
    e.preventDefault();
    if ((await sha256(pin)) === hash) {
      unlocked = true;
      setOk(true);
    } else {
      setErr('Wrong PIN.');
      setPin('');
    }
  }

  return (
    <form className="screen pin-gate" onSubmit={check}>
      <div className="pin-lock">🔒</div>
      <h2>Journal is locked</h2>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus
        placeholder="Enter PIN"
        value={pin}
        onChange={(e) => {
          setPin(e.target.value);
          setErr('');
        }}
      />
      {err && <div className="text-bad">{err}</div>}
      <button className="btn primary" type="submit">
        Unlock
      </button>
      <p className="small muted">This PIN keeps casual eyes out of your journal. Forgot it? Settings → Journal PIN → Forgot PIN.</p>
    </form>
  );
}
