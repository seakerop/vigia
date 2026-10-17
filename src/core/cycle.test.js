import { describe, expect, it } from 'vitest';
import { ESTUDIO, isBitcoin, monthsSinceHalving, zoneOf } from './cycle.js';

describe('ciclo del halving', () => {
  it('meses desde el último halving y su fase', () => {
    const r = monthsSinceHalving(new Date('2026-10-17T00:00:00Z'));
    expect(r.since).toBe('2024-04-20');
    expect(r.months).toBeCloseTo(29.9, 1);
    expect(zoneOf(r.months).id).toBe('h18-30');
    expect(zoneOf(30.1).id).toBe('h30+');
    expect(zoneOf(0).id).toBe('h0-12');
    expect(monthsSinceHalving(new Date('2010-01-01'))).toBeNull();
  });

  it('el estudio tiene las cuatro fases en cada plazo', () => {
    for (const p of ESTUDIO.plazos) expect(Object.keys(p.zonas).sort()).toEqual(['h0-12', 'h12-18', 'h18-30', 'h30+']);
  });

  it('reconoce Bitcoin en cualquier fuente, y solo Bitcoin', () => {
    for (const s of ['BTCUSDT', 'BTC-USD', 'BTC-EUR', 'btcusdc']) expect(isBitcoin({ symbol: s })).toBe(true);
    for (const s of ['ETHUSDT', 'BTCST', 'WBTCUSDT', 'AAPL']) expect(isBitcoin({ symbol: s })).toBe(false);
  });
});
