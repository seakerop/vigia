import { describe, expect, it } from 'vitest';
import { evaluateAll } from './evaluate.js';

const NOW = '2026-10-17T12:00:00.000Z';
const asset = { id: 'a', symbol: 'BTCUSDT', label: 'BTC', source: 'binance' };
const regla = (extra = {}) => ({ id: 'r', assetId: 'a', indicator: 'precio', timeframe: '1d', op: '<', threshold: 100, enabled: true, ...extra });

describe('pasada local del vigía', () => {
  it('dispara, guarda el estado y no repite en la siguiente pasada', () => {
    const market = { 'a:1d': { closes: [120, 110, 95] } };
    const p1 = evaluateAll({ config: { assets: [asset], rules: [regla()] }, state: null, market, now: NOW });
    expect(p1.fired).toHaveLength(1);
    expect(p1.fired[0]).toMatchObject({ symbol: 'BTCUSDT', value: 95, rule: 'precio < 100' });
    expect(p1.state.rules.r.armed).toBe(false);
    const p2 = evaluateAll({ config: { assets: [asset], rules: [regla()] }, state: p1.state, market, now: NOW });
    expect(p2.fired).toHaveLength(0);
  });

  it('sin datos o con la regla pausada, el estado se conserva tal cual', () => {
    const state = { rules: { r: { armed: false, firedAt: 'antes' } } };
    expect(evaluateAll({ config: { assets: [asset], rules: [regla()] }, state, market: {}, now: NOW }).state.rules.r).toEqual(state.rules.r);
    expect(evaluateAll({ config: { assets: [asset], rules: [regla({ enabled: false })] }, state, market: { 'a:1d': { closes: [50] } }, now: NOW }).state.rules.r).toEqual(state.rules.r);
  });

  it('las reglas de activos borrados se ignoran', () => {
    const r = evaluateAll({ config: { assets: [], rules: [regla()] }, state: null, market: { 'a:1d': { closes: [50] } }, now: NOW });
    expect(r.fired).toHaveLength(0);
    expect(r.state.rules).toEqual({});
  });
});
