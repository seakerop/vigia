import { useEffect, useState } from 'react';
import { useVigia } from '../lib/store.jsx';
import { backtestRule, contextSentence, horizonLabel } from '../core/history.js';
import { fmtDate, fmtRet, fmtShare, fmtValue } from '../lib/format.js';

// Prueba una regla contra la historia del activo. Se recalcula al cambiar la regla (con un pequeño
// retardo para no recalcular a cada tecla) y la historia se baja una sola vez por activo y timeframe.
export function useBacktest(asset, rule) {
  const { loadHistory } = useVigia();
  const [res, setRes] = useState({ status: 'idle' });
  const key = rule ? JSON.stringify([rule.indicator, rule.timeframe, rule.op, rule.threshold, rule.params]) : null;
  useEffect(() => {
    if (!asset || !rule || rule.threshold == null || !isFinite(rule.threshold)) { setRes({ status: 'idle' }); return; }
    let vivo = true;
    setRes(r => ({ ...r, status: 'loading' }));
    const t = setTimeout(() => {
      loadHistory(asset, rule.timeframe)
        .then(candles => { if (vivo) setRes({ status: 'ok', bt: backtestRule(rule, candles) }); })
        .catch(e => { if (vivo) setRes({ status: 'error', error: String(e.message || e) }); });
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset && asset.id, key, loadHistory]);
  return res;
}

const VEREDICTO = {
  mejor: { txt: 'subió más de lo normal', cls: 'v-mejor' },
  peor: { txt: 'subió menos de lo normal', cls: 'v-peor' },
  igual: { txt: 'puede ser casualidad', cls: 'v-igual' },
  pocos: { txt: 'pocos casos', cls: 'v-pocos' },
};

export function VerdictChip({ verdict }) {
  const v = VEREDICTO[verdict];
  return v ? <span className={`chip ${v.cls}`}>{v.txt}</span> : null;
}

export default function RuleTester({ asset, rule }) {
  const { status, bt, error } = useBacktest(asset, rule);
  const name = asset.label || asset.symbol;

  // sin regla válida (p. ej. mientras se escribe el umbral) no se pinta el resultado anterior
  if (!rule || status === 'idle') return <div className="tester tester-muted">Pon un umbral para ver qué habría pasado en el pasado.</div>;
  if (status === 'error') return <div className="tester tester-muted">No he podido bajar la historia de {asset.symbol} ({error}).</div>;
  if (!bt) return <div className="tester tester-muted">Bajando años de historia de {asset.symbol}…</div>;

  const ultimos = bt.fires.slice(-5).reverse();
  return (
    <div className={`tester ${status === 'loading' ? 'tester-stale' : ''}`} aria-live="polite">
      <div className="tester-title">¿Qué habría pasado antes?</div>
      <p className="tester-sentence">{contextSentence(bt, { timeframe: rule.timeframe, source: asset.source, symbol: name })}</p>
      {bt.fires.length > 0 && (
        <>
          <table className="tester-table">
            <thead>
              <tr><th>Después de</th><th>Subió</th><th>Lo normal</th><th>Mediana</th><th></th></tr>
            </thead>
            <tbody>
              {bt.horizons.map(h => (
                <tr key={h.bars}>
                  <td>{horizonLabel(h.bars, rule.timeframe, asset.source)}</td>
                  <td>{h.n ? fmtShare(h.pctUp) : '—'}</td>
                  <td>{fmtShare(h.base)}</td>
                  <td>{h.n ? fmtRet(h.median) : '—'}</td>
                  <td><VerdictChip verdict={h.verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {ultimos.length > 0 && (
            <details className="tester-fires">
              <summary>Últimas veces que habría saltado</summary>
              <ul>
                {ultimos.map(f => (
                  <li key={f.time}>
                    <span>{fmtDate(f.time)}</span>
                    <span>en {fmtValue(rule.indicator, f.value)}</span>
                    <span>{bt.horizons[1] ? `${horizonLabel(bt.horizons[1].bars, rule.timeframe, asset.source)}: ${fmtRet(f.fwd[bt.horizons[1].bars])}` : ''}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <p className="tester-note">
        Cuenta solo las veces en que el aviso te habría llegado (con el mismo rearme que el vigía), desde {fmtDate(bt.since)}.
        "Lo normal" es lo que hizo {name} después de cualquier {rule.timeframe === '1w' ? 'semana' : 'día'}. Si pruebas muchos
        umbrales hasta que uno sale bonito, lo más probable es que hayas encontrado casualidad.
      </p>
    </div>
  );
}
