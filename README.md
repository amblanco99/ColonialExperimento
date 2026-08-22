# Crímenes Coloniales

Visualización de datos sobre juicios criminales del periodo colonial en el
Nuevo Reino de Granada. Sitio estático (Vite + JS vanilla + D3.js), sin
framework.

## Estructura del proyecto

Cada sección del sitio vive en su propia carpeta, con `index.html` como
portada de esa sección:

```
index.html                  portada del sitio

base-de-datos/index.html    Tablas y filtros de la base de datos (Crímenes)
base-de-datos/caso.html      └─ Detalle de un caso
about/index.html            Sobre el proyecto (portada)
about/fuentes.html           └─ Fuentes
about/delitos.html           └─ Delitos
about/documentacion-tecnica.html
                              └─ Documentación técnica
tiempo/index.html           Tiempo (mapa + línea de tiempo)
personas/index.html         Composición social (portada)
personas/personas.html       └─ Personas
personas/otrosAgentes.html
                              └─ Otros agentes

public/data/           CSV/JSON fuente que consumen los gráficos (se sirven
                       tal cual, sin build)
src/
  main/                un archivo *Main.js por página — el punto de entrada
                       que importa los CSS de esa página y llama a las
                       funciones de src/charts/. Excepción: `baseDeDatosMain.js`
                       sirve tanto a `base-de-datos/index.html` como a
                       `base-de-datos/caso.html` (mismo bloque), y decide
                       cuál inicializar según qué elemento exista en el DOM.
  charts/              cada gráfico D3, exportado como una función que recibe
                       un id de contenedor y datos ya filtrados
  tables/              carga de CSV vía d3.csv + tabla general y detalle de caso
  ui/                  componentes de interfaz reutilizables entre páginas
                       (p. ej. el carrusel de preguntas)
  style/               CSS, ver más abajo
```

Al enlazar entre páginas usa siempre la ruta completa al `index.html` de la
carpeta destino (p. ej. `../base-de-datos/index.html`, no `../base-de-datos/`), como ya
está en todo el sitio — es más explícito y evita depender de que el
hosting resuelva directorios.

## Patrón página → main → chart → CSS

Cada página HTML sigue (o debería seguir) el mismo esqueleto:

```html
<link rel="stylesheet" href="/src/style/style.css" />
...
<script type="module" src="/src/main/miPaginaMain.js"></script>
```

Y `src/main/miPaginaMain.js`:

```js
import '/src/style/style.css';
import '/src/style/tooltips.css';
// ...cualquier otro CSS que use esta página

import { crearMiGrafico } from '../charts/MiGrafico.js';

crearMiGrafico('idDelContenedor');
```

Los estilos se importan **desde el JS de entrada**, no con `<link>` extra en
el `<head>` — así cada página solo carga el CSS que realmente usa, y queda
explícito en un solo archivo qué CSS depende de qué página. La excepción es
`style.css`, que casi todas las páginas enlazan también desde el `<head>`
por las variables globales (`:root`) que usa el nav compartido.

Dentro de los archivos de `src/charts/`, evita agregar `.style(...)` o CSS
inline salvo que el valor sea **genuinamente dinámico** (viene de una escala
de color, de la posición del mouse, de una transición D3). Todo lo demás
(colores fijos, tipografías, spacing, bordes) va en una clase CSS.

## CSS (`src/style/`)

- `style.css` — variables `:root` (paletas de color, fuentes) que son la
  única fuente de verdad; los charts las leen en JS vía
  `getComputedStyle(...).getPropertyValue(...)` cuando necesitan el valor
  para un cálculo (ver `src/charts/agentesComun.js`).
- `tooltips.css`, `botones.css`, `paneles-filtro.css`, `filtros-chip.css`,
  `graficos.css` — clases genéricas reutilizadas por varios gráficos.
- `mapa.css`, `mariposa.css`, `sunburst.css`, `agentes-filtros.css`,
  `caso.css` — CSS específico de un chart o página puntual.

Si vas a crear un gráfico nuevo: reutiliza las clases genéricas que ya
existan antes de escribir una nueva; si necesitas una paleta de color,
agrégala a `:root` en `style.css` en vez de declarar los hex directamente
en el JS.

## Datos (`public/data/`)

CSV planos, sin build/procesamiento — se hace `fetch`/`d3.csv` directo desde
el navegador. Los principales:

- `Visualizaciones.csv` — el dataset central: una fila por persona/agente
  involucrado en un documento (género, atributo, tipo, año, crimen...).
  Lo usan casi todos los charts de `personas/` y `otrosAgentes`.
- `crimenes.csv` / `Casos.csv` — un caso puede tener varios documentos y
  varios crímenes; `src/tables/caso.js` los cruza para armar el detalle de
  `base-de-datos/caso.html`.
- `Source.csv` — metadatos archivísticos (archivo, sección, fondo, folios)
  por documento.
- `Lugar.csv`, `NuevaGranada.json` — coordenadas de lugares, usadas por el
  mapa (`TiempoCrimenesMapa.js`).
- `Linaje.csv` — jerarquía de códigos de crimen (para el árbol de
  `Linaje.js`).

## Pendiente

- **Nav duplicado**: la barra de navegación (`<nav class="topnav">`) está
  copiada y pegada en cada archivo HTML. Cambiar un link significa editar
  todos los archivos a mano (ya pasó dos veces esta sesión: al renombrar
  `composicion-social.html` y al mover cada página a su propia carpeta). Si
  el proyecto sigue creciendo, vale la pena moverlo a un componente que se
  inyecte por JS, o adoptar SSR/templating de Vite.
