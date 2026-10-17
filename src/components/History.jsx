import { useVigia } from '../lib/store.jsx';
import { fmtDay, fmtTime, fmtValue } from '../lib/format.js';

// Histórico de avisos disparados: el snapshot que guarda el cron (fecha,
// valor, umbral), agrupado por día, lo más nuevo arriba.
export default function History({ onBack }) {
  const { alerts } = useVigia();

  const byDay = [];
  for (const a of alerts) {
    const day = a.at.slice(0, 10);
    const bucket = byDay.find((b) => b.day === day);
    if (bucket) bucket.items.push(a);
    else byDay.push({ day, at: a.at, items: [a] });
  }

  return (
    <>
      <div className="view-head">
        <button className="btn-icon" aria-label="Volver" onClick={onBack}>
          ←
        </button>
        <div className="view-title">Histórico de avisos</div>
      </div>

      {alerts.length === 0 ? (
        <div className="empty">
          <div className="empty-mark">🕘</div>
          <p className="empty-title">Silencio, de momento.</p>
          <p className="empty-text">
            Cuando una regla se cumpla, el aviso quedará aquí con su fecha, el valor que la disparó y el umbral que
            cruzó.
          </p>
        </div>
      ) : (
        byDay.map((b) => (
          <div key={b.day} className="card">
            <div className="card-title">{fmtDay(b.at)}</div>
            {b.items.map((a) => (
              <div key={a.id} className="alert-row">
                <span className="alert-time">{fmtTime(a.at)}</span>
                <div className="alert-body">
                  <div className="alert-asset">
                    <span className="asset-symbol">{a.symbol}</span>
                    {a.label && a.label !== a.symbol && <span className="asset-label">{a.label}</span>}
                  </div>
                  <div className="alert-rule">
                    {a.rule} · saltó en {fmtValue(a.indicator, a.value)}
                  </div>
                  {a.context && <div className="alert-ctx">{a.context}</div>}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </>
  );
}
