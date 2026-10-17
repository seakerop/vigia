import { useEffect, useRef } from 'react';
import { ColorType, LineSeries, createChart } from 'lightweight-charts';

// La serie del RSI bajo la de velas, con las líneas clásicas de 30 y 70.
// Escala fija 0-100: el RSI se lee por dónde está, no por cuánto se estira.
export default function RsiChart({ times, values, height = 110 }) {
  const boxRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    const chart = createChart(boxRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#8b93a7',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
        fontSize: 10,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, visible: false },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#1a2332' },
        horzLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#1a2332' },
      },
    });
    const series = chart.addSeries(LineSeries, {
      color: '#3987e5',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    for (const level of [30, 70]) {
      series.createPriceLine({
        price: level,
        color: 'rgba(255,255,255,0.18)',
        lineWidth: 1,
        lineStyle: 3,
        axisLabelVisible: false,
      });
    }
    apiRef.current = { chart, series };
    return () => {
      chart.remove();
      apiRef.current = null;
    };
  }, []);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const data = [];
    for (let i = 0; i < values.length; i++) {
      if (values[i] != null) data.push({ time: times[i], value: values[i] });
    }
    api.series.setData(data);
    api.chart.timeScale().fitContent();
  }, [times, values]);

  return (
    <div className="chart-wrap" style={{ height }}>
      <div ref={boxRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
