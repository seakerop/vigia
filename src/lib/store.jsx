// Estado global de Vigía: la config (activos + reglas), el estado de cada regla, el histórico de avisos y los
// datos de mercado que la app baja por su cuenta para pintar (mismos módulos core que usa el cron: lo que ves
// en pantalla es lo que el vigía evalúa).
//
// Dos modos:
//   - local (por defecto): todo vive en este dispositivo y la propia app comprueba las reglas cada vez que
//     se actualiza. No necesita servidor ni cuentas; solo avisa mientras la app está abierta.
//   - servidor: config en Upstash, un cron en GitHub Actions comprueba cada 2 horas y avisa por Telegram.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiGetAll, apiSaveConfig, apiTestTelegram, getToken, saveToken } from './api.js';
import { exportBackup, getMode, importBackup, localRead, localWrite, setMode } from './local.js';
import { fetchCandles, fetchHistory, closesOf } from '../core/market.js';
import { evaluateAll } from '../core/evaluate.js';
import { backtestRule, contextSentence } from '../core/history.js';

const Ctx = createContext(null);

const EMPTY_CONFIG = { assets: [], rules: [] };
const TIMEFRAMES = ['1d', '1w'];
const AUTO_REFRESH_MS = 15 * 60 * 1000; // con la app abierta y visible
const STALE_MS = 5 * 60 * 1000; // al volver a la app, se refresca si los datos tienen más de 5 minutos

// Notificación del sistema (solo si se ha dado permiso). Con el service worker se ve también con la app en
// segundo plano; sin él, solo mientras está en primer plano.
async function notify(alert) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const title = `Vigía · ${alert.label}`;
  const body = `${alert.rule}${alert.context ? `\n${alert.context}` : ''}`;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) await reg.showNotification(title, { body, icon: '/icon.svg', tag: alert.id });
    else new Notification(title, { body, icon: '/icon.svg' });
  } catch {}
}

