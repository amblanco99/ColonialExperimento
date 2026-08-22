# Migración a Astro

Registro de la migración del sitio de Vite + HTML plano a Astro (TypeScript + SCSS).

**Esto es un port, no un refactor.** Las visualizaciones D3 deben renderizar exactamente
igual que hoy. No hay cambios visuales, funcionalidades nuevas ni reescritura de la lógica
de dibujo.

Rama: `astro`. Punto de retorno: tag `pre-astro` (`00656aa`).

---

## 1. Inventario

**Actualizado tras fusionar `origin/main` (`87aa6a7 personas`) el 2026-08-13.** Las cifras de
abajo son del árbol fusionado, no del estado inicial. Donde algo cambió respecto al inventario
original se indica.

| | |
|---|---|
| Páginas | 11 archivos HTML (sin cambios) |
| JS | **23 archivos**: 6 en `src/main/`, 15 en `src/charts/`, 2 en `src/tables/`, 1 en `src/ui/` (antes 24) |
| CSS | **15 archivos** en `src/style/` (antes 11); `style.css` bajó a 387 líneas |
| Datos | 8 archivos en `public/data/` (~4,3 MB), sin cambios |
| Assets | **ninguno** — no hay imágenes, fuentes locales ni PDFs |
| Dependencias | d3 7.9, `@observablehq/plot`, `d3-sankey`, `@turf/rewind`, **`d3-hexbin` 0.2.2** (nueva) |

### Qué cambió en `src/charts/`, `src/tables/` y `src/ui/`

**6 módulos eliminados:** `AgentesBeeswarm.js`, `AgentesSankey.js`, `BeeswarmGenero.js`,
`WaffleGenero.js`, `zoomBeeswarm.js`, `ui/carruselPreguntas.js`.

**5 módulos nuevos:** `DelitosSunburstGenero.js`, `ParticipacionTiempoAgentes.js`,
`PersonasDashboard.js`, `verCasos.js`, `ui/vistaToggle.js`.

**18 módulos siguen en pie** (los que porta la fase 5a):

`AgentesButterfly` · `ButterflyGenero` · `ConteoCrimenes` · `DelitosSunburstGenero` ·
`InstitucionesAtributo` · `Linaje` · `OtrosAgentesDashboard` · `ParticipacionTiempo` ·
`ParticipacionTiempoAgentes` · `PersonasDashboard` · `TablasConteo` · `TiempoCrimenesMapa` ·
`TiposCasos` · `agentesComun` · `verCasos` · `tables/caso` · `tables/tablageneral` ·
`ui/vistaToggle`

**Reescrituras grandes:** `TablasConteo` (686 líneas), `ParticipacionTiempo` (516),
`ButterflyGenero` (320), `AgentesButterfly` (280), `OtrosAgentesDashboard` (188).

**El carrusel desapareció.** `personasDetalleMain.js` ya no usa `carruselPreguntas.js`, sino
`crearPersonasDashboard()` y un `initVistaToggle({ botones, vistas })`. El contrato de ids
`pw*`/`ag*` que había que preservar en `personas.html` y `otrosAgentes.html` **ya no existe**.

**4 hojas nuevas:** `apilado.css`, `conteo.css`, `dashboard.css`, `lineas.css`.

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
- ~~**Carrusel `pw-*`:** duplicado entre `personas.html` y `otrosAgentes.html`.~~ **Ya no
  aplica:** la fusión con `origin/main` sustituyó el carrusel por un conmutador de vistas
  (`ui/vistaToggle.js`) en las dos páginas.
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
| CSS | Base global + cadenas por página | `style.css` pasa a `global.scss` en el layout; las **14** hojas especializadas siguen importándose por página, **igual que hoy**. (La rareza de que `otrosAgentes` no cargara `botones.css`, que había que preservar, la arregló ella en `origin/main`: ahora sí la importa.) |
| Estado activo del nav | Solo `aria-current="page"` | Hoy no hay ningún estilo activo. Añadir uno visible sería un cambio de diseño. |
| Footer | `Footer.astro` vacío | No hay contenido de footer que portar; se deja la estructura lista. |
| `npm run build` | Sigue en Vite hasta la fase 7 | `deploy.yml` corre `npm run build`. Apuntarlo a Astro antes de tiempo publicaría un sitio incompleto. |
| `outDir` de Astro | `dist-astro/` hasta la fase 7 | Vite y Astro usan `dist/` por defecto; se pisarían y la comparación lado a lado sería imposible. |

---

## 3. El contrato de las 27 propiedades personalizadas

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

**Re-extraído del árbol fusionado el 2026-08-13.** Las 25 que se leen con `leerVariableCss` no
cambiaron: ningún módulo eliminado se llevó ninguna, y ningún módulo nuevo lee ninguna que no
existiera. Lo único que se movió fue la parte de los literales `var(--…)`.

| Origen | Propiedades |
|---|---|
| `agentesComun.js:9-11` | `--tipo-institucion`, `--tipo-poblacion-completa`, `--tipo-poblacion-indigena` |
| `agentesComun.js:24-26` | `--genero-mujer`, `--genero-hombre`, `--genero-sin-info` |
| `TiempoCrimenesMapa.js:17-24` | `--mapa-fondo-pergamino`, `--mapa-panel`, `--mapa-tierra`, `--mapa-borde`, `--mapa-tinta-oscura`, `--mapa-acento-linea`, `--mapa-acento-secundario`, `--mapa-tarjeta-fondo` |
| `TiempoCrimenesMapa.js:27` | `--mapa-serie-1` … `--mapa-serie-10` (construidas con template literal) |
| `TiempoCrimenesMapa.js:624` | `--mapa-punto-color` |
| `AgentesButterfly.js:225` | `--accent` (literal `"var(--accent)"`; antes estaba en la línea 133) |
| `TablasConteo.js:102-103` | `--genero-mujer`, `--tipo-institucion`, **`--ink`** (literales) |
| `TablasConteo.js:181` | **`--ink`** (literal) |
| `PersonasDashboard.js:144` | `--accent` (literal, vía `style.setProperty("--chip-color", …)`) |

