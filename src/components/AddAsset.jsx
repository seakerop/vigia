import { useEffect, useRef, useState } from 'react';
import { useVigia } from '../lib/store.jsx';

// Alta de activo. Dos caminos: par de Binance escrito a mano (se valida
// contra su API antes de aceptarlo) o búsqueda en Yahoo para bolsa y ETFs.
export default function AddAsset({ onClose }) {
  const { addAsset, config } = useVigia();
  const [source, setSource] = useState('binance');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // binance
  const [pair, setPair] = useState('');
  // yahoo
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (source !== 'yahoo' || query.trim().length < 2) {
      setResults([]);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/yahoo?fn=search&q=${encodeURIComponent(query.trim())}`);
        const data = await r.json();
        setResults((data.quotes || []).filter((q) => q.symbol));
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(debounceRef.current);
  }, [query, source]);

  async function save(asset) {
    if (config.assets.some((a) => a.source === asset.source && a.symbol === asset.symbol)) {
      setError('Ese activo ya está en la watchlist.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await addAsset({ id: crypto.randomUUID(), ...asset });
      onClose();
    } catch {
      setBusy(false);
    }
  }

  async function submitBinance(e) {
    e.preventDefault();
    const symbol = pair.trim().toUpperCase();
    if (!symbol) return;
    setBusy(true);
    setError(null);
    // validar que el par existe pidiendo una vela
    try {
      const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=1`);
      if (!r.ok) throw new Error();
      setBusy(false);
      await save({ symbol, source: 'binance', label: symbol.replace(/USDT$|USDC$|EUR$/, ''), type: 'crypto' });
    } catch {
      setBusy(false);
      setError(`Binance no conoce el par "${symbol}". Prueba con el formato BTCUSDT.`);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Añadir activo</div>
        <div className="tf-tabs source-tabs" role="tablist" aria-label="Fuente">
          <button role="tab" aria-selected={source === 'binance'} className={source === 'binance' ? 'chip chip-on' : 'chip'} onClick={() => setSource('binance')}>
            Crypto
          </button>
          <button role="tab" aria-selected={source === 'yahoo'} className={source === 'yahoo' ? 'chip chip-on' : 'chip'} onClick={() => setSource('yahoo')}>
            Bolsa y ETFs
          </button>
        </div>

        {source === 'binance' ? (
          <form onSubmit={submitBinance}>
            <label className="field">
              <span>Par de Binance</span>
              <input
                value={pair}
                onChange={(e) => setPair(e.target.value)}
                placeholder="BTCUSDT"
                autoCapitalize="characters"
                autoFocus
              />
            </label>
            <p className="form-hint">El símbolo tal cual lo usa Binance: BTCUSDT, ETHUSDT, SOLUSDT…</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy || !pair.trim()}>
                {busy ? 'Comprobando…' : 'Añadir'}
              </button>
            </div>
          </form>
        ) : (
          <>
            <label className="field">
              <span>Buscar en Yahoo Finance</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Apple, MSCI World, IBE.MC…"
                autoFocus
              />
            </label>
            <div className="search-results">
              {searching && <p className="form-hint">Buscando…</p>}
              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="form-hint">Nada con ese nombre. Prueba con el ticker.</p>
              )}
              {results.slice(0, 8).map((q) => (
                <button
                  key={q.symbol}
                  className="search-row"
                  disabled={busy}
                  onClick={() =>
                    save({
                      symbol: q.symbol,
                      source: 'yahoo',
                      label: q.shortname || q.longname || q.symbol,
                      type: (q.quoteType || '').toLowerCase() === 'etf' ? 'etf' : 'stock',
                    })
                  }
                >
                  <span className="asset-symbol">{q.symbol}</span>
                  <span className="search-name">{q.shortname || q.longname || ''}</span>
                  <span className="search-exch">{q.exchDisp || q.exchange || ''}</span>
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Cancelar
              </button>
            </div>
          </>
        )}
        {error && <p className="gate-error">{error}</p>}
      </div>
    </div>
  );
}
