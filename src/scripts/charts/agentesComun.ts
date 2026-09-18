function leerVariableCss(nombre: string, fallback: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || fallback;
}

// TODO: type — fila cruda de los CSV que devuelve d3.csv. Es `any` a propósito:
// DSVRowString<string> convertiría cada ts(2339) en un ts(18048) sin añadir
// garantía ninguna. Ver MIGRATION.md.
export type FilaCsv = any;

export const TIPOS_AGENTE = ['Institución', 'Población Completa', 'Población Indígena Completa'];

export const PALETA_TIPO = {
  Institución: leerVariableCss('--tipo-institucion', '#5b7c92'),
  'Población Completa': leerVariableCss('--tipo-poblacion-completa', '#c9a679'),
  'Población Indígena Completa': leerVariableCss('--tipo-poblacion-indigena', '#a9573b'),
};

export function grupoDeTipo(tipo: string): string {
  return tipo === 'Institución' ? 'Instituciones' : 'Poblaciones';
}

export const PALETA_GRUPO = {
  Instituciones: PALETA_TIPO['Institución'],
  Poblaciones: PALETA_TIPO['Población Completa'],
};

export const PALETA_GENERO = {
  Mujer: leerVariableCss('--genero-mujer', '#c9a679'),
  Hombre: leerVariableCss('--genero-hombre', '#a9573b'),
  'Sin información': leerVariableCss('--genero-sin-info', '#5b7c92'),
};

export const PALETA_ATRIBUTO = {
  Víctima: '#4e7d5c',
  Perpetrador: '#b5443a',
  Cómplice: '#5b7c92',
};

export const ATRIBUTOS_ORDEN = ['Víctima', 'Perpetrador', 'Cómplice'];

export const SIGLOS = ['Siglo XVI', 'Siglo XVII', 'Siglo XVIII', 'Siglo XIX'];

// Único llamante: TablasConteo.ts:44, que pasa `+d.Año`, o sea un número.
// (Hay otras tres implementaciones locales de getSiglo en el proyecto; ver
// MIGRATION.md, trabajo posterior.)
export function getSiglo(año: number): string {
  if (año <= 1599) return 'Siglo XVI';
  if (año <= 1699) return 'Siglo XVII';
  if (año <= 1799) return 'Siglo XVIII';
  return 'Siglo XIX';
}
