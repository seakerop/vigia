import { describe, expect, it } from 'vitest';
import { conditionMet, evaluateRule, isRearmed, rearmMargin, ruleLabel } from './rules.js';

const NOW = '2026-07-18T12:00:00.000Z';

const rsiBajo30 = {
  id: 'r1',
  assetId: 'a1',
  indicator: 'rsi',
  timeframe: '1d',
  op: '<',
  threshold: 30,
  params: { period: 14 },
  enabled: true,
};

describe('evaluateRule', () => {
  it('regla armada + condición cumplida → dispara y se desarma', () => {
    const { state, fired } = evaluateRule(rsiBajo30, { armed: true }, 28.4, NOW);
    expect(fired).toBe(true);
    expect(state.armed).toBe(false);
    expect(state.firedValue).toBe(28.4);
    expect(state.firedAt).toBe(NOW);
  });

  it('regla recién creada (sin estado) con condición ya cumplida → avisa en la primera pasada', () => {
    const { fired } = evaluateRule(rsiBajo30, null, 28.4, NOW);
    expect(fired).toBe(true);
  });

  it('desarmada no re-avisa aunque la condición siga cumpliéndose', () => {
    const { state, fired } = evaluateRule(rsiBajo30, { armed: false, firedAt: NOW }, 27.1, NOW);
    expect(fired).toBe(false);
    expect(state.armed).toBe(false);
  });

  it('no se rearma bailando pegada al umbral (histéresis)', () => {
    // disparó en 29; sube a 31 (dentro del margen de 2) → sigue desarmada
    const { state, fired } = evaluateRule(rsiBajo30, { armed: false }, 31, NOW);
    expect(fired).toBe(false);
    expect(state.armed).toBe(false);
  });

  it('se rearma al cruzar de vuelta con margen, y puede volver a disparar', () => {
    const paso1 = evaluateRule(rsiBajo30, { armed: false }, 33.5, NOW); // > 30 + 2
    expect(paso1.state.armed).toBe(true);
    expect(paso1.fired).toBe(false);
    const paso2 = evaluateRule(rsiBajo30, paso1.state, 29.9, NOW);
    expect(paso2.fired).toBe(true);
  });

  it('ciclo completo: dispara una vez, calla, rearma, dispara otra vez', () => {
    const valores = [31, 28, 27, 29, 31.5, 33, 29];
    let state = null;
    const disparos = [];
    for (const v of valores) {
      const r = evaluateRule(rsiBajo30, state, v, NOW);
      state = r.state;
      if (r.fired) disparos.push(v);
    }
    // dispara en 28 (primer cruce), calla en 27/29/31.5, rearma en 33, dispara en 29
    expect(disparos).toEqual([28, 29]);
  });

  it('funciona igual con op > (RSI alto)', () => {
    const alta = { ...rsiBajo30, op: '>', threshold: 70 };
    expect(evaluateRule(alta, null, 72, NOW).fired).toBe(true);
    expect(evaluateRule(alta, { armed: false }, 69, NOW).state.armed).toBe(false); // margen
    expect(evaluateRule(alta, { armed: false }, 67.9, NOW).state.armed).toBe(true);
  });

  it('guarda siempre el último valor evaluado', () => {
    const { state } = evaluateRule(rsiBajo30, { armed: true }, 55, NOW);
    expect(state.lastValue).toBe(55);
    expect(state.lastEvalAt).toBe(NOW);
  });
});

describe('márgenes y condiciones', () => {
  it('condición simple', () => {
    expect(conditionMet(rsiBajo30, 29.9)).toBe(true);
    expect(conditionMet(rsiBajo30, 30)).toBe(false);
  });

  it('margen por defecto: 2 puntos para RSI, 1% para precio', () => {
    expect(rearmMargin(rsiBajo30)).toBe(2);
    const precio = { indicator: 'precio', op: '>', threshold: 60000 };
    expect(rearmMargin(precio)).toBe(600);
    expect(isRearmed(precio, 59300)).toBe(true);
    expect(isRearmed(precio, 59500)).toBe(false);
  });

  it('margen configurable por regla', () => {
    expect(rearmMargin({ ...rsiBajo30, rearm: 5 })).toBe(5);
  });

  it('etiquetas legibles', () => {
    expect(ruleLabel(rsiBajo30)).toBe('RSI diario < 30');
    expect(ruleLabel({ indicator: 'precio', op: '>', threshold: 60000, timeframe: '1d' })).toBe('precio > 60000');
  });
});
