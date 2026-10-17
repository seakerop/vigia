import { useRef, useState } from 'react';
import { useVigia } from '../lib/store.jsx';
import { getToken } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';

function LocalSettings() {
  const { notifPermission, enableNotifications, exportBackup, importBackup, config, alerts, lastUpdated } = useVigia();
  const fileRef = useRef(null);
  const [msg, setMsg] = useState(null);

  function download() {
    const blob = new Blob([exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `vigia-copia-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function onFile(e) {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (!confirm('Importar sustituye tus activos, reglas e histórico actuales por los de la copia. ¿Seguimos?')) return;
    try {
      await importBackup(await f.text());
      setMsg({ ok: true, text: 'Copia importada.' });
    } catch (err) {
      setMsg({ ok: false, text: `No se pudo importar: ${err.message}` });
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Estado</div>
        <div className="status-row"><span>Modo</span><span>en este dispositivo</span></div>
        <div className="status-row"><span>Vigilando</span><span>{config.assets.length} {config.assets.length === 1 ? 'activo' : 'activos'} · {config.rules.length} {config.rules.length === 1 ? 'regla' : 'reglas'}</span></div>
        <div className="status-row"><span>Avisos guardados</span><span>{alerts.length}</span></div>
        <div className="status-row"><span>Última actualización</span><span>{lastUpdated ? timeAgo(lastUpdated) : '—'}</span></div>
      </div>

      <div className="card">
        <div className="card-title">Notificaciones</div>
        <p className="form-hint">
          Cuando una regla salte mientras la app está abierta (o en segundo plano, según el móvil), te llega también una
          notificación del sistema. Con la app cerrada no puede avisar: para eso está el modo servidor con Telegram.
        </p>
        {notifPermission === 'granted' ? (
          <p className="test-ok">Activadas en este dispositivo.</p>
        ) : notifPermission === 'denied' ? (
          <p className="gate-error">Las has bloqueado para esta web. Se reactivan desde los ajustes del navegador.</p>
        ) : notifPermission === 'unsupported' ? (
          <p className="form-hint">Este navegador no admite notificaciones. En iPhone funcionan con la app añadida a la pantalla de inicio.</p>
        ) : (
          <button className="btn btn-primary" onClick={enableNotifications}>Activar notificaciones</button>
        )}
      </div>

      <div className="card">
        <div className="card-title">Copia de seguridad</div>
        <p className="form-hint">
          Tus activos, reglas e histórico viven solo en este navegador. Si borras sus datos o cambias de móvil, se pierden:
          descarga una copia de vez en cuando. También sirve para pasarlos al modo servidor más adelante.
        </p>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={download}>Descargar copia</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current && fileRef.current.click()}>Importar copia</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />
        </div>
        {msg && <p className={msg.ok ? 'test-ok' : 'gate-error'}>{msg.text}</p>}
      </div>

      <div className="card">
        <div className="card-title">Cómo vigila</div>
        <p className="about-text">
          Mientras la app está abierta, baja los precios cada 15 minutos (y al volver a ella), calcula los indicadores y
          comprueba tus reglas. Si una se cumple, te lo dice aquí con el contexto histórico: qué pasó las otras veces que
          esa misma regla habría saltado en ese activo. Una regla disparada no se repite: se rearma sola cuando el valor
          cruza de vuelta el umbral.
        </p>
        <p className="about-text">
          Vigía no opina, no recomienda y no toca ningún broker: solo lee precios públicos y vigila los umbrales que tú
          le pongas.
        </p>
      </div>
    </>
  );
}

function ServerSettings() {
  const { kv, telegramReady, cronState, config, applyToken, testTelegram, hasToken } = useVigia();
  const [token, setToken] = useState(getToken());
  const [savingToken, setSavingToken] = useState(false);
  const [testState, setTestState] = useState(null); // null | 'busy' | 'ok' | error

  async function saveTokenNow(e) {
    e.preventDefault();
    setSavingToken(true);
    await applyToken(token);
    setSavingToken(false);
  }

  async function runTest() {
    setTestState('busy');
    try {
      await testTelegram();
      setTestState('ok');
    } catch (e) {
      setTestState(String(e.message || e));
    }
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Acceso</div>
        <form onSubmit={saveTokenNow}>
          <label className="field">
            <span>Token personal</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={hasToken ? '••••••••' : 'Pega aquí tu VIGIA_TOKEN'} />
          </label>
          <button className="btn btn-ghost" disabled={savingToken}>{savingToken ? 'Guardando…' : 'Guardar token'}</button>
        </form>
        <p className="form-hint">El mismo valor que la variable VIGIA_TOKEN del servidor. Se guarda solo en este dispositivo.</p>
      </div>

      <div className="card">
        <div className="card-title">Estado</div>
        <div className="status-row"><span>Almacén</span><span>{kv === 'upstash' ? 'Upstash Redis' : 'fichero local (desarrollo)'}</span></div>
        <div className="status-row"><span>Telegram</span><span>{telegramReady ? 'configurado' : 'sin configurar en el servidor'}</span></div>
        <div className="status-row"><span>Última pasada del cron</span><span>{cronState.lastRunAt ? timeAgo(cronState.lastRunAt) : 'ninguna todavía'}</span></div>
        <div className="status-row"><span>Vigilando</span><span>{config.assets.length} {config.assets.length === 1 ? 'activo' : 'activos'} · {config.rules.length} {config.rules.length === 1 ? 'regla' : 'reglas'}</span></div>
      </div>

      <div className="card">
        <div className="card-title">Probar el aviso</div>
        <p className="form-hint">
          Manda un mensaje de prueba por el bot de Telegram, con las credenciales que viven en el servidor. Si te llega al
          móvil, los avisos de verdad también llegarán.
        </p>
        <button className="btn btn-primary" onClick={runTest} disabled={testState === 'busy'}>{testState === 'busy' ? 'Enviando…' : 'Enviar prueba a Telegram'}</button>
        {testState === 'ok' && <p className="test-ok">Enviado. Mira el móvil.</p>}
        {testState && testState !== 'ok' && testState !== 'busy' && <p className="gate-error">{testState}</p>}
      </div>

      <div className="card">
        <div className="card-title">Cómo vigila</div>
        <p className="about-text">
          Un workflow de GitHub Actions se despierta cada dos horas, baja las velas de cada activo, calcula los indicadores
          con el mismo código que ves aquí y evalúa tus reglas. Si una se cumple, Telegram, con el contexto histórico de la
          regla. Una regla disparada no se repite: se rearma sola cuando el valor cruza de vuelta el umbral.
        </p>
      </div>
    </>
  );
}

export default function Settings({ onBack }) {
  const { mode, switchMode } = useVigia();
  return (
    <>
      <div className="view-head">
        <button className="btn-icon" aria-label="Volver" onClick={onBack}>←</button>
        <div className="view-title">Ajustes</div>
      </div>

      {mode === 'local' ? <LocalSettings /> : <ServerSettings />}

      <div className="card">
        <div className="card-title">Modo</div>
        {mode === 'local' ? (
          <>
            <p className="form-hint">
              Ahora mismo todo vive en este dispositivo. El modo servidor guarda las reglas en Upstash, las comprueba un cron
              cada dos horas aunque tengas el móvil apagado y avisa por Telegram. Necesita configurar esas cuentas antes.
            </p>
            <button className="btn btn-ghost" onClick={() => { if (confirm('El modo servidor usa otras reglas (las del servidor). Las de este dispositivo se quedan guardadas aquí. ¿Cambiamos?')) switchMode('servidor'); }}>
              Pasar a modo servidor
            </button>
          </>
        ) : (
          <>
            <p className="form-hint">Las reglas viven en el servidor y avisa Telegram. Puedes volver al modo de este dispositivo cuando quieras.</p>
            <button className="btn btn-ghost" onClick={() => switchMode('local')}>Volver al modo de este dispositivo</button>
          </>
        )}
      </div>
    </>
  );
}
