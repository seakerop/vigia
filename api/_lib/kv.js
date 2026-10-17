// Almacén compartido entre la PWA (vía api/store.js) y el cron (check.mjs).
// En producción es Upstash Redis por su API REST; en local, sin credenciales,
// un fichero .data/dev-store.json hace de Redis de mesa para poder probar el
// ciclo completo sin darse de alta en nada.
//
// Reparto de escrituras pensado para no pisarse: la PWA solo escribe `config`
// (activos y reglas); el cron solo escribe `state` (runtime de las reglas) y
// `alerts` (histórico, lista con tope).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILE = fileURLToPath(new URL('../../.data/dev-store.json', import.meta.url));
const ALERTS_CAP = 200;

function restCreds() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function kvMode() {
  return restCreds() ? 'upstash' : 'file';
}

async function pipeline(commands) {
  const { url, token } = restCreds();
  const r = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`upstash ${r.status}`);
  const out = await r.json();
  const bad = out.find((x) => x.error);
  if (bad) throw new Error(`upstash: ${bad.error}`);
  return out.map((x) => x.result);
}

function fileRead() {
  try {
    return JSON.parse(readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function fileWrite(db) {
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export async function kvGetJSON(key, fallback = null) {
  if (!restCreds()) {
    const db = fileRead();
    return key in db ? db[key] : fallback;
  }
  const [raw] = await pipeline([['GET', key]]);
  return raw ? JSON.parse(raw) : fallback;
}

export async function kvSetJSON(key, value) {
  if (!restCreds()) {
    const db = fileRead();
    db[key] = value;
    fileWrite(db);
    return;
  }
  await pipeline([['SET', key, JSON.stringify(value)]]);
}

// Añade avisos al histórico (los más nuevos primero) y recorta al tope.
export async function kvPushAlerts(alerts) {
  if (!alerts.length) return;
  if (!restCreds()) {
    const db = fileRead();
    db.alerts = [...alerts.slice().reverse(), ...(db.alerts || [])].slice(0, ALERTS_CAP);
    fileWrite(db);
    return;
  }
  await pipeline([
    ...alerts.map((a) => ['LPUSH', 'alerts', JSON.stringify(a)]),
    ['LTRIM', 'alerts', '0', String(ALERTS_CAP - 1)],
  ]);
}

export async function kvGetAlerts() {
  if (!restCreds()) {
    return fileRead().alerts || [];
  }
  const [items] = await pipeline([['LRANGE', 'alerts', '0', String(ALERTS_CAP - 1)]]);
  return (items || []).map((x) => JSON.parse(x));
}
