import { describe, expect, it } from 'vitest';
import { bollingerSeries, drawdownSeries, indicatorValue, maDistanceSeries } from './indicators.js';
import { backtestRule, contextSentence } from './history.js';
import { binomTest, median } from './stats.js';
import { ruleLabel } from './rules.js';

const velas = closes => closes.map((close, i) => ({ time: 1_600_000_000 + i * 86400, open: close, high: close, low: close, close }));

describe('indicadores nuevos', () => {
  it('Bollinger %B: serie plana = 0,5 y una rampa 1..20 acaba cerca de la banda superior', () => {
    expect(bollingerSeries(Array(25).fill(7)).at(-1)).toBe(0.5);
    const ramp = Array.from({ length: 20 }, (_, i) => i + 1);
    // media 10,5; desviación poblacional √((20²−1)/12) = 5,766; %B = (20 − (10,5 − 2·5,766)) / (4·5,766)
    expect(bollingerSeries(ramp).at(-1)).toBeCloseTo((20 - (10.5 - 2 * 5.766281)) / (4 * 5.766281), 5);
    expect(bollingerSeries(ramp)[18]).toBeNull();
  });

  it('distancia a la media, en %', () => {
    const s = maDistanceSeries([100, 100, 100, 130], 4); // media 107,5
    expect(s[2]).toBeNull();
    expect(s[3]).toBeCloseTo((130 / 107.5 - 1) * 100, 10);
  });

  it('caída desde el máximo de la ventana', () => {
    expect(drawdownSeries([10, 12, 6], 3)[2]).toBeCloseTo(-50, 10);
    expect(drawdownSeries([10, 12, 13], 3)[2]).toBe(0);
  });

  it('el valor actual es el de la última vela', () => {
    expect(indicatorValue({ indicator: 'precio' }, [1, 2, 3])).toBe(3);
  });

  it('etiquetas de las reglas nuevas', () => {
    expect(ruleLabel({ indicator: 'bollinger', timeframe: '1d', op: '<', threshold: 0 })).toBe('%B diario < 0');
    expect(ruleLabel({ indicator: 'media', timeframe: '1w', op: '<', threshold: 0, params: { period: 200 } })).toBe('vs media 200 semanal < 0 %');
    expect(ruleLabel({ indicator: 'caida', timeframe: '1d', op: '<', threshold: -20 })).toBe('desde máx. diario < -20 %');
    expect(ruleLabel({ indicator: 'rsi', timeframe: '1d', op: '<', threshold: 10, params: { period: 2 } })).toBe('RSI(2) diario < 10');
  });
});

describe('estadística', () => {
  it('mediana y binomial (contrastadas con R)', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(binomTest(9, 10, 0.5)).toBeCloseTo(0.021484375, 9); // binom.test(9, 10)
    expect(binomTest(5, 5, 1)).toBe(1);
  });
});

describe('probador de reglas', () => {
  // precio < 9,5: dispara en el índice 2; se rearma al pasar de 9,595 (índice 3, precio 11);
  // vuelve a disparar en el 5, se rearma en el 6 (10) y dispara otra vez en el 7.
  const closes = [10, 10, 9, 11, 12, 9, 10, 9, 13, 14, 15, 16];
  const regla = { indicator: 'precio', timeframe: '1d', op: '<', threshold: 9.5 };

  it('los disparos son los mismos que haría el cron, con histéresis', () => {
    const bt = backtestRule(regla, velas(closes));
    expect(bt.fires.map(f => f.price)).toEqual([9, 9, 9]);
    expect(bt.fires.map(f => f.time)).toEqual([2, 5, 7].map(i => velas(closes)[i].time));
  });

  it('si la condición ya se cumplía al empezar la historia, no cuenta como disparo', () => {
    const bt = backtestRule(regla, velas([9, 9, 12, 9]));
    expect(bt.fires.map(f => f.time)).toEqual([velas([9, 9, 12, 9])[3].time]);
  });

  it('rentabilidad a N velas y tasa base del propio activo', () => {
    const bt = backtestRule(regla, velas(closes));
    const h5 = bt.horizons.find(h => h.bars === 5);
    // disparo 1: de 9 (índice 2) a 9 (índice 7) → 0 %; disparo 2: de 9 (5) a 15 (10) → +66,7 %
    expect(bt.fires[0].fwd[5]).toBeCloseTo(0, 10);
    expect(bt.fires[1].fwd[5]).toBeCloseTo(15 / 9 - 1, 10);
    expect(h5.n).toBe(2);
    expect(h5.pctUp).toBe(0.5);
    // el disparo 3 (índice 7) aún no tiene 5 velas por delante
    // base: velas 0..6 frente a 5 velas después: 10→9 baja, 10→10 igual, 9→9 igual, 11→13, 12→14, 9→15, 10→16 suben
    expect(h5.base).toBeCloseTo(4 / 7, 10);
    expect(h5.nIndep).toBe(1); // los dos disparos están a 3 velas: se solapan a 5 velas vista
    expect(h5.verdict).toBe('pocos');
  });

  it('frase de contexto honesta con pocos casos', () => {
    const bt = backtestRule(regla, velas(closes));
    const s = contextSentence(bt, { timeframe: '1d', source: 'binance', symbol: 'TEST' });
    // a 10 velas ningún disparo tiene recorrido: no debe decir que nunca saltó
    expect(s).toMatch(/habría saltado 3 veces, todas demasiado recientes/);
    const largo = backtestRule(regla, velas([...closes, ...Array(20).fill(20)]));
    expect(contextSentence(largo, { timeframe: '1d', source: 'binance', symbol: 'TEST' })).toMatch(/habría saltado 3 veces: 10 días después, TEST estaba más alto el 100 %.*pocos casos/);
  });
});