**Cambios respecto al contrato anterior:**

- **`--ink` es nueva en el contrato.** La introdujo `TablasConteo.js` al reescribirse. Total:
  **26 → 27**.
- El literal `var(--accent)` de `AgentesSankey.js` desapareció con el archivo, pero `--accent`
  sigue en el contrato por `AgentesButterfly` y por el `PersonasDashboard` nuevo.
- Ninguna propiedad salió del contrato.

**Comprobado en el árbol fusionado: las 27 siguen definidas en `:root`.** `style.css` perdió 212
líneas en la fusión pero conserva sus 37 tokens intactos; ninguno de los que lee el JS se fue.

`--mapa-font` sigue en `:root` sin lector. `style.css` mantiene el comentario que avisa de que
JS lee estas propiedades.

**`PALETA_ATRIBUTO` se queda como está — decidido, y NO es trabajo de la fase 4a.**
`agentesComun.js` incorporó tres colores **hardcodeados** (`#2f7d5c`, `#c1443e`, `#6b5b95`) que
no son custom properties. Convertirlos en tokens cambiaría el renderizado, y eso queda fuera de
un port. **La fase 4a no los toca**: no entran en el contrato, no se les busca equivalente en
`:root` y no se añaden a `_variables.scss`. Queda anotado abajo como trabajo posterior.

**Verificación automática:** `src/scripts/dev/verificarVariablesCss.ts` comprueba que las 27
resuelvan a un valor no vacío en `:root` y lanza error si alguna falla. Corre en todas las
páginas en modo dev. Convierte el fallo invisible en un error duro.

**El build NO detecta que falte un token. Este chequeo es lo único que lo hace.** Comprobado a
propósito en la fase 4a: se quitó `7: #3ab8b0` del mapa `$mapa-series`, se compiló y
`npm run build:astro` **salió con exit 0, sin un solo aviso**, publicando nueve series en vez de
diez. Sass no se queja (el `@each` simplemente itera sobre menos entradas), Astro tampoco, y el
CSS resultante es válido. El gráfico habría usado el color hardcodeado de `SERIE_FALLBACK` sin
que nada lo dijera. El chequeo sí la cazó:

```
[variables-css] 1 de 27 propiedades del contrato NO resuelven en :root.
  · --mapa-serie-7
```

O sea: un build verde no dice nada sobre el contrato. Si alguna vez se quita este chequeo, se
pierde la única señal que existe.

**Trampa al añadir scripts solo de desarrollo.** La guarda tiene que ir **dentro** del
`<script>`, no en el marcado que lo envuelve:

```astro
<!-- MAL: Astro empaqueta el script igual y acaba en producción -->
{import.meta.env.DEV && <script>…</script>}

<!-- BIEN: Vite sustituye DEV por false y elimina el import dinámico -->
<script>
  if (import.meta.env.DEV) {
    const { verificarVariablesCss } = await import('../scripts/dev/verificarVariablesCss');
    verificarVariablesCss();
  }
</script>
```

Astro recoge y empaqueta las etiquetas `<script>` de un componente **aunque el marcado que las
rodea sea condicional**: la condición decide si se renderiza la etiqueta, no si el módulo entra
al bundle. Se detectó a tiempo en la fase 4a, pero cualquiera que añada otro script de
desarrollo se va a topar con lo mismo.

---

## 4. Otros puntos que no son mecánicos

1. **Imports de CSS absolutos.** Los 6 `src/main/*.js` hacen `import '/src/style/style.css'`.
   Ese especificador no sobrevive; el CSS pasa al layout y al frontmatter de cada página.
2. **16 rutas de datos con doble barra** (antes 17). Todas usan
   `` `${import.meta.env.BASE_URL}/data/X.csv` ``, pero `BASE_URL` ya termina en `/`, así que
   la URL real lleva `//`. Los servidores lo normalizan y por eso nunca falló. Se corrige a
   `` `${import.meta.env.BASE_URL}data/X.csv` ``. La misma trampa aplica a los enlaces del nav.
   Comprobado en el árbol fusionado: **ninguna está corregida todavía**. Reparto por archivo —
   `TiempoCrimenesMapa` 4, `caso` 3, `TablasConteo` 2, `tablageneral` 2, y una cada uno en
   `OtrosAgentesDashboard`, `Linaje`, `ConteoCrimenes`, `TiposCasos`, `PersonasDashboard`.
   *Cambio en la fusión:* desaparecieron las de `BeeswarmGenero`, `WaffleGenero` y
   `ParticipacionTiempo`; apareció la de `PersonasDashboard`.
3. **7 saltos de página hardcodeados** (antes 5), todos dentro del código de gráficos:
   `tablageneral.js:114` y `:159`, `TablasConteo.js:23`, `TiempoCrimenesMapa.js:133` y `:151`,
   **`verCasos.js:33`** (nuevo) y **`TablasConteo.js:105`** (nuevo, y de otro tipo: no es
   `window.location.href` sino `botonExpandir.href = opcion.destino`, con `destino` valiendo
   `"personas.html"` o `"otrosAgentes.html"` según las líneas 102-103).
   *Cambio en la fusión:* murió el de `BeeswarmGenero.js:339`; el de `TablasConteo` se movió de
   la línea 158 a la 23; entraron los dos nuevos.
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

### El CSS de index.html cambia de mecanismo

`index.html` era la única página que cargaba la hoja global con una etiqueta directa:

```html
<link rel="stylesheet" href="/src/style/style.css" />
```

Las otras 10 la recibían a través del `import` de su módulo JS. Ahora `BaseLayout` la importa
y Astro la empaqueta y versiona, así que en el HTML publicado sale como
`/ColonialExperimento/_astro/<nombre>.<hash>.css`.

