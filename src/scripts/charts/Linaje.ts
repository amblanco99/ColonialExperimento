import * as d3 from 'd3';
import { irATablasFiltradas } from './verCasos.js';
import { esLinajeCriminal } from './linajeComun.js';
import { colorDeCrimen } from './coloresCrimen.js';

type NodoMutable = any;

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

function overridesDeNodo(d: NodoMutable) {
  if (d.depth === 1) return { codigo: d.data.Nombre };

  return { codigo: d.parent.data.Nombre, subcodigo: d.data.Nombre };
}

function colorTextoContraste(hex: string): string {
  const limpio = hex.replace('#', '');
  const r = parseInt(limpio.substring(0, 2), 16) / 255;
  const g = parseInt(limpio.substring(2, 4), 16) / 255;
  const b = parseInt(limpio.substring(4, 6), 16) / 255;
  const linearizar = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminancia = 0.2126 * linearizar(r) + 0.7152 * linearizar(g) + 0.0722 * linearizar(b);

  return luminancia > 0.4 ? '#1a1410' : '#fff';
}

const RADIO_CIRCULO = 34;
const RADIO_AGRANDADO = 58;
const ANCHO_CAJA_SATELITE = 112;
const ALTO_CAJA_SATELITE = 30;
const GAP_RADIAL = 22;
const DURACION_GIRO_MS = 700;

function polarACartesiano(angulo: number, radio: number) {
  return { x: radio * Math.sin(angulo), y: -radio * Math.cos(angulo) };
}

function calcularRadioPrincipal(n: number): number {
  const cuerdaNecesaria = RADIO_AGRANDADO + RADIO_CIRCULO + GAP_RADIAL;
  if (n < 2) return cuerdaNecesaria;

  const anguloEntreVecinos = (2 * Math.PI) / n;

  return cuerdaNecesaria / (2 * Math.sin(anguloEntreVecinos / 2));
}

function calcularRadioSubrueda(cantidadHijos: number): number {
  const radioMinimo =
    RADIO_AGRANDADO + GAP_RADIAL + Math.hypot(ANCHO_CAJA_SATELITE / 2, ALTO_CAJA_SATELITE / 2);
  if (cantidadHijos <= 1) return radioMinimo;

  const anguloEntreHijos = (2 * Math.PI) / cantidadHijos;
  const cuerdaNecesaria = ANCHO_CAJA_SATELITE + GAP_RADIAL;
  const radioPorEmpaquetado = cuerdaNecesaria / (2 * Math.sin(anguloEntreHijos / 2));

  return Math.max(radioMinimo, radioPorEmpaquetado);
}

