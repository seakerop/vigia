// Velas para indicadores y gráficas. El mismo módulo corre en el navegador
// (la PWA pinta lo que el cron evalúa) y en Node (el cron de GitHub Actions).
// Yahoo siempre pasa por un proxy (CORS en navegador, inyectable en Node);
// Binance se llama directo, con host de respaldo porque api.binance.com
// devuelve 451 desde IPs de EE. UU., que es donde viven los runners de GitHub.

const BINANCE_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision'];

const BINANCE_INTERVAL = { '1d': '1d', '1w': '1w' };
const YAHOO_PARAMS = {
  '1d': { interval: '1d', range: '2y' }, // 2 años: la caída desde el máximo usa 250 velas
  '1w': { interval: '1wk', range: '5y' },
};

async function binanceCandles(symbol, timeframe) {
  const interval = BINANCE_INTERVAL[timeframe];
  if (!interval) throw new Error(`timeframe no soportado: ${timeframe}`);
  let lastErr;
  for (const host of BINANCE_HOSTS) {
    try {
      const url = `${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`binance ${r.status}`);
      const rows = await r.json();
      return rows.map((k) => ({
        time: Math.floor(k[0] / 1000),
        open: Number(k[1]),
        high: Number(k[2]),
        low: Number(k[3]),
        close: Number(k[4]),
      }));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

function parseYahooChart(data) {
  const result = data && data.chart && data.chart.result && data.chart.result[0];
  if (!result) throw new Error('respuesta de yahoo sin datos');
  const ts = result.timestamp || [];
  const q = (result.indicators && result.indicators.quote && result.indicators.quote[0]) || {};
  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close && q.close[i];
    if (close == null) continue; // huecos de mercado cerrado
    candles.push({
      time: ts[i],
      open: q.open[i] ?? close,
      high: q.high[i] ?? close,
      low: q.low[i] ?? close,
      close,
    });
  }
  return candles;
}

// En el navegador el proxy es el endpoint propio; el cron inyecta el suyo
// (llamada directa a Yahoo, con la URL desplegada como respaldo).
async function defaultYahooFetch(params) {
  const r = await fetch(`/api/yahoo?${new URLSearchParams(params)}`);
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  return r.json();
}

export async function fetchCandles(asset, timeframe, { yahooFetch = defaultYahooFetch } = {}) {
  if (asset.source === 'binance') return binanceCandles(asset.symbol, timeframe);
  const params = YAHOO_PARAMS[timeframe];
  if (!params) throw new Error(`timeframe no soportado: ${timeframe}`);
  return parseYahooChart(await yahooFetch({ fn: 'chart', symbol: asset.symbol, ...params }));
}

// Historia larga para el probador de reglas: el cron se conforma con 300 velas, pero para saber qué
// pasó después de cada señal hacen falta años. Binance devuelve como mucho 1000 velas por petición, así
// que se pagina hacia atrás; Yahoo da toda la serie de una vez con range=max.
const HISTORY_BARS = { '1d': 5000, '1w': 1000 }; // de sobra para llegar al inicio de Binance (agosto de 2017)

async function binanceHistory(symbol, timeframe) {
  const interval = BINANCE_INTERVAL[timeframe];
  const all = [];
  let endTime = null;
  while (all.length < HISTORY_BARS[timeframe]) {
    let rows = null, lastErr;
    for (const host of BINANCE_HOSTS) {
      try {
        const url = `${host}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=1000${endTime ? `&endTime=${endTime}` : ''}`;
        const r = await fetch(url);
        if (!r.ok) throw new Error(`binance ${r.status}`);
        rows = await r.json();
        break;
      } catch (e) { lastErr = e; }
    }
    if (!rows) throw lastErr;
    if (!rows.length) break;
    all.unshift(...rows.map(k => ({ time: Math.floor(k[0] / 1000), open: Number(k[1]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]) })));
    if (rows.length < 1000) break; // ya no hay más historia
    endTime = rows[0][0] - 1;
  }
  return all;
}

export async function fetchHistory(asset, timeframe, { yahooFetch = defaultYahooFetch } = {}) {
  if (asset.source === 'binance') return binanceHistory(asset.symbol, timeframe);
  // Ojo: con range=max Yahoo devuelve velas mensuales aunque se pidan diarias. Por fechas sí respeta el
  // intervalo; se pide desde 1900 y Yahoo empieza donde tenga datos.
  const interval = timeframe === '1w' ? '1wk' : '1d';
  return parseYahooChart(await yahooFetch({ fn: 'chart', symbol: asset.symbol, interval, period1: -2208988800, period2: Math.floor(Date.now() / 1000) }));
}

export function closesOf(candles) {
  return candles.map((c) => c.close);
}