Los estilos son los mismos; lo que cambia es la URL y el momento en que se resuelve. **Si más
adelante aparece una regresión de estilos en la portada y se bisecta hasta la fase 2, es por
esto.** El efecto secundario bueno es que `index.html` deja de ser la excepción: ahora las 11
páginas reciben la hoja global por la misma vía.

### Comentarios HTML: qué se conserva y qué no

- **Los comentarios que ya están en las 11 páginas se copian literalmente.** Son parte del
  contenido que se porta, y decidir cuáles sobran es otra tarea.
- **Lo que escribamos nosotros va en el frontmatter**, nunca como comentario HTML. Astro
  publica los comentarios HTML: en la fase 2 se colaron tres notas explicativas al output de
  todas las páginas antes de detectarlo.
- **Si un comentario del original parece una nota del autor para sí mismo** y no contenido
  (un `TODO`, un recordatorio, código comentado), **se marca y se pregunta**, no se decide
  sobre la marcha.

### Meta viewport — fase 3.5, ahora una revisión y no un commit

Solo `index.html` y `base-de-datos/caso.html` tenían `<meta name="viewport">`. Como
`BaseLayout` lo da a las 11, los breakpoints móviles (`style.css:438`, más 600/640/720/900px en
otros archivos) **empiezan a aplicarse en 9 páginas que nunca los habían visto**.

**El plan original era aislarlo en un commit propio. Eso ya no es posible.** `BaseLayout` lleva
la etiqueta desde la fase 2, así que cada página la recibe en el momento en que se porta, no
en un commit posterior. Cuando se detectó, `index.html` y `about/documentacion-tecnica.html` ya
habían salido con ella. Se acepta el hecho en vez de deshacerlo.

Consecuencias, para quien venga después:

- **La etiqueta llega página a página, en el commit de cada página.** No existe ni existirá un
  commit "fase 3.5" que se pueda revertir por separado.
- **Se perdió la opción de revertir el cambio de forma aislada.** Quien bisecte una regresión
  en móvil llegará al commit de esa página concreta, donde el viewport está mezclado con el
  port del marcado. No es el commit de la fase 3.5, porque no lo hay.
- **La fase 3.5 pasa a ser una puerta de verificación**, no un commit: cuando termine la fase 3,
  se revisan las 9 páginas en teléfono de una pasada, antes de empezar la fase 4.
- Además, cada página de esa lista se mira a ancho de teléfono **en el momento de portarla**,
  para repartir el trabajo en vez de acumularlo al final.

**Sigue sin tocarse el CSS.** Lo que se vea mal se anota abajo, en trabajo posterior.

Lista de la puerta de verificación:

1. `about/index.html`
2. `about/fuentes.html`
3. `about/delitos.html`
4. `about/documentacion-tecnica.html`
5. `base-de-datos/index.html`
6. `tiempo/index.html`
7. `personas/index.html`
8. `personas/personas.html`
9. `personas/otrosAgentes.html`

**Dónde el análisis de CSS deja de bastar.** En las páginas de solo texto se puede predecir
razonablemente lo que hará el breakpoint leyendo las reglas. En las que llevan gráfico, no: hay
que mirarlas. Por orden de prioridad:

- **`tiempo/index.html`** — el mapa (760×820) y el gráfico de líneas, más paneles de filtro
  construidos por JS que no existen en el HTML. **Sigue siendo la primera.**
- **`about/fuentes.html`** — Observable Plot con ancho fijo de 600 y sin `viewBox`, así que no
  se comporta como los demás.
- **`personas/personas.html` y `personas/otrosAgentes.html`** — bajan de prioridad, ver abajo.

El resto de páginas con gráfico caen en el patrón general descrito arriba (se encogen y pierden
legibilidad), y con mirar una basta para saber cómo están todas.

**Las páginas del dashboard sí tienen breakpoint: 900 px.** Se comprobó leyendo
`dashboard.css`, que trae una única media query (línea 108):

```css
@media (max-width: 900px) {
  .personas-filtros-top { position: static; }   /* deja de ser sticky */
  .personas-grid        { flex-direction: column; }  /* dos columnas -> una */
}
```

`.personas-grid` es `display:flex` con `.personas-columna { flex: 1 1 0; min-width: 0 }`, así
que **por debajo de 900 px pasa a una sola columna**. `.personas-main-ancho` no necesita
breakpoint: es `max-width: 1700px; width: 96%`, o sea fluido (a 375 px ocupa ~360).

Esto **descarta el escenario malo**: en un teléfono no van a quedar dos gráficos de 820 px lado
a lado. A 375 px hay una columna y cada gráfico se encoge, que es el problema sistemático ya
descrito — legibilidad, no maquetación. Por eso `personas.html` y `otrosAgentes.html` bajan en
la lista: se comportan como las demás.

**Ojo para la fase 4a: 900 es un valor nuevo.** El juego de breakpoints ya no es
600/640/720/768 sino **600/640/720/768/900**, repartido así tras la fusión:

| valor | archivo | qué hace |
|---|---|---|
| 600 | `caso.css:286` | padding de `.page` |
| 640 | `conteo.css:145` y `:260` | dos bloques del conteo (**nuevos**) |
| 720 | `agentes-filtros.css:126` | apila las filas de filtros |
| 768 | `style.css:438` | topnav, `.col-root`/`.cards-container` a columna, `.card` al 100% |
| 900 | `dashboard.css:108` | **nuevo**: `.personas-grid` a una columna, filtros no sticky |

