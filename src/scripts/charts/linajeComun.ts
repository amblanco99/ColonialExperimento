// Los linajes 1-27 son tipos de delito; del 28 en adelante son categorías
// administrativas (documentos, traslados, juicios civiles, etc.) que Tipo_delito
// marca como "No criminal". Los linajes 1 y 2 llevan esa misma etiqueta a pesar
// de ser delitos (inconsistencia de captura), así que el corte se hace por
// número de linaje en vez de confiar en Tipo_delito. Compartido por Linaje.ts
// y CrimenesPorTipo.ts para que ambos apliquen el mismo criterio.
const ULTIMO_LINAJE_CRIMINAL = 27;

// `codigo` es el ID_Código de nivel superior (p.ej. "4", no el Path completo
// "0/4/4.1"). Devuelve false para códigos vacíos o no numéricos.
export function esLinajeCriminal(codigo: string | undefined): boolean {
  if (!codigo) return false;

  const linaje = Number(codigo);

  return !Number.isNaN(linaje) && linaje <= ULTIMO_LINAJE_CRIMINAL;
}
