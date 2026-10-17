import { useState } from 'react';
import { useVigia } from '../lib/store.jsx';
import { rsi } from '../core/rsi.js';
import { fmtPct, fmtPrice, fmtRSI, timeAgo } from '../lib/format.js';
import AddAsset from './AddAsset.jsx';

function AssetCard({ asset, onOpen }) {
  const { config, market, marketErrors, cronState } = useVigia();
  const daily = market[`${asset.id}:1d`];
  const weekly = market[`${asset.id}:1w`];
  const err = marketErrors[`${asset.id}:1d`];

  const last = daily && daily.closes[daily.closes.length - 1];
  const prev = daily && daily.closes[daily.closes.length - 2];
  const changePct = last != null && prev != null ? ((last - prev) / prev) * 100 : null;
  const rsiD = daily ? rsi(daily.closes) : null;
  const rsiW = weekly ? rsi(weekly.closes) : null;

  const rules = config.rules.filter((r) => r.assetId === asset.id && r.enabled !== false);
  const fired = rules.filter((r) => {
    const st = cronState.rules[r.id];
    return st && st.armed === false;
  }).length;

  return (
    <button className={`asset-card ${fired ? 'asset-fired' : ''}`} onClick={onOpen}>
      <div className="asset-main">
        <div className="asset-id">
          <span className="asset-symbol">{asset.symbol}</span>
          {asset.label && asset.label !== asset.symbol && <span className="asset-label">{asset.label}</span>}
        </div>
        <div className="asset-price">
          <span className="price">{fmtPrice(last)}</span>
          {changePct != null && (
            <span className={`pct ${changePct >= 0 ? 'up' : 'down'}`}>{fmtPct(changePct)}</span>
          )}
        </div>
      </div>
      <div className="asset-meta">
        <span className="chip chip-rsi">RSI D {fmtRSI(rsiD)}</span>
        <span className="chip chip-rsi">RSI S {fmtRSI(rsiW)}</span>
        {rules.length > 0 && (
          <span className={`chip ${fired ? 'chip-fired' : 'chip-armed'}`}>
            {fired ? `${fired} de ${rules.length} disparada${fired > 1 ? 's' : ''}` : `${rules.length} vigilando`}
          </span>
        )}
        {err && <span className="chip chip-warn">sin datos ahora</span>}
      </div>
    </button>
  );
}

export default function Watchlist({ onOpenAsset }) {
  const { config, cronState, kv, mode, lastUpdated } = useVigia();
  const [adding, setAdding] = useState(false);

  return (
    <>
      {config.assets.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">◉</div>
          <p className="empty-title">El vigía está de guardia, pero aún no tiene nada que vigilar.</p>
          <p className="empty-text">Añade un activo y cuélgale reglas: él mira el mercado para que tú no tengas que hacerlo.</p>
          <button className="btn btn-primary" onClick={() => setAdding(true)}>
            Añadir activo
          </button>
        </div>
      ) : (
        <>
          <div className="asset-list">
            {config.assets.map((a) => (
              <AssetCard key={a.id} asset={a} onOpen={() => onOpenAsset(a.id)} />
            ))}
          </div>
          <button className="btn btn-ghost btn-block" onClick={() => setAdding(true)}>
            + Añadir activo
          </button>
          <p className="cron-note">
            {mode === 'local'
              ? `Actualizado ${lastUpdated ? timeAgo(lastUpdated) : '…'} · se actualiza solo cada 15 minutos y comprueba tus reglas mientras la app está abierta`
              : cronState.lastRunAt
                ? `Última pasada del vigía: ${timeAgo(cronState.lastRunAt)}`
                : 'El cron aún no ha hecho ninguna pasada.'}
            {kv === 'file' && ' · almacén local de desarrollo'}
          </p>
        </>
      )}
      {adding && <AddAsset onClose={() => setAdding(false)} />}
    </>
  );
}
