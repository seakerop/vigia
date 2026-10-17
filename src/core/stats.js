// Estadística mínima para el probador de reglas, sin dependencias.

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function lgamma(x) { // Lanczos
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1; let a = c[0]; const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Prueba binomial exacta bilateral: ¿k aciertos de n son compatibles con una tasa p0?
// Con una tasa base de 0 % o 100 % no hay nada que contrastar.
export function binomTest(k, n, p0) {
  if (!n) return null;
  if (p0 >= 1) return k === n ? 1 : 0;
  if (p0 <= 0) return k === 0 ? 1 : 0;
  const logC = (a, b) => lgamma(a + 1) - lgamma(b + 1) - lgamma(a - b + 1);
  const pmf = i => Math.exp(logC(n, i) + i * Math.log(p0) + (n - i) * Math.log(1 - p0));
  const pk = pmf(k);
  let p = 0;
  for (let i = 0; i <= n; i++) { const q = pmf(i); if (q <= pk * (1 + 1e-7)) p += q; }
  return Math.min(1, p);
}
