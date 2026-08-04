# Migración a Astro

Registro de la migración del sitio de Vite + HTML plano a Astro (TypeScript + SCSS).

**Esto es un port, no un refactor.** Las visualizaciones D3 deben renderizar exactamente
igual que hoy. No hay cambios visuales, funcionalidades nuevas ni reescritura de la lógica
de dibujo.

Rama: `astro`. Punto de retorno: tag `pre-astro` (`00656aa`).

---

## 1. Inventario del estado inicial

| | |
|---|---|
| Páginas | 11 archivos HTML, todos entry points de Vite |
| JS | 24 archivos: 6 en `src/main/`, 16 en `src/charts/`, 2 en `src/tables/`, 1 en `src/ui/` (~4.700 líneas) |
| CSS | 11 archivos en `src/style/` (~2.000 líneas); `style.css` tiene 599 y concentra los tokens |
| Datos | 8 archivos en `public/data/` (~4,3 MB), cargados en runtime con `d3.csv` / `d3.json` |
| Assets | **ninguno** — no hay imágenes, fuentes locales ni PDFs |
| Dependencias | d3 7.9, `@observablehq/plot`, `d3-sankey`, `@turf/rewind` |

### Páginas y sus scripts

| Archivo | Título | Script de entrada |
|---|---|---|
| `index.html` | Crímenes Coloniales | **ninguno** |
| `base-de-datos/index.html` | Tablas y Filtros | `baseDeDatosMain.js` |
| `base-de-datos/caso.html` | Detalle del Caso | `baseDeDatosMain.js` |
| `about/index.html` | Fuentes y metodología | `aboutmain.js` |
| `about/fuentes.html` | Fuentes | `aboutmain.js` |
| `about/delitos.html` | Delitos | `aboutmain.js` |
| `about/documentacion-tecnica.html` | Documentación técnica | `aboutmain.js` |
| `tiempo/index.html` | Tiempo | `tiempomain.js` |
| `personas/index.html` | Composición social | `personasmain.js` |
| `personas/personas.html` | Personas | `personasDetalleMain.js` |
| `personas/otrosAgentes.html` | Otros agentes | `otrosAgentesMain.js` |

### Duplicación encontrada

- **Nav:** copiado a mano en 10 páginas (`caso.html` no lo tiene). Derivó en cuatro
  dimensiones: orden de los enlaces, indentación, espacios sueltos dentro del texto y la
  etiqueta `<main>`.
- **`<head>`:** dos variantes. Solo `index.html` y `caso.html` tienen `<meta name="viewport">`.
- **Footer:** no existe en ninguna página (cero coincidencias de `<footer>`).
- **Tokens CSS:** `caso.css` repite literalmente los primeros 11 tokens de `style.css`.
- **Carrusel `pw-*`:** duplicado entre `personas.html` y `otrosAgentes.html`, cambiando solo
  el prefijo de los ids (`pw*` → `ag*`).
- **Sin CDN:** no hay ningún `<script src="https://…">`. Las dependencias ya son paquetes npm,
  así que "reemplazar CDN por dependencias reales" ya estaba hecho.

---

## 2. Decisiones

| Tema | Decisión | Motivo |
|---|---|---|
| Gestor de paquetes | **npm**, no yarn | El repo tiene `package-lock.json` y `deploy.yml` corre `npm install`. Cambiar a yarn obligaba a tocar el pipeline de deploy sin ganancia. |
| Rama | `astro` (existente) | Ya diverge de `main`. |
| Base URL | `/ColonialExperimento/` | GitHub Pages en subruta; los enlaces existentes siguen funcionando. |
| `build.format` | `'preserve'` | Conserva las rutas `.html` actuales (`caso.html`, `fuentes.html`, `personas.html`). El default `'directory'` las reescribiría a `/caso/` y rompería los enlaces que genera el código de la tabla. |
| CSS | Base global + cadenas por página | `style.css` pasa a `global.scss` en el layout; las 10 hojas especializadas siguen importándose por página, **igual que hoy**. |
| Estado activo del nav | Solo `aria-current="page"` | Hoy no hay ningún estilo activo. Añadir uno visible sería un cambio de diseño. |
| Footer | `Footer.astro` vacío | No hay contenido de footer que portar; se deja la estructura lista. |
| `npm run build` | Sigue en Vite hasta la fase 7 | `deploy.yml` corre `npm run build`. Apuntarlo a Astro antes de tiempo publicaría un sitio incompleto. |
| `outDir` de Astro | `dist-astro/` hasta la fase 7 | Vite y Astro usan `dist/` por defecto; se pisarían y la comparación lado a lado sería imposible. |

