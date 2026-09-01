import * as d3 from 'd3';
import { irATablasFiltradas } from './verCasos.js';
import { esLinajeCriminal } from './linajeComun.js';

// TODO: type — nodo de jerarquía de d3 (d3.HierarchyPointNode). Ver MIGRATION.md.
type NodoMutable = any;

// Sinónimos usa "/" como separador cuando hay más de uno (mismo carácter que
// Path, pero en un campo de texto libre), y "null" literal cuando no hay
// ninguno.
function formatearSinonimos(crudo: string | undefined): string {
  if (!crudo || crudo.trim() === '' || crudo.trim().toLowerCase() === 'null') {
    return 'Sin sinónimos.';
  }

  return crudo
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

// Código/Sub_Código en crimenes.csv apuntan a ID_Código de Linaje.csv: el
// linaje (crimen, nivel 1) va en `codigo`, el subcrimen (nivel 2) en
// `subcodigo`. Ver irATablasFiltradas en verCasos.ts.
function overridesDeNodo(d: NodoMutable) {
  if (d.depth === 1) return { codigo: d.data.Nombre };

  return { codigo: d.parent.data.Nombre, subcodigo: d.data.Nombre };
}

function leerVariableCss(nombre: string, fallback: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();

  return valor || fallback;
}

// Blanco o tinta oscura según la luminancia del color de fondo (fórmula WCAG
// simplificada), para que el texto de cada círculo de categoría sea siempre
// legible sin tener que elegir el contraste a mano color por color.
function colorTextoContraste(hex: string): string {
  const limpio = hex.replace('#', '');
  const r = parseInt(limpio.substring(0, 2), 16) / 255;
  const g = parseInt(limpio.substring(2, 4), 16) / 255;
  const b = parseInt(limpio.substring(4, 6), 16) / 255;
  const linearizar = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = 0.2126 * linearizar(r) + 0.7152 * linearizar(g) + 0.0722 * linearizar(b);

  return luminancia > 0.4 ? '#1a1410' : '#fff';
}

// Diez series ya validadas del dashboard "Tiempo y Crímenes" (--mapa-serie-1…10,
// ver _variables.scss): se reciclan acá para no inventar una paleta nueva. Con
// más de 10 categorías (hasta 27 en el árbol criminal) el color se repite —
// aceptable porque lo que importa es distinguir una rama de sus vecinas
// inmediatas, no leer las 27 a la vez como una leyenda.
const NUM_SERIES = 10;
const COLOR_RAIZ = '#6b4f2a';

// Mismo árbol jerárquico de siempre (root → categoría → subcrimen, izquierda
// a derecha, un solo lienzo), pero con los nodos rediseñados: círculos de
// color para la raíz y las categorías, cajas redondeadas para los
// subcrímenes — en HTML, no texto en SVG, para que el nombre envuelva con
// las reglas normales de CSS. El SVG de abajo solo dibuja las curvas.
const RADIO_CIRCULO = 34;
const RADIO_RAIZ = 26;
const GAP_HORIZONTAL = 30;
const ANCHO_CAJA = 158;
const ALTO_CAJA = 44;
// Separación mínima entre nodos vecinos en el eje vertical (nodeSize de
// d3.tree): con nodos tan grandes hace falta mucho más que los 18px del
// árbol original de puntos+texto.
const DX = 56;
const MARGEN = 40;

// Distancia centro a centro por nivel: 0→1 (raíz a categoría) y 1→2
// (categoría a subcrimen). d3.tree() no soporta un `dy` distinto por nivel,
// así que se pisa `d.y` a mano después de calcular el layout.
const COL_RAIZ_A_CATEGORIA = RADIO_RAIZ + GAP_HORIZONTAL + RADIO_CIRCULO;
const COL_CATEGORIA_A_SUBCRIMEN = RADIO_CIRCULO + GAP_HORIZONTAL + ANCHO_CAJA / 2;
const COLUMNAS_X = [0, COL_RAIZ_A_CATEGORIA, COL_RAIZ_A_CATEGORIA + COL_CATEGORIA_A_SUBCRIMEN];

export async function crearLinaje(containerId: string, esCriminal: boolean) {
  const datos = (await d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`)).filter((d: any) => {
    if (d.Path === '0') return true;

    return esLinajeCriminal(d.Path.split('/')[1]) === esCriminal;
  });

  const stratifier = d3
    .stratify()
    .id((d: any) => String(d.Path))
    .parentId((d: any) => {
      const path = String(d.Path);

      const lastSlash = path.lastIndexOf('/');

      return lastSlash >= 0 ? path.substring(0, lastSlash) : null;
    });

  const root: NodoMutable = stratifier(datos);
  const categorias: NodoMutable[] = root.children ?? [];

  const colorPorCategoria = new Map<string, string>();
  categorias.forEach((categoria: NodoMutable, indice: number) => {
    colorPorCategoria.set(
      categoria.data.Path,
      leerVariableCss(`--mapa-serie-${(indice % NUM_SERIES) + 1}`, '#7a3b1e'),
    );
  });

  function colorDeNodo(d: NodoMutable): string {
    if (d.depth === 0) return COLOR_RAIZ;
    if (d.depth === 1) return colorPorCategoria.get(d.data.Path)!;

    return colorPorCategoria.get(d.parent.data.Path)!;
  }

  const tree = d3.tree().nodeSize([DX, 1]);

  tree(root);
  root.each((d: NodoMutable) => {
    d.y = COLUMNAS_X[d.depth];
  });

  let x0 = Infinity;
  let x1 = -Infinity;

  root.each((d: NodoMutable) => {
    if (d.x > x1) x1 = d.x;

    if (d.x < x0) x0 = d.x;
  });

  const alto = x1 - x0 + MARGEN * 2;
  const ancho = COLUMNAS_X[2] + ANCHO_CAJA / 2 + MARGEN * 2;

  const wrapper = document.createElement('div');
  wrapper.className = 'linaje-wrapper';

  const arbol = document.createElement('div');
  arbol.className = 'linaje-arbol';
  arbol.style.width = `${ancho}px`;
  arbol.style.height = `${alto}px`;

  function px(d: NodoMutable): number {
    return d.y + MARGEN;
  }
  function py(d: NodoMutable): number {
    return d.x - x0 + MARGEN;
  }

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'linaje-arbol-lineas');
  svg.setAttribute('width', String(ancho));
  svg.setAttribute('height', String(alto));

  root.links().forEach((link: NodoMutable) => {
    const xOrigen = px(link.source);
    const yOrigen = py(link.source);
    const xDestino = px(link.target);
    const yDestino = py(link.target);
    const xMedio = (xOrigen + xDestino) / 2;

    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute(
      'd',
      `M${xOrigen},${yOrigen} C${xMedio},${yOrigen} ${xMedio},${yDestino} ${xDestino},${yDestino}`,
    );
    path.setAttribute('class', 'linaje-arbol-linea');
    path.style.setProperty('--categoria-color', colorDeNodo(link.target));
    svg.append(path);
  });

  arbol.append(svg);

  // Las definiciones y sinónimos solo tienen contenido útil en el árbol de
  // delitos criminales; en el de no-criminales casi todos los campos de
  // Explicación/Sinónimos están vacíos, así que ese árbol se muestra sin
  // interacción (sin panel, sin clic).
  let seleccionar: ((d: NodoMutable, elemento: HTMLElement) => void) | null = null;

  if (esCriminal) {
    const layout = document.createElement('div');
    layout.className = 'linaje-layout';
    layout.append(arbol);
    wrapper.append(layout);

    const panel = document.createElement('div');
    panel.className = 'linaje-panel';
    panel.innerHTML = `
      <p class="linaje-panel-vacio">Selecciona una categoría o un subcrimen para ver su definición.</p>
      <div class="linaje-panel-contenido">
        <h3 class="linaje-panel-titulo"></h3>
        <p class="linaje-panel-definicion"></p>
        <p class="linaje-panel-sinonimos"></p>
        <button type="button" class="linaje-panel-boton">Ver casos</button>
      </div>
    `;
    layout.append(panel);

    const titulo = panel.querySelector<HTMLElement>('.linaje-panel-titulo')!;
    const definicion = panel.querySelector<HTMLElement>('.linaje-panel-definicion')!;
    const sinonimos = panel.querySelector<HTMLElement>('.linaje-panel-sinonimos')!;
    const botonVerCasos = panel.querySelector<HTMLButtonElement>('.linaje-panel-boton')!;

    let nodoActivo: HTMLElement | null = null;

    seleccionar = (d: NodoMutable, elemento: HTMLElement) => {
      nodoActivo?.classList.remove('linaje-nodo--activo');
      elemento.classList.add('linaje-nodo--activo');
      nodoActivo = elemento;

      // Mismo color de la categoría que ya llevan el nodo y sus líneas: el
      // panel queda con el mismo diseño que el árbol en vez de un acento fijo.
      const color = colorDeNodo(d);
      panel.style.setProperty('--categoria-color', color);
      panel.style.setProperty('--categoria-color-texto', colorTextoContraste(color));

      titulo.textContent = d.data.Nombre;
      definicion.textContent = d.data['Explicación']?.trim() || 'Sin definición disponible.';
      sinonimos.textContent = `Sinónimos: ${formatearSinonimos(d.data['Sinónimos'])}`;
      botonVerCasos.onclick = () => irATablasFiltradas(overridesDeNodo(d));

      panel.classList.add('linaje-panel--con-seleccion');
    };
  } else {
    wrapper.append(arbol);
  }

  // Solo la raíz (depth 0, el tronco "Delitos") queda sin clic; categorías y
  // subcrímenes se comportan igual.
  root.descendants().forEach((d: NodoMutable) => {
    const clicable = esCriminal && d.depth > 0;
    const color = colorDeNodo(d);

    if (d.depth < 2) {
      const radio = d.depth === 0 ? RADIO_RAIZ : RADIO_CIRCULO;
      const circulo = document.createElement(clicable ? 'button' : 'div');
      circulo.className = 'linaje-nodo linaje-nodo-circulo';
      if (d.depth === 0) circulo.classList.add('linaje-nodo-circulo--raiz');
      circulo.style.width = `${radio * 2}px`;
      circulo.style.height = `${radio * 2}px`;
      circulo.style.left = `${px(d) - radio}px`;
      circulo.style.top = `${py(d) - radio}px`;
      circulo.style.setProperty('--categoria-color', color);
      circulo.style.setProperty('--categoria-color-texto', colorTextoContraste(color));

      // El nombre va en un span aparte: el círculo se centra con flex, y el
      // span recorta con line-clamp — no se pueden combinar display:flex y
      // display:-webkit-box en el mismo elemento.
      const texto = document.createElement('span');
      texto.className = 'linaje-nodo-circulo-texto';
      texto.textContent = d.data.Nombre;
      circulo.append(texto);

      if (clicable) {
        (circulo as HTMLButtonElement).type = 'button';
        circulo.addEventListener('click', () => seleccionar?.(d, circulo));
      }

      arbol.append(circulo);
    } else {
      const caja = document.createElement(clicable ? 'button' : 'div');
      caja.className = 'linaje-nodo linaje-nodo-caja';
      caja.style.width = `${ANCHO_CAJA}px`;
      caja.style.height = `${ALTO_CAJA}px`;
      caja.style.left = `${px(d) - ANCHO_CAJA / 2}px`;
      caja.style.top = `${py(d) - ALTO_CAJA / 2}px`;
      caja.style.setProperty('--categoria-color', color);
      caja.style.setProperty('--categoria-color-texto', colorTextoContraste(color));
      caja.textContent = d.data.Nombre;

      if (clicable) {
        (caja as HTMLButtonElement).type = 'button';
        caja.addEventListener('click', () => seleccionar?.(d, caja));
      }

      arbol.append(caja);
    }
  });

  document.getElementById(containerId)!.append(wrapper);
}
