// Los indicadores que pueden vigilar las reglas. Módulo puro, compartido por la PWA, el cron y el probador
// de reglas: el valor que ves en pantalla, el que evalúa el cron y el que se prueba contra la historia
// salen del mismo cálculo.
//
// Cada indicador devuelve una serie alineada con las velas (null mientras no hay datos suficientes).

import { rsiSeries } from './rsi.js';

function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= n) sum -= values[i - n];
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

// %B de Bollinger: 0 = banda inferior, 1 = banda superior (media de N ± 2 desviaciones)
export function bollingerSeries(closes, period = 20, k = 2) {
  const out = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let m = 0;
    for (let j = i - period + 1; j <= i; j++) m += closes[j];
    m /= period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) ** 2;
    const sd = Math.sqrt(v / period);
    out[i] = sd > 0 ? (closes[i] - (m - k * sd)) / (2 * k * sd) : 0.5;
  }
  return out;
}

// Distancia del precio a su media de N velas, en %
export function maDistanceSeries(closes, period = 200) {
  const m = sma(closes, period);
  return closes.map((c, i) => (m[i] ? (c / m[i] - 1) * 100 : null));
}

// Caída desde el máximo de las últimas N velas, en % (0 = en máximos). Con una ventana fija y no
// "desde el máximo histórico" porque el cron solo baja unas 300 velas: así el valor en vivo y el del
// probador son el mismo número.
export function drawdownSeries(closes, window = 250) {
  const out = new Array(closes.length).fill(null);
  for (let i = window - 1; i < closes.length; i++) {
    let mx = -Infinity;
    for (let j = i - window + 1; j <= i; j++) mx = Math.max(mx, closes[j]);
    out[i] = (closes[i] / mx - 1) * 100;
  }
  return out;
}

// Catálogo. `rearm` es el margen de histéresis por defecto (ver rules.js).
export const INDICATORS = {
  rsi: {
    label: 'RSI', unit: '', decimals: 1, rearm: 2, range: [0, 100], suggest: { '<': 30, '>': 70 },
    params: { period: 14 },
    help: 'Fuerza relativa de Wilder, de 0 a 100.',
    series: (closes, p = {}) => rsiSeries(closes, p.period || 14),
  },
  precio: {
    label: 'Precio', unit: '', decimals: null, rearm: null, suggest: {},
    help: 'Último cierre.',
    series: closes => closes.slice(),
  },
  bollinger: {
    label: 'Bandas de Bollinger (%B)', short: '%B', unit: '', decimals: 2, rearm: 0.05, suggest: { '<': 0, '>': 1 },
    params: { period: 20 },
    help: '0 = toca la banda inferior; 1 = toca la superior. Por debajo de 0 o por encima de 1, está fuera de las bandas.',
    series: (closes, p = {}) => bollingerSeries(closes, p.period || 20),
  },
  media: {
    label: 'Distancia a la media', short: 'vs media', unit: '%', decimals: 1, rearm: 1, suggest: { '<': 0, '>': 50 },
    params: { period: 200 },
    help: 'Cuánto está el precio por encima (+) o por debajo (−) de su media de N velas.',
    series: (closes, p = {}) => maDistanceSeries(closes, p.period || 200),
  },
  caida: {
    label: 'Caída desde el máximo de 1 año', short: 'desde máx.', unit: '%', decimals: 1, rearm: 1, suggest: { '<': -20 },
    help: 'Cuánto está por debajo de su máximo de las últimas 250 velas (en semanal, 52).',
    series: (closes, p = {}, tf = '1d') => drawdownSeries(closes, tf === '1w' ? 52 : 250),
  },
};

export function indicatorSeries(rule, closes) {
  const ind = INDICATORS[rule.indicator];
  if (!ind) throw new Error(`indicador desconocido: ${rule.indicator}`);
  return ind.series(closes, rule.params || {}, rule.timeframe);
}

export function indicatorValue(rule, closes) {
  const s = indicatorSeries(rule, closes);
  return s.length ? s[s.length - 1] : null;
}
