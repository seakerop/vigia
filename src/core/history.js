// El probador de reglas: ¿qué pasó en el pasado cada vez que esta regla habría saltado?
//
// Repasa la historia vela a vela con la MISMA lógica de disparo y rearme que el cron (evaluateRule),
// así que los disparos del pasado son exactamente los avisos que te habrían llegado. Para cada uno mira
// cuánto había cambiado el precio N velas después y lo compara con lo normal en ese activo: el % de veces
// que el precio estaba más alto N velas después de cualquier vela.
//
// La prueba estadística es la del Termómetro: binomial exacta solo con disparos separados al menos N
// velas (para que no se solapen) y tasa base del propio activo. Y una segunda mirada a los últimos años,
// porque una señal puede haber funcionado en 2013 y no hoy.

import { indicatorSeries } from './indicators.js';
import { conditionMet, evaluateRule } from './rules.js';
import { binomTest, median } from './stats.js';

export const HORIZONS = { '1d': [5, 10, 30], '1w': [1, 4, 12] };
const MIN_INDEP = 8; // por debajo, "pocos casos": no se emite veredicto

export function horizonLabel(bars, timeframe, source) {
  if (timeframe === '1w') return bars === 1 ? '1 semana' : `${bars} semanas`;
  return `${bars} ${source === 'binance' ? 'días' : 'sesiones'}`;
}

// Veredicto de un horizonte: 'pocos' | 'mejor' | 'peor' | 'igual'
function verdictOf(h) {
  if (h.nIndep < MIN_INDEP) return 'pocos';
  if (h.p != null && h.p < 0.05) return h.pctUp > h.base ? 'mejor' : 'peor';
  return 'igual';
}

export function backtestRule(rule, candles, { recentYears = 3 } = {}) {
  const closes = candles.map(c => c.close);
  const series = indicatorSeries(rule, closes);
  const first = series.findIndex(v => v != null);
  if (first < 0) return null;

  // Repetición de la vida de la regla. Si la condición ya se cumplía en la primera vela con datos, eso no
  // es un "disparo" (sería el aviso de recién creada), así que empieza desarmada.
  let state = { armed: !conditionMet(rule, series[first]) };
  const fires = [];
  for (let i = first + 1; i < series.length; i++) {
    if (series[i] == null) continue;
    const r = evaluateRule(rule, state, series[i], null);
    state = r.state;
    if (r.fired) fires.push(i);
  }

  const lastTime = candles[candles.length - 1].time;
  const cutoff = lastTime - recentYears * 365.25 * 86400;
  const horizons = (HORIZONS[rule.timeframe] || HORIZONS['1d']).map(bars => {
    const fwd = i => (i + bars < closes.length ? closes[i + bars] / closes[i] - 1 : null);
    const baseIdx = [];
    for (let i = first; i + bars < closes.length; i++) baseIdx.push(i);
    const upRate = idx => (idx.length ? idx.filter(i => fwd(i) > 0).length / idx.length : null);
    const done = fires.filter(i => fwd(i) != null);
    const base = upRate(baseIdx);
    // disparos separados al menos `bars` velas, para que sus periodos no se solapen
    const indep = [];
    for (const i of done) if (!indep.length || i - indep[indep.length - 1] >= bars) indep.push(i);
    const k = indep.filter(i => fwd(i) > 0).length;
    const recentFires = done.filter(i => candles[i].time >= cutoff);
    const recentBase = baseIdx.filter(i => candles[i].time >= cutoff);
    const h = {
      bars,
      n: done.length,
      pctUp: upRate(done),
      median: median(done.map(fwd)),
      base,
      baseMedian: median(baseIdx.map(fwd)),
      nIndep: indep.length,
      p: indep.length ? binomTest(k, indep.length, base) : null,
      recent: { n: recentFires.length, pctUp: upRate(recentFires), base: upRate(recentBase) },
    };
    h.verdict = verdictOf(h);
    return h;
  });

  return {
    since: candles[first].time,
    until: lastTime,
    bars: closes.length - first,
    fires: fires.map(i => ({
      time: candles[i].time,
      value: series[i],
      price: closes[i],
      fwd: Object.fromEntries(horizons.map(h => [h.bars, i + h.bars < closes.length ? closes[i + h.bars] / closes[i] - 1 : null])),
    })),
    horizons,
    headline: horizons[1] || horizons[0], // el horizonte del medio es el que se resume en una frase
  };
}

// Frase corta para Telegram y para la ficha de la regla
export function contextSentence(bt, { timeframe, source, symbol }) {
  if (!bt || !bt.headline) return null;
  const h = bt.headline;
  const pct = v => `${Math.round(v * 100)} %`;
  const desde = new Date(bt.since * 1000).getUTCFullYear();
  const total = bt.fires.length, veces = n => `${n} ${n === 1 ? 'vez' : 'veces'}`;
  if (total === 0) return `Desde ${desde}, esta regla no habría saltado nunca en ${symbol}.`;
  const lbl = horizonLabel(h.bars, timeframe, source);
  if (h.n === 0) return `Desde ${desde} habría saltado ${veces(total)}, todas demasiado recientes para saber qué pasó ${lbl} después.`;
  let s = `Desde ${desde} habría saltado ${veces(total)}${h.n < total ? ` (${h.n} con ${lbl} de recorrido)` : ''}: ${lbl} después, ${symbol} estaba más alto el ${pct(h.pctUp)} de las veces (lo normal: ${pct(h.base)}).`;
  if (h.verdict === 'pocos') s += ' Son pocos casos para sacar conclusiones.';
  else if (h.verdict === 'igual') s += Math.abs(h.pctUp - h.base) < 0.05 ? ' Prácticamente lo normal.' : ' Con estos casos, la diferencia puede ser casualidad.';
  else s += ' Es una diferencia difícil de atribuir a la casualidad.';
  if (h.recent.n >= 3 && h.recent.pctUp != null) s += ` En los últimos 3 años: ${pct(h.recent.pctUp)} (lo normal: ${pct(h.recent.base)}).`;
  return s;
}
