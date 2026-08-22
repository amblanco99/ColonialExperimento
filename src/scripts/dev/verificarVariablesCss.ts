/**
 * Comprueba que las 27 custom properties que el JS lee en tiempo de ejecución
 * resuelvan a un valor no vacío en :root.
 *
 * POR QUÉ EXISTE
 *
 * Dos módulos leen colores desde CSS con este helper:
 *
 *   function leerVariableCss(nombre, fallback) {
 *     const valor = getComputedStyle(document.documentElement)
 *       .getPropertyValue(nombre).trim();
 *     return valor || fallback;
 *   }
 *
 * Si la propiedad no existe, `valor` sale vacío y la función devuelve el
 * fallback hardcodeado. Hoy los dos valores coinciden, así que **no falla nada
 * visible**: no hay excepción, no hay aviso en consola, el gráfico se dibuja
 * con un color plausible. Solo se nota cuando el token y el fallback se
 * separan, y para entonces nadie relaciona el síntoma con la causa.
 *
 * Este chequeo convierte ese fallo invisible en un error duro.
 *
 * CASO ESPECIAL: --mapa-serie-1 … --mapa-serie-10
 *
 * TiempoCrimenesMapa.js:27 las pide con un nombre construido en runtime:
 *
 *   SERIE_FALLBACK.map((valor, i) => leerVariableCss(`--mapa-serie-${i + 1}`, valor))
 *
 * Al no aparecer nunca como cadenas literales, **ningún grep sobre el bundle
 * puede verificarlas**: buscar "--mapa-serie-7" devuelve cero siempre, exista
 * o no la propiedad. Este chequeo es la única cobertura que tienen, y por eso
 * las genera igual que el módulo: del 1 al 10, en el mismo orden.
 */

/** Las ocho del mapa, por nombre. `TiempoCrimenesMapa.js:17-24`. */
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

/**
 * Las diez series, generadas igual que en `TiempoCrimenesMapa.js:27`: mismo
 * prefijo, mismo rango, mismo orden. Si allí cambiara el número de series,
 * aquí hay que cambiarlo también.
 */
const MAPA_SERIES = Array.from({ length: 10 }, (_, i) => `--mapa-serie-${i + 1}`);

export const VARIABLES_REQUERIDAS: readonly string[] = [
  // agentesComun.js:9-11 — leídas al importar el módulo, no al dibujar.
  '--tipo-institucion',
  '--tipo-poblacion-completa',
  '--tipo-poblacion-indigena',

  // agentesComun.js:24-26 — igual, en el nivel superior del módulo.
  '--genero-mujer',
  '--genero-hombre',
  '--genero-sin-info',

  ...MAPA_NOMBRADAS,
  ...MAPA_SERIES,

  // TiempoCrimenesMapa.js:624
  '--mapa-punto-color',

  // Literales "var(--…)" escritos en atributos y estilos desde JS:
  // AgentesButterfly.js:225, PersonasDashboard.js:144, TablasConteo.js:102-103 y :181.
  '--accent',
  '--ink',
];

/**
 * Resuelve cada propiedad contra :root y lanza si alguna sale vacía.
 *
 * Tiene que correr **antes** de que se importe cualquier módulo de gráficos:
 * `agentesComun.js` lee su paleta en el nivel superior del módulo, o sea al
 * importarlo, no al llamar a ninguna función.
 */
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
