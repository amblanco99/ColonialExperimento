# Auditoría de tipografía

Diagnóstico del estado actual de la tipografía en el repositorio. **No modifica código.**

**Alcance de la búsqueda:** todo `src/`, `public/`, `astro.config.mjs`, `tools/`, `eslint.config.js`,
`tsconfig.json`, `.prettierrc.json` y `.github/workflows/`. Extensiones `.astro`, `.scss`, `.ts`,
`.js`, `.mjs`, `.html`, `.json`.

**Excluidos:** `node_modules/` y `dist/`. `dist/` es salida de build obsoleta (contiene 11 páginas;
`src/pages/` tiene 8), así que auditarla describiría un sitio que ya no existe.

**Superficie auditada:** 8 páginas `.astro`, 26 hojas `.scss`, 23 módulos de gráfico en
`src/scripts/charts/`, 2 en `src/scripts/tables/`, 2 en `src/scripts/ui/`.

---

## 1. Tipografías

Hay **seis pilas de fuentes declaradas** y **cinco familias reales** nombradas. Todas se declaran en
un solo sitio, `src/styles/abstracts/_variables.scss`.

| Token SCSS | Valor | Custom property | Cómo se carga |
|---|---|---|---|
| `$font-display` (`_variables.scss:43`) | `'IM Fell English', Georgia, serif` | `--font-display` (`_root.scss:47`) | Google Fonts — `ital@0;1` |
| `$font-body` (`_variables.scss:44`) | `'Source Sans 3', system-ui, sans-serif` | `--font-body` (`_root.scss:48`) | Google Fonts — `wght@300;400;600` |
| `$font-mono` (`_variables.scss:45`) | `'Source Code Pro', monospace` | `--font-mono` (`_root.scss:49`) | Google Fonts — `wght@400;600` |
| `$font-mapa` (`_variables.scss:46`) | `Georgia, serif` | **`--mapa-font`** (`_root.scss:50`) | **No se carga.** Fuente del sistema |
| `$font-sistema` (`_variables.scss:53`) | `system-ui, sans-serif` | *ninguna* | Fuente del sistema |
| `$font-sans` (`_variables.scss:54`) | `sans-serif` | *ninguna* | Genérica del navegador |

### Origen de cada familia

**Enlaces externos.** Un único punto de carga, `src/layouts/BaseLayout.astro:46-51`, que llega a las
8 páginas:

```
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=Source+Sans+3:wght@300;400;600&family=Source+Code+Pro:wght@400;600&display=swap" rel="stylesheet" />
```

Eso descarga exactamente:

| Familia | Pesos y estilos descargados |
|---|---|
| IM Fell English | 400 redonda, 400 cursiva |
| Source Sans 3 | 300, 400, 600 (solo redonda) |
| Source Code Pro | 400, 600 (solo redonda) |

**`@font-face`:** ninguna en todo el repositorio.

**Archivos de fuente locales:** ninguno. `public/` contiene 4 PNG y 13 archivos de datos;
`src/assets/images/` contiene un JPG. No hay `.woff`, `.woff2`, `.ttf` ni `.otf`.

**Familias nombradas sin declaración propia (recaen en la fuente instalada o en la genérica):**

| Familia | Dónde | Estado |
|---|---|---|
| `Georgia` | `$font-mapa`, y como respaldo de `$font-display` | Fuente del sistema. Si no está instalada, cae a `serif` |
| `system-ui` | `$font-sistema`, y respaldo de `$font-body` | La fuente de interfaz del SO |
| `serif` / `sans-serif` / `monospace` | genéricas finales de cada pila | Las decide el navegador |
| `serif` (suelta) | `src/scripts/charts/ConteoCrimenes.ts:42` | Dentro de un módulo muerto — ver §5.8 |

**Nota sobre el contrato de runtime.** `src/scripts/dev/verificarVariablesCss.ts` verifica 27 custom
properties que el JS lee con `getComputedStyle`. **Ninguna es de tipografía** — la lista es solo de
color. Renombrar o reorganizar los tokens de fuente no rompe ningún gráfico.

---

## 2. Tamaños de fuente

**38 valores distintos** repartidos en **159 declaraciones `font-size`** en SCSS, en dos sistemas de
unidades que conviven.

### 2.1 Definidos como custom properties

**Ninguno.** No existe ni un `$font-size-*` en `_variables.scss` ni un `--font-size-*` en
`_root.scss`. Los tokens cubren color, tipografía (familia), breakpoints y z-index; la escala
tipográfica no está tokenizada. Los 159 tamaños son literales escritos en el sitio de uso.

### 2.2 Hardcodeados en SCSS — valores en `px` (17 distintos, 101 declaraciones)

