import { useEffect, useRef } from 'react';
import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts';
import { axisFormatter } from '../lib/format.js';

// Gráfica de velas, mismo patrón que en Bóveda pero con la paleta de Vigía.
export default function CandleChart({ candles, height = 260 }) {
  const boxRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b93a7',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#1a2332' },
        horzLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#1a2332' },
      },
      localization: { priceFormatter: axisFormatter },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#0ca30c',
      downColor: '#e66767',
      borderVisible: false,
      wickUpColor: '#0ca30c',
      wickDownColor: '#e66767',
    });
    apiRef.current = { chart, series };
    return () => {
      chart.remove();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    api.series.setData(candles);
    api.chart.timeScale().fitContent();
  }, [candles]);

  return (
    <div className="chart-wrap" style={{ height }}>
      <div ref={boxRef} style={{ position: 'absolute', inset: 0 }} />
      {!candles.length && <div className="chart-empty">Sin datos de mercado ahora mismo</div>}
    </div>
  );
}
