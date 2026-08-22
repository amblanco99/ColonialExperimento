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
 * Reduce un módulo a su programa: la ESTRUCTURA de lo que se ejecuta.
 *
 * Dos pasos:
 *
 *  1. `transpileModule` borra los tipos y los comentarios.
 *  2. El JS resultante se parsea y se recorre el AST emitiendo, por cada nodo,
 *     su tipo y —cuando es un identificador o un literal— su VALOR. El
 *     resultado es una huella de la estructura del programa.
 *
 * Comparar la huella y no el texto es lo correcto, y hizo falta en cuanto entró
 * Prettier: comillas simples o dobles, paréntesis de una flecha de un
 * parámetro, comillas en las claves de un objeto, sangrías y saltos son
 * decisiones de formato que no cambian el programa, y como texto no coinciden.
 * Reimprimir con el printer de TypeScript no bastaba: reutiliza el texto
 * original de los nodos que no se han tocado.
 *
 * Qué SÍ detecta, que es lo que importa: un `if` de más, un `?.` colado, un
 * argumento reordenado, una llamada cambiada, una cadena con otro contenido o
 * un número distinto.
 *
 * Los `ParenthesizedExpression` se desenvuelven: unos paréntesis redundantes no
 * cambian nada. Si los paréntesis alteraran la precedencia, el árbol de debajo
 * sería distinto y la diferencia saldría igual.
 */
const huella = (codigo) => {
  const js = ts.transpileModule(codigo, opciones).outputText;
  const sf = ts.createSourceFile('m.js', js, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
  const partes = [];

  // El nombre de una propiedad es el mismo esté entrecomillado o no:
  // { "Institución": x } y { Institución: x } crean la misma clave. Prettier
  // quita las comillas cuando la clave es un identificador válido, así que se
  // canoniza a "clave + valor". Las claves computadas ([k]) NO entran aquí:
  // esas sí son otra cosa.
  const esNombrePropiedad = (nodo) => {
    const padre = nodo.parent;
    if (!padre || padre.name !== nodo) return false;
    return (
      ts.isPropertyAssignment(padre) ||
      ts.isMethodDeclaration(padre) ||
      ts.isGetAccessorDeclaration(padre) ||
      ts.isSetAccessorDeclaration(padre) ||
      ts.isPropertyDeclaration(padre)
    );
  };

  const visitar = (nodo) => {
    // Paréntesis redundantes: se ignora el envoltorio, se sigue con el interior.
    if (ts.isParenthesizedExpression(nodo)) return visitar(nodo.expression);

    if (esNombrePropiedad(nodo) && (ts.isIdentifier(nodo) || ts.isStringLiteral(nodo) || ts.isNumericLiteral(nodo))) {
      partes.push('NombrePropiedad', JSON.stringify(nodo.text));
      return;
    }

    partes.push(ts.SyntaxKind[nodo.kind]);
    if (
      ts.isIdentifier(nodo) ||
      ts.isPrivateIdentifier(nodo) ||
      ts.isStringLiteral(nodo) ||
      ts.isNumericLiteral(nodo) ||
      ts.isBigIntLiteral(nodo) ||
      ts.isRegularExpressionLiteral(nodo) ||
      ts.isNoSubstitutionTemplateLiteral(nodo) ||
      ts.isTemplateHead(nodo) ||
      ts.isTemplateMiddle(nodo) ||
      ts.isTemplateTail(nodo)
    ) {
      partes.push(JSON.stringify(nodo.text));
    }
    nodo.forEachChild(visitar);
  };

  sf.forEachChild(visitar);
  return partes.join(' ');
};

const aJs = huella;

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