| Valor | Veces | Dónde aparece (muestra) |
|---|---|---|
| `9.5px` | 1 | `apilado.scss:25` `.apilado-eje-siglo` |
| `10px` | 7 | `mariposa.scss:14`, `sunburst.scss:29`, `mapa.scss:582,606,655,737`, `paneles-filtro.scss:47` |
| `10.5px` | 4 | `mariposa.scss:23`, `linaje.scss:253,272`, `crimenesPorTipo.scss:234` |
| `11px` | 14 | `graficos.scss:40,50`, `mapa.scss:595,650,665,678`, `filtros-chip.scss:18`, `agentes-filtros.scss:17`, `lineaTiempoCasos.scss:138,159`, `crimenesPorTipo.scss:91,200`, `paneles-filtro.scss:40`, `mariposa.scss:28` |
| `11.5px` | 7 | `apilado.scss:132`, `agentes-filtros.scss:65`, `mapa.scss:228,301`, `crimenesPorTipo.scss:60,142`, `paneles-filtro.scss:130` |
| `12px` | 17 | `sunburst.scss:24`, `tooltips.scss:19`, `botones.scss:12,42,58,75`, `mapa.scss:271,318,575`, `filtros-chip.scss:113,136`, `linaje.scss:338`, `agentes-filtros.scss:105,121`, `mariposa.scss:54`, `paneles-filtro.scss:153,166` |
| `12.5px` | 14 | `apilado.scss:19,84,95`, `agentes-filtros.scss:37`, `filtros-chip.scss:38,102,153`, `faq.scss:19`, `linaje.scss:77`, `mapa.scss:287`, `botones.scss:106`, `crimenesPorTipo.scss:172`, `lineaTiempoCasos.scss:225`, `preguntasTarjetas.scss:122` |
| `13px` | 13 | `sunburst.scss:40`, `botones.scss:29`, `mapa.scss:244,422,588`, `mariposa.scss:33`, `paneles-filtro.scss:88,121,147`, `lineaTiempoCasos.scss:242,257,278`, `preguntasTarjetas.scss:51` |
| `13.5px` | 4 | `filtros-chip.scss:57`, `faq.scss:128`, `linaje.scss:358,370` |
| `14px` | 4 | `global.scss:307` `.legend-item`, `mapa.scss:570,644`, `paneles-filtro.scss:29` |
| `14.5px` | 3 | `faq.scss:85`, `historiaMetodologia.scss:89`, `preguntasTarjetas.scss:134` |
| `15px` | 6 | `faq.scss:50`, `linaje.scss:152,247,352`, `mapa.scss:220,562` |
| `16px` | 3 | `tooltips.scss:49`, `crimenesPorTipo.scss:82`, `lineaTiempoCasos.scss:217` |
| `20px` | 1 | `lineaTiempoCasos.scss:210` |
| `22px` | 1 | `crimenesPorTipo.scss:227` |
| `44px` | 1 | `lineaTiempoCasos.scss:86` |
| `56px` | 1 | `lineaTiempoCasos.scss:97` |

Los `px` se concentran en las hojas de gráficos, mapa y filtros.

### 2.3 Hardcodeados en SCSS — valores en `rem` (19 distintos, 56 declaraciones)

| Valor | = px @16 | Veces | Dónde aparece |
|---|---|---|---|
| `0.62rem` | 9.92 | 1 | `caso.scss:176` |
| `0.65rem` | 10.4 | 2 | `caso.scss:113,267` |
| `0.7rem` | 11.2 | 1 | `caso.scss:354` |
| `0.75rem` | 12 | 2 | `global.scss:407`, `caso.scss:373` |
| `0.78rem` | 12.48 | 2 | `caso.scss:220,262` |
| `0.8rem` | 12.8 | 5 | `caso.scss:102,281`, `conteo.scss:151,266,430` |
| `0.85rem` | 13.6 | 9 | `global.scss:259,465`, `caso.scss:51,304,362,379`, `conteo.scss:302,341,353` |
| `0.88rem` | 14.08 | 1 | `caso.scss:197` |
| `0.9rem` | 14.4 | 3 | `global.scss:158,418`, `caso.scss:247` |
| `0.95rem` | 15.2 | 10 | `_typography.scss:30` (`p`), `global.scss:336,355,374,500`, `conteo.scss:36,66,143,261,413` |
| `1rem` | 16 | 3 | `_reset.scss:15` (`body`), `caso.scss:34,67` |
| `1.05rem` | 16.8 | 3 | `apilado.scss:65,121`, `conteo.scss:335` |
| `1.1rem` | 17.6 | 5 | `apilado.scss:72`, `caso.scss:122`, `conteo.scss:119,196`, `faq.scss:98` |
| `1.15rem` | 18.4 | 1 | `global.scss:227` (`a.card h3`) |
| `1.2rem` | 19.2 | 3 | `global.scss:61` (`.logo`, muerto), `caso.scss:392`, `historiaMetodologia.scss:142` |
| `1.35rem` | 21.6 | 1 | `caso.scss:191` |
| `1.4rem` | 22.4 | 1 | `_typography.scss:19` (`.section-title`) |
| `1.6rem` | 25.6 | 2 | `conteo.scss:231`, `linaje.scss:323` |
| `2rem` | 32 | 1 | `_typography.scss:5` (`.section-mainTitle`) |