*(El bloque de 640 que tenía `style.css` para el carrusel desapareció con él en la fusión; los
dos de 640 que hay ahora son de `conteo.css` y son otra cosa.)*

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
| Pre-vuelo | Tag `pre-astro`, subir `deploy.yml` a Node 22 | **hecho** |
| 0 | Este documento | **hecho** (se corrige sobre la marcha) |
| 1 | Scaffold: Astro, sass, TS, Prettier | **hecho** |
| 2 | `BaseLayout` + `Nav` + `Footer` | **hecho** |
| — | Fusionar `origin/main` (`87aa6a7`) | **hecho** (2026-08-13) |
| 3 | Páginas, una a una, de la más simple a la más compleja | **hecha**, 11 de 11 |
| 3.5 | Revisión en móvil de las 9 páginas (ya no es un commit) | **hecha**, sin incidencias |
| 4a | Tokens, base, `global.scss` | **hecha** |
| 4b | Las otras **14** hojas → `src/styles/pages/` | **hecha** |
| 5a | Mover D3 a `src/scripts/*.ts` sin tocar contenido (**18 módulos**) | **hecha** |
| 5b | Corregir las **16** rutas de datos y los **7** saltos de página | **hecha** |
| 5c | Tipar | **hecha**, 845 errores a 0 |
| 6 | Prettier sobre todo el repo | **hecha** |
| 7 | Cambiar `build` a Astro, `outDir` a `dist`, borrar lo viejo | **hecha** |

**Páginas portadas (7):** `index`, `about/index`, `about/fuentes`, `about/delitos`,
`about/documentacion-tecnica`, `base-de-datos/index`, `personas/index`.
**Pendientes (4):** `base-de-datos/caso`, `personas/personas`, `personas/otrosAgentes`,
`tiempo/index`.

**Nota sobre Node:** `astro@7.1.6` exige `engines.node >= 22.12.0` y `deploy.yml` estaba
fijado en `node-version: 20`. Se sube a 22 en el pre-vuelo, no en el cambio final: si no, CI
instalaría bien mientras `build` siga siendo Vite y reventaría justo al hacer el cambio.

### Dos idioms para el `any` de la fase 5c

Tipar los 18 módulos deja dos escapes recurrentes. Se escriben **siempre igual**, para que el
trabajo posterior de tipado tenga una sola cosa que buscar en vez de diez variantes.

**1. Nodos de jerarquía que d3 muta.** El patrón del árbol colapsable de d3 le cuelga campos
propios a los nodos (`_children` para plegar, `x0`/`y0` para la posición anterior) y reasigna
`id`. Nada de eso está en `HierarchyNode`. Aparece en `Linaje` y en `DelitosSunburstGenero`, y
puede salir en cualquier otro que use `d3.hierarchy` o `d3.stratify`:

```ts
// TODO: type — nodo de jerarquía de d3 mutado por el patrón del árbol
// colapsable: se le cuelgan _children, x0 e y0 y se le reasigna id, que no
// están en HierarchyNode. Ver MIGRATION.md.
type NodoMutable = any;
```

**2. Cadenas de selección y transición de d3.** Los genéricos de `Selection` y `Transition` no
cuadran cuando el dato es un nodo mutado, y salen como `ts(2769) no overload matches this call`.
No se pelean: se anota la cadena y se sigue.

```ts
// TODO: type — genéricos de selección/transición de d3. Ver MIGRATION.md.
type SeleccionD3 = any;
```


**3. Filas de CSV.** `d3.csv` devuelve `DSVRowString<string>`, que no conoce los nombres de las
columnas del proyecto (`Nombre_Sub_Codigo`, `ID_Documento`, `Atributo`…). Cada acceso da un
`ts(2339)`. Se usa un alias **exportado desde `agentesComun.ts`**, para no volver a inventar uno
por módulo:

```ts
// TODO: type — fila cruda de los CSV. Ver MIGRATION.md.
export type FilaCsv = any;
```

**Por qué `any` y no `DSVRowString<string>`, que sería lo preciso:** el tipo exacto no añade
seguridad aquí. Convertiría cada `ts(2339)` en un `ts(18048)` —«posiblemente undefined»— porque
todas sus propiedades son opcionales: mismo número de errores, resueltos con `!`, y ninguna
garantía nueva. Si alguien renombra una columna del CSV, las dos versiones fallan igual en
runtime y ninguna lo detecta al compilar. El alias dice lo que de verdad sabemos: es una fila
suelta de un CSV.

**Excepción deliberada:** `tables/caso.ts` usa `d3.DSVRowString<string>` y funciona. **No se
degrada a `FilaCsv`** solo por uniformidad: es más preciso que el alias y ya está escrito.

**Hecho:** los cinco módulos que se habían inventado su propio alias (`Fila` en `TablasConteo`,
`FilaEvento` en los dos de participación, `EventoPersona` en `ButterflyGenero`, `EventoAgente`
en `AgentesButterfly`) usan ya el `FilaCsv` compartido. Solo queda `tables/caso.ts`, con su
`DSVRowString<string>`, que es la excepción deliberada de arriba.

**4. Estado mutable inicializado a `null`.** Muy común en los módulos con interacción:
`let seleccionNodo = null` y compañía, que TypeScript infiere como `any` implícito
(`ts(7034)`/`ts(7005)`). Se anota **en la declaración**:

```ts
let seleccionNodo: NodoMutable = null;
```

> **REGLA: anotar solo en la declaración, nunca con un buscar-y-reemplazar sobre `= null`.**
> Un patrón como `s/(\w+) = null;/\1: T = null;/` también acierta en las **asignaciones**
> (`seleccionNodo = null;` dentro de una función), y eso no es TypeScript válido: produce una
> etiqueta suelta y un error de sintaxis. Pasó dos veces durante la fase 5c
> (`ParticipacionTiempo` e `InstitucionesAtributo`), y las dos hubo que revertir el archivo y
> rehacerlo. En `TiempoCrimenesMapa` hay ~39 sitios de este tipo: a mano, uno a uno.

**5. Paletas indexadas por string.** `PALETA_GENERO`, `PALETA_TIPO` y `PALETA_ATRIBUTO` son
objetos literales, así que indexarlos con una variable `string` da `ts(7053)`:

