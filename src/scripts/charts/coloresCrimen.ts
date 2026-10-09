import { hcl, rgb } from 'd3';

const COLORES_NIVEL1: Record<string, string> = {
  '0': '#bc3324',
  '1': '#027297',
  '2': '#127A00',
  '3': '#1F4D49',
  '4': '#243063',
  '5': '#2E496F',
  '6': '#406706',
  '7': '#4C7155',
  '8': '#582B14',
  '9': '#607E8F',
  '10': '#AF5883',
  '11': '#651100',
  '12': '#696E22',
  '13': '#6B667D',
  '14': '#714F4C',
  '15': '#804A6A',
  '16': '#867362',
  '17': '#870B01',
  '18': '#882A15',
  '19': '#89B962',
  '20': '#943C52',
  '21': '#985A33',
  '22': '#9B0920',
  '23': '#AD600E',
  '24': '#636363',
  '25': '#B14356',
  '26': '#B4BC97',
  '27': '#BABABA',
  '28': '#C15731',
  '29': '#CA8BB0',
  '30': '#D07361',
  '31': '#D19830',
  '32': '#D1B778',
  '33': '#D4AD82',
  '34': '#E33950',
  '35': '#EC9577',
  '36': '#EED462',
};

const SUBCRIMENES: Record<string, number[]> = {
  '1': [1, 2, 3],
  '3': [1, 2],
  '4': [1, 2, 3, 4],
  '5': [1, 2],
  '7': [1, 2, 3],
  '9': [1, 2, 3, 4, 5, 6],
  '10': [1, 2, 3, 4],
  '13': [1, 2, 3, 4],
  '15': [1, 2, 3, 4, 5],
  '16': [1, 2, 3, 4],
  '18': [2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15],
  '20': [1, 2, 3],
  '21': [1, 2],
  '22': [1, 2, 3, 4, 5, 6, 7, 8, 9],
  '24': [1, 2, 3, 4],
  '25': [1, 2, 3, 4],
  '28': [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14],
  '29': [1, 2, 3],
  '35': [1, 2],
  '36': [1, 2, 3, 4, 5],
};

const TECHO_BASE = 78;
const TECHO_CROMA = 10;
const PISO = 24;
const BANDA_MAX = 54;
const PASO_MAX = 12;
const MARGEN_MIN = 18;
const MERMA_BASE = 0.28;
const MERMA_APRETADA = 0.62;
const PASO_APRETADO = 4.2;

function derivarSubcrimen(hexPadre: string, indice: number, total: number): string {
  const base = hcl(hexPadre);
  const techo = TECHO_BASE + Math.min(TECHO_CROMA, base.c * 0.18);
  const arriba = techo - base.l;
  const banda =
    arriba >= MARGEN_MIN ? Math.min(BANDA_MAX, arriba) : -Math.min(BANDA_MAX, base.l - PISO);
  const paso = Math.sign(banda) * Math.min(PASO_MAX, Math.abs(banda) / total);
  const merma = Math.abs(paso) < PASO_APRETADO ? MERMA_APRETADA : MERMA_BASE;
  const proporcion = indice / total;
  return rgb(hcl(base.h, base.c * (1 - merma * proporcion), base.l + paso * indice)).formatHex();
}

function construirColores(): Record<string, string> {
  const salida: Record<string, string> = { ...COLORES_NIVEL1 };
  for (const [padre, sufijos] of Object.entries(SUBCRIMENES)) {
    sufijos.forEach((sufijo, i) => {
      salida[`${padre}.${sufijo}`] = derivarSubcrimen(COLORES_NIVEL1[padre], i + 1, sufijos.length);
    });
  }
  return salida;
}

export const COLORES_CRIMEN: Record<string, string> = construirColores();

export const COLOR_CRIMEN_FALLBACK = '#8b7048';

export function colorDeCrimen(idCodigo: string | null | undefined): string {
  const clave = idCodigo?.trim();
  if (!clave) return COLOR_CRIMEN_FALLBACK;
  return COLORES_CRIMEN[clave] ?? COLOR_CRIMEN_FALLBACK;
}
