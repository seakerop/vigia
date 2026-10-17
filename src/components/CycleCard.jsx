import { ESTUDIO, ZONAS, monthsSinceHalving, zoneOf } from '../core/cycle.js';
import { fmtRet, fmtShare } from '../lib/format.js';

const NIVEL = { solida: '●', indicio: '○', nada: '' };

// Solo en Bitcoin: en qué punto del ciclo de cuatro años estamos y qué pasó en esa fase en los ciclos anteriores
export default function CycleCard() {
  const now = monthsSinceHalving();
  if (!now) return null;
  const zona = zoneOf(now.months);
  const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });
  return (
    <div className="card">
      <div className="card-title">Ciclo del halving</div>
      <p className="cycle-now">
        <strong>{nf.format(now.months)} meses</strong> desde el halving del {new Date(now.since).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}: <strong>{zona.nombre.toLowerCase()}</strong>.
      </p>
      <div className="cycle-bar" aria-hidden="true">
        {ZONAS.map(z => {
          const w = (Math.min(z.hasta, 48) - z.desde) / 48 * 100;
          return <span key={z.id} className={`cycle-seg ${z.id === zona.id ? 'cycle-on' : ''}`} style={{ width: `${w}%` }} />;
        })}
        <span className="cycle-mark" style={{ left: `${Math.min(now.months, 48) / 48 * 100}%` }} />
      </div>
      <table className="tester-table cycle-table">
        <thead>
          <tr><th>Desde esta fase, a</th><th>Subió</th><th>Lo normal</th><th>Mediana</th></tr>
        </thead>
        <tbody>
          {ESTUDIO.plazos.map(p => {
            const z = p.zonas[zona.id];
            return (
              <tr key={p.id}>
                <td>{p.etiqueta}</td>
                <td>{fmtShare(z.sube)} {NIVEL[z.nivel]}</td>
                <td>{fmtShare(p.base)}</td>
                <td>{fmtRet(z.mediana)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="tester-note">
        Del estudio del Termómetro de Bitcoin (precio diario desde 2011). ● = resultado sólido; ○ = indicio. Detrás de cada
        cifra hay solo {Math.min(...ESTUDIO.plazos.map(p => p.zonas[zona.id].ciclos))}-4 ciclos, y es una regla que conoce todo el
        mercado: es contexto, no una predicción.
      </p>
    </div>
  );
}