```ts
(PALETA_GENERO as Record<string, string>)[genero]
```

**Es el idiom más extendido del proyecto y no tenía nombre: 21 usos en 9 módulos.** Queda
registrado aquí para que se busque como los demás.

**Búsqueda para el trabajo posterior:** `grep -rn "NodoMutable\|SeleccionD3\|FilaCsv\|as Record<string, string>" src/scripts/`.

La regla de fondo no cambia: el `any` es para donde los genéricos de d3 se ponen feos, no para
ahorrarse una anotación evidente. En `Linaje`, 18 de 38 errores venían de la mutación de nodos
—una sola causa— y los otros 20 son anotaciones normales que sí se escriben.

### Por qué la regla es "el JS emitido es idéntico" y no "se comporta igual"

`tools/identidad-semantica.mjs` cazó dos cambios reales durante la fase 5c, los dos míos, y los
dos habrían pasado una revisión a ojo.

**1. `?? undefined` en `ParticipacionTiempo`.** Al tipar escribí:

```diff
- codigo: crimenActivo,
+ codigo: crimenActivo ?? undefined,
```

**El comportamiento observable habría sido idéntico.** `irATablasFiltradas` filtra con
`if (overrides.codigo)`, y `null` y `undefined` son igual de falsos, así que la URL generada
habría sido exactamente la misma en todos los casos. Aun así es una violación: el JS emitido
cambia.

Y ahí está el motivo de la regla. "Se comporta igual" es un juicio: hay que razonar sobre el
llamante, convencerse de que ninguna rama distingue `null` de `undefined`, y acertar. "El JS
emitido es idéntico" no se opina, se comprueba. La primera versión de esa afirmación habría
sido correcta esta vez y no hay forma de saber cuándo dejaría de serlo.

**2. Renombrar un parámetro sin usar.** En los dos sunburst renombré `event` a `_event` para
callar un `ts(6133)`. Mismo caso: no cambia nada observable, cambia el JS emitido. Se revirtió
y se deja el aviso: `ts(6133)` es una sugerencia, no un error, y no hace fallar el chequeo.
**Vale más una sugerencia que un cambio de runtime no verificable.**

### Patrón recurrente: `d3.extent` devuelve `[T | undefined, T | undefined]`

Sale en `PersonasDashboard`, `OtrosAgentesDashboard` y volverá a salir. Genera dos errores por
sitio, `ts(18048)` y `ts(2345)`:

```ts
const [decadaMin, decadaMax] = d3.extent(datos, d => d.década);
const DECADAS = d3.range(decadaMin!, decadaMax! + 10, 10);
```

**Resolución estándar: `!`.** Está justificado porque en todos los casos la función ya sale
antes si el array está vacío, así que `extent` no puede devolver `undefined` cuando se llega
ahí. Un `if` en su lugar cambiaría el comportamiento: el gráfico pasaría a no dibujarse en
silencio en vez de fallar.

Si algún día se quita ese return temprano, estos `!` dejan de estar justificados.

### OJO: `astro check` vale menos de lo que parece hasta la fase 5c

Desde la fase 5a, `tsconfig.json` excluye `src/scripts/charts`, `src/scripts/tables` y
`src/scripts/ui`. Los 18 módulos se renombraron a `.ts` sin tipar, y en modo strict dan **845
errores** — 245 `ts(7006)` de parámetros con `any` implícito, 176 `ts(2339)`, 60 `ts(18047)`,
57 `ts(2345)`, etc. Ninguno afecta a los `.astro`.

Mientras esas tres líneas estén en los excludes, **un `npm run check -> exit 0` solo dice que
las páginas y los componentes están bien; no dice nada de los 18 módulos**. En la fase 4 sí
cubría todo lo que existía; ahora no. La fase 5c quita los excludes y le devuelve el alcance.

Si alguien lee un check verde entre 5a y 5c como "todo tipado y correcto", se equivoca.

### Antes de la fase 4a: el juego de breakpoints es 600/640/720/768/900

Al extraer las `$bp-*` a `_variables.scss` hay que partir de **cinco** valores, no de cuatro.
**900 es nuevo**, lo trajo `dashboard.css` en la fusión.

| valor | archivo | qué hace |
|---|---|---|
| 600 | `caso.css:286` | padding de `.page` |
| 640 | `conteo.css:145` y `:260` | dos bloques del conteo (**nuevos**) |
| 720 | `agentes-filtros.css:126` | apila las filas de filtros |
| 768 | `style.css:438` | topnav, `.col-root`/`.cards-container` a columna, `.card` al 100% |
| 900 | `dashboard.css:108` | **nuevo**: `.personas-grid` a una columna, filtros no sticky |

**La composición cambió, no solo el total.** El bloque de 640 que tenía `style.css` era del
carrusel y desapareció con él; los dos 640 de ahora son de `conteo.css` y hacen otra cosa. O
sea: el 640 de la lista antigua y el de la nueva no son el mismo breakpoint. Conviene mirar qué
hace cada uno antes de darles nombre, porque un `$bp-movil` único no describe bien cinco valores
que responden a cosas distintas.

### Lista de la fase 7 — completada

Todo lo de abajo está hecho. Se deja como registro de lo que incluyó el cambio.


- `dev`, `build` y `preview` pasan a Astro; se quitan los alias `:astro`.
- `outDir` vuelve a `dist`, porque `deploy.yml` sube `path: dist`.
- Se borran las 11 páginas HTML de la raíz, `src/main/`, `src/style/` y `vite.config.js`.
- **Quitar de `tsconfig.json` los excludes de `src/charts`, `src/main`, `src/tables` y
  `src/ui`.** Se pusieron porque era código condenado que solo ensuciaba la salida; una vez
  borrados esos directorios, los excludes apuntan a rutas inexistentes y confunden.
  **Después de quitarlos, `npm run check` tiene que seguir dando 0.** Si no da 0, es que algo
  que se movió a `src/scripts/` en la fase 5 nunca llegó a chequearse de verdad.
