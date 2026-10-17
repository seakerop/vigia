// El ciclo de cuatro años de Bitcoin: en qué fase del halving estamos y qué pasó históricamente en ella.
//
// Las cifras salen del estudio "Termómetro de Bitcoin" (precio diario de CoinMetrics desde 2011, mismas
// pruebas estadísticas que el resto del proyecto), calculadas el 16-10-2026. No se recalculan aquí porque
// Binance solo tiene datos desde 2017: con dos ciclos no se puede medir nada.

export const HALVINGS = ['2012-11-28', '2016-07-09', '2020-05-11', '2024-04-20'];
export const PROXIMO_HALVING_APROX = '2028-04'; // cada 210.000 bloques; la fecha exacta depende del ritmo de minado

const MES = 30.4375 * 86400 * 1000;

export function monthsSinceHalving(date = new Date()) {
  const t = date.getTime();
  const last = HALVINGS.filter(d => Date.parse(d) <= t).at(-1);
  return last ? { months: (t - Date.parse(last)) / MES, since: last } : null;
}

export const ZONAS = [
  { id: 'h0-12', desde: 0, hasta: 12, nombre: 'Primer año tras el halving' },
  { id: 'h12-18', desde: 12, hasta: 18, nombre: '12-18 meses tras el halving' },
  { id: 'h18-30', desde: 18, hasta: 30, nombre: '18-30 meses tras el halving' },
  { id: 'h30+', desde: 30, hasta: Infinity, nombre: 'Más de 30 meses tras el halving' },
];

export function zoneOf(months) {
  return ZONAS.find(z => months >= z.desde && months < z.hasta) || null;
}

// % de veces que Bitcoin estaba más alto al final del plazo partiendo de cada zona, mediana del cambio y
// cuántos ciclos distintos hay detrás. "nivel" es el veredicto del estudio: sólido, indicio o nada.
export const ESTUDIO = {
  fecha: '2026-10-16',
  plazos: [
    { id: '1m', etiqueta: '1 mes', base: 0.569, zonas: {
      'h0-12': { sube: 0.707, mediana: 0.091, ciclos: 4, nivel: 'solida' },
      'h12-18': { sube: 0.522, mediana: 0.022, ciclos: 4, nivel: 'nada' },
      'h18-30': { sube: 0.358, mediana: -0.052, ciclos: 4, nivel: 'solida' },
      'h30+': { sube: 0.662, mediana: 0.067, ciclos: 3, nivel: 'nada' } } },
    { id: '6m', etiqueta: '6 meses', base: 0.631, zonas: {
      'h0-12': { sube: 0.934, mediana: 1.036, ciclos: 4, nivel: 'indicio' },
      'h12-18': { sube: 0.331, mediana: -0.158, ciclos: 4, nivel: 'nada' },
      'h18-30': { sube: 0.239, mediana: -0.301, ciclos: 4, nivel: 'solida' },
      'h30+': { sube: 0.826, mediana: 0.448, ciclos: 3, nivel: 'nada' } } },
    { id: '12m', etiqueta: '12 meses', base: 0.692, zonas: {
      'h0-12': { sube: 0.822, mediana: 2.675, ciclos: 4, nivel: 'nada' },
      'h12-18': { sube: 0.157, mediana: -0.442, ciclos: 4, nivel: 'indicio' },
      'h18-30': { sube: 0.517, mediana: 0.123, ciclos: 3, nivel: 'nada' },
      'h30+': { sube: 0.965, mediana: 1.321, ciclos: 3, nivel: 'nada' } } },
  ],
};

export function isBitcoin(asset) {
  return /^BTC([-/]?(USD|USDT|EUR|USDC))?$/i.test(asset.symbol);
}
