// La API de la PWA: leerlo todo de un golpe, guardar la config y probar el
// canal de Telegram. Un solo usuario, un solo token (VIGIA_TOKEN): esto no es
// un sistema de cuentas, es la llave de mi propia puerta.

import { kvGetAlerts, kvGetJSON, kvMode, kvSetJSON } from './_lib/kv.js';
import { sendTelegram, telegramReady } from './_lib/telegram.js';

const EMPTY_CONFIG = { assets: [], rules: [] };

function authorized(req) {
  const token = process.env.VIGIA_TOKEN;
  // Sin token configurado: en dev local se deja pasar; en producción se
  // rechaza todo (endpoint mal desplegado, mejor cerrado que abierto).
  if (!token) return process.env.VIGIA_DEV === '1';
  return String(req.headers.authorization || '') === `Bearer ${token}`;
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'token inválido' });
  const fn = (req.query && req.query.fn) || '';
  try {
    if (req.method === 'GET' && fn === 'all') {
      const [config, state, alerts] = await Promise.all([
        kvGetJSON('config', EMPTY_CONFIG),
        kvGetJSON('state', { rules: {}, lastRunAt: null }),
        kvGetAlerts(),
      ]);
      return res.status(200).json({ config, state, alerts, kv: kvMode(), telegram: telegramReady() });
    }
    if (req.method === 'POST' && fn === 'config') {
      const config = req.body && req.body.config;
      if (!config || !Array.isArray(config.assets) || !Array.isArray(config.rules)) {
        return res.status(400).json({ error: 'config inválida' });
      }
      await kvSetJSON('config', config);
      return res.status(200).json({ ok: true });
    }
    if (req.method === 'POST' && fn === 'test') {
      await sendTelegram('Vigía: prueba de aviso. Si lees esto, el canal funciona.');
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'fn no soportada' });
  } catch (e) {
    return res.status(502).json({ error: String(e.message || e) });
  }
}
