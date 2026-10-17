// Cliente de la API propia. El token personal se pega una vez en Ajustes y
// vive en localStorage; el servidor lo compara con su env var VIGIA_TOKEN.

const KEY = 'vigia:token';

export function getToken() {
  return localStorage.getItem(KEY) || '';
}

export function saveToken(t) {
  if (t) localStorage.setItem(KEY, t);
  else localStorage.removeItem(KEY);
}

async function call(method, fn, body) {
  const token = getToken();
  const r = await fetch(`/api/store?fn=${fn}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(data.error || `HTTP ${r.status}`);
    e.status = r.status;
    throw e;
  }
  return data;
}

export const apiGetAll = () => call('GET', 'all');
export const apiSaveConfig = (config) => call('POST', 'config', { config });
export const apiTestTelegram = () => call('POST', 'test');
