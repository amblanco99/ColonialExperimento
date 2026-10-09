import * as d3 from 'd3';
import { PALETA_GENERO, PALETA_TIPO } from './agentesComun.js';
import type { FilaCsv } from './agentesComun.js';
export type Modo = 'personas' | 'agentes';
export interface Fila {
  idAgente: string;
  idCaso: string;
  grupo: string;
  genero: string;
  tipo: string;
  atributo: string;
  crimen: string;
  codigoCrimen: string;
  subcrimen: string | null;
  codigoSubcrimen: string | null;
  año: number;
  década: number;
}
export interface Grupo {
  clave: string;
  etiqueta: string;
  color: string;
}
export interface Lado {
  etiqueta: string;
  color: string;
  claves: string[];
}
export interface ConfigModo {
  modo: Modo;
  grupos: Grupo[];
  lados: [Lado, Lado];
  etiquetaFiltro: string;
  unidadTarjeta: string;
  unidadLinea: string;
  tituloRol: (grupo: Grupo) => string;
  paramsTabla: (clave: string) => { genero?: string; agente?: string };
}
export const ATRIBUTOS = ['Víctima', 'Perpetrador', 'Cómplice'] as const;
const GENEROS = ['Mujer', 'Hombre', 'Indeterminado'];
const TIPOS: { clave: string; etiqueta: string }[] = [
  { clave: 'Institución', etiqueta: 'Instituciones' },
  { clave: 'Población Indígena Completa', etiqueta: 'Población indígena' },
  { clave: 'Población Completa', etiqueta: 'Población general' },
];
const ROL_PERSONAS: Record<string, string> = {
  Mujer: 'Rol de las mujeres en los casos',
  Hombre: 'Rol de los hombres en los casos',
  Indeterminado: 'Rol de las personas con género indeterminado',
};
export function crearConfig(modo: Modo): ConfigModo {
  if (modo === 'personas') {
    const pal = PALETA_GENERO as Record<string, string>;
    return {
      modo,
      grupos: GENEROS.map((g) => ({ clave: g, etiqueta: g, color: pal[g] })),
      lados: [
        { etiqueta: 'Mujer', color: pal.Mujer, claves: ['Mujer'] },
        { etiqueta: 'Hombre', color: pal.Hombre, claves: ['Hombre'] },
      ],
      etiquetaFiltro: 'Género',
      unidadTarjeta: 'personas',
      unidadLinea: 'persona(s)',
      tituloRol: (g) => ROL_PERSONAS[g.clave] ?? `Rol en los casos · ${g.etiqueta}`,
      paramsTabla: (clave) => ({ genero: clave }),
    };
  }
  const pal = PALETA_TIPO as Record<string, string>;
  return {
    modo,
    grupos: TIPOS.map((t) => ({ clave: t.clave, etiqueta: t.etiqueta, color: pal[t.clave] })),
    lados: [
      { etiqueta: 'Instituciones', color: pal['Institución'], claves: ['Institución'] },
      {
        etiqueta: 'Poblaciones',
        color: pal['Población Indígena Completa'],
        claves: ['Población Indígena Completa', 'Población Completa'],
      },
    ],
    etiquetaFiltro: 'Tipo de agente',
    unidadTarjeta: 'agentes',
    unidadLinea: 'agente(s)',
    tituloRol: (g) => `Rol · ${g.etiqueta}`,
    paramsTabla: (clave) => ({ agente: clave }),
  };
}
function textoOpcional(valor: string | undefined): string | null {
  const v = valor?.trim();
  return v && v.toUpperCase() !== 'NULL' ? v : null;
}
function añoValido(valor: string | undefined): number | null {
  const n = +(valor || '').trim();
  return !isNaN(n) && n >= 1500 && n <= 1899 ? n : null;
}
export async function cargarFilas(modo: Modo): Promise<Fila[]> {
  const [rawAgentes, rawCrimenes, rawLinaje]: [FilaCsv[], FilaCsv[], FilaCsv[]] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}data/ConteoAgentes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);
  const crimenPorId = new Map(rawCrimenes.map((d: FilaCsv) => [(d['ID_Crímen'] || '').trim(), d]));
  const linajeNombreMap = new Map(
    rawLinaje.map((d: FilaCsv) => [(d['ID_Código'] || '').trim(), (d.Nombre || '').trim()]),
  );
  const vistos = new Set<string>();
  const filas: Fila[] = [];
  for (const d of rawAgentes) {
    const esPersona = d.Agente === 'Persona';
    if (modo === 'personas' ? !esPersona : !d.Agente || esPersona) continue;
    const atributo = textoOpcional(d.Atributo);
    if (!atributo || !d.ID_Agente) continue;
    const grupo =
      modo === 'personas' ? (textoOpcional(d.Género) ?? 'Indeterminado') : d.Agente.trim();
    const codigosCrimen = ((d['Relación_crimenes'] as string) || '')
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
    for (const codigo of codigosCrimen) {
      const crimenRow = crimenPorId.get(codigo);
      if (!crimenRow) continue;
      const año = añoValido(crimenRow.Año);
      if (año === null) continue;
      const nombreCrimen = linajeNombreMap.get((crimenRow['Código'] || '').trim());
      if (!nombreCrimen) continue;
      const id = `${d.ID_Agente}|${codigo}`;
      if (vistos.has(id)) continue;
      vistos.add(id);
      const subcodigo = textoOpcional(crimenRow['Sub_Código']);
      filas.push({
        idAgente: d.ID_Agente,
        idCaso: d.ID_Caso,
        grupo,
        genero: grupo,
        tipo: grupo,
        atributo,
        crimen: nombreCrimen,
        codigoCrimen: (crimenRow['Código'] || '').trim(),
        subcrimen: subcodigo ? (linajeNombreMap.get(subcodigo) ?? null) : null,
        codigoSubcrimen: subcodigo,
        año,
        década: Math.floor(año / 10) * 10,
      });
    }
  }
  return filas;
}
export function crimenesPorFrecuencia(filas: Fila[]): [string, number][] {
  return [
    ...d3.rollup(
      filas,
      (v) => v.length,
      (d) => d.crimen,
    ),
  ].sort((a, b) => b[1] - a[1]);
}
export function formatoPct(parte: number, total: number): string {
  return total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : '—';
}
export const fmt = (n: number) => n.toLocaleString('de-DE');
