import * as d3 from 'd3';
import Lenis from 'lenis';
import type { FilaCsv } from './agentesComun.js';
import { colorDeCrimen } from './coloresCrimen.js';
type SeleccionD3 = any;
interface FiltrosCrimenesPorTipo {
  decadaDesde: number;
  decadaHasta: number;
  codigo: string | null;
  subcodigo: string | null;
  lugar: string | null;
}
declare global {
  interface Window {
    __obtenerFiltrosCrimenesPorTipo?: () => FiltrosCrimenesPorTipo | null;
    __actualizarLineaTiempoCasosDashboard?: () => void;
    __irAVistaLugar?: () => void;
    __resaltarCasoEnMapa?: (lugar: string) => void;
  }
}
function leerVariableCss(nombre: string, fallback: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || fallback;
}
function getDecada(y: number): number {
  return Math.floor(y / 10) * 10;
}
function decadaValida(y: number): boolean {
  return y >= 1500 && y <= 1899;
}
const ULTIMA_DECADA = 1820;
const SIN_TIPO_PROCESO = 'Sin información';
interface ResumenCaso {
  id: string;
  anioDesde: number;
  anioHasta: number;
  lugar: string;
  tipoProceso: string;
  filas: FilaCsv[];
}
const FADE_PASO_PX = 90;
const ESPACIO_ANIO_BASE = 42;
export async function crearLineaTiempoCasos(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const [crimenes, linaje, casosCsv] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Casos.csv`),
  ]);
  const linajeMap = new Map(linaje.map((d) => [d['ID_Código'], d.Nombre]));
  const tipoDelitoMap = new Map(linaje.map((d) => [d['ID_Código'], d.Tipo_delito]));
  const tipoProcesoPorCaso = new Map(
    casosCsv.map((c: FilaCsv) => [c['ID_Caso'], (c['TipoProceso'] || '').trim()]),
  );
  const crimenesAplicables = crimenes
    .filter((d: FilaCsv) => tipoDelitoMap.get(d['Código']) !== 'No aplica' && decadaValida(+d.Año))
    .map((d: FilaCsv) => ({
      ...d,
      año: +d.Año,
      decada: getDecada(+d.Año),
    }));
  const casosPorId = new Map<string, FilaCsv[]>();
  crimenesAplicables.forEach((d) => {
    const id = d['ID_Caso'];
    if (!id) return;
    if (!casosPorId.has(id)) casosPorId.set(id, []);
    casosPorId.get(id)!.push(d);
  });
  const resumenPorCaso = new Map<string, ResumenCaso>();
  casosPorId.forEach((filas, id) => {
    const anios = filas.map((f) => f.año as number);
    const conteoLugar = new Map<string, number>();
    filas.forEach((f) => {
      const l = (f.Lugar || '').trim();
      if (l) conteoLugar.set(l, (conteoLugar.get(l) || 0) + 1);
    });
    const lugar = [...conteoLugar.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    resumenPorCaso.set(id, {
      id,
      anioDesde: Math.min(...anios),
      anioHasta: Math.max(...anios),
      lugar,
      tipoProceso: tipoProcesoPorCaso.get(id) || SIN_TIPO_PROCESO,
      filas,
    });
  });
  const tiposProceso = [
    ...d3.rollup(
      [...resumenPorCaso.values()],
      (v) => v.length,
      (c) => c.tipoProceso,
    ),
  ]
    .sort((a, b) => b[1] - a[1])
    .map(([tipo]) => tipo);
  const PALETA_TIPOS = [
    leerVariableCss('--mapa-punto-color', '#7b5ea7'),
    leerVariableCss('--mapa-acento-secundario', '#4e9bbb'),
    leerVariableCss('--mapa-serie-3', '#e8a838'),
    leerVariableCss('--mapa-serie-4', '#56b87e'),
  ];
  const colorDeTipo = (tipo: string) =>
    PALETA_TIPOS[Math.max(0, tiposProceso.indexOf(tipo)) % PALETA_TIPOS.length];
  const decadasConDatos = [...new Set(crimenesAplicables.map((d) => d.decada))].sort(
    (a, b) => a - b,
  );
  const decadaMinGlobal = decadasConDatos[0] as number;
  function calcularCasos(decadaDesde: number, decadaHasta: number): ResumenCaso[] {
    const filtros = window.__obtenerFiltrosCrimenesPorTipo?.() ?? null;
    const idsCalifican = new Set<string>();
    crimenesAplicables.forEach((d) => {
      const okDecada = d.decada >= decadaDesde && d.decada <= decadaHasta;
      const okCodigo = !filtros?.codigo || d['Código'] === filtros.codigo;
      const okSubcodigo = !filtros?.subcodigo || d['Sub_Código'] === filtros.subcodigo;
      const okLugar = !filtros?.lugar || d.Lugar?.trim() === filtros.lugar;
      if (okDecada && okCodigo && okSubcodigo && okLugar) idsCalifican.add(d['ID_Caso']);
    });
    return [...idsCalifican]
      .map((id) => resumenPorCaso.get(id))
      .filter((c): c is ResumenCaso => !!c);
  }
  const wrapper = document.createElement('div');
  wrapper.className = 'linea-tiempo-casos-wrapper';
  const selectorVista = document.createElement('div');
  selectorVista.className = 'linea-tiempo-casos-selector-vista';
selectorVista.innerHTML = `
  <button type="button" class="linea-tiempo-casos-selector-vista__boton linea-tiempo-casos-selector-vista__boton--activo" data-vista="linea">Vista en línea</button>
  <button type="button" class="linea-tiempo-casos-selector-vista__boton" data-vista="rueda">Rueda de años</button>
`;
  wrapper.appendChild(selectorVista);
  const botonVistaLinea = selectorVista.querySelector<HTMLButtonElement>('[data-vista="linea"]')!;
  const botonVistaRueda = selectorVista.querySelector<HTMLButtonElement>('[data-vista="rueda"]')!;
  const cuerpo = document.createElement('div');
  cuerpo.className = 'linea-tiempo-casos-cuerpo linea-tiempo-casos-cuerpo--oculto';
  wrapper.appendChild(cuerpo);
  const contenedorLinea = document.createElement('div');
  contenedorLinea.className = 'linea-tiempo-casos-contenedor-linea';
  wrapper.appendChild(contenedorLinea);
  const elTitulo = document.getElementById('lineaTiempoCasosTitulo');
  const elSubtitulo = document.getElementById('lineaTiempoCasosSubtitulo');
  const TEXTOS_VISTA = {
    rueda: {
      titulo: 'Línea de tiempo de casos',
      subtitulo: 'Cada punto es un caso individual en su año exacto, según los filtros de arriba.',
    },
    linea: {
      titulo: 'Casos por año',
      subtitulo:
        'Cada línea suma los casos por año según su tipo de proceso, con los filtros de arriba.',
    },
  } as const;
  function mostrarVistaTimeline(vista: 'linea' | 'rueda') {
    cuerpo.classList.toggle('linea-tiempo-casos-cuerpo--oculto', vista !== 'rueda');
    contenedorLinea.classList.toggle('linea-tiempo-casos-contenedor-linea--oculto', vista !== 'linea');
    botonVistaLinea.classList.toggle('linea-tiempo-casos-selector-vista__boton--activo', vista === 'linea');
    botonVistaRueda.classList.toggle('linea-tiempo-casos-selector-vista__boton--activo', vista === 'rueda');
    if (elTitulo) elTitulo.textContent = TEXTOS_VISTA[vista].titulo;
    if (elSubtitulo) elSubtitulo.textContent = TEXTOS_VISTA[vista].subtitulo;
    leyenda.classList.toggle('linea-tiempo-casos-leyenda--linea', vista === 'linea');
  }
  botonVistaLinea.addEventListener('click', () => mostrarVistaTimeline('linea'));
  botonVistaRueda.addEventListener('click', () => mostrarVistaTimeline('rueda'));
  const columnaIzq = document.createElement('div');
  columnaIzq.className = 'linea-tiempo-casos-columna-izq';
  cuerpo.appendChild(columnaIzq);
  const lista = document.createElement('div');
  lista.className = 'linea-tiempo-casos-lista';
  columnaIzq.appendChild(lista);
  const guiaFecha = document.createElement('div');
  guiaFecha.className = 'linea-tiempo-casos-guia-fecha';
  guiaFecha.innerHTML = `
    <div class="mapa-slider-rango">
      <div class="mapa-slider-track"></div>
      <div class="mapa-slider-progreso"></div>
      <input type="range" class="mapa-slider" aria-label="Desplazarse en el tiempo" />
    </div>
    <div class="linea-tiempo-casos-guia-fecha__etiqueta"></div>
  `;
  columnaIzq.appendChild(guiaFecha);
  const guiaProgreso = guiaFecha.querySelector<HTMLElement>('.mapa-slider-progreso')!;
  const guiaPos = guiaFecha.querySelector<HTMLInputElement>('.mapa-slider')!;
  const guiaEtiqueta = guiaFecha.querySelector<HTMLElement>('.linea-tiempo-casos-guia-fecha__etiqueta')!;
  const contenido = document.createElement('div');
  contenido.className = 'linea-tiempo-casos-lista-contenido';
  lista.appendChild(contenido);
  const lenis = new Lenis({
    wrapper: lista,
    content: contenido,
    duration: 1,
    orientation: 'horizontal',
    gestureOrientation: 'horizontal',
  });
  let filas: HTMLElement[] = [];
  let aniosFilas: number[] = [];
  let espaciadorFinal: HTMLElement | null = null;
  let anioMinActual = decadaMinGlobal;
  let anioMaxActual = ULTIMA_DECADA + 9;
  let anchoInterior = 0;
  const xScale = d3.scaleLinear();
  function actualizarDesvanecido() {
    if (filas.length === 0) return;
    const centroVentana = lista.scrollLeft + lista.clientWidth / 2;
    let indiceActivo = 0;
    let menorDistancia = Infinity;
    const distancias = filas.map((fila) => {
      const centroFila = fila.offsetLeft + fila.offsetWidth / 2;
      return Math.abs(centroFila - centroVentana);
    });
    distancias.forEach((distancia, i) => {
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        indiceActivo = i;
      }
    });
    filas.forEach((fila, i) => {
      fila.classList.toggle('linea-tiempo-casos-anio--activo', i === indiceActivo);
    });
  }
  function recolocarColumnas() {
    if (filas.length === 0) {
      if (espaciadorFinal) espaciadorFinal.style.width = '0px';
      return;
    }
    const mitadVentana = lista.clientWidth / 2;
    anchoInterior = ESPACIO_ANIO_BASE * Math.max(1, anioMaxActual - anioMinActual);
    xScale.domain([anioMinActual, anioMaxActual]).range([0, anchoInterior]);
    filas[0].style.marginLeft = `${Math.max(0, mitadVentana - filas[0].offsetWidth / 2)}px`;
    for (let i = 1; i < filas.length; i++) {
      const brecha = xScale(aniosFilas[i]) - xScale(aniosFilas[i - 1]);
      const margen = brecha - filas[i - 1].offsetWidth / 2 - filas[i].offsetWidth / 2;
      filas[i].style.marginLeft = `${Math.max(0, margen)}px`;
    }
    const ultima = filas[filas.length - 1];
    if (espaciadorFinal) {
      espaciadorFinal.style.width = `${Math.max(0, mitadVentana - ultima.offsetWidth / 2)}px`;
    }
    lenis.resize();
  }
  function contenidoXDeAnio(anio: number): number {
    if (filas.length === 0) return 0;
    if (filas.length === 1 || anio <= aniosFilas[0]) {
      return filas[0].offsetLeft + (anio - aniosFilas[0]) * ESPACIO_ANIO_BASE;
    }
    const ultimo = aniosFilas.length - 1;
    if (anio >= aniosFilas[ultimo]) {
      return filas[ultimo].offsetLeft + (anio - aniosFilas[ultimo]) * ESPACIO_ANIO_BASE;
    }
    let lo = 0;
    let hi = ultimo;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (aniosFilas[mid] <= anio) lo = mid;
      else hi = mid;
    }
    const t = (anio - aniosFilas[lo]) / Math.max(1, aniosFilas[hi] - aniosFilas[lo]);
    return filas[lo].offsetLeft + (filas[hi].offsetLeft - filas[lo].offsetLeft) * t;
  }
  function anioDeContenidoX(x: number): number {
    if (filas.length === 0) return anioMinActual;
    if (filas.length === 1 || x <= filas[0].offsetLeft) {
      return aniosFilas[0] + (x - filas[0].offsetLeft) / ESPACIO_ANIO_BASE;
    }
    const ultimo = filas.length - 1;
    if (x >= filas[ultimo].offsetLeft) {
      return aniosFilas[ultimo] + (x - filas[ultimo].offsetLeft) / ESPACIO_ANIO_BASE;
    }
    let lo = 0;
    let hi = ultimo;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (filas[mid].offsetLeft <= x) lo = mid;
      else hi = mid;
    }
    const x0 = filas[lo].offsetLeft;
    const x1 = filas[hi].offsetLeft;
    const t = (x - x0) / Math.max(1, x1 - x0);
    return aniosFilas[lo] + (aniosFilas[hi] - aniosFilas[lo]) * t;
  }
  function obtenerVentanaVisible(): [number, number] {
    return [anioDeContenidoX(lista.scrollLeft), anioDeContenidoX(lista.scrollLeft + lista.clientWidth)];
  }
  function irAAnio(anioDesdeVentana: number) {
    if (filas.length === 0) return;
    const maxScrollLeft = Math.max(0, lista.scrollWidth - lista.clientWidth);
    const destino = Math.min(maxScrollLeft, Math.max(0, contenidoXDeAnio(anioDesdeVentana)));
    lenis.scrollTo(destino, { immediate: true });
    actualizarDesvanecido();
  }
  function sincronizarGuia() {
    if (filas.length === 0) return;
    const [desde, hasta] = obtenerVentanaVisible();
    guiaPos.min = String(anioMinActual);
    guiaPos.max = String(anioMaxActual);
    guiaPos.disabled = lista.scrollWidth <= lista.clientWidth;
    const desdeClamp = Math.round(Math.max(anioMinActual, Math.min(anioMaxActual, desde)));
    const hastaClamp = Math.round(Math.max(anioMinActual, Math.min(anioMaxActual, hasta)));
    if (document.activeElement !== guiaPos) guiaPos.value = String(desdeClamp);
    const rango = Math.max(1, anioMaxActual - anioMinActual);
    const pctDesde = ((desdeClamp - anioMinActual) / rango) * 100;
    const pctHasta = ((hastaClamp - anioMinActual) / rango) * 100;
    guiaProgreso.style.left = `${pctDesde}%`;
    guiaProgreso.style.width = `${Math.max(0, pctHasta - pctDesde)}%`;
    guiaEtiqueta.textContent = `${desdeClamp} – ${hastaClamp}`;
  }
  guiaPos.addEventListener('input', () => irAAnio(+guiaPos.value));
  function raf(time: number) {
    lenis.raf(time);
    actualizarDesvanecido();
    sincronizarGuia();
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
  window.addEventListener('resize', () => {
    if (filas.length === 0) return;
    recolocarColumnas();
    actualizarDesvanecido();
  });
  const nota = document.createElement('div');
  nota.className = 'linea-tiempo-casos-nota';
  wrapper.appendChild(nota);
  const leyenda = document.createElement('div');
  leyenda.className = 'linea-tiempo-casos-leyenda';
  tiposProceso.forEach((tipo) => {
    const item = document.createElement('span');
    item.className = 'linea-tiempo-casos-leyenda-item';
    const punto = document.createElement('span');
    punto.className = 'linea-tiempo-casos-leyenda-punto';
    punto.style.setProperty('--tipo-color', colorDeTipo(tipo));
    item.append(punto, tipo);
    leyenda.appendChild(item);
  });
  wrapper.appendChild(leyenda);
  const panelCaso = document.createElement('div');
  panelCaso.className = 'linea-tiempo-casos-panel-caso';
  panelCaso.innerHTML = `
    <button type="button" class="linea-tiempo-casos-panel-caso__cerrar" aria-label="Cerrar">×</button>
    <div class="linea-tiempo-casos-panel-caso__fecha"></div>
    <div class="linea-tiempo-casos-panel-caso__lugar"></div>
    <p class="linea-tiempo-casos-panel-caso__descripcion"></p>
    <ul class="linea-tiempo-casos-panel-caso__lista"></ul>
    <button type="button" class="linea-tiempo-casos-panel-caso__boton-mapa">Ver en el mapa</button>
    <button type="button" class="linea-tiempo-casos-panel-caso__boton-caso">Ver caso</button>
  `;
  cuerpo.appendChild(panelCaso);
  const elFecha = panelCaso.querySelector<HTMLElement>('.linea-tiempo-casos-panel-caso__fecha')!;
  const elLugar = panelCaso.querySelector<HTMLElement>('.linea-tiempo-casos-panel-caso__lugar')!;
  const elDescripcion = panelCaso.querySelector<HTMLElement>(
    '.linea-tiempo-casos-panel-caso__descripcion',
  )!;
  const elLista = panelCaso.querySelector<HTMLUListElement>('.linea-tiempo-casos-panel-caso__lista')!;
  const botonMapa = panelCaso.querySelector<HTMLButtonElement>(
    '.linea-tiempo-casos-panel-caso__boton-mapa',
  )!;
  const botonVerCaso = panelCaso.querySelector<HTMLButtonElement>(
    '.linea-tiempo-casos-panel-caso__boton-caso',
  )!;
  function ocultarPopup() {
    panelCaso.classList.remove('linea-tiempo-casos-panel-caso--visible');
  }
  function mostrarPopup(caso: ResumenCaso) {
    elFecha.textContent =
      caso.anioDesde === caso.anioHasta ? `${caso.anioDesde}` : `${caso.anioDesde}–${caso.anioHasta}`;
    elLugar.textContent = caso.lugar || 'Sin información';
    const descripcion = (caso.filas[0]?.['Descripción'] || '').trim().replace(/\*\*(.+?)\*\*/g, '$1');
    elDescripcion.textContent = descripcion;
    elDescripcion.hidden = !descripcion;
    elLista.innerHTML = '';
    caso.filas.forEach((f) => {
      const nombre = linajeMap.get(f['Código']) || 'Sin información';
      const nombreSub = linajeMap.get(f['Sub_Código']);
      const li = document.createElement('li');
      const cuadro = document.createElement('i');
      cuadro.className = 'linea-tiempo-casos-panel-caso__lista-color';
      cuadro.style.background = colorDeCrimen(f['Código']);
      const texto = nombreSub && nombreSub !== nombre ? `${nombre} — ${nombreSub}` : nombre;
      li.append(cuadro, document.createTextNode(texto));
      elLista.appendChild(li);
    });
    botonMapa.disabled = !caso.lugar;
    botonMapa.onclick = () => {
      if (!caso.lugar) return;
      window.__irAVistaLugar?.();
      requestAnimationFrame(() => window.__resaltarCasoEnMapa?.(caso.lugar));
    };
    botonVerCaso.onclick = () => {
      window.location.href = `${import.meta.env.BASE_URL}base-de-datos/caso.html?caso=${encodeURIComponent(caso.id)}`;
    };
    panelCaso.classList.add('linea-tiempo-casos-panel-caso--visible');
  }
  panelCaso
    .querySelector('.linea-tiempo-casos-panel-caso__cerrar')!
    .addEventListener('click', ocultarPopup);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') ocultarPopup();
  });
  function renderizarLinea(anioDesde: number, anioHasta: number, casos: ResumenCaso[]) {
    contenedorLinea.innerHTML = '';
    if (casos.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'mapa-aviso-vacio mapa-aviso-vacio--compacto';
      aviso.textContent = 'Sin casos con los filtros actuales';
      contenedorLinea.appendChild(aviso);
      return;
    }
    const conteoPorAnio = new Map<number, Map<string, number>>();
    casos.forEach((c) => {
      const entrada = conteoPorAnio.get(c.anioDesde) || new Map<string, number>();
      entrada.set(c.tipoProceso, (entrada.get(c.tipoProceso) || 0) + 1);
      conteoPorAnio.set(c.anioDesde, entrada);
    });
    const anios = d3.range(anioDesde, anioHasta + 1);
    const series = tiposProceso.map((tipo) => ({
      tipo,
      color: colorDeTipo(tipo),
      valores: anios.map((a) => conteoPorAnio.get(a)?.get(tipo) ?? 0),
    }));
    const MARGIN = { top: 16, right: 20, bottom: 30, left: 44 };
    const WIDTH = 900;
    const HEIGHT = 320;
    const IW = WIDTH - MARGIN.left - MARGIN.right;
    const IH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = d3.scaleLinear().domain([anioDesde, anioHasta]).range([0, IW]);
    const maxValor = Math.max(1, d3.max(series.flatMap((s) => s.valores)) || 1);
    const y = d3.scaleLinear().domain([0, maxValor]).nice().range([IH, 0]);
    const svg = d3
      .create('svg')
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('class', 'linea-tiempo-casos-linea-svg');
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(-IW).tickFormat(d3.format('d')) as SeleccionD3)
      .call((gg: SeleccionD3) => gg.select('.domain').remove())
      .call((gg: SeleccionD3) => gg.selectAll('line').attr('class', 'mapa-linea-grid-linea'))
      .call((gg: SeleccionD3) => gg.selectAll('text').attr('class', 'mapa-linea-eje-y-texto'));
    const spanAnios = anioHasta - anioDesde;
    const ejeX = d3.axisBottom(x).tickFormat(d3.format('d') as SeleccionD3).tickSizeOuter(0);
    if (spanAnios > 20) {
      const paso = Math.ceil(spanAnios / 12);
      ejeX.tickValues(d3.range(anioDesde, anioHasta + 1, paso));
    }
    g.append('g')
      .attr('transform', `translate(0,${IH})`)
      .call(ejeX)
      .call((gg: SeleccionD3) => gg.select('.domain').attr('class', 'mapa-linea-eje-dominio'))
      .call((gg: SeleccionD3) => gg.selectAll('text').attr('class', 'mapa-linea-eje-x-texto'));
    const lineGen = (d3.line() as SeleccionD3)
      .x((_: number, i: number) => x(anios[i]))
      .y((v: number) => y(v))
      .curve(d3.curveMonotoneX);
    const clipId = `linea-tiempo-casos-clip-${Math.random().toString(36).slice(2, 9)}`;
    svg
      .append('defs')
      .append('clipPath')
      .attr('id', clipId)
      .append('rect')
      .attr('class', 'linea-tiempo-casos-linea-clip-rect')
      .attr('x', 0)
      .attr('y', -10)
      .attr('width', IW)
      .attr('height', IH + 20);
    const clipRect = svg.select<SVGRectElement>(`#${clipId} rect`);
    const grupoLineas = g.append('g').attr('clip-path', `url(#${clipId})`);
    series.forEach((s) => {
      grupoLineas
        .append('path')
        .datum(s.valores)
        .attr('d', lineGen)
        .attr('class', 'linea-tiempo-casos-linea-trazo')
        .attr('stroke', s.color);
    });
    const guia = g
      .append('line')
      .attr('class', 'linea-tiempo-casos-linea-guia')
      .attr('y1', 0)
      .attr('y2', IH)
      .style('display', 'none');
    const focos = series.map((s) =>
      g.append('circle').attr('r', 4).attr('fill', s.color).style('display', 'none'),
    );
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-grafico tooltip-grafico--sans';
    contenedorLinea.appendChild(tooltip);
    function moverFocoA(anioBruto: number) {
      const anio = Math.min(anioHasta, Math.max(anioDesde, Math.round(anioBruto)));
      const idx = anio - anioDesde;
      const xPix = x(anio);
      guia.attr('x1', xPix).attr('x2', xPix).style('display', null);
      focos.forEach((foco, i) =>
        foco
          .attr('cx', xPix)
          .attr('cy', y(series[i].valores[idx]))
          .style('display', null),
      );
      tooltip.innerHTML =
        `<strong>${anio}</strong>` +
        series.map((s) => `<br/>${s.tipo}: ${s.valores[idx].toLocaleString('es')}`).join('');
      tooltip.classList.add('tooltip-grafico--visible');
      return xPix;
    }
    function ocultarFoco() {
      guia.style('display', 'none');
      focos.forEach((foco) => foco.style('display', 'none'));
      tooltip.classList.remove('tooltip-grafico--visible');
    }
    let reproduciendo = false;
    svg
      .append('rect')
      .attr('x', MARGIN.left)
      .attr('y', MARGIN.top)
      .attr('width', IW)
      .attr('height', IH)
      .attr('fill', 'transparent')
      .style('cursor', 'crosshair')
      .on('mousemove', (event: MouseEvent) => {
        if (reproduciendo) return;
        const [mx] = d3.pointer(event, g.node());
        moverFocoA(x.invert(mx));
        const rect = contenedorLinea.getBoundingClientRect();
        tooltip.style.left = `${event.clientX - rect.left + 12}px`;
        tooltip.style.top = `${event.clientY - rect.top + 12}px`;
      })
      .on('mouseleave', () => {
        if (!reproduciendo) ocultarFoco();
      });
    contenedorLinea.appendChild(svg.node()!);
    const botonReproducir = document.createElement('button');
    botonReproducir.type = 'button';
    botonReproducir.className = 'linea-tiempo-casos-linea-reproducir';
    botonReproducir.textContent = '▶ Reproducir';
    contenedorLinea.appendChild(botonReproducir);
    const duracionMs = Math.min(9000, Math.max(2500, spanAnios * 20));
    let idAnimacion = 0;
    botonReproducir.addEventListener('click', () => {
      if (idAnimacion) cancelAnimationFrame(idAnimacion);
      reproduciendo = true;
      botonReproducir.disabled = true;
      botonReproducir.textContent = 'Reproduciendo…';
      clipRect.attr('width', 0);
      const inicio = performance.now();
      const tooltipRect = contenedorLinea.getBoundingClientRect();
      const svgRect = svg.node()!.getBoundingClientRect();
      const escalaSvg = svgRect.width / WIDTH;
      function paso(ahora: number) {
        const t = Math.max(0, Math.min(1, (ahora - inicio) / duracionMs));
        clipRect.attr('width', IW * t);
        const xPix = moverFocoA(anioDesde + spanAnios * t);
        tooltip.style.left = `${(svgRect.left - tooltipRect.left) + (MARGIN.left + xPix) * escalaSvg + 12}px`;
        tooltip.style.top = `${(svgRect.top - tooltipRect.top) + MARGIN.top * escalaSvg}px`;
        if (t < 1) {
          idAnimacion = requestAnimationFrame(paso);
        } else {
          reproduciendo = false;
          idAnimacion = 0;
          botonReproducir.disabled = false;
          botonReproducir.textContent = '↻ Repetir';
        }
      }
      idAnimacion = requestAnimationFrame(paso);
    });
  }
  function dibujar() {
    const filtros = window.__obtenerFiltrosCrimenesPorTipo?.() ?? null;
    const decadaDesde = filtros?.decadaDesde ?? decadaMinGlobal;
    const decadaHasta = filtros?.decadaHasta ?? ULTIMA_DECADA;
    const casos = calcularCasos(decadaDesde, decadaHasta);
    renderizarLinea(decadaDesde, decadaHasta + 9, casos);
    contenido.innerHTML = '';
    ocultarPopup();
    filas = [];
    aniosFilas = [];
    if (casos.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'mapa-aviso-vacio mapa-aviso-vacio--compacto';
      aviso.textContent = 'Sin casos con los filtros actuales';
      contenido.appendChild(aviso);
      espaciadorFinal = null;
      nota.textContent = '';
      return;
    }
    anioMinActual = decadaDesde;
    anioMaxActual = decadaHasta + 9;
    const porAnio = d3.group(casos, (c) => c.anioDesde);
    const aniosConCasos = [...porAnio.keys()].sort((a, b) => a - b);
    aniosConCasos.forEach((anio) => {
      const casosAnio = porAnio.get(anio)!;
      const fila = document.createElement('div');
      fila.className = 'linea-tiempo-casos-anio';
      const circulos = document.createElement('div');
      circulos.className = 'linea-tiempo-casos-anio-circulos';
      casosAnio.forEach((caso) => {
        const punto = document.createElement('button');
        punto.type = 'button';
        punto.className = 'linea-tiempo-casos-punto';
        punto.style.setProperty('--tipo-color', colorDeTipo(caso.tipoProceso));
        const rango =
          caso.anioDesde === caso.anioHasta
            ? `${caso.anioDesde}`
            : `${caso.anioDesde}–${caso.anioHasta}`;
        punto.title = `${caso.lugar || 'Sin información'} · ${rango} · ${caso.tipoProceso}`;
        punto.addEventListener('click', () => mostrarPopup(caso));
        circulos.appendChild(punto);
      });
      const conteo = document.createElement('div');
      conteo.className = 'linea-tiempo-casos-anio-conteo';
      conteo.textContent = String(casosAnio.length);
      const numero = document.createElement('div');
      numero.className = 'linea-tiempo-casos-anio-numero';
      numero.textContent = String(anio);
      fila.append(conteo, circulos, numero);
      contenido.appendChild(fila);
      aniosFilas.push(anio);
    });
    espaciadorFinal = document.createElement('div');
    espaciadorFinal.className = 'linea-tiempo-casos-espaciador';
    contenido.appendChild(espaciadorFinal);
    filas = [...contenido.querySelectorAll<HTMLElement>('.linea-tiempo-casos-anio')];
    recolocarColumnas();
    lenis.scrollTo(0, { immediate: true });
    actualizarDesvanecido();
    nota.textContent = `${casos.length.toLocaleString('es')} caso${casos.length === 1 ? '' : 's'} en ${aniosConCasos.length} año${aniosConCasos.length === 1 ? '' : 's'} · clic en un punto para ver el detalle`;
  }
  window.__actualizarLineaTiempoCasosDashboard = dibujar;
  container.appendChild(wrapper);
  dibujar();
}