Los `rem` se concentran en `global.scss`, `base/`, `caso.scss` y `conteo.scss` — el contenido
editorial.

### 2.4 `clamp()` (2)

| Valor | Dónde |
|---|---|
| `clamp(1.4rem, 3vw, 2rem)` | `caso.scss:80` `.case-title` |
| `clamp(2rem, 6vw, 3.4rem)` | `conteo.scss:137` `.conteo-stat-cuadro-valor` |

Son las dos únicas reglas fluidas del repositorio.

### 2.5 Estilos en línea en archivos `.astro`

**Ninguno.** No hay ni un atributo `style=` ni un bloque `<style>` en ninguno de los 8 `.astro`, ni
en `BaseLayout.astro`, `Nav.astro` o `Footer.astro`. Toda la tipografía del marcado vive en SCSS.

### 2.6 Definidos en JS/TS

Esta es la sección que menos contenido tiene, y es una buena noticia: la migración movió la
tipografía de los gráficos a clases CSS. Los scripts asignan clases (`.attr('class', ...)`) y las
hojas les dan el tipo. Solo quedan **dos sitios** donde el JS fija tipografía, **uno de ellos
muerto**:

| Sitio | Qué hace | Estado |
|---|---|---|
| `TiempoCrimenesMapa.ts:1774` | `.style('font-size', lista.length > 6 ? '9px' : '12px')` sobre los ticks del eje X | **Vivo.** Único tamaño fijado por JS |
| `ConteoCrimenes.ts:45,52` | `<style>` inyectado con `font-size: 1.5rem` y `font-size:1rem` en línea | **Muerto** — ningún módulo lo importa |

`.style()` de D3 escribe un estilo en línea, así que ese `9px`/`12px` gana sobre la clase
`.mapa-linea-eje-x-texto` (`mapa.scss:660`), que deliberadamente no declara `font-size`.

**Observable Plot** — `TiposCasos.ts` es el único uso de `@observablehq/plot` en el repo.
`Plot.plot({...})` recibe `width`, `marginLeft`, `x`, `y`, `color` y `marks`, pero **ninguna opción
`style`**. El SVG resultante sale con los valores por defecto de Plot (`10px`, `system-ui`) escritos
en sus propios estilos, y no hereda nada del sitio.

**OpenLayers** — `mapaBaseTopografico.ts` no crea ningún `ol/style/Text`; el mapa base solo pinta
tiles. `ol/ol.css` entra importado en la línea 7 y aporta la tipografía de los controles de
OpenLayers, ajena a los tokens del proyecto.

**Tablas** (`src/scripts/tables/caso.ts`, `tablageneral.ts`) y **UI**
(`src/scripts/ui/navMenu.ts`, `vistaToggle.ts`) no contienen ninguna referencia a `font`.

---

## 3. Pesos y alturas de línea

### 3.1 Pesos — 5 valores distintos en SCSS, 66 declaraciones

| Valor | Veces | Dónde (muestra) |
|---|---|---|
| `400` | 2 | `faq.scss:99`, `mapa.scss:598` |
| `600` | 25 | `global.scss:159,260,466,499`, `botones.scss:19,36,63,80,108`, `caso.scss:52,103,241,276,374`, `linaje.scss:297,372`, `graficos.scss:51`, `mapa.scss:276,679`, `faq.scss:21,86`, `agentes-filtros.scss:38`, `crimenesPorTipo.scss:201`, `preguntasTarjetas.scss:52`, `tooltips.scss:50` |
| `700` | 34 | `conteo.scss` (×10), `mapa.scss:221,288,423,576,602,645`, `caso.scss:190,221`, `lineaTiempoCasos.scss:87,218,258,279`, `linaje.scss:78,254`, `mariposa.scss:34,43`, `crimenesPorTipo.scss:61,77`, `filtros-chip.scss:19,55`, `apilado.scss:20`, `agentes-filtros.scss:18`, `paneles-filtro.scss:30`, `preguntasTarjetas.scss:123` |
| `800` | 3 | `crimenesPorTipo.scss:83,228`, `lineaTiempoCasos.scss:87` |
| `normal` | 2 | `global.scss:62` (muerto), `caso.scss:81` |

Fuera de SCSS: `font-weight: bold` ×2 en `ConteoCrimenes.ts:45,46` (módulo muerto). **Ningún peso
está tokenizado.**

### 3.2 Alturas de línea — 11 valores distintos, 26 declaraciones

| Valor | Veces | Dónde |
|---|---|---|
| `0.5` | 2 | `caso.scss:192,198` |
| `1` | 9 | `apilado.scss:73`, `caso.scss:393`, `conteo.scss:120,139,234`, `crimenesPorTipo.scss:84`, `historiaMetodologia.scss:143`, `lineaTiempoCasos.scss:88,211` |
| `1.15` | 2 | `linaje.scss:255,273` |
| `1.3` | 1 | `preguntasTarjetas.scss:124` |
| `1.35` | 2 | `caso.scss:83`, `preguntasTarjetas.scss:53` |
| `1.4` | 1 | `caso.scss:363` |
| `1.5` | 2 | `mapa.scss:245`, `crimenesPorTipo.scss:173` |
| `1.55` | 1 | `faq.scss:129` |
| `1.6` | 2 | `linaje.scss:353`, `historiaMetodologia.scss:90` |
| `1.65` | 1 | `preguntasTarjetas.scss:135` |
| `1.7` | 3 | `_reset.scss:16` (`body`), `_typography.scss:31` (`p`), `caso.scss:35` (`body`, duplicado) |