- Se limpian las entradas ya obsoletas de `.prettierignore`.
- Comprobar que `dist/` contiene las 11 rutas antes de mezclar a `main`.

### Verificación por página (fase 3)

Para cada una de las 10 páginas restantes, además de `npm run check` y `npm run build:astro`:

1. **Diff del texto visible contra el original.** Se extrae el texto de ambos HTML quitando
   `<head>` y etiquetas, y se comparan. Lo único que puede diferir es el orden del nav. Es el
   control estándar de cada página, no algo puntual.
2. **Buscar enlaces relativos en el cuerpo, no solo en el nav.** `index.html` tenía un enlace
   a `about/index.html` dentro de un párrafo; se asume que hay más. Todo enlace interno se
   construye desde `BASE_URL`, sin barra inicial en el segmento.
3. **Reportar los comentarios HTML que aparezcan** y de qué lado de la regla caen (contenido
   que se copia, o nota del autor que hay que preguntar), en vez de decidirlo en silencio.

---

## 8. Trabajo posterior (no se toca en esta migración)

- Lo que aparezca en las 9 páginas al aplicarse el breakpoint móvil.
- No hay favicon en todo el repo.
- `public/data/metadatos.csv` no lo carga nadie; `style.css:237` estiliza un
  `#tablaMetadatos` que ninguna página define.
- **El acceso a `personas.html` y `otrosAgentes.html` cuelga de un solo hilo.** Ninguna de las
  dos está en el nav y **ningún HTML enlaza a ellas**: antes se llegaba por las dos tarjetas de
  `personas/index.html`, que `origin/main` eliminó. El único acceso que queda lo fabrica
  `TablasConteo.js` en tiempo de ejecución.

  Traza completa, por si hay que rehacerla:

  1. `crearConteoInteractivo()` sale temprano si no encuentra `#conteoInteractivo`
     (`TablasConteo.js:63`).
  2. Si lo encuentra, **hace `await` de dos CSV** — `Visualizaciones.csv` y `Casos.csv`
     (líneas 65-68). Todo lo demás va después de esa espera.
  3. Crea `<a class="conteo-expandir-btn">Expandir</a>` (línea 97) **sin `href`**.
  4. `dibujarToggle(...)` recibe las dos opciones con `destino: "personas.html"` y
     `destino: "otrosAgentes.html"` (líneas 102-103) y un callback que asigna
     `botonExpandir.href = opcion.destino` (línea 105).
  5. El `href` solo se asigna dentro de ese callback. Lo que salva la situación es que
     `dibujarToggle` **termina llamando a `activar(0)`** (línea 164), que dispara el callback en
     el primer render. Sin esa línea el botón saldría sin `href` hasta que alguien pulsara el
     conmutador.

  **Consecuencia: si falla la carga de cualquiera de los dos CSV, el `await` no resuelve, el
  botón no llega a existir y las dos páginas quedan inalcanzables desde el sitio.** No hay
  segunda vía.

  Comprobado que sobrevive al build de Vite: en `dist/assets/composicionSocial-*.js` están
  `conteo-expandir-btn`, `Expandir`, las dos cadenas `destino` y, sobre todo, la llamada `a(0)`
  minificada justo detrás del cuerpo de la función. La resolución relativa también es correcta:
  desde `/ColonialExperimento/personas/index.html`, un `href="personas.html"` apunta a
  `/ColonialExperimento/personas/personas.html`.

  **Es anterior al port y el port no lo cambia.** Se anota porque no es algo que se redescubra
  fácilmente: son cinco saltos de código para explicar por qué dos páginas del sitio existen.
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
- **250 KB de JavaScript para un solo gráfico.** `about/fuentes.html` solo dibuja
  `crearTiposCasos`, pero su bundle pesa 250.714 bytes porque arrastra d3 entero y
  `@observablehq/plot`. **No es una regresión:** hoy pasa lo mismo, solo que repartido en un
  bundle común que además incluía los otros dos gráficos. Lo que cambia es que los scripts por
  página lo vuelven visible y medible. Vale la pena revisarlo después de la fase 7 (importar
  solo los módulos de d3 que se usan, en vez de `import * as d3`).
- **Tokenizar `PALETA_ATRIBUTO`.** `agentesComun.js` define `"Víctima": "#2f7d5c"`,
  `"Perpetrador": "#c1443e"` y `"Cómplice": "#6b5b95"` a fuego, mientras el resto de paletas del
  proyecto salen de custom properties vía `leerVariableCss`. Es la única paleta fuera del
  sistema de tokens. **Decidido: no se toca en la migración** — convertirlas cambiaría el
  renderizado y eso no es un port. La fase 4a las deja tal cual.
- **`getSiglo` está implementado cuatro veces.** Hay una versión exportada en
  `agentesComun.ts:43` y tres copias locales, cada una en su módulo:
  `tablageneral.ts:27`, `ConteoCrimenes.ts:10` y `TiempoCrimenesMapa.ts:40`. La exportada tiene
  **un solo llamante**, `TablasConteo.ts:44`.

  **Las cuatro NO son equivalentes. Unificarlas a ciegas cambia lo que dibuja el mapa.**

  | dónde | recibe | convierte dentro |
  |---|---|---|
  | `agentesComun.ts:43` (exportada) | número | no |
  | `ConteoCrimenes.ts:10` | string de `d3.csv` | sí (`+year`) |
  | `tablageneral.ts:27` | string de `d3.csv` | sí |
  | `TiempoCrimenesMapa.ts:40` | número | no, y **devuelve `null`** fuera de rango en vez del siglo XVI |

  La divergencia importante está en la última fila y no es de estilo: **con un año fuera de
  1500-1899, `TiempoCrimenesMapa` devuelve `null` y `agentesComun` devuelve `"Siglo XVI"`.**

  En el mapa ese `null` es significativo: los registros sin siglo válido se descartan en vez de
  amontonarse en el siglo XVI. Si alguien "consolida" las cuatro quedándose con la versión de
  `agentesComun`, esos registros dejan de descartarse y **el mapa empieza a dibujar datos que
  hoy no dibuja**, sin que falle nada ni cambie ningún test.

  Así que esto no es una limpieza mecánica. Hay que decidir cuál es el contrato correcto para
  cada llamante y revisarlos uno a uno. Es un cambio de runtime y queda fuera de la migración.

