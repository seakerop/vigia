// La pasada del vigía. La ejecuta GitHub Actions cada 2 horas
// (.github/workflows/check.yml) y también se puede lanzar a mano:
//
//   node scripts/check.mjs             pasada real (KV y Telegram de verdad)
//   DRY_RUN=1 node scripts/check.mjs   imprime los avisos en vez de enviarlos
//
// Lee la config del KV, baja velas, calcula indicadores, evalúa las reglas y
// avisa por Telegram. Si una fuente de mercado falla, esa pasada se la salta
// y ya se reintentará en la siguiente: un fallo puntual de Yahoo no merece
// llenarme el móvil de errores.

import { fileURLToPath } from 'node:url';
import { INDICATORS, indicatorValue } from '../src/core/indicators.js';
import { evaluateRule, ruleLabel } from '../src/core/rules.js';
import { closesOf, fetchCandles, fetchHistory } from '../src/core/market.js';
import { backtestRule, contextSentence } from '../src/core/history.js';
import { kvGetJSON, kvMode, kvPushAlerts, kvSetJSON } from '../api/_lib/kv.js';
import { sendTelegram } from '../api/_lib/telegram.js';
import { yahooProxy } from '../api/_lib/yahoo.js';

// .env local si existe (en Actions las variables llegan de los secrets)
try {
  process.loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url)));
} catch {}

const DRY = process.env.DRY_RUN === '1';

// Yahoo directo desde Node; si el runner tiene la IP vetada, respaldo vía el
// proxy propio ya desplegado (YAHOO_PROXY_URL).
async function yahooFetch(params) {
  try {
    return await yahooProxy(params);
  } catch (e) {
    const base = process.env.YAHOO_PROXY_URL;
    if (!base) throw e;
    const r = await fetch(`${base}?${new URLSearchParams(params)}`);
    if (!r.ok) throw new Error(`proxy yahoo ${r.status}`);
    return r.json();
  }
}

function fmtValue(rule, value) {
  const meta = INDICATORS[rule.indicator];
  if (!meta || meta.decimals == null) return String(+value.toPrecision(6));
  return `${value.toFixed(meta.decimals)}${meta.unit ? ' ' + meta.unit : ''}`;
}

function alertMessage(asset, rule, value, context) {
  const name = asset.label && asset.label !== asset.symbol ? `${asset.label} (${asset.symbol})` : asset.symbol;
  return `Vigía · ${name}\n${ruleLabel(rule)} — ahora en ${fmtValue(rule, value)}${context ? `\n\n${context}` : ''}`;
}

// Contexto histórico del aviso: qué pasó las otras veces que esta regla habría saltado en este activo.
// Solo se calcula cuando algo dispara (baja años de historia), y si falla, el aviso sale igual sin él.
const historyCache = new Map();
async function contextFor(asset, rule) {
  try {
    const key = `${asset.id}:${rule.timeframe}`;
    if (!historyCache.has(key)) historyCache.set(key, fetchHistory(asset, rule.timeframe, { yahooFetch }));
    const bt = backtestRule(rule, await historyCache.get(key));
    return { sentence: contextSentence(bt, { timeframe: rule.timeframe, source: asset.source, symbol: asset.label || asset.symbol }), headline: bt && bt.headline };
  } catch (e) {
    console.warn(`  ! sin contexto histórico para ${asset.symbol} (${e.message})`);
    return { sentence: null, headline: null };
  }
}

async function main() {
  const now = new Date().toISOString();
  const config = await kvGetJSON('config', null);
  if (!config || !config.assets.length) {
    console.log(`[${now}] sin watchlist en el KV (${kvMode()}); nada que vigilar`);
    return;
  }

  const stateDoc = await kvGetJSON('state', { rules: {}, lastRunAt: null });
  const rules = (config.rules || []).filter((r) => r.enabled !== false);
  const assetsById = new Map(config.assets.map((a) => [a.id, a]));

  // una descarga por (activo, timeframe), la compartan las reglas que la usen
  const seriesCache = new Map();
  async function getCloses(asset, timeframe) {
    const key = `${asset.id}:${timeframe}`;
    if (!seriesCache.has(key)) {
      seriesCache.set(
        key,
        fetchCandles(asset, timeframe, { yahooFetch }).then(closesOf)
      );
    }
    return seriesCache.get(key);
  }

  const nextRuleState = {};
  const firedAlerts = [];
  let sourceErrors = 0;

  for (const rule of rules) {
    const asset = assetsById.get(rule.assetId);
    if (!asset) continue;
    let closes;
    try {
      closes = await getCloses(asset, rule.timeframe);
    } catch (e) {
      sourceErrors++;
      console.warn(`  ! ${asset.symbol} ${rule.timeframe}: fuente caída (${e.message}); se reintenta en la próxima pasada`);
      nextRuleState[rule.id] = stateDoc.rules[rule.id]; // estado intacto
      continue;
    }
    const value = indicatorValue(rule, closes);
    if (value == null) {
      console.warn(`  ! ${asset.symbol} ${rule.timeframe}: historial insuficiente para ${ruleLabel(rule)}`);
      nextRuleState[rule.id] = stateDoc.rules[rule.id];
      continue;
    }
    const { state, fired } = evaluateRule(rule, stateDoc.rules[rule.id], value, now);
    if (fired) {
      const context = await contextFor(asset, rule);
      const message = alertMessage(asset, rule, value, context.sentence);
      if (DRY) {
        console.log(`  → [DRY_RUN] aviso:\n${message.split('\n').map((l) => `      ${l}`).join('\n')}`);
      } else {
        try {
          await sendTelegram(message);
        } catch (e) {
          // si el aviso no salió, la regla se queda armada y reintenta luego
          console.warn(`  ! telegram falló (${e.message}); la regla queda armada`);
          nextRuleState[rule.id] = stateDoc.rules[rule.id];
          continue;
        }
      }
      firedAlerts.push({
        id: `${rule.id}-${Date.now()}`,
        at: now,
        ruleId: rule.id,
        assetId: asset.id,
        symbol: asset.symbol,
        label: asset.label || asset.symbol,
        rule: ruleLabel(rule),
        indicator: rule.indicator,
        timeframe: rule.timeframe,
        op: rule.op,
        threshold: rule.threshold,
        value,
        context: context.sentence,
        verdict: context.headline ? context.headline.verdict : null,
      });
    }
    nextRuleState[rule.id] = state;
  }

  // los estados de reglas borradas en la app se van con ellas
  await kvSetJSON('state', { rules: nextRuleState, lastRunAt: now });
  await kvPushAlerts(firedAlerts);

  console.log(
    `[${now}] ${rules.length} reglas evaluadas · ${firedAlerts.length} avisos · ` +
      `${sourceErrors} fuentes caídas · KV: ${kvMode()}${DRY ? ' · DRY_RUN' : ''}`
  );
}

main().catch((e) => {
  // fallo total (KV inaccesible, config corrupta): que el workflow salga en
  // rojo, porque esto sí es un problema de configuración y no de mercado
  console.error('pasada abortada:', e);
  process.exitCode = 1;
});