**Ninguna altura de línea está tokenizada.** Definidas en JS: ninguna.

### 3.3 Complementos (catalogados por completitud)

- **`letter-spacing`** — 11 valores distintos en 25 declaraciones: `0.01em`, `0.02em`, `0.03em`,
  `0.04em`, `0.05em`, `0.06em`, `0.08em`, `0.09em`, `0.1em`. Sin tokenizar.
- **`font-style: italic`** — 19 declaraciones. La más visible es `global.scss:155`, que pone en
  cursiva el título del sitio y los enlaces del menú.
- **`text-transform: uppercase`** — 18 declaraciones en 7 hojas.

---

## 4. Mapa de cobertura

**Cadena de carga.** `BaseLayout.astro:6` importa `global.scss` (que a su vez trae `abstracts/root`,
`base/reset` y `base/typography`) en las 8 páginas. Cada página importa además sus propias hojas:

| Página | Hojas propias |
|---|---|
| `index.astro` (portada) | `home.scss` |
| `about/index.astro` | `botones`, `mapa`, `linaje`, `tooltips`, `faq`, `historiaMetodologia`, `preguntasTarjetas` |
| `base-de-datos/index.astro` | `caso` |
| `base-de-datos/caso.astro` | `caso` |
| `personas/index.astro` | `conteo` |
| `personas/personas.astro` | `tooltips`, `botones`, `graficos`, `filtros-chip`, `mariposa`, `apilado`, `lineas`, `sunburst`, `dashboard`, `paneles-filtro`, `mapa` |
| `personas/otrosAgentes.astro` | `tooltips`, `botones`, `graficos`, `filtros-chip`, `mariposa`, `agentes-filtros`, `sunburst`, `lineas`, `dashboard` |
| `tiempo/index.astro` | `tooltips`, `botones`, `paneles-filtro`, `mapa`, `crimenesPorTipo`, `lineaTiempoCasos` |

### 4.1 IM Fell English — `var(--font-display)` — 11 declaraciones, 6 hojas

| Archivo:línea | Selector | Qué tipografía |
|---|---|---|
| `base/_typography.scss:4` | `.section-mainTitle` | Título principal (h1) de todas las páginas |
| `base/_typography.scss:18` | `section h2`, `.section-title` | Títulos de sección |
| `global.scss:154` | `.logo`, `.nav-links a` | Título del sitio en el nav + los 5 enlaces del menú hamburguesa (en **cursiva**) |
| `global.scss:226` | `a.card h3` | Titular de las tarjetas-enlace |
| `global.scss:289` | `#mapa-contenedor` | Contenedor raíz del mapa (heredado por su contenido) |
| `apilado.scss:64` | `.apilado-panel-titulo` | Título del panel de detalle *(clase huérfana, §5.8)* |
| `apilado.scss:120` | `.apilado-sankey-titulo` | Título del sankey *(clase huérfana, §5.8)* |
| `caso.scss:79` | `.case-title` | Título del caso (cursiva, `clamp`) |
| `conteo.scss:136` | `.conteo-stat-cuadro-valor` | Cifra grande de los cuadros de estadística |
| `conteo.scss:195` | `.conteo-detalle-header h3` | Cabecera del panel de detalle |
| `linaje.scss:322` | `.linaje-panel-titulo` | Título del panel de linaje |

**Alcance:** portada, `about`, `personas/*`, `base-de-datos/*`, `tiempo`. Titulares y navegación —
nunca cuerpo de texto ni gráficos.

### 4.2 Source Sans 3 — `var(--font-body)` — 28 declaraciones, 10 hojas

| Archivo:línea | Selector | Qué tipografía |
|---|---|---|
| `base/_reset.scss:14` | `body` | **Todo el sitio por herencia** |
| `global.scss:258` | `.about-tab` | Pestañas de "Sobre el proyecto" |
| `global.scss:335,354,373` | `.filters select/input`, `.filtro-checkbox`, `.filtro-rango-anio input` | Controles de filtro |
| `global.scss:433` | `.cargando` | Mensaje de carga (cursiva) |
| `global.scss:464` | `.btn-descarga` | Botones de descarga |
| `global.scss:498` | `.vista-toggle-btn` | Conmutador Dashboard/Historia |
| `botones.scss:107` | `.btn-ver-casos-generico` | Botón "ver casos" fuera del mapa |
| `agentes-filtros.scss:39,122` | `.ag-chip`, `.ag-btn-limpiar` | Chips y botón de limpiar de `otrosAgentes` |
| `caso.scss:33,50,303` | `body`, `.back-link`, `.similares-tab` | Ficha de caso |
| `conteo.scss:64` | `.conteo-toggle-btn` | Botón de conmutación del conteo |
| `faq.scss:20,84` | `.btn-descargar-datos`, `.linaje-faq-pregunta` | FAQ de `about` |
| `filtros-chip.scss:39,103,155` | `.filtro-chip`, `.filtro-select-generico`, `.filtro-switch` | Filtros de `personas/*` |
| `linaje.scss:76,210,252,318,337,371` | `.linaje-nivel-titulo`, `.linaje-nodo`, `.linaje-nodo-circulo-texto`, `.linaje-panel`, `.linaje-selector-crimen`, `.linaje-panel-boton` | Grafo de linaje y su panel |
| `preguntasTarjetas.scss:50,121` | `.preguntas-tarjetas-pildora`, `.preguntas-tarjetas-chip` | Tarjetas de preguntas |