---

## 3. El contrato de las 26 propiedades personalizadas

**El punto más delicado de la migración.** Dos archivos leen colores desde CSS en runtime:

```js
function leerVariableCss(nombre, fallback) {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || fallback;
}
```

Duplicado en `agentesComun.js:1` y `TiempoCrimenesMapa.js:10`.

Si estas propiedades se convierten en variables SCSS de tiempo de compilación, la lectura
devuelve vacío y **cae silenciosamente al hex hardcodeado**. Hoy los valores coinciden, así
que no falla nada visible — hasta que uno de los dos cambie y se separen. No hay error en
consola. Es la única forma de fallo invisible de todo el port.

Peor: `agentesComun.js` llama al helper **en el nivel superior del módulo** (líneas 9-11 y
24-26), o sea al importarlo, antes de que corra ninguna función de gráfico.

**Estas propiedades deben seguir siendo custom properties reales en `:root`.** Las variables
SCSS son la fuente de verdad; `:root` las emite como custom properties.

| Origen | Propiedades |
|---|---|
| `agentesComun.js:9-11` | `--tipo-institucion`, `--tipo-poblacion-completa`, `--tipo-poblacion-indigena` |
| `agentesComun.js:24-26` | `--genero-mujer`, `--genero-hombre`, `--genero-sin-info` |
| `TiempoCrimenesMapa.js:17-24` | `--mapa-fondo-pergamino`, `--mapa-panel`, `--mapa-tierra`, `--mapa-borde`, `--mapa-tinta-oscura`, `--mapa-acento-linea`, `--mapa-acento-secundario`, `--mapa-tarjeta-fondo` |
| `TiempoCrimenesMapa.js:27` | `--mapa-serie-1` … `--mapa-serie-10` (construidas con template literal) |
| `TiempoCrimenesMapa.js:624` | `--mapa-punto-color` |
| `AgentesButterfly.js:133` | `--accent` (string literal `"var(--accent)"`) |

Solo tienen lector en JS estas 26. `--mapa-font` está en `:root` pero nadie la lee.
`style.css:20` ya trae un comentario advirtiendo que JS las lee.

**Verificación automática:** `src/scripts/dev/verificarVariablesCss.ts` comprueba que las 26
resuelvan a un valor no vacío en `:root` y lanza error si alguna falla. Corre en todas las
páginas en modo dev. Convierte el fallo invisible en un error duro.

---

## 4. Otros puntos que no son mecánicos

1. **Imports de CSS absolutos.** Los 6 `src/main/*.js` hacen `import '/src/style/style.css'`.
   Ese especificador no sobrevive; el CSS pasa al layout y al frontmatter de cada página.
2. **17 rutas de datos con doble barra.** Todas usan
   `` `${import.meta.env.BASE_URL}/data/X.csv` ``, pero `BASE_URL` ya termina en `/`, así que
   la URL real lleva `//`. Los servidores lo normalizan y por eso nunca falló. Se corrige a
   `` `${import.meta.env.BASE_URL}data/X.csv` ``. La misma trampa aplica a los enlaces del nav.
3. **5 saltos de página hardcodeados** dentro del código D3: `tablageneral.js:114,159`,
   `BeeswarmGenero.js:339`, `TablasConteo.js:158`, `TiempoCrimenesMapa.js:133,151`.
4. **Dos bloques `<style>` inyectados** por `innerHTML` con hex hardcodeados
   (`ConteoCrimenes.js:46`, `TablasConteo.js:138`). Se portan tal cual.

---

## 5. Correcciones incluidas en el port

Invisibles, van sin commit aparte:

- **`tiempo/index.html` cerraba `</main>` dos veces.** Etiqueta desbalanceada, eliminada.
- **Guardas en las páginas de about.** `aboutmain.js` llamaba a `crearConteoCrimenes`,
  `crearTiposCasos` y `crearLinaje` en las 4 páginas de about, pero `about/index` y
  `documentacion-tecnica` no tienen ninguno de los contenedores. Ahora cada página llama solo
  a los gráficos cuyos contenedores existen.

Con cambio visual, aprobado explícitamente:

- **Orden del nav unificado.** `index.html` ponía "Sobre el proyecto" en tercer lugar; las
  otras 9 páginas lo ponen al final. Al existir un solo `Nav.astro` hay que elegir uno: se
  adopta el orden mayoritario de las 9. **Esto reordena visiblemente el menú de la portada.**

### Meta viewport — commit aparte (fase 3.5)

Solo `index.html` y `base-de-datos/caso.html` tienen `<meta name="viewport">`. Como
`BaseLayout` lo da a las 11, los breakpoints móviles (`style.css:590`, más 600/640/720px en
otros archivos) **empiezan a aplicarse en 9 páginas que nunca los habían visto**.

Páginas a revisar en teléfono antes de ese commit:

1. `about/index.html`
2. `about/fuentes.html`
3. `about/delitos.html`
4. `about/documentacion-tecnica.html`
5. `base-de-datos/index.html`
6. `tiempo/index.html`
7. `personas/index.html`
8. `personas/personas.html`
9. `personas/otrosAgentes.html`

Lo que se vea mal se anota abajo como trabajo posterior. **No se corrige CSS en esta
migración.**

---

## 6. Estructura destino

```
src/
  components/   Nav.astro, Footer.astro
  layouts/      BaseLayout.astro
  pages/        una .astro por página, mismas rutas
  scripts/      D3 y demás TS de cliente, un módulo por visualización
  styles/       abstracts/_variables.scss, _mixins.scss
                base/_reset.scss, _typography.scss
                pages/_caso.scss, _mapa.scss, …
                global.scss
public/         data/
```

D3 corre solo en el navegador, importado desde un `<script>` a nivel de página,
**nunca desde el frontmatter**.

---

## 7. Fases

| Fase | Contenido | Estado |
|---|---|---|
| Pre-vuelo | Tag `pre-astro`, subir `deploy.yml` a Node 22 | pendiente |
| 0 | Este documento | **en curso** |
| 1 | Scaffold: Astro, sass, TS, Prettier | pendiente |
| 2 | `BaseLayout` + `Nav` + `Footer` | pendiente |
| 3 | Páginas, una a una, de la más simple a la más compleja | pendiente |
| 3.5 | Meta viewport | pendiente |
| 4a | Tokens, base, `global.scss` | pendiente |
| 4b | Las otras 10 hojas → `src/styles/pages/` | pendiente |
| 5a | Mover D3 a `src/scripts/*.ts` sin tocar contenido | pendiente |
| 5b | Corregir las 17 rutas de datos y los 5 saltos de página | pendiente |
| 5c | Tipar | pendiente |
| 6 | Prettier sobre todo el repo | pendiente |
| 7 | Cambiar `build` a Astro, `outDir` a `dist`, borrar lo viejo | pendiente |

**Nota sobre Node:** `astro@7.1.6` exige `engines.node >= 22.12.0` y `deploy.yml` estaba
fijado en `node-version: 20`. Se sube a 22 en el pre-vuelo, no en el cambio final: si no, CI
instalaría bien mientras `build` siga siendo Vite y reventaría justo al hacer el cambio.

---

## 8. Trabajo posterior (no se toca en esta migración)

- Lo que aparezca en las 9 páginas al aplicarse el breakpoint móvil.
- No hay favicon en todo el repo.
- `public/data/metadatos.csv` no lo carga nadie; `style.css:237` estiliza un
  `#tablaMetadatos` que ninguna página define.
- El carrusel tiene `role="tablist"` y `role="tab"` pero le faltan `aria-selected`,
  `aria-controls` y `role="tabpanel"` en los paneles.
- `personas/personas.html` y `personas/otrosAgentes.html` solo se alcanzan desde las tarjetas
  de `personas/index.html`, nunca desde el nav.
- `personas/personas.html` tiene una sección "Mujeres Mencionadas" cuyo cuerpo es `PENDIENTE`.
- `leerVariableCss` está duplicado en dos archivos.
- Los dos bloques `<style>` inyectados por `innerHTML` se saltan la hoja de estilos.
- **`AgentesButterfly.js:133` probablemente ya está roto.** Define
  `colorActivo = "var(--accent)"` como valor por defecto cuando no hay tipo seleccionado, y lo
  aplica en la línea 213 con `.attr("fill", colorActivo)` — un **atributo de presentación**
  SVG, donde `var()` no resuelve. La barra se dibuja con el relleno por defecto, no con el
  color de acento. **Se porta tal cual; no se corrige**, porque corregirlo cambiaría el
  renderizado.
- ESLint no tiene parser de `.astro` configurado.
