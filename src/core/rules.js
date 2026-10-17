// El motor de reglas. Una regla es declarativa y no sabe nada de APIs:
//   { id, assetId, indicator: 'rsi' | 'precio' | 'bollinger' | 'media' | 'caida', timeframe: '1d' | '1w',
//     op: '<' | '>', threshold, params: { period }, enabled, rearm? }
// Su estado en runtime vive aparte (solo lo escribe el cron):
//   { armed, lastValue, lastEvalAt, firedAt, firedValue }
//
// Histéresis para no re-avisar en bucle: al dispararse, la regla se desarma;
// solo se rearma cuando el valor cruza de vuelta el umbral con un margen.
// Así un RSI bailando en 29.8-30.2 avisa una vez, no cada pasada del cron.
//
// Una regla recién creada nace armada: si su condición ya se cumple, la
// primera pasada avisa (decisión de producto: quiero enterarme del estado
// real nada más colgar la regla).

import { INDICATORS } from './indicators.js';

export function conditionMet(rule, value) {
  return rule.op === '<' ? value < rule.threshold : value > rule.threshold;
}

// Margen de rearme: configurable por regla; por defecto el de cada indicador (2 puntos de RSI,
// 0,05 de %B, 1 punto en los porcentajes) y un 1% del umbral para el precio.
export function rearmMargin(rule) {
  if (rule.rearm != null) return rule.rearm;
  const def = INDICATORS[rule.indicator] && INDICATORS[rule.indicator].rearm;
  return def != null ? def : Math.abs(rule.threshold) * 0.01;
}

export function isRearmed(rule, value) {
  const m = rearmMargin(rule);
  return rule.op === '<' ? value > rule.threshold + m : value < rule.threshold - m;
}

// Un paso de evaluación. Devuelve el estado siguiente y si hay que avisar.
export function evaluateRule(rule, state, value, now) {
  const prev = state || { armed: true };
  const next = { ...prev, lastValue: value, lastEvalAt: now };
  if (prev.armed !== false && conditionMet(rule, value)) {
    return { state: { ...next, armed: false, firedAt: now, firedValue: value }, fired: true };
  }
  if (prev.armed === false && isRearmed(rule, value)) {
    return { state: { ...next, armed: true }, fired: false };
  }
  return { state: next, fired: false };
}

// Descripción corta de una regla para la UI y los mensajes de Telegram.
const TF_LABEL = { '1d': 'diario', '1w': 'semanal' };

export function ruleLabel(rule) {
  if (rule.indicator === 'precio') return `precio ${rule.op} ${rule.threshold}`;
  const meta = INDICATORS[rule.indicator] || { label: rule.indicator, unit: '' };
  const p = rule.params && rule.params.period;
  const base = rule.indicator === 'rsi' ? (p && p !== 14 ? `RSI(${p})` : 'RSI')
    : rule.indicator === 'media' ? `vs media ${p || 200}`
    : meta.short || meta.label;
  return `${base} ${TF_LABEL[rule.timeframe] || rule.timeframe} ${rule.op} ${rule.threshold}${meta.unit ? ' ' + meta.unit : ''}`;
}