**Alcance:** las 8 páginas. Cuerpo, formularios, botones, chips y el grafo de linaje.

### 4.3 Source Code Pro — `var(--font-mono)` — 5 declaraciones, 2 hojas

| Archivo:línea | Selector | Qué tipografía |
|---|---|---|
| `global.scss:406` | `.tabla-datos th`, `.tabla-metadatos th` | Encabezados de las tablas archivísticas |
| `caso.scss:116` | `.meta-pill .label` | Etiqueta de las píldoras de metadatos |
| `caso.scss:175` | `[data-tooltip]::after` | Tooltip CSS de la ficha de caso |
| `caso.scss:266` | `.sf-label` | Etiqueta de campo de fuente |
| `caso.scss:353` | `.similar-card-meta` | Metadatos de las tarjetas de casos similares |

**Alcance:** solo `base-de-datos/index.astro` y `base-de-datos/caso.astro`. Es la familia más
acotada del sitio.

### 4.4 Georgia — `var(--mapa-font)` — 36 declaraciones, 6 hojas

La familia **más usada por número de declaraciones**, y la única que no se descarga.

| Archivo | Declaraciones | Qué tipografía |
|---|---|---|
| `mapa.scss` (17,219,227,243,270,286,300,317,560,577,583,590,596,607,747) | 15 | Selector de vista, tarjetas del mapa, info de lugar, avisos, cápsulas, y el SVG del grafo (`.mapa-grafo-svg`) |
| `botones.scss` (18,35,48,62,79) | 5 | Los 5 botones del dashboard de mapa |
| `paneles-filtro.scss` (22,90,148,165) | 4 | Panel de filtros del mapa, combo, select, aviso |
| `lineaTiempoCasos.scss` (140,160,190,256,277) | 5 | Nota, leyenda, panel de caso y sus dos botones |
| `crimenesPorTipo.scss` (59,93,141,199,233) | 5 | Nombre de tipo, nota, chip de leyenda, pestaña de dona, etiqueta del total |
| `tooltips.scss` (20) | 1 | `.tooltip-grafico` — **el tooltip por defecto de todos los gráficos** |

**Alcance:** `tiempo/index.astro`, `personas/personas.astro`, `about/index.astro` — toda la
superficie de mapa y línea de tiempo, más los tooltips.

### 4.5 system-ui — `$font-sistema` — 9 declaraciones, 5 hojas

Solo llega por SCSS (no hay custom property), y tipografía **los cuerpos de los SVG de D3**:

| Archivo:línea | Selector | Gráficos que lo reciben |
|---|---|---|
| `graficos.scss:23` | `.grafico-svg` | `AgentesButterfly`, `ButterflyGenero`, `ParticipacionTiempo`, `ParticipacionTiempoAgentes`, `InstitucionesAtributo`, `DelitosSunburstGenero` |
| `mapa.scss:702` | `.mapa-linea-svg` | Gráfico de líneas de `TiempoCrimenesMapa.ts:1737` |
| `crimenesPorTipo.scss:108,216` | `.crimenes-tipo-spike-svg`, `.crimenes-tipo-donut-svg` | `CrimenesPorTipo.ts:375,520` |
| `crimenesPorTipo.scss:81,226` | `.crimenes-tipo-numero`, `.crimenes-tipo-donut-total-num` | Cifras del panel |
| `lineaTiempoCasos.scss:85` | `.linea-tiempo-casos-anio-numero` | Año grande de la línea de tiempo |
| `tooltips.scss:32,39` | `.tooltip-grafico--sans`, `.tooltip-grafico--neutro` | Variantes de tooltip de `personas/*` |

### 4.6 sans-serif — `$font-sans` — 1 declaración

| Archivo:línea | Selector | Gráficos |
|---|---|---|
| `sunburst.scss:10` | `.sunburst-svg` | `InstitucionesAtributo.ts:139`, `DelitosSunburstGenero.ts:148` |

Los dos sunbursts reciben `class="sunburst-svg grafico-svg"`. `.sunburst-svg` se declara después en
la cascada de la página, así que en la práctica gana `sans-serif` sobre `system-ui`.
`MIGRATION.md:789-792` documenta que esta separación fue deliberada.