export function VigiaProvider({ children }) {
  const [mode, setModeState] = useState(getMode());
  const [data, setData] = useState(null); // { config, state, alerts, kv, telegram }
  const [market, setMarket] = useState({}); // 'assetId:tf' → { candles, closes }
  const [marketErrors, setMarketErrors] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [newAlerts, setNewAlerts] = useState([]); // avisos de esta sesión aún sin ver
  const [notifPermission, setNotifPermission] = useState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const configRef = useRef(EMPTY_CONFIG);
  const marketRef = useRef({});
  const lastUpdatedRef = useRef(0);
  const local = mode === 'local';

  // Historia larga para el probador de reglas: se baja solo cuando hace falta y una vez por sesión
  // ('assetId:tf' → promesa de velas), porque son años de datos.
  const historyRef = useRef(new Map());
  const loadHistory = useCallback((asset, tf) => {
    const key = `${asset.id}:${tf}`;
    if (!historyRef.current.has(key)) {
      const p = fetchHistory(asset, tf);
      p.catch(() => historyRef.current.delete(key)); // si falla, que se pueda reintentar
      historyRef.current.set(key, p);
    }
    return historyRef.current.get(key);
  }, []);

  const loadMarket = useCallback(async (assets) => {
    const jobs = [];
    for (const asset of assets) {
      for (const tf of TIMEFRAMES) {
        jobs.push(
          fetchCandles(asset, tf)
            .then((candles) => ({ key: `${asset.id}:${tf}`, candles }))
            .catch((e) => ({ key: `${asset.id}:${tf}`, error: String(e.message || e) }))
        );
      }
    }
    const results = await Promise.all(jobs);
    const next = {};
    const errs = {};
    for (const r of results) {
      if (r.candles) next[r.key] = { candles: r.candles, closes: closesOf(r.candles) };
      else errs[r.key] = r.error;
    }
    marketRef.current = next;
    setMarket(next);
    setMarketErrors(errs);
    lastUpdatedRef.current = Date.now();
    setLastUpdated(new Date().toISOString());
    return next;
  }, []);

  // Modo local: la pasada del vigía la hace la propia app con los datos recién bajados.
  // El contexto histórico de cada aviso se calcula después, sin bloquear.
  const runLocalCheck = useCallback(
    (mkt) => {
      const stored = localRead();
      const { state, fired } = evaluateAll({ config: configRef.current, state: stored.state, market: mkt, now: new Date().toISOString() });
      const saved = localWrite({ state, alerts: [...fired.slice().reverse(), ...stored.alerts] });
      setData((d) => ({ ...(d || {}), state: saved.state, alerts: saved.alerts }));
      if (!fired.length) return;
      setNewAlerts((a) => [...fired, ...a]);
      for (const alert of fired) {
        const asset = configRef.current.assets.find((x) => x.id === alert.assetId);
        const rule = configRef.current.rules.find((x) => x.id === alert.ruleId);
        loadHistory(asset, rule.timeframe)
          .then((candles) => contextSentence(backtestRule(rule, candles), { timeframe: rule.timeframe, source: asset.source, symbol: asset.label || asset.symbol }))
          .catch(() => null)
          .then((context) => {
            const withCtx = { ...alert, context };
            const cur = localRead();
            const upd = localWrite({ alerts: cur.alerts.map((x) => (x.id === alert.id ? withCtx : x)) });
            setData((d) => ({ ...(d || {}), alerts: upd.alerts }));
            setNewAlerts((a) => a.map((x) => (x.id === alert.id ? withCtx : x)));
            notify(withCtx);
          });
      }
    },
    [loadHistory]
  );

  const reload = useCallback(async () => {
    setRefreshing(true);
    setApiError(null);
    try {
      const all = local ? { ...localRead(), kv: 'local', telegram: false } : await apiGetAll();
      configRef.current = all.config || EMPTY_CONFIG;
      setData(all);
      setNeedsToken(false);
      setLoading(false);
      const mkt = await loadMarket(configRef.current.assets);
      if (local) runLocalCheck(mkt);
    } catch (e) {
      if (e.status === 401) setNeedsToken(true);
      else setApiError(String(e.message || e));
      setLoading(false);
    } finally {
      setRefreshing(false);
    }
  }, [local, loadMarket, runLocalCheck]);

  useEffect(() => {
    reload();
  }, [reload]);

  // Se actualiza sola: cada 15 minutos con la app visible, y al volver a ella si los datos son viejos
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') reload(); };
    const id = setInterval(tick, AUTO_REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible' && Date.now() - lastUpdatedRef.current > STALE_MS) reload(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [reload]);

  // Guardado optimista: la UI responde al momento; en modo servidor, si el POST falla se recarga para no
  // quedarnos con una mentira en pantalla.
  const saveConfig = useCallback(
    async (nextConfig) => {
      const prevAssets = configRef.current.assets;
      configRef.current = nextConfig;
      setData((d) => (d ? { ...d, config: nextConfig } : d));
      if (local) {
        localWrite({ config: nextConfig });
      } else {
        try {
          await apiSaveConfig(nextConfig);
        } catch (e) {
          setApiError(`no se pudo guardar: ${e.message}`);
          await reload();
          throw e;
        }
      }
      const mkt = nextConfig.assets !== prevAssets ? await loadMarket(nextConfig.assets) : marketRef.current;
      if (local) runLocalCheck(mkt); // una regla nueva cuyo umbral ya se cumple avisa al momento
    },
    [local, loadMarket, reload, runLocalCheck]
  );

  const addAsset = useCallback((asset) => saveConfig({ ...configRef.current, assets: [...configRef.current.assets, asset] }), [saveConfig]);
  const removeAsset = useCallback(
    (assetId) => saveConfig({ assets: configRef.current.assets.filter((a) => a.id !== assetId), rules: configRef.current.rules.filter((r) => r.assetId !== assetId) }),
    [saveConfig]
  );
  const addRule = useCallback((rule) => saveConfig({ ...configRef.current, rules: [...configRef.current.rules, rule] }), [saveConfig]);
  const updateRule = useCallback(
    (ruleId, patch) => saveConfig({ ...configRef.current, rules: configRef.current.rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) }),
    [saveConfig]
  );
  const removeRule = useCallback((ruleId) => saveConfig({ ...configRef.current, rules: configRef.current.rules.filter((r) => r.id !== ruleId) }), [saveConfig]);

  const applyToken = useCallback(
    (t) => {
      saveToken(t.trim());
      setLoading(true);
      return reload();
    },
    [reload]
  );

  const switchMode = useCallback((m) => {
    setMode(m);
    setLoading(true);
    setNewAlerts([]);
    setModeState(m);
  }, []);

  const enableNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return 'unsupported';
    const p = await Notification.requestPermission();
    setNotifPermission(p);
    return p;
  }, []);

  const doImport = useCallback(
    (text) => {
      importBackup(text);
      return reload();
    },
    [reload]
  );

  const value = useMemo(
    () => ({
      mode,
      loading,
      refreshing,
      apiError,
      needsToken,
      hasToken: Boolean(getToken()),
      config: (data && data.config) || EMPTY_CONFIG,
      cronState: (data && data.state) || { rules: {}, lastRunAt: null },
      alerts: (data && data.alerts) || [],
      kv: data && data.kv,
      telegramReady: Boolean(data && data.telegram),
      market,
      marketErrors,
      lastUpdated,
      newAlerts,
      dismissNewAlerts: () => setNewAlerts([]),
      notifPermission,
      enableNotifications,
      exportBackup,
      importBackup: doImport,
      switchMode,
      reload,
      addAsset,
      removeAsset,
      addRule,
      updateRule,
      removeRule,
      applyToken,
      loadHistory,
      testTelegram: apiTestTelegram,
    }),
    [mode, loading, refreshing, apiError, needsToken, data, market, marketErrors, lastUpdated, newAlerts, notifPermission, enableNotifications, doImport, switchMode, reload, addAsset, removeAsset, addRule, updateRule, removeRule, applyToken, loadHistory]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVigia() {
  return useContext(Ctx);
}
