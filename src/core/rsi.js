// RSI de Wilder (1978), implementado a mano a propósito: la matemática es
// parte del proyecto. Módulo puro sin dependencias, compartido por la PWA
// (mostrar el valor en pantalla) y el cron (evaluar reglas): un solo cálculo,
// unos solos tests.
//
// La primera media de ganancias/pérdidas es la media simple de los primeros
// `period` cambios; a partir de ahí, suavizado de Wilder:
//   media = (mediaAnterior * (period - 1) + cambioActual) / period
// Por eso el RSI necesita bastante más historial que `period` velas para
// converger: los fetchers piden ~250-300.

function toRSI(avgGain, avgLoss) {
  if (avgLoss === 0 && avgGain === 0) return 50; // serie plana (p. ej. stablecoin)
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

// Serie completa alineada con `closes`: null hasta que hay datos suficientes.
export function rsiSeries(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (period < 1 || closes.length <= period) return out;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;
  out[period] = toRSI(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(change, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-change, 0)) / period;
    out[i] = toRSI(avgGain, avgLoss);
  }
  return out;
}

// El valor actual (última vela), que es lo que evalúan las reglas.
export function rsi(closes, period = 14) {
  const s = rsiSeries(closes, period);
  return s.length ? s[s.length - 1] : null;
}