### 4.7 Tipografía de los gráficos, por módulo

| Script | Clase(s) que asigna | Hoja que las tipografía | Familia final |
|---|---|---|---|
| `AgentesButterfly.ts:168` | `grafico-svg`, `mariposa-eje-tick-texto`, `mariposa-valor-texto` | `graficos.scss`, `mariposa.scss` | system-ui, 10–13px |
| `ButterflyGenero.ts:227` | idem | idem | system-ui, 10–13px |
| `ParticipacionTiempo.ts:185,192` | `grafico-svg`, `grafico-eje-texto` | `graficos.scss` | system-ui, 11px |
| `ParticipacionTiempoAgentes.ts:172,183` | idem | idem | system-ui, 11px |
| `InstitucionesAtributo.ts:139,213` | `sunburst-svg grafico-svg`, `sunburst-texto-central` | `sunburst.scss` | sans-serif, 10–13px |
| `DelitosSunburstGenero.ts:148,226` | idem | idem | sans-serif, 10–13px |
| `RelacionCrimenes.ts:225` | `mapa-grafo-svg`, `mapa-grafo-etiqueta` | `mapa.scss:737,747` | Georgia, 10px |
| `CrimenesPorTipo.ts:375,382,399,520` | `crimenes-tipo-spike-svg`, `crimenes-tipo-donut-svg`, `mapa-linea-eje-*-texto` | `crimenesPorTipo.scss`, `mapa.scss` | system-ui, 11px |
| `TiempoCrimenesMapa.ts:1737,1773,1782` | `mapa-linea-svg`, `mapa-linea-eje-*-texto` | `mapa.scss` | system-ui, 11px + **9px/12px en línea** |
| `Linaje.ts:225` | `linaje-nodo linaje-nodo-circulo` | `linaje.scss` | Source Sans 3, 10.5–15px |
| `TiposCasos.ts` | *ninguna* | *ninguna* | **Defaults de Observable Plot** |
| `mapaBaseTopografico.ts` | *ninguna* | `ol/ol.css` | Defaults de OpenLayers |

---

## 5. Inconsistencias

### 5.1 `rem` y `px` chocan en casi cada escalón de la escala

Las dos unidades cubren el mismo rango sin coordinarse. Con la raíz en 16px (`body` está en `1rem`,
nadie la reescala):

| En `rem` | Equivale a | Literal `px` cercano en el repo | Diferencia |
|---|---|---|---|
| `0.62rem` (`caso.scss:176`) | 9.92px | `9.5px` (`apilado.scss:25`), `10px` (×7) | 0.08–0.42px |
| `0.65rem` (`caso.scss:113,267`) | 10.4px | `10.5px` (×4) | **0.1px** |
| `0.7rem` (`caso.scss:354`) | 11.2px | `11px` (×14), `11.5px` (×7) | 0.2–0.3px |
| `0.75rem` (`global.scss:407`) | **12px** | `12px` (×17) | **exactamente el mismo tamaño, escrito de dos formas** |
| `0.78rem` (`caso.scss:220,262`) | 12.48px | `12.5px` (×14) | **0.02px** |
| `0.8rem` (×5) | 12.8px | `12.5px` (×14), `13px` (×13) | 0.2–0.3px |
| `0.85rem` (×9) | 13.6px | `13.5px` (×4) | **0.1px** |
| `0.88rem` (`caso.scss:197`) | 14.08px | `14px` (×4) | **0.08px** |
| `0.9rem` (×3) | 14.4px | `14.5px` (×3) | **0.1px** |
| `0.95rem` (×10) | 15.2px | `15px` (×6) | **0.2px** |
| `1rem` (×3) | **16px** | `16px` (×3) | **el mismo tamaño, dos escrituras** |
| `1.05rem` (×3) | 16.8px | `16px` (×3) | 0.8px |
| `1.4rem` (`_typography.scss:19`) | 22.4px | `22px` (`crimenesPorTipo.scss:227`) | **0.4px** |

Diez pares están a **0.5px o menos** entre sí. Ninguno de esos pares es una diferencia que alguien
haya decidido; son dos escalas que crecieron por separado (la editorial en `rem`, la de gráficos en
`px`) y se solapan.

### 5.2 `caso.scss` emite un segundo bloque `:root` que duplica los tres tokens de fuente

`src/styles/pages/caso.scss:7-19` declara su propio `:root` con 8 tokens de color **y los tres de
tipografía**:

```scss
:root {
  --ink: #1a1410;
  ...
  --font-display: 'IM Fell English', Georgia, serif;
  --font-body: 'Source Sans 3', system-ui, sans-serif;
  --font-mono: 'Source Code Pro', monospace;
}
```

Son los mismos valores que `_variables.scss:43-45` emite vía `_root.scss:47-49`. El problema no es
el peso: es que la cabecera de `src/styles/abstracts/_root.scss` afirma ser *"el ÚNICO que emite el
bloque `:root`"* y explica en detalle por qué tener varias fuentes declarando lo mismo hace que
**decida el orden de la cascada**. Esa afirmación ya no es cierta. Las dos páginas que cargan
`caso.scss` (`base-de-datos/index.astro` y `base-de-datos/caso.astro`) resuelven sus tokens de
fuente por orden de bundle.

