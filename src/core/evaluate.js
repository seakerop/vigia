// Una pasada del vigía sobre datos ya descargados: evalúa todas las reglas activas y devuelve el estado
// siguiente y los avisos. La usa el modo local (la app comprueba las reglas cada vez que se actualiza);
// es la misma lógica que el cron, con evaluateRule e indicatorValue.

import { indicatorValue } from './indicators.js';
import { evaluateRule, ruleLabel } from './rules.js';

// market: 'assetId:timeframe' → { closes }
export function evaluateAll({ config, state, market, now }) {
  const prev = (state && state.rules) || {};
  const nextRules = {};
  const fired = [];
  const assets = new Map(config.assets.map(a => [a.id, a]));
  for (const rule of config.rules) {
    const asset = assets.get(rule.assetId);
    if (!asset) continue;
    if (rule.enabled === false) { if (prev[rule.id]) nextRules[rule.id] = prev[rule.id]; continue; }
    const series = market[`${asset.id}:${rule.timeframe}`];
    const value = series ? indicatorValue(rule, series.closes) : null;
    if (value == null) { if (prev[rule.id]) nextRules[rule.id] = prev[rule.id]; continue; } // sin datos: estado intacto
    const r = evaluateRule(rule, prev[rule.id], value, now);
    nextRules[rule.id] = r.state;
    if (r.fired) {
      fired.push({
        id: `${rule.id}-${Date.parse(now)}`,
        at: now, ruleId: rule.id, assetId: asset.id, symbol: asset.symbol, label: asset.label || asset.symbol,
        rule: ruleLabel(rule), indicator: rule.indicator, timeframe: rule.timeframe, op: rule.op, threshold: rule.threshold, value,
      });
    }
  }
  return { state: { rules: nextRules, lastRunAt: now }, fired };
}
