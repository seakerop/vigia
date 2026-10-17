import { useState } from 'react';
import { useVigia } from '../lib/store.jsx';
import { INDICATORS } from '../core/indicators.js';
import RuleTester from './RuleTester.jsx';

const PARAM_LABEL = { rsi: 'Periodo', bollinger: 'Periodo', media: 'Media de' };
const PARAM_RANGE = { rsi: [2, 50], bollinger: [5, 100], media: [5, 400] };

// Alta y edición de regla: indicador, timeframe, condición y umbral (y el periodo cuando aplica).
// Debajo, el probador enseña qué habría pasado en el pasado con esa misma regla.
export default function RuleForm({ asset, rule, defaultTimeframe = '1d', onClose }) {
  const { addRule, updateRule } = useVigia();
  const editing = Boolean(rule);
  const [indicator, setIndicator] = useState(rule ? rule.indicator : 'rsi');
  const [timeframe, setTimeframe] = useState(rule ? rule.timeframe : defaultTimeframe);
  const [op, setOp] = useState(rule ? rule.op : '<');
  const [threshold, setThreshold] = useState(rule ? String(rule.threshold) : '');
  const meta = INDICATORS[indicator];
  const [period, setPeriod] = useState(rule && rule.params && rule.params.period ? String(rule.params.period) : String((meta.params && meta.params.period) || ''));
  const [busy, setBusy] = useState(false);

  const hasPeriod = Boolean(meta.params && meta.params.period);
  const th = Number(threshold.replace(',', '.'));
  const pd = Number(period);
  const [pMin, pMax] = PARAM_RANGE[indicator] || [0, 0];
  const valid =
    threshold.trim() !== '' && isFinite(th) &&
    (!meta.range || (th >= meta.range[0] && th <= meta.range[1])) &&
    (!hasPeriod || (Number.isInteger(pd) && pd >= pMin && pd <= pMax));

  function changeIndicator(next) {
    setIndicator(next);
    const m = INDICATORS[next];
    setPeriod(String((m.params && m.params.period) || ''));
    const sug = m.suggest && m.suggest[op];
    setThreshold(sug != null ? String(sug) : '');
  }

  const fields = { indicator, timeframe, op, threshold: th, params: hasPeriod ? { period: pd } : {} };

  async function submit(e) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    try {
      if (editing) await updateRule(rule.id, fields);
      else await addRule({ id: crypto.randomUUID(), assetId: asset.id, enabled: true, ...fields });
      onClose();
    } catch {
      setBusy(false); // el store ya enseña el error de guardado
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          {editing ? 'Editar regla' : 'Nueva regla'} · {asset.symbol}
        </div>
        <form onSubmit={submit}>
          <label className="field">
            <span>Indicador</span>
            <select value={indicator} onChange={(e) => changeIndicator(e.target.value)}>
              {Object.entries(INDICATORS).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </label>
          <p className="form-hint form-hint-top">{meta.help}</p>
          <div className="field-row">
            <label className="field">
              <span>Timeframe</span>
              <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                <option value="1d">Diario</option>
                <option value="1w">Semanal</option>
              </select>
            </label>
            <label className="field">
              <span>Condición</span>
              <select value={op} onChange={(e) => setOp(e.target.value)}>
                <option value="<">baja de</option>
                <option value=">">supera</option>
              </select>
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span>Umbral{meta.unit ? ` (${meta.unit})` : ''}</span>
              <input
                inputMode="decimal"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                placeholder={meta.suggest && meta.suggest[op] != null ? String(meta.suggest[op]) : '60000'}
                autoFocus
              />
            </label>
            {hasPeriod && (
              <label className="field">
                <span>{PARAM_LABEL[indicator]}</span>
                <input inputMode="numeric" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </label>
            )}
          </div>

          <RuleTester asset={asset} rule={valid ? fields : null} />

          <p className="form-hint">
            Avisa una vez al cumplirse y se rearma cuando el valor cruza de vuelta el umbral (con un pequeño margen
            para no repetirse).
          </p>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn btn-primary" disabled={!valid || busy}>
              {busy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
