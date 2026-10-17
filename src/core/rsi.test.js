import { describe, expect, it } from 'vitest';
import { rsi, rsiSeries } from './rsi.js';

// Dataset clásico del ejemplo de RSI de ChartSchool (StockCharts). Los valores
// esperados están cross-checkeados contra la librería technicalindicators
// (redondea a 2 decimales, de ahí la tolerancia): diferencia máxima 0.005 en
// toda la serie, y también en 5 series aleatorias de 300 velas.
const STOCKCHARTS = [
  44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84, 46.08,
  45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41, 46.22, 45.64,
  46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57,
  43.42, 42.66, 43.13,
];

describe('rsiSeries', () => {
  it('reproduce los valores conocidos del ejemplo de StockCharts', () => {
    const s = rsiSeries(STOCKCHARTS, 14);
    const expected = [70.46, 66.25, 66.48, 69.35, 66.29, 57.92];
    expected.forEach((v, i) => expect(s[14 + i]).toBeCloseTo(v, 2));
    expect(s[s.length - 1]).toBeCloseTo(37.79, 2);
  });

  it('devuelve null hasta tener period + 1 cierres', () => {
    const s = rsiSeries(STOCKCHARTS, 14);
    for (let i = 0; i < 14; i++) expect(s[i]).toBeNull();
    expect(s[14]).not.toBeNull();
  });

  it('serie demasiado corta: todo null', () => {
    expect(rsiSeries([1, 2, 3], 14)).toEqual([null, null, null]);
    expect(rsi([], 14)).toBeNull();
  });

  it('subidas sin ninguna pérdida dan 100', () => {
    const up = Array.from({ length: 40 }, (_, i) => 100 + i);
    expect(rsi(up, 14)).toBe(100);
  });

  it('bajadas sin ninguna ganancia dan 0', () => {
    const down = Array.from({ length: 40 }, (_, i) => 100 - i);
    expect(rsi(down, 14)).toBe(0);
  });

  it('serie plana (stablecoin) da 50, no divide por cero', () => {
    const flat = Array.from({ length: 40 }, () => 1.0);
    expect(rsi(flat, 14)).toBe(50);
  });

  it('siempre queda entre 0 y 100', () => {
    // serie pseudoaleatoria reproducible
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296), seed / 4294967296);
    const vals = [100];
    for (let i = 0; i < 300; i++) vals.push(Math.max(1, vals[vals.length - 1] * (1 + (rnd() - 0.5) * 0.1)));
    for (const v of rsiSeries(vals, 14)) {
      if (v == null) continue;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('respeta el periodo configurable', () => {
    const s7 = rsiSeries(STOCKCHARTS, 7);
    expect(s7[7]).not.toBeNull();
    expect(s7[6]).toBeNull();
  });
});