- **Dos pares de módulos casi duplicados.** Salieron al tipar: en cada par, el perfil de errores
  era idéntico código por código, lo que fue la primera pista.

  | par | diferencia | qué cambia |
  |---|---|---|
  | `ParticipacionTiempo` / `ParticipacionTiempoAgentes` | 89 líneas | `genero` → `tipo` |
  | `InstitucionesAtributo` / `DelitosSunburstGenero` | 117 líneas | `atributo` → `genero` |

  Los cuatro se tiparon con el mismo script, uno por par, que es la prueba práctica de lo
  parecidos que son. Unificar cada par en un módulo parametrizado por el campo es trabajo
  posterior, junto a las cuatro copias de `getSiglo`: son cambios de runtime y quedan fuera de
  la migración.
- **Evaluar Playwright para pruebas de regresión visual después de la fase 7.** Durante la
  migración se descartó a propósito: es una dependencia nueva y una superficie de fallo nueva a
  mitad del port, y las 9 páginas se revisan en un teléfono de verdad, que además detecta cosas
  que un viewport headless no.

### Todos los gráficos tienen ancho fijo (sistemático, no por página)

**Re-ejecutado sobre el árbol fusionado el 2026-08-13.** La conclusión no cambia: **ningún
módulo mide su contenedor para dimensionarse.** Los 8 `getBoundingClientRect()` (antes 8
también, pero en otros archivos) siguen siendo todos para colocar el tooltip
(`tooltip.style.left = event.clientX - rect.left + 12`). No hay `clientWidth`, `offsetWidth`
ni `innerWidth` en ningún sitio. **Los dos módulos nuevos que dibujan heredan el mismo patrón.**

| Archivo | Línea | Valor | ¿Deriva del contenedor? |
|---|---|---|---|
| `Linaje.js` | 7 | `width = 928` | no |
| `ButterflyGenero.js` | 96 | `WIDTH = 820` | no — **subió de 700 a 820** al reescribirse |
| `ParticipacionTiempo.js` | 6 | `WIDTH_LINEA = 820` | no — **ahora es constante fija**; antes derivaba de los datos con mínimo 500 |
| `ParticipacionTiempoAgentes.js` | 6 | `WIDTH_LINEA = 820` | no — **nuevo**, copia del anterior |
| `TiempoCrimenesMapa.js` | 620-621 | `width = 760`, `height = 820` (mapa) | no |
| `TiempoCrimenesMapa.js` | 976 | `WIDTH = 700`, `HEIGHT = 300` (líneas) | no |
| `AgentesButterfly.js` | 32 | `WIDTH = 700` | no |
| `TiposCasos.js` | 10 | `width: 600` (Observable Plot) | no |
| `DelitosSunburstGenero.js` | 39 | `width = 600` | no — **nuevo** |
| `InstitucionesAtributo.js` | 42 | `width = 550` | no |
| `ConteoCrimenes.js` | 46 | `max-width: 800px` (HTML, no SVG) | no |
| `TablasConteo.js` | 138 | `max-width: 800px` (HTML, no SVG) | no |

`PersonasDashboard.js`, `verCasos.js` y `ui/vistaToggle.js` no dibujan: el primero orquesta a
`ButterflyGenero`, `ParticipacionTiempo` y `DelitosSunburstGenero`; los otros dos son navegación
y alternancia de vistas.

**Qué cambió respecto al barrido anterior:**

- Se fueron 5 entradas con los módulos borrados (`AgentesSankey`, `WaffleGenero`,
  `BeeswarmGenero`, `AgentesBeeswarm`, y con ellos los tres anchos derivados de los datos).
- Entraron 2 nuevas: `DelitosSunburstGenero` (600) y `ParticipacionTiempoAgentes` (820).
- `ButterflyGenero` pasó de 700 a 820 y `ParticipacionTiempo` dejó de derivar del rango de
  décadas para fijarse en 820.
- **Ya no queda ningún módulo cuyo ancho dependa de los datos.** Ahora son todos constantes,
  entre 550 y 928 px. El rango se estrechó y el caso raro desapareció.

**Qué significa para la revisión en móvil.** Igual que antes, y ahora más uniforme: los módulos
SVG llevan `viewBox` y `style.css` aplica `svg { max-width: 100%; height: auto }`, así que **el
fallo esperable es que se encojan, no que se desborden**. Un gráfico de 928 px en un viewport de
375 px se escala a ~40% y el texto con él: es un problema de **legibilidad**, sistemático y
único.

La única excepción que queda es `TiposCasos.js`, que usa Observable Plot y no emite `viewBox`.
*(La otra excepción de antes, el `overflow-x:auto` de `AgentesSankey`, desapareció con el
archivo. Además aquella nota era incorrecta: el sankey también llevaba `max-width:100%` en línea
sobre el SVG, así que se encogía igual y el scroll nunca llegaba a activarse.)*

Arreglarlo es trabajo posterior (gráficos responsivos), no parte de este port.

*(Aquí había una entrada sobre dos bytes NUL en `AgentesSankey.js`, marcada como pendiente de
decisión. La fusión con `origin/main` borró ese archivo, así que la pregunta se cerró sola y la
fase 6 ya no tiene ese riesgo. No queda ningún archivo con bytes NUL en el repo.)*

