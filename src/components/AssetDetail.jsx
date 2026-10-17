import { useState } from 'react';
import { useVigia } from '../lib/store.jsx';
import { rsiSeries } from '../core/rsi.js';
import { ruleLabel } from '../core/rules.js';
import { indicatorValue } from '../core/indicators.js';
import { horizonLabel } from '../core/history.js';
import { fmtPrice, fmtRSI, fmtShare, fmtValue } from '../lib/format.js';
import CandleChart from './CandleChart.jsx';
import RsiChart from './RsiChart.jsx';
import RuleForm from './RuleForm.jsx';
import { useBacktest, VerdictChip } from './RuleTester.jsx';
import CycleCard from './CycleCard.jsx';
import { isBitcoin } from '../core/cycle.js';

// Una línea con lo que pasó históricamente después de esta regla en este activo
function RuleContext({ rule, asset }) {
  const { status, bt } = useBacktest(asset, rule);
  if (!bt) return status === 'loading' ? <div className="rule-ctx">probando contra la historia…</div> : null;
  const h = bt.headline;
  if (!bt.fires.length || !h || !h.n) return <div className="rule-ctx">sin disparos con recorrido en la historia</div>;
  return (
    <div className="rule-ctx">
      Antes: {bt.fires.length} {bt.fires.length === 1 ? 'vez' : 'veces'} · a {horizonLabel(h.bars, rule.timeframe, asset.source)} subió {fmtShare(h.pctUp)} (normal {fmtShare(h.base)}) <VerdictChip verdict={h.verdict} />
    </div>
  );
}

const TF_TABS = [
  { key: '1d', label: 'Diario' },
  { key: '1w', label: 'Semanal' },
];

function RuleRow({ rule, asset, onEdit }) {
  const { cronState, updateRule, removeRule, market } = useVigia();
  const st = cronState.rules[rule.id];
  const fired = st && st.armed === false;
  const disabled = rule.enabled === false;

  // valor en vivo calculado por la PWA con el mismo módulo que usa el cron
  const series = market[`${asset.id}:${rule.timeframe}`];
  const live = series == null ? null : indicatorValue(rule, series.closes);

  return (
    <div className={`rule-row ${disabled ? 'rule-off' : ''}`}>
      <div className="rule-info">
        <span className={`rule-dot ${disabled ? 'dot-off' : fired ? 'dot-fired' : 'dot-armed'}`} />
        <div>
          <div className="rule-name">{ruleLabel(rule)}</div>
          <div className="rule-sub">
            {disabled
              ? 'pausada'
              : fired
                ? `disparada · ahora en ${fmtValue(rule.indicator, live)}`
                : `vigilando · ahora en ${fmtValue(rule.indicator, live)}`}
          </div>
          <RuleContext rule={rule} asset={asset} />
        </div>
      </div>
      <div className="rule-actions">
        <button
          className="btn-icon"
          title={disabled ? 'Reactivar regla' : 'Pausar regla'}
          aria-label={disabled ? 'Reactivar regla' : 'Pausar regla'}
          onClick={() => updateRule(rule.id, { enabled: disabled })}
        >
          {disabled ? '▶' : '⏸'}
        </button>
        <button className="btn-icon" title="Editar regla" aria-label="Editar regla" onClick={onEdit}>
          ✎
        </button>
        <button
          className="btn-icon danger"
          title="Borrar regla"
          aria-label="Borrar regla"
          onClick={() => {
            if (confirm(`¿Borrar la regla "${ruleLabel(rule)}"?`)) removeRule(rule.id);
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export default function AssetDetail({ assetId, onBack }) {
  const { config, market, marketErrors, removeAsset } = useVigia();
  const [tf, setTf] = useState('1d');
  const [ruleForm, setRuleForm] = useState(null); // null | { rule? }

  const asset = config.assets.find((a) => a.id === assetId);
  if (!asset) {
    onBack();
    return null;
  }

  const series = market[`${assetId}:${tf}`];
  const err = marketErrors[`${assetId}:${tf}`];
  const candles = (series && series.candles) || [];
  const rsiVals = series ? rsiSeries(series.closes) : [];
  const rsiNow = rsiVals.length ? rsiVals[rsiVals.length - 1] : null;
  const last = series && series.closes.at(-1);
  const rules = config.rules.filter((r) => r.assetId === assetId);

  return (
    <>
      <div className="view-head">
        <button className="btn-icon" aria-label="Volver" onClick={onBack}>
          ←
        </button>
        <div className="view-title">
          <span className="asset-symbol">{asset.symbol}</span>
          {asset.label && asset.label !== asset.symbol && <span className="asset-label">{asset.label}</span>}
        </div>
        <span className="view-price">{fmtPrice(last)}</span>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="tf-tabs" role="tablist" aria-label="Timeframe">
            {TF_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tf === t.key}
                className={tf === t.key ? 'chip chip-on' : 'chip'}
                onClick={() => setTf(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="rsi-now">
            RSI <strong>{fmtRSI(rsiNow)}</strong>
          </span>
        </div>
        {err ? (
          <p className="market-err">La fuente de datos no responde ahora mismo ({err}). Se reintenta al refrescar.</p>
        ) : (
          <>
            <CandleChart candles={candles} />
            <RsiChart times={candles.map((c) => c.time)} values={rsiVals} />
          </>
        )}
      </div>

      {isBitcoin(asset) && <CycleCard />}

      <div className="card">
        <div className="card-title">Reglas</div>
        {rules.length === 0 ? (
          <p className="empty-text">
            Sin reglas todavía. Una regla es un umbral con voz: "RSI semanal por debajo de 30", "precio por encima de
            60.000". Cuando se cumple, te llega un Telegram.
          </p>
        ) : (
          rules.map((r) => <RuleRow key={r.id} rule={r} asset={asset} onEdit={() => setRuleForm({ rule: r })} />)
        )}
        <button className="btn btn-ghost btn-block" onClick={() => setRuleForm({})}>
          + Añadir regla
        </button>
      </div>

      <button
        className="btn btn-danger btn-block"
        onClick={() => {
          if (confirm(`¿Quitar ${asset.symbol} de la watchlist? Sus reglas se van con él.`)) {
            removeAsset(assetId);
            onBack();
          }
        }}
      >
        Quitar de la watchlist
      </button>

      {ruleForm && <RuleForm asset={asset} rule={ruleForm.rule} defaultTimeframe={tf} onClose={() => setRuleForm(null)} />}
    </>
  );
}
