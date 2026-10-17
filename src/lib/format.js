// Formateo con criterio es-ES: coma decimal, puntos de miles, y decimales
// adaptados a la magnitud (un BTC no se formatea como un DOGE).

import { INDICATORS } from '../core/indicators.js';

const nf = (min, max) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: min, maximumFractionDigits: max });

export function fmtPrice(n) {
  if (n == null || !isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return nf(0, 0).format(n);
  if (abs >= 1) return nf(2, 2).format(n);
  return nf(2, 6).format(n);
}

export function fmtRSI(v) {
  return v == null ? '—' : nf(1, 1).format(v);
}

export function fmtPct(v) {
  if (v == null || !isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${nf(1, 1).format(v)}%`;
}

export function fmtValue(indicator, v) {
  if (v == null || !isFinite(v)) return '—';
  const meta = INDICATORS[indicator];
  if (!meta || meta.decimals == null) return fmtPrice(v);
  return `${nf(meta.decimals, meta.decimals).format(v)}${meta.unit ? ' ' + meta.unit : ''}`;
}

// Porcentaje entero a partir de una fracción (0,69 → "69 %")
export function fmtShare(v) {
  return v == null || !isFinite(v) ? '—' : `${Math.round(v * 100)} %`;
}

// Rentabilidad con signo a partir de una fracción (0,123 → "+12,3 %")
export function fmtRet(v) {
  if (v == null || !isFinite(v)) return '—';
  return `${v > 0 ? '+' : ''}${nf(1, 1).format(v * 100)} %`;
}

export function fmtDate(unixSeconds) {
  return new Date(unixSeconds * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function axisFormatter(v) {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${nf(0, 1).format(v / 1e6)}M`;
  if (abs >= 1e4) return nf(0, 0).format(v);
  if (abs >= 1) return nf(0, 2).format(v);
  return nf(0, 4).format(v);
}

export function timeAgo(iso) {
  if (!iso) return null;
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return 'hace un momento';
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86400) {
    const h = Math.round(s / 3600);
    return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const d = Math.round(s / 86400);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

export function fmtDay(iso) {
  return new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