Hoy los valores coinciden, así que no se ve nada. Es exactamente el fallo invisible que
`_root.scss` documenta, reintroducido en una hoja de página. Además, la copia de `caso.scss`
**no incluye `--mapa-font`**, así que las dos declaraciones tampoco son equivalentes.

En la misma hoja, `caso.scss:30-36` vuelve a declarar `body` con `font-family: var(--font-body)`,
`font-size: 1rem` y `line-height: 1.7` — idénticos a `base/_reset.scss:14-16`, que ya se aplica a
esa página vía `global.scss`.

### 5.3 Los pesos 700 y 800 se usan 37 veces y no se descarga ninguno

El `<link>` de `BaseLayout.astro:49` pide:

- IM Fell English → **solo 400** (redonda y cursiva)
- Source Sans 3 → **300, 400, 600**
- Source Code Pro → **400, 600**

Contra eso, el CSS pide:

| Declaración | Familia que resuelve | ¿Descargado? |
|---|---|---|
| `font-weight: 700` ×34 | Source Sans 3 en su mayoría (herencia de `body`) | **No** → negrita sintética |
| `font-weight: 800` ×3 | `system-ui` (`crimenesPorTipo`, `lineaTiempoCasos`) | N/A — fuente del sistema |
| `font-weight: 600` en `global.scss:159` | **IM Fell English cursiva** (`.logo`, `.nav-links a`) | **No** → sintética |
| `font-weight: 700` en `conteo.scss:138` | **IM Fell English** (`.conteo-stat-cuadro-valor`, a `clamp(2rem, 6vw, 3.4rem)`) | **No** → sintética, y a 54px se nota |
| `font-weight: 600` ×24 restantes | Source Sans 3 | Sí |
| `font-weight: 400` ×2 | Source Sans 3 / Georgia | Sí |

El caso más visible es el título del sitio y los enlaces del menú: IM Fell English cursiva a 600
sintético en todas las páginas.

**A la inversa: Source Sans 3 300 se descarga y no se usa ni una vez.** No hay ningún
`font-weight: 300` en el repositorio. Es un archivo de fuente que se pide en las 8 páginas y nunca
pinta nada.

### 5.4 La tipografía propia de `.logo` está muerta

```scss
/* global.scss:60-63 */
.logo {
  font-size: 1.2rem;
  font-weight: normal;
}
/* global.scss:153-162 */
.logo,
.nav-links a {
  font-size: 0.9rem;
  font-weight: 600;
  ...
}
```

Misma especificidad (0,1,0), la segunda va después, gana la segunda. `1.2rem` y `normal` no pintan
nada. El propio archivo ya lo señala en un comentario (`global.scss:57-59`); queda registrado aquí
como hallazgo, sin tocar.

### 5.5 Georgia es la tipografía del mapa y nunca se carga

`$font-mapa: Georgia, serif` es la familia con más declaraciones del repositorio (36), y cubre toda
la interfaz de mapa y línea de tiempo más el tooltip por defecto de los gráficos. Georgia es una
fuente del sistema: viene con Windows y macOS, pero **no con la mayoría de distribuciones Linux ni
con Android**. En esas máquinas todo ese bloque de interfaz cae al `serif` genérico del navegador —
la única familia que el proyecto nunca eligió.

Nada la descarga, y no hay ninguna alternativa web declarada delante de ella. Es el "font
referenced but never loaded" más consecuente del repo, precisamente porque sí se ve bien en las
máquinas donde se desarrolla.

### 5.6 La tipografía de los gráficos no coincide con la del sitio

| Qué | Dónde | Desajuste |
|---|---|---|
| Observable Plot | `TiposCasos.ts` | Sin opción `style`. Ejes y leyenda salen a `10px` / `system-ui`, los defaults de Plot. Aparece en `about/index.astro`, rodeado de Source Sans 3 |
| Cuerpos de SVG en D3 | `graficos.scss:23`, `mapa.scss:702`, `crimenesPorTipo.scss:108,216` | `system-ui` mientras la página corre en Source Sans 3 |
| Sunbursts | `sunburst.scss:10` | `sans-serif` a secas — ni `system-ui` ni la del sitio |
| Grafo de crímenes | `mapa.scss:747` | Georgia, mientras los demás gráficos de la misma página van en `system-ui` |
| Tamaño de eje X | `TiempoCrimenesMapa.ts:1774` | `9px` en línea. **Ese valor no existe en ninguna hoja**; el más pequeño del CSS es `9.5px`. Y al ser estilo en línea, gana sobre cualquier clase |
| Tooltips | `tooltips.scss:20` vs `:32,39` | El tooltip base va en Georgia; las variantes `--sans` y `--neutro` en `system-ui`. Tres gráficos de la misma página pueden mostrar tooltips en dos familias distintas |