function crearHub() {
  const hub = document.createElement('div');
  hub.className = 'linaje-hub';
  hub.innerHTML = `
    <div class="linaje-panel">
      <h3 class="linaje-panel-titulo"></h3>
      <p class="linaje-panel-definicion"></p>
      <p class="linaje-panel-sinonimos"></p>
      <button type="button" class="linaje-panel-boton">Ver casos</button>
    </div>
  `;

  const panel = hub.querySelector<HTMLElement>('.linaje-panel')!;
  const titulo = panel.querySelector<HTMLElement>('.linaje-panel-titulo')!;
  const definicion = panel.querySelector<HTMLElement>('.linaje-panel-definicion')!;
  const sinonimos = panel.querySelector<HTMLElement>('.linaje-panel-sinonimos')!;
  const botonVerCasos = panel.querySelector<HTMLButtonElement>('.linaje-panel-boton')!;

  let nodoActivo: HTMLElement | null = null;

  function seleccionar(
    d: NodoMutable,
    elemento: HTMLElement,
    colorDeNodo: (d: NodoMutable) => string,
  ) {
    nodoActivo?.classList.remove('linaje-nodo--activo');
    elemento.classList.add('linaje-nodo--activo');
    nodoActivo = elemento;

    const color = colorDeNodo(d);
    panel.style.setProperty('--categoria-color', color);
    panel.style.setProperty('--categoria-color-texto', colorTextoContraste(color));

    titulo.textContent = d.data.Nombre;
    definicion.textContent = d.data['Explicación']?.trim() || 'Sin definición disponible.';
    sinonimos.textContent = `Sinónimos: ${formatearSinonimos(d.data['Sinónimos'])}`;
    botonVerCasos.onclick = () => irATablasFiltradas(overridesDeNodo(d));
  }

  return { elemento: hub, seleccionar };
}

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
  const n = categorias.length;

  // Cada nodo (crimen o subcrimen) trae su propio color declarado por
  // ID_Código en coloresCrimen.ts — sin herencia entre padre e hijo, así que
  // un subcrimen no comparte el color de su categoría.
  function colorDeNodo(d: NodoMutable): string {
    return colorDeCrimen(d.data['ID_Código']);
  }

  const r1 = calcularRadioPrincipal(n);
  categorias.forEach((categoria: NodoMutable, indice: number) => {
    categoria.anguloBase = (indice * 2 * Math.PI) / n;
    const pos = polarACartesiano(categoria.anguloBase, r1);
    categoria.baseX = pos.x;
    categoria.baseY = pos.y;
  });

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
  svg.setAttribute('class', 'linaje-radial-svg');
  if (!esCriminal) svg.classList.add('linaje-radial-svg--achicada');
  svg.style.setProperty('--angulo-rueda', '0deg');
  svg.style.setProperty('--duracion-giro', `${DURACION_GIRO_MS}ms`);
  const extentoAnillo = r1 + RADIO_AGRANDADO;
  const padAnillo = 24;
  svg.setAttribute(
    'viewBox',
    `${-extentoAnillo - padAnillo} ${-extentoAnillo - padAnillo} ${(extentoAnillo + padAnillo) * 2} ${(extentoAnillo + padAnillo) * 2}`,
  );

  function crearLineaSvg(x1: number, y1: number, x2: number, y2: number, color: string) {
    const linea = document.createElementNS(svgNs, 'line');
    linea.setAttribute('x1', String(x1));
    linea.setAttribute('y1', String(y1));
    linea.setAttribute('x2', String(x2));
    linea.setAttribute('y2', String(y2));
    linea.setAttribute('class', 'linaje-arbol-linea');
    linea.style.setProperty('--categoria-color', color);

    return linea;
  }

  function crearForeignObject(x: number, y: number, ancho: number, alto: number) {
    const fo = document.createElementNS(svgNs, 'foreignObject');
    fo.setAttribute('x', String(x));
    fo.setAttribute('y', String(y));
    fo.setAttribute('width', String(ancho));
    fo.setAttribute('height', String(alto));

    return fo;
  }

  const ruedaPrincipal = document.createElementNS(svgNs, 'g');
  ruedaPrincipal.setAttribute('class', 'linaje-rueda-principal');
  svg.append(ruedaPrincipal);

  categorias.forEach((categoria: NodoMutable) => {
    const color = colorDeNodo(categoria);

    ruedaPrincipal.append(crearLineaSvg(0, 0, categoria.baseX, categoria.baseY, color));

    const posG = document.createElementNS(svgNs, 'g');
    posG.setAttribute('transform', `translate(${categoria.baseX}, ${categoria.baseY})`);

    const contraG = document.createElementNS(svgNs, 'g');
    contraG.setAttribute('class', 'linaje-categoria-contrarrotacion');


    const foCategoria = crearForeignObject(
      -RADIO_AGRANDADO,
      -RADIO_AGRANDADO,
      RADIO_AGRANDADO * 2,
      RADIO_AGRANDADO * 2,
    );

    const hueco = document.createElement('div');
    hueco.className = 'linaje-nodo-hueco';

    const circulo = document.createElement('button');
    circulo.type = 'button';
    circulo.className = 'linaje-nodo linaje-nodo-circulo';
    circulo.style.setProperty('--categoria-color', color);
    circulo.style.setProperty('--categoria-color-texto', colorTextoContraste(color));

    const texto = document.createElement('span');
    texto.className = 'linaje-nodo-circulo-texto';
    texto.textContent = categoria.data.Nombre;
    circulo.append(texto);
    circulo.addEventListener('click', () => activarCategoria(categoria));
    conectarTooltip(circulo, categoria);

    hueco.append(circulo);
    foCategoria.append(hueco);
    contraG.append(foCategoria);
    posG.append(contraG);
    ruedaPrincipal.append(posG);

    categoria.elementoCirculo = circulo;
  });

  const { elemento: hubElemento, seleccionar: seleccionarBase } = crearHub();

  // Selector: solo categorías (nivel 1) en un <select> nativo, para saltar
  // directo a cualquiera sin tener que ubicarla primero en la rueda. Cada
  // <option> usa el Path de la categoría (único en Linaje.csv) como value.
  const selectorCrimen = document.createElement('select');
  selectorCrimen.className = 'linaje-selector-crimen';
  selectorCrimen.setAttribute('aria-label', 'Ir directo a una categoría');

  const opcionInicial = document.createElement('option');
  opcionInicial.value = '';
  opcionInicial.textContent = 'Ir a una categoría…';
  opcionInicial.disabled = true;
  opcionInicial.hidden = true;
  opcionInicial.selected = true;
  selectorCrimen.append(opcionInicial);

  const categoriasPorPath = new Map<string, NodoMutable>();
  categorias.forEach((categoria: NodoMutable) => {
    categoriasPorPath.set(categoria.data.Path, categoria);

    const opcion = document.createElement('option');
    opcion.value = categoria.data.Path;
    opcion.textContent = categoria.data.Nombre;
    selectorCrimen.append(opcion);
  });

  selectorCrimen.addEventListener('change', () => {
    const categoria = categoriasPorPath.get(selectorCrimen.value);
    if (categoria) activarCategoria(categoria);
    selectorCrimen.blur();
  });

  function seleccionar(
    d: NodoMutable,
    elemento: HTMLElement,
    colorFn: (d: NodoMutable) => string,
  ) {
    seleccionarBase(d, elemento, colorFn);
    selectorCrimen.value = d.depth === 1 ? d.data.Path : d.parent.data.Path;
  }

  hubElemento.querySelector('.linaje-panel-titulo')?.insertAdjacentElement('afterend', selectorCrimen);

  const tituloNivel2 = document.createElement('h4');
  tituloNivel2.className = 'linaje-nivel-titulo';
  tituloNivel2.textContent = 'Nivel 2';

  const subruedaContenedor = document.createElement('div');
  subruedaContenedor.className = 'linaje-subrueda-col';

  const conectorSvg = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
  conectorSvg.setAttribute('class', 'linaje-conector-svg');

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-grafico tooltip-grafico--neutro tooltip-grafico--grande';
  function moverTooltip(event: MouseEvent) {
    const rect = wrapper.getBoundingClientRect();
    const relX = event.clientX - rect.left;
    const relY = event.clientY - rect.top;
    const margen = 14;
    const anchoTooltip = tooltip.offsetWidth;
    const altoTooltip = tooltip.offsetHeight;

    let left = relX + margen;
    if (left + anchoTooltip > rect.width) left = relX - margen - anchoTooltip;
    left = Math.max(0, Math.min(left, rect.width - anchoTooltip));

    let top = relY + margen;
    if (top + altoTooltip > rect.height) top = relY - margen - altoTooltip;
    top = Math.max(0, Math.min(top, rect.height - altoTooltip));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }
  function conectarTooltip(elemento: HTMLElement, d: NodoMutable) {
    elemento.addEventListener('mouseenter', (event) => {
      tooltip.textContent = d.data.Nombre;
      tooltip.classList.add('tooltip-grafico--visible');
      moverTooltip(event as MouseEvent);
    });
    elemento.addEventListener('mousemove', moverTooltip);
    elemento.addEventListener('mouseleave', () => tooltip.classList.remove('tooltip-grafico--visible'));
  }

  let anguloRuedaActual = 0; // grados, acumulado (no normalizado) para que el giro siempre tome el camino corto
  let categoriaActiva: NodoMutable | null = null;
  const ANGULO_OBJETIVO_GRADOS = 90;

  function activarCategoria(categoria: NodoMutable) {
    const mostradoActual =
      ((((categoria.anguloBase * 180) / Math.PI + anguloRuedaActual) % 360) + 360) % 360;
    let delta = ANGULO_OBJETIVO_GRADOS - mostradoActual;
    if (delta < -180) delta += 360;
    if (delta > 180) delta -= 360;
    anguloRuedaActual += delta;

    svg.style.setProperty('--angulo-rueda', `${anguloRuedaActual}deg`);

    categoriaActiva?.elementoCirculo.classList.remove('linaje-nodo-circulo--agrandada');
    categoria.elementoCirculo.classList.add('linaje-nodo-circulo--agrandada');
    categoriaActiva = categoria;

    seleccionar(categoria, categoria.elementoCirculo, colorDeNodo);
    reconstruirSubrueda(categoria);
    actualizarConector();
  }

  function reconstruirSubrueda(categoria: NodoMutable) {
    subruedaContenedor.replaceChildren();

    const hijos: NodoMutable[] = categoria.children ?? [];
    tituloNivel2.hidden = hijos.length === 0;
    if (hijos.length === 0) return;

    const colorCategoria = colorDeNodo(categoria);
    const radioSubrueda = calcularRadioSubrueda(hijos.length);
    const extento = radioSubrueda + Math.max(ANCHO_CAJA_SATELITE, ALTO_CAJA_SATELITE) / 2;
    const pad = 16;

    const svgSub = document.createElementNS(svgNs, 'svg') as SVGSVGElement;
    svgSub.setAttribute('class', 'linaje-subrueda-svg');
    svgSub.setAttribute(
      'viewBox',
      `${-extento - pad} ${-extento - pad} ${(extento + pad) * 2} ${(extento + pad) * 2}`,
    );

    hijos.forEach((hijo: NodoMutable, indice: number) => {
      const pos = polarACartesiano((indice * 2 * Math.PI) / hijos.length, radioSubrueda);
      const colorHijo = colorDeNodo(hijo);

      svgSub.append(crearLineaSvg(0, 0, pos.x, pos.y, colorHijo));

      const caja = document.createElement('button');
      caja.type = 'button';
      caja.className = 'linaje-nodo linaje-nodo-caja';
      caja.style.setProperty('--categoria-color', colorHijo);
      caja.style.setProperty('--categoria-color-texto', colorTextoContraste(colorHijo));
      caja.textContent = hijo.data.Nombre;
      caja.addEventListener('click', () => seleccionar(hijo, caja, colorDeNodo));
      conectarTooltip(caja, hijo);

      const foHijo = crearForeignObject(
        pos.x - ANCHO_CAJA_SATELITE / 2,
        pos.y - ALTO_CAJA_SATELITE / 2,
        ANCHO_CAJA_SATELITE,
        ALTO_CAJA_SATELITE,
      );
      foHijo.append(caja);
      svgSub.append(foHijo);
    });

    const foCentro = crearForeignObject(
      -RADIO_AGRANDADO,
      -RADIO_AGRANDADO,
      RADIO_AGRANDADO * 2,
      RADIO_AGRANDADO * 2,
    );
    const centro = document.createElement('div');
    centro.className = 'linaje-subrueda-centro';
    centro.style.setProperty('--categoria-color', colorCategoria);
    centro.style.setProperty('--categoria-color-texto', colorTextoContraste(colorCategoria));
    const centroTexto = document.createElement('span');
    centroTexto.className = 'linaje-nodo-circulo-texto';
    centroTexto.textContent = categoria.data.Nombre;
    centro.append(centroTexto);
    conectarTooltip(centro, categoria);
    foCentro.append(centro);
    svgSub.append(foCentro);

    subruedaContenedor.append(svgSub);
  }

  let montado = false;

  function actualizarConector() {
    const subSvg = subruedaContenedor.querySelector('svg');
    if (!montado || !subSvg || !categoriaActiva) {
      conectorSvg.replaceChildren();
      return;
    }

    const wrapperRect = wrapper.getBoundingClientRect();
    if (wrapperRect.width === 0 || wrapperRect.height === 0) return; // aún no tiene layout

    conectorSvg.setAttribute('viewBox', `0 0 ${wrapperRect.width} ${wrapperRect.height}`);

    const svgRect = svg.getBoundingClientRect();
    const cajaPrincipal = svg.viewBox.baseVal;
    const escalaPrincipal = svgRect.width / cajaPrincipal.width;
    const x1 = svgRect.left - wrapperRect.left + (r1 + RADIO_AGRANDADO - cajaPrincipal.x) * escalaPrincipal;
    const y1 = svgRect.top - wrapperRect.top + (0 - cajaPrincipal.y) * escalaPrincipal;

    const subRect = subSvg.getBoundingClientRect();
    const cajaSub = subSvg.viewBox.baseVal;
    const escalaSub = subRect.width / cajaSub.width;
    const centroX = subRect.left - wrapperRect.left + (0 - cajaSub.x) * escalaSub;
    const centroY = subRect.top - wrapperRect.top + (0 - cajaSub.y) * escalaSub;

    const anguloLlegada = Math.atan2(x1 - centroX, -(y1 - centroY));
    const totalHijos = subSvg.querySelectorAll('.linaje-nodo-caja').length;
    let anguloHueco = anguloLlegada;
    let mejorDistancia = Infinity;
    for (let i = 0; i < totalHijos; i++) {
      const candidato = (i + 0.5) * ((2 * Math.PI) / totalHijos);
      const distancia = Math.abs(
        ((((candidato - anguloLlegada + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) -
          Math.PI,
      );
      if (distancia < mejorDistancia) {
        mejorDistancia = distancia;
        anguloHueco = candidato;
      }
    }

    const radioExterno = cajaSub.width / 2; // mitad del viewBox: por fuera de toda caja, con margen.
    const control = polarACartesiano(anguloHueco, radioExterno);
    const final = polarACartesiano(anguloHueco, RADIO_AGRANDADO);
    const cx = centroX + control.x * escalaSub;
    const cy = centroY + control.y * escalaSub;
    const fx = centroX + final.x * escalaSub;
    const fy = centroY + final.y * escalaSub;

    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', `M ${x1} ${y1} Q ${cx} ${cy} ${fx} ${fy}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('class', 'linaje-arbol-linea linaje-conector-linea');
    path.style.setProperty('--categoria-color', colorDeNodo(categoriaActiva));

    conectorSvg.replaceChildren(path);
  }

  window.addEventListener('resize', actualizarConector);

  // Categoría que arranca activa: "Concubinato" en el árbol criminal,
  // "Separación" en el no criminal — a pedido, en vez de la primera del
  // recorrido. Si algún día no aparece con ese nombre exacto en Linaje.csv,
  // cae de nuevo a la primera categoría en vez de romper el gráfico.
  const NOMBRE_CATEGORIA_INICIAL = esCriminal ? 'Concubinato' : 'Separación';
  const categoriaInicial =
    categorias.find((categoria: NodoMutable) => categoria.data.Nombre === NOMBRE_CATEGORIA_INICIAL) ??
    categorias[0];
  activarCategoria(categoriaInicial);

  const tituloNivel1 = document.createElement('h4');
  tituloNivel1.className = 'linaje-nivel-titulo';
  tituloNivel1.textContent = 'Nivel 1';

  const columnaRueda = document.createElement('div');
  columnaRueda.className = 'linaje-rueda-col';
  columnaRueda.append(tituloNivel1, svg);

  const columnaHub = document.createElement('div');
  columnaHub.className = 'linaje-hub-col';
  columnaHub.append(hubElemento, tituloNivel2, subruedaContenedor);

  const wrapper = document.createElement('div');
  wrapper.className = 'linaje-wrapper';
  wrapper.append(conectorSvg, columnaRueda, columnaHub, tooltip);

  document.getElementById(containerId)!.append(wrapper);

  montado = true;
  actualizarConector();
}
