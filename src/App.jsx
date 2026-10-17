import { useState } from 'react';
import { useVigia } from './lib/store.jsx';
import Watchlist from './components/Watchlist.jsx';
import AssetDetail from './components/AssetDetail.jsx';
import History from './components/History.jsx';
import Settings from './components/Settings.jsx';
import TokenGate from './components/TokenGate.jsx';

export default function App() {
  const { loading, needsToken, refreshing, reload, apiError, newAlerts, dismissNewAlerts } = useVigia();
  const [view, setView] = useState({ name: 'watchlist' });

  if (loading) return <div className="splash">Vigía</div>;
  if (needsToken) return <TokenGate />;

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'watchlist' })}>
          <span className="brand-mark">◉</span> Vigía
        </button>
        <div className="topbar-actions">
          <button
            className={`btn-icon ${refreshing ? 'spin' : ''}`}
            aria-label="Actualizar datos"
            title="Actualizar datos"
            onClick={reload}
          >
            ↻
          </button>
          <button className="btn-icon" aria-label="Histórico de avisos" title="Histórico de avisos" onClick={() => setView({ name: 'history' })}>
            🕘
          </button>
          <button className="btn-icon" aria-label="Ajustes" title="Ajustes" onClick={() => setView({ name: 'settings' })}>
            ⚙
          </button>
        </div>
      </header>
      {apiError && <div className="api-error">{apiError}</div>}
      {newAlerts.length > 0 && (
        <div className="alert-banner" role="status">
          <div className="alert-banner-body">
            {newAlerts.slice(0, 3).map((a) => (
              <div key={a.id} className="alert-banner-item">
                <strong>{a.label}</strong> · {a.rule}
                {a.context && <div className="alert-banner-ctx">{a.context}</div>}
              </div>
            ))}
            {newAlerts.length > 3 && <div className="alert-banner-ctx">y {newAlerts.length - 3} más en el histórico</div>}
          </div>
          <div className="alert-banner-actions">
            <button className="btn btn-ghost" onClick={() => { dismissNewAlerts(); setView({ name: 'history' }); }}>Ver</button>
            <button className="btn-icon" aria-label="Cerrar aviso" onClick={dismissNewAlerts}>✕</button>
          </div>
        </div>
      )}
      <main>
        {view.name === 'watchlist' && <Watchlist onOpenAsset={(id) => setView({ name: 'asset', id })} />}
        {view.name === 'asset' && <AssetDetail assetId={view.id} onBack={() => setView({ name: 'watchlist' })} />}
        {view.name === 'history' && <History onBack={() => setView({ name: 'watchlist' })} />}
        {view.name === 'settings' && <Settings onBack={() => setView({ name: 'watchlist' })} />}
      </main>
      <footer className="disclaimer">
        Herramienta de monitorización personal. Vigila los umbrales que tú defines y te cuenta qué pasó otras veces;
        no es asesoramiento financiero.
      </footer>
    </div>
  );
}
