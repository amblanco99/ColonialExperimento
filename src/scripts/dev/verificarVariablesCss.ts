const MAPA_NOMBRADAS = [
  '--mapa-fondo-pergamino',
  '--mapa-panel',
  '--mapa-tierra',
  '--mapa-borde',
  '--mapa-tinta-oscura',
  '--mapa-acento-linea',
  '--mapa-acento-secundario',
  '--mapa-tarjeta-fondo',
];
const MAPA_SERIES = Array.from({ length: 10 }, (_, i) => `--mapa-serie-${i + 1}`);
const MAPA_PROVINCIAS = Array.from({ length: 4 }, (_, i) => `--mapa-provincia-${i + 1}`);
export const VARIABLES_REQUERIDAS: readonly string[] = [
  '--tipo-institucion',
  '--tipo-poblacion-completa',
  '--tipo-poblacion-indigena',
  '--genero-mujer',
  '--genero-hombre',
  '--genero-sin-info',
  '--atributo-victima',
  '--atributo-perpetrador',
  '--atributo-complice',
  ...MAPA_NOMBRADAS,
  ...MAPA_SERIES,
  ...MAPA_PROVINCIAS,
  '--mapa-punto-color',
  '--accent',
  '--ink',
];
export function verificarVariablesCss(): void {
  const estilos = getComputedStyle(document.documentElement);
  const faltan = VARIABLES_REQUERIDAS.filter(
    (nombre) => estilos.getPropertyValue(nombre).trim() === '',
  );
  if (faltan.length === 0) {
    console.info(
      `[variables-css] ${VARIABLES_REQUERIDAS.length} propiedades del contrato resueltas en :root.`,
    );
    return;
  }
  console.error(
    `[variables-css] ${faltan.length} de ${VARIABLES_REQUERIDAS.length} propiedades del contrato NO resuelven en :root.\n` +
      faltan.map((n) => `  · ${n}`).join('\n') +
      '\n\nLos gráficos que las leen caerán a su color hardcodeado sin avisar.\n' +
      'Revisa src/styles/abstracts/_variables.scss (ver MIGRATION.md, sección 3).',
  );
  throw new Error(
    `[variables-css] faltan ${faltan.length} custom properties en :root: ${faltan.join(', ')}`,
  );
}
