/**
 * Comprueba que un módulo no haya cambiado de comportamiento entre dos
 * versiones, ignorando tipos y comentarios.
 *
 * Se usa en la fase 5c, donde la regla es que tipar no puede tocar el runtime.
 * En vez de mirar el diff y afirmar que "solo son anotaciones", transpila las
 * dos versiones con TypeScript —que borra los tipos— y compara el JavaScript
 * emitido. Un `if` de más, un `?.` colado o un argumento reordenado aparecen;
 * una anotación, no.
 *
 * USO
 *
 *   node tools/identidad-semantica.mjs <ref-base> [--nuevo <ref>] <archivo...>
 *
 *   # versión de trabajo contra la de un commit
 *   node tools/identidad-semantica.mjs HEAD src/scripts/charts/Linaje.ts
 *
 *   # dos commits entre sí, sin depender del árbol de trabajo
 *   node tools/identidad-semantica.mjs pre-astro --nuevo HEAD src/scripts/charts/Linaje.ts
 *
 *   # varios archivos de golpe
 *   node tools/identidad-semantica.mjs HEAD~1 src/scripts/charts/*.ts
 *
 * Sale con 0 si todos coinciden y con 1 si alguno difiere, así que sirve tal
 * cual en un hook o en CI.
 *
 * OJO: si un archivo cambió de ruta entre las dos versiones (la fase 5a movió
 * los 18 módulos y les cambió la extensión), hay que dar la ruta que tenía en
 * cada ref con la sintaxis `rutaVieja:rutaNueva`.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const raiz = path.resolve(import.meta.dirname, '..');
const requerir = createRequire(path.join(raiz, 'package.json'));
const ts = requerir('typescript');

const argv = process.argv.slice(2);
if (argv.length < 2) {
  console.error('uso: node tools/identidad-semantica.mjs <ref-base> [--nuevo <ref>] <archivo...>');
  process.exit(2);
}

const refBase = argv.shift();
let refNuevo = null;
if (argv[0] === '--nuevo') {
  argv.shift();
  refNuevo = argv.shift();
}
const archivos = argv;

const opciones = {
  compilerOptions: {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    removeComments: true,
  },
};

/**
 * Transpila y normaliza: deja solo lo que se ejecuta.
 *
 * Además de colapsar espacios, quita los paréntesis de las flechas de un solo
 * parámetro. Al anotar `y => …` hay que escribir `(y: number) => …`, y el
 * transpilador emite `(y) => …`: son el mismo programa, pero comparados como
 * texto no coinciden. Es la única normalización que se permite aquí, y es
 * puramente sintáctica.
 */
const aJs = (codigo) =>
  ts
    .transpileModule(codigo, opciones)
    .outputText.replace(/\s+/g, ' ')
    .replace(/\(([A-Za-z_$][\w$]*)\) =>/g, '$1 =>')
    .trim();

const enRef = (ref, ruta) => execSync(`git show ${ref}:${ruta}`, { cwd: raiz }).toString();

let fallos = 0;

for (const entrada of archivos) {
  // "rutaVieja:rutaNueva" para archivos que se movieron entre refs.
  const [rutaBase, rutaNueva = rutaBase] = entrada.split(':');
  const etiqueta = rutaNueva.replace(/^src\/scripts\//, '');

  let base, nuevo;
  try {
    base = aJs(enRef(refBase, rutaBase));
  } catch {
    console.log(`  ? ${etiqueta} — no existe en ${refBase}`);
    fallos++;
    continue;
  }
  try {
    nuevo = refNuevo
      ? aJs(enRef(refNuevo, rutaNueva))
      : aJs(fs.readFileSync(path.join(raiz, rutaNueva), 'utf8'));
  } catch {
    console.log(`  ? ${etiqueta} — no existe en ${refNuevo ?? 'el árbol de trabajo'}`);
    fallos++;
    continue;
  }

  if (base === nuevo) {
    console.log(`  ✓ ${etiqueta} — JS emitido idéntico`);
    continue;
  }

  fallos++;
  const a = nuevo.split(' ');
  const b = base.split(' ');
  const i = a.findIndex((tok, k) => tok !== b[k]);
  console.log(`  ✗ ${etiqueta} — el JS emitido DIFIERE`);
  console.log(`      ${refNuevo ?? 'trabajo'}: …${a.slice(Math.max(0, i - 6), i + 10).join(' ')}…`);
  console.log(`      ${refBase}: …${b.slice(Math.max(0, i - 6), i + 10).join(' ')}…`);
}

process.exitCode = fallos ? 1 : 0;
