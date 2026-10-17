import { useState } from 'react';
import { useVigia } from '../lib/store.jsx';

// Pantalla de entrada cuando el servidor rechaza el token (o no hay ninguno
// guardado). Un solo usuario, una sola llave: se pega una vez y listo.
export default function TokenGate() {
  const { applyToken } = useVigia();
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setFailed(false);
    await applyToken(token);
    // si el token era bueno, el provider sale de needsToken y esta pantalla
    // desaparece sola; si seguimos aquí, era malo
    setBusy(false);
    setFailed(true);
  }

  return (
    <div className="gate">
      <div className="gate-brand">
        <span className="brand-mark">◉</span> Vigía
      </div>
      <p className="gate-text">
        Pega tu token personal para entrar. Es el mismo valor que pusiste en la variable{' '}
        <code>VIGIA_TOKEN</code> del servidor.
      </p>
      <form onSubmit={submit} className="gate-form">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Token personal"
          autoFocus
        />
        <button className="btn btn-primary" disabled={busy || !token.trim()}>
          {busy ? 'Comprobando…' : 'Entrar'}
        </button>
      </form>
      {failed && !busy && <p className="gate-error">Ese token no abre esta puerta. Revísalo y prueba otra vez.</p>}
    </div>
  );
}