### La prop `conNav` de BaseLayout

`base-de-datos/caso.html` es **la única de las 11 páginas sin nav**. En su lugar lleva:

```html
<header class="site-header">
  <a href="index.html" class="back-link">Base de datos</a>
</header>
```

`BaseLayout` renderizaba `<Nav>` siempre, así que usarlo tal cual habría **añadido** un nav que
esa página hoy no tiene: un cambio visual, no un port. Por eso el layout acepta
`conNav` (**por defecto `true`**, de modo que las otras 10 páginas no se enteran) y
`caso.astro` pasa `conNav={false}` y pone su propia cabecera.

Si algún día se decide que `caso` también lleve nav, es quitar esa prop de la página — pero es
un cambio de diseño, no de migración.

### Un solo :root, y por qué está separado de los tokens

`astro.config.mjs` inyecta `@use "abstracts/variables"` en cada `.scss` que no esté bajo
`abstracts/`. Mientras `_variables.scss` emitía también el bloque `:root`, esa inyección hacía
que **cada hoja de página publicara su propia copia de las 27 propiedades**. Comprobado con una
página de prueba con dos hojas propias: acababa con dos bloques `:root` idénticos, el de
`global.scss` y el suyo.

El problema no es el peso. Es que con varias fuentes declarando lo mismo **decide el orden de la
cascada**, y eso no se ve hasta que alguien edita una de ellas y el resultado depende de en qué
bundle acabó.

Por eso el `:root` vive en `abstracts/_root.scss`, que solo carga `global.scss`. La inyección
automática lleva únicamente variables SCSS, que no producen CSS. Verificado después de mover las
14 hojas: **un bloque `:root` por página**, en las 11.

### Dos valores distintos de fuente, no uno

Al tokenizar las cinco declaraciones sueltas apareció que no eran el mismo valor: cuatro decían
`system-ui, sans-serif` y la de `sunburst` solo `sans-serif`. Unificarlas habría metido
`system-ui` delante en el sunburst, o sea **habría cambiado la fuente que se dibuja**. Se
mantienen separadas: `$font-sistema` y `$font-sans`.

### Cómo comprobar de verdad la cadena de CSS de una página

Astro decide por hoja si la incrusta o la emite (`build.inlineStylesheets: 'auto'`), y **usa las
dos vías en este proyecto**:

| página | hoja extra | cómo llega |
|---|---|---|
| `base-de-datos/index` | `caso.css` (6,7 KB) | **en línea**, como `<style>` dentro del HTML |
| `personas/index` | `conteo.css` (12 KB) | **enlazada**, como `_astro/index.<hash>.css` |

**Mirar solo una de las dos da un falso negativo, y las dos veces me pasó:** primero busqué solo
`<link>` y di `caso.css` por perdida; luego busqué solo dentro del HTML y di `conteo.css` por
perdida. Las dos estaban bien.

La comprobación correcta es juntar el contenido de los `<style>` en línea **y** el de cada hoja
enlazada, y buscar en esa unión un selector real de la hoja que se quiere verificar. Conviene
además comprobar el negativo: que ese selector **no** aparezca en una página que no debería
tenerlo.

### Estado verificado antes de la fase 5b

La fase 5b corrige las 17 rutas de datos. Para que tenga contra qué comparar, este es el estado
comprobado en el bundle publicado de `about/fuentes.html` (fase 3):

```
/ColonialExperimento//data/Casos.csv
```

La doble barra viene de `TiposCasos.js:6`, que construye la URL como
`` `${import.meta.env.BASE_URL}/data/Casos.csv` `` cuando `BASE_URL` ya termina en `/`.
Funciona porque los servidores normalizan `//`. Después de la fase 5b esa misma comprobación
tiene que devolver `/ColonialExperimento/data/Casos.csv`.

### Dos vulnerabilidades altas, ambas solo de build

Aparecieron al instalar Astro en la fase 1. **Ninguna llega al output publicado**, así que no
se tocan durante la migración.

| | `postcss` 8.5.15 | `brace-expansion` 5.0.8 |
|---|---|---|
| Aviso | [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) y [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) — path traversal vía `sourceMappingURL` | [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) — DoS por arrays intermedios sin límite |
| CVSS | 7.5 | 7.5 |
| Ruta | `vite` → `postcss` | `eslint` → `minimatch` → `brace-expansion` |
| Tipo | devDependency | devDependency |
| Rango vulnerable | `<=8.5.22` | `>=4.0.0 <5.0.9` |
| Arreglo sin romper | sí (parche) | sí (parche) |

`npm ls --omit=dev --all` no devuelve ninguno de los dos: el árbol de producción son solo
`d3`, `@observablehq/plot`, `@turf/rewind` y `d3-sankey`. Son herramientas de Node que nunca
entran al bundle del navegador. Además, el aviso de postcss exige procesar CSS controlado por
un atacante, y todo el CSS de aquí está en el repo.

**Detalle importante:** el cambio de lockfile que se descartó antes del pre-vuelo era
justamente el parche de seguridad — subía `postcss` a 8.5.25 (por encima del rango vulnerable)
y `brace-expansion` a 5.0.9 (la primera versión corregida). No era ruido de un `npm install`
ajeno, sino npm recogiendo parches publicados dentro de los rangos semver existentes.
Descartarlo mantuvo limpio el historial, pero el parche se fue con él y el `npm i` de la fase 1
no lo recuperó, porque el lockfile fija esas versiones.

Al terminar la migración, en un commit aparte: o `npm audit fix`, o reponer esos bumps de forma
deliberada.

**Regla que sale de aquí:** antes de descartar cualquier cambio de lockfile que llegue de
fuera, correr `npm audit` contra él. Lo que parece ruido de ordenación puede ser un parche de
seguridad, y desde dentro del diff las dos cosas se ven igual. Se descartó este por mantener
limpio el historial de la migración, sin comprobar qué arreglaba.