En una misma página (`personas/personas.astro`) conviven Source Sans 3 (cuerpo), Georgia (mapa y
tooltip base), `system-ui` (gráficos) y `sans-serif` (sunburst).

### 5.7 El nombre del cuarto token rompe el patrón

Tres tokens salen como `--font-display`, `--font-body`, `--font-mono`. El cuarto sale como
**`--mapa-font`** (`_root.scss:50`), invirtiendo el orden de las palabras, aunque su variable SCSS
sí sigue el patrón (`$font-mapa`). Buscar `--font-` en el repo encuentra tres de las cuatro.

A eso se suma que `$font-sistema` y `$font-sans` **no se emiten como custom property**, así que solo
son alcanzables desde SCSS: no se pueden usar en un `style` en línea, ni leer desde JS, ni redefinir
por página. La decisión de mantenerlas separadas está justificada en `MIGRATION.md:789-792` (unificar
cambiaría lo que se dibuja en el sunburst), pero el resultado es que hay dos categorías de token de
fuente con alcances distintos y nada lo indica.

### 5.8 Tipografía muerta

**`ConteoCrimenes.ts` no lo importa nadie.** Ni una página ni otro módulo de `charts/` lo referencia,
así que su `<style>` inyectado nunca llega al bundle. Si se reviviera, haría dos cosas que chocan con
`global.scss`:

- `.col-root { font-family: serif; ... }` (línea 42) — `global.scss:188` ya define `.col-root` como
  contenedor flex, y la regla inyectada le pondría `serif`, una familia que no está en los tokens.
- `.card { ... }` (línea 43) — `global.scss:203` ya define `.card`. Las dos reglas competirían por
  orden de inserción, y la inyectada se añade al DOM en tiempo de ejecución, así que ganaría.

También trae los únicos `font-weight: bold` (palabra clave, no número) y un `font-size` en un
atributo `style` en línea (línea 52) del repositorio.

**Reglas `apilado-*` sin marcado.** `apilado.scss` está importada por `personas/personas.astro`, pero
de sus 20 clases **solo `.apilado-sankey-wrapper` aparece en el código**
(`DelitosSunburstGenero.ts:104`). Las demás no las escribe ningún script ni ningún `.astro`. Eso deja
sin efecto, entre otras, esta tipografía:

| Regla | Tipografía que define |
|---|---|
| `.apilado-eje-atributo` (`:18-20`) | `12.5px` / `700` |
| `.apilado-eje-siglo` (`:24-25`) | `9.5px` — el tamaño más pequeño del repo |
| `.apilado-panel-titulo` (`:63-65`) | `--font-display` / `1.05rem` |
| `.apilado-panel-cerrar` (`:69-73`) | `1.1rem` / `line-height: 1` |
| `.apilado-panel-total` (`:83-84`) | `12.5px` |
| `.apilado-genero-fila` (`:89-95`) | `12.5px` |
| `.apilado-sankey-titulo` (`:119-121`) | `--font-display` / `1.05rem` |
| `.apilado-sankey-etiqueta` (`:131-132`) | `11.5px` |

Ocho de los 38 tamaños distintos del inventario solo existen aquí o aquí y en otro sitio; `9.5px`
solo existe aquí.

### 5.9 `line-height: 0.5` recorta descendentes

`caso.scss:192` (`.crime-name`, a `1.35rem`) y `caso.scss:198` (`.crime-sub`, a `0.88rem`) usan
`line-height: 0.5` — media línea para el tamaño de fuente. Es el valor más extremo del repo y
recorta las descendentes (`g`, `j`, `p`, `q`, `y`) en los nombres de crimen de la ficha de caso.
Los otros nueve `line-height: 1` del repo están todos sobre cifras o iconos, donde no hay
descendentes; estos dos están sobre texto corrido.

---

## Resumen

| Métrica | Valor |
|---|---|
| Familias declaradas | 6 pilas / 5 familias reales |
| Fuentes web descargadas | 3 (IM Fell English, Source Sans 3, Source Code Pro) |
| `@font-face` | 0 |
| Archivos de fuente locales | 0 |
| Familias usadas sin descargar | 2 (Georgia, `system-ui`) + 3 genéricas |
| Tamaños distintos | 38 (17 px, 19 rem, 2 clamp) |
| Declaraciones `font-size` | 159 en SCSS + 1 viva en JS |
| Tamaños tokenizados | **0** |
| Pesos distintos | 5 (`400`, `600`, `700`, `800`, `normal`) |
| Pesos tokenizados | **0** |
| Pesos usados y no descargados | `700` (×34), `600` sobre IM Fell (×2) |
| Pesos descargados y no usados | `300` de Source Sans 3 |
| Alturas de línea distintas | 11 |
| Alturas de línea tokenizadas | **0** |
| Bloques `:root` que declaran fuentes | **2** (`_root.scss`, `caso.scss`) |
| Estilos tipográficos en línea en `.astro` | 0 |
| Sitios donde el JS fija tipografía | 2 (1 vivo, 1 muerto) |
