import * as d3 from 'd3';
import { PALETA_GENERO, PALETA_TIPO } from './agentesComun.js';
import type { FilaCsv } from './agentesComun.js';

export type Modo = 'personas' | 'agentes';

/** Una participación (agente en un caso, con un crimen) ya limpia y sin duplicados. */
export interface Fila {
  idAgente: string;
  idCaso: string;
  /** Género (personas) o tipo de agente (otros agentes): lo que filtra el chip. */
  grupo: string;
  /** Alias de `grupo` para los sunbursts, que leen `genero` o `tipo` según el modo. */
  genero: string;
  tipo: string;
  atributo: string;
  crimen: string;
  subcrimen: string | null;
  año: number;
  década: number;
}

export interface Grupo {
  clave: string;
  etiqueta: string;
  color: string;
}

/** Cada lado de la barra doble: uno o más grupos que se suman en una barra. */
export interface Lado {
  etiqueta: string;
  color: string;
  claves: string[];
}

export interface ConfigModo {
  modo: Modo;
  grupos: Grupo[];
  lados: [Lado, Lado];
  /** Título del bloque de filtro de grupo, en mayúsculas. */
  etiquetaFiltro: string;
  /** Sustantivo para "1,461 <unidad>" bajo el número de cada tarjeta. */
  unidadTarjeta: string;
  /** Lo que cuenta la línea de evolución, con plural entre paréntesis. */
  unidadLinea: string;
  /** Sujeto del panel de roles: "Rol de las mujeres en los casos". */
  tituloRol: (grupo: Grupo) => string;
  /** Parámetros de la tabla de base-de-datos para un grupo. */
  paramsTabla: (clave: string) => { genero?: string; agente?: string };
}

export const ATRIBUTOS = ['Víctima', 'Perpetrador', 'Cómplice'] as const;

const GENEROS = ['Mujer', 'Hombre', 'Sin información'];

const TIPOS: { clave: string; etiqueta: string }[] = [
  { clave: 'Institución', etiqueta: 'Instituciones' },
  { clave: 'Población Indígena Completa', etiqueta: 'Población indígena' },
  { clave: 'Población Completa', etiqueta: 'Población general' },
];

const ROL_PERSONAS: Record<string, string> = {
  Mujer: 'Rol de las mujeres en los casos',
  Hombre: 'Rol de los hombres en los casos',
  'Sin información': 'Rol de las personas sin género registrado',
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

export async function cargarFilas(modo: Modo): Promise<Fila[]> {
  const raw: FilaCsv[] = await d3.csv(`${import.meta.env.BASE_URL}data/Visualizaciones.csv`);
  const vistos = new Set<string>();
  const filas: Fila[] = [];

  for (const d of raw) {
    const esPersona = d.Agente === 'Persona';
    if (modo === 'personas' ? !esPersona : !d.Agente || esPersona) continue;
    if (!d.Año || isNaN(+d.Año) || !d.Nombre_Codigo || !d.Atributo || !d.ID_Agente) continue;

    const id = `${d.ID_Documento}|${d.Sub_Código}|${d.ID_Agente}`;
    if (vistos.has(id)) continue;
    vistos.add(id);

    const grupo =
      modo === 'personas' ? (textoOpcional(d.Género) ?? 'Sin información') : d.Agente.trim();
    const año = +d.Año;
    filas.push({
      idAgente: d.ID_Agente,
      idCaso: d.ID_Caso,
      grupo,
      genero: grupo,
      tipo: grupo,
      atributo: d.Atributo.trim(),
      crimen: d.Nombre_Codigo.trim(),
      subcrimen: textoOpcional(d.Nombre_Sub_Codigo),
      año,
      década: Math.floor(año / 10) * 10,
    });
  }
  return filas;
}

/** Cuántas filas hay por crimen, de mayor a menor. */
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
