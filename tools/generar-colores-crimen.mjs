// Genera un color placeholder por cada ID_Código de Linaje.csv, para llenar
// COLORES_CRIMEN en src/scripts/charts/coloresCrimen.ts mientras no exista la
// paleta final. No se corre automáticamente (a diferencia de
// generar-negrilla-csv.mjs): es una utilidad manual — imprime el objeto para
// pegarlo en coloresCrimen.ts. Semilla fija para que sea reproducible.
import { csvParse } from 'd3-dsv';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raizProyecto = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUTA_LINAJE = path.join(raizProyecto, 'public', 'data', 'Linaje.csv');

function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

const rows = csvParse(readFileSync(RUTA_LINAJE, 'utf-8'));
const ids = rows.map((r) => r['ID_Código']);

let seed = 20240521;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

const n = ids.length;
ids.forEach((id, i) => {
  const hue = Math.round(((i / n) * 360 + rand() * 24 - 12 + 360) % 360);
  const sat = 55 + Math.round(rand() * 15);
  const light = 42 + Math.round(rand() * 14);
  console.log(`  '${id}': '${hslToHex(hue, sat, light)}',`);
});
