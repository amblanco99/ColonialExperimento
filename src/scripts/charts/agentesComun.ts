function leerVariableCss(nombre: string, fallback: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || fallback;
}
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
  Indeterminado: leerVariableCss('--genero-sin-info', '#5b7c92'),
};
export const PALETA_ATRIBUTO = {
  Víctima: leerVariableCss('--atributo-victima', '#2e496f'),
  Perpetrador: leerVariableCss('--atributo-perpetrador', '#e33950'),
  Cómplice: leerVariableCss('--atributo-complice', '#406706'),
};
export const ATRIBUTOS_ORDEN = ['Víctima', 'Perpetrador', 'Cómplice'];
export const SIGLOS = ['Siglo XVI', 'Siglo XVII', 'Siglo XVIII', 'Siglo XIX'];
export function getSiglo(año: number): string {
  if (año <= 1599) return 'Siglo XVI';
  if (año <= 1699) return 'Siglo XVII';
  if (año <= 1799) return 'Siglo XVIII';
  return 'Siglo XIX';
}
