// Modo local: todo vive en este dispositivo (localStorage), sin servidor ni cuentas.
// Mismo formato que el modo servidor ({ config, state, alerts }), así que pasar de uno a otro
// es mover un JSON. Las reglas se evalúan en la propia app cada vez que se actualizan los datos.

const KEY = 'vigia:local';
const MODE_KEY = 'vigia:modo';
const ALERTS_CAP = 200;

export const EMPTY = { config: { assets: [], rules: [] }, state: { rules: {}, lastRunAt: null }, alerts: [] };

// 'local' (por defecto) o 'servidor' (Upstash + cron + Telegram, cuando se configure)
export function getMode() {
  try { return localStorage.getItem(MODE_KEY) || 'local'; } catch { return 'local'; }
}
export function setMode(m) {
  try { localStorage.setItem(MODE_KEY, m); } catch {}
}

export function localRead() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(EMPTY);
    const d = JSON.parse(raw);
    return { config: d.config || EMPTY.config, state: d.state || EMPTY.state, alerts: d.alerts || [] };
  } catch {
    return structuredClone(EMPTY);
  }
}

export function localWrite(patch) {
  const next = { ...localRead(), ...patch };
  next.alerts = (next.alerts || []).slice(0, ALERTS_CAP);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

// Copia de seguridad: un fichero JSON que se puede volver a importar (o subir al servidor más adelante)
export function exportBackup() {
  return JSON.stringify({ app: 'vigia', version: 1, exportedAt: new Date().toISOString(), ...localRead() }, null, 2);
}

export function importBackup(text) {
  const d = JSON.parse(text);
  if (!d || !d.config || !Array.isArray(d.config.assets) || !Array.isArray(d.config.rules)) {
    throw new Error('no parece una copia de Vigía');
  }
  return localWrite({ config: d.config, state: d.state || EMPTY.state, alerts: d.alerts || [] });
}
