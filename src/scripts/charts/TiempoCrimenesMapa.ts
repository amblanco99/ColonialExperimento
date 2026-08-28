import * as d3 from 'd3';
import rewind from '@turf/rewind';
import type { FilaCsv } from './agentesComun.js';

// TODO: type — nodo/dato mutado por d3 (grafo de relación, jerarquías). Ver MIGRATION.md.
type NodoMutable = any;

// TODO: type — genéricos de selección/transición de d3. Ver MIGRATION.md.
type SeleccionD3 = any; // se usa en las cadenas de transición de más abajo

// El dashboard expone un callback global colgándolo de window. No es estándar,
// así que se declara aquí. Mismo caso que _timerLineas en los módulos de
// participación; ver MIGRATION.md.
declare global {
  interface Window {
    __actualizarPanelSecundarioDashboard?: (conAnimacion?: boolean) => void;
    __obtenerFiltrosCrimenesPorTipo?: () => {
      decadaDesde: number;
      decadaHasta: number;
      codigo: string | null;
      subcodigo: string | null;
      lugar: string | null;
    } | null;
    __actualizarCrimenesPorTipoDashboard?: () => void;
  }
}

const SERIE_FALLBACK = [
  '#bb4e99',
  '#4e9bbb',
  '#e8a838',
  '#56b87e',
  '#e05a5a',
  '#7b5ea7',
  '#3ab8b0',
  '#d4784e',
  '#6a8fce',
  '#a05080',
];

function leerVariableCss(nombre: string, fallback: string): string {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || fallback;
}

// El corpus documental colonial llega hasta 1824 (fin de la etapa cubierta
// por las fuentes), aunque la última década (1820) solo tenga datos reales
// hasta ese año. formatoDecada() lo usa para mostrar "1824" en vez de "1820"
// dondequiera que se muestre esa última década; los cálculos internos (bucket,
// filtros, parámetros de URL) siguen usando el número de década (1820).
const ULTIMO_ANIO_COLONIAL = 1824;
const ULTIMA_DECADA = Math.floor(ULTIMO_ANIO_COLONIAL / 10) * 10;

function formatoDecada(decada: number): number {
  return decada === ULTIMA_DECADA ? ULTIMO_ANIO_COLONIAL : decada;
}

export async function inicializarDashboard() {
  const PALETA = {
    fondoPergamino: leerVariableCss('--mapa-fondo-pergamino', '#f4ecd8'),
    panel: leerVariableCss('--mapa-panel', '#efe4c8'),
    tierra: leerVariableCss('--mapa-tierra', '#e8dcc0'),
    borde: leerVariableCss('--mapa-borde', '#6b4f2a'),
    tintaOscura: leerVariableCss('--mapa-tinta-oscura', '#3a2d1a'),
    acentoLinea: leerVariableCss('--mapa-acento-linea', '#bb4e99'),
    acentoSecundario: leerVariableCss('--mapa-acento-secundario', '#4e9bbb'),
    tarjetaFondo: leerVariableCss('--mapa-tarjeta-fondo', '#fdf8ec'),
  };

  const COLORES_SERIE = SERIE_FALLBACK.map((valor, i) =>
    leerVariableCss(`--mapa-serie-${i + 1}`, valor),
  );

  const [NuevaGranadaRaw, rawViz, rawLugar, rawLinaje] = await Promise.all([
    d3.json(`${import.meta.env.BASE_URL}data/NuevaGranada.json`),
    d3.csv(`${import.meta.env.BASE_URL}data/Visualizaciones.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Lugar.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);

  // rewind() devuelve un union de tipos GeoJSON; aquí siempre es una
  // FeatureCollection, que es lo que trae NuevaGranada.json.
  const NuevaGranada = rewind(NuevaGranadaRaw as any, { reverse: true }) as any;

  const getDecada = (y: number) => Math.floor(y / 10) * 10;
  const decadaValida = (y: number) => y >= 1500 && y <= 1899;

  const coordPorLugar: Record<string, any> = {};
  rawLugar.forEach((d: FilaCsv) => {
    const nombre = d.Lugar?.trim();
    const lon = +d.Longitud;
    const lat = +d.Latitud;
    if (nombre && !isNaN(lon) && !isNaN(lat)) {
      coordPorLugar[nombre] = [lon, lat];
    }
  });

  const datosLimpios = rawViz
    .filter(
      (d: FilaCsv) => d.Año && d.Nombre_Codigo && d.ID_Documento && d.Lugar && d.Nombre_Sub_Codigo,
    )
    .map((d: FilaCsv) => ({
      ...d,
      año: +d.Año,
      decada: getDecada(+d.Año),
      lugar: d.Lugar.trim(),
      coords: coordPorLugar[d.Lugar.trim()] || null,
    }))
    .filter((d: FilaCsv) => decadaValida(d.año));

  // El período colonial documentado llega hasta 1824 (ver ULTIMO_ANIO_COLONIAL
  // más abajo), aunque Visualizaciones.csv no tenga filas en la última década
  // (1818 es el año máximo real ahí; crimenes.csv sí llega a 1824). Se arma la
  // lista de décadas de forma contigua entre la mínima con datos y esa década
  // final, en vez de tomar solo las décadas presentes en Visualizaciones.csv,
  // para que el deslizador pueda llegar hasta 1824 y así cubrir también los
  // datos de "Crímenes por tipo" (basados en crimenes.csv).
  const decadasConDatos = [...new Set(datosLimpios.map((d: FilaCsv) => d.decada))].sort(
    (a: NodoMutable, b: NodoMutable) => a - b,
  );
  const DECADAS: NodoMutable[] = [];
  for (let d = decadasConDatos[0] as number; d <= ULTIMA_DECADA; d += 10) {
    DECADAS.push(d);
  }

  const linajeFilas = rawLinaje.map((d: FilaCsv) => ({
    idCodigo: (d['ID_Código'] || '').trim(),
    nombre: (d.Nombre || '').trim(),
    nivel: (d.Nivel || '').trim(),
  }));
  const nombresGenerales = new Set(
    linajeFilas.filter((f: any) => f.nivel === 'Nivel 0').map((f: any) => f.nombre),
  );
  const ordenPorCodigo = new Map(linajeFilas.map((f, i) => [f.idCodigo, i]));

  const codigoPorNombreSub = new Map();
  const codigoPorNombreCrimen = new Map();
  datosLimpios.forEach((d: FilaCsv) => {
    if (d.Nombre_Sub_Codigo && !codigoPorNombreSub.has(d.Nombre_Sub_Codigo)) {
      codigoPorNombreSub.set(d.Nombre_Sub_Codigo, (d['Sub_Código'] || '').trim());
    }
    if (d.Nombre_Codigo && !codigoPorNombreCrimen.has(d.Nombre_Codigo)) {
      codigoPorNombreCrimen.set(d.Nombre_Codigo, (d['Código'] || '').trim());
    }
  });

  function compararPorLinaje(a: NodoMutable, b: NodoMutable) {
    const oa = ordenPorCodigo.get(codigoPorNombreSub.get(a)) ?? Number.MAX_SAFE_INTEGER;
    const ob = ordenPorCodigo.get(codigoPorNombreSub.get(b)) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  }

  function getProvincia(coords: [number, number]) {
    const features = NuevaGranada.features ? NuevaGranada.features : [NuevaGranada];
    const feature = features.find((f: any) => d3.geoContains(f, coords));
    return feature ? feature.properties?.Nombre || 'Desconocida' : 'Desconocida';
  }

  const lugaresLista = [...new Set(datosLimpios.map((d: FilaCsv) => d.lugar))].sort();
  const subcrimenesLista = [
    ...new Set(
      datosLimpios
        .filter((d: FilaCsv) => !nombresGenerales.has(d.Nombre_Sub_Codigo))
        .map((d: FilaCsv) => d.Nombre_Sub_Codigo),
    ),
  ].sort(compararPorLinaje);
  const crimenesLista = [...new Set(datosLimpios.map((d: FilaCsv) => d.Nombre_Codigo))].sort();

  const estado = {
    decadaMinIdx: 0,
    decadaMaxIdx: DECADAS.length - 1,
    crimen: 'Todos',
    subcrimen: 'Todos',
    lugar: 'Todos',
    lugaresFijados: new Set(),
  };

  function decadasSeleccionadas() {
    return DECADAS.slice(estado.decadaMinIdx, estado.decadaMaxIdx + 1);
  }
  function rangoDecadaActual(): [number, number] {
    return [DECADAS[estado.decadaMinIdx] as number, DECADAS[estado.decadaMaxIdx] as number];
  }
  function etiquetaRangoActual() {
    const [desde, hasta] = rangoDecadaActual();
    const desdeTxt = formatoDecada(desde);
    const hastaTxt = formatoDecada(hasta);
    return desdeTxt === hastaTxt ? `${desdeTxt}` : `${desdeTxt} – ${hastaTxt}`;
  }

  window.__obtenerFiltrosCrimenesPorTipo = function () {
    const [decadaDesde, decadaHasta] = rangoDecadaActual();
    return {
      decadaDesde,
      decadaHasta,
      codigo: estado.crimen === 'Todos' ? null : codigoPorNombreCrimen.get(estado.crimen) || null,
      subcodigo: estado.subcrimen === 'Todos' ? null : codigoPorNombreSub.get(estado.subcrimen) || null,
      lugar: estado.lugar === 'Todos' ? null : estado.lugar,
    };
  };

  window.__obtenerRangoDecadaGrafo = function () {
    return rangoDecadaActual();
  };

  function actualizarCrimenesPorTipo() {
    window.__actualizarCrimenesPorTipoDashboard?.();
  }

  function actualizarGrafoRelacion() {
    window.__actualizarGrafoRelacionDashboard?.();
  }

  function irATablasFiltradas(overrides: Record<string, any> = {}) {
    if (overrides.casos) {
      const params = new URLSearchParams();
      params.set('casos', overrides.casos.join(','));
      window.location.href = `${import.meta.env.BASE_URL}base-de-datos/index.html?${params.toString()}`;
      return;
    }

    const lugar =
      'lugar' in overrides ? overrides.lugar : estado.lugar !== 'Todos' ? estado.lugar : null;
    const codigo =
      'codigo' in overrides ? overrides.codigo : estado.crimen !== 'Todos' ? estado.crimen : null;
    const subcodigo =
      'subcodigo' in overrides
        ? overrides.subcodigo
        : estado.subcrimen !== 'Todos'
          ? estado.subcrimen
          : null;
    const params = new URLSearchParams();
    if (lugar) params.set('lugar', lugar);
    if (codigo) params.set('codigo', codigo);
    if (subcodigo) params.set('subcodigo', subcodigo);
    if ('fecha' in overrides) {
      params.set('fecha', overrides.fecha);
    } else {
      const [desde, hasta] = rangoDecadaActual();
      params.set('fechaDesde', desde as unknown as string);
      params.set('fechaHasta', hasta as unknown as string);
    }
    window.location.href = `${import.meta.env.BASE_URL}base-de-datos/index.html?${params.toString()}`;
  }

  function crearBotonVerCasos() {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn-mapa-ver-casos';
    let handlerActivo: (() => void) | null = null;
    boton.addEventListener('click', () => {
      if (handlerActivo) handlerActivo();
    });

    function ocultar() {
      boton.classList.remove('btn-mapa--visible');
      handlerActivo = null;
    }
    function mostrar(texto: string, handler: () => void) {
      boton.textContent = `Ver casos: ${texto}`;
      boton.classList.add('btn-mapa--visible');
      handlerActivo = handler;
    }
    return { boton, mostrar, ocultar };
  }

  function datosFiltradosBase() {
    return datosLimpios.filter((d: FilaCsv) => {
      const okCrimen = estado.crimen === 'Todos' || d.Nombre_Codigo === estado.crimen;
      const okSub = estado.subcrimen === 'Todos' || d.Nombre_Sub_Codigo === estado.subcrimen;
      const okLugar = estado.lugar === 'Todos' || d.lugar === estado.lugar;
      return okCrimen && okSub && okLugar;
    });
  }

  function datosReferenciaLugar(lugar: string) {
    const [desde, hasta] = rangoDecadaActual();
    const filas = datosFiltradosBase().filter(
      (d: FilaCsv) => d.lugar === lugar && d.decada >= desde && d.decada <= hasta,
    );

    const map: Record<string, any> = {};
    filas.forEach((d: FilaCsv) => {
      const key =
        estado.crimen === 'Todos'
          ? d.Nombre_Codigo
          : nombresGenerales.has(d.Nombre_Sub_Codigo)
            ? d.Nombre_Codigo
            : d.Nombre_Sub_Codigo;
      if (!map[key]) map[key] = new Set();
      map[key].add(`${d.ID_Documento}|${d.Sub_Código}`);
    });

    return Object.entries(map)
      .map(([nombre, set]) => ({ nombre, casos: set.size }))
      .sort((a: NodoMutable, b: NodoMutable) => b.casos - a.casos);
  }

  function agruparMapaInstante() {
    const [desde, hasta] = rangoDecadaActual();
    const filas = datosFiltradosBase().filter(
      (d: FilaCsv) =>
        d.decada >= desde && d.decada <= hasta && d.coords && !isNaN(d.coords[0]) && !isNaN(d.coords[1]),
    );

    const map: Record<string, any> = {};
    filas.forEach((d: FilaCsv) => {
      const key = d.lugar;
      if (!map[key]) {
        map[key] = {
          lugar: d.lugar,
          coords: d.coords,
          docs: new Set(),
        };
      }
      map[key].docs.add(d.ID_Documento);
    });

    return Object.values(map).map((r) => ({
      ...r,
      count: r.docs.size,
    }));
  }

  const mapaContenedor = document.getElementById('mapa-contenedor');
  if (!mapaContenedor) return;
  const contenedorLineasEl = document.getElementById('crimenesChart');
  const dashboardWrap = mapaContenedor.parentElement;

  const mainContenedor = document.querySelector('main.container');
  if (mainContenedor) {
    mainContenedor.classList.add('mapa-main-ancho');
  }

  function envolverEnTarjeta(el: HTMLElement, titulo: string, subtitulo?: string) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'mapa-tarjeta';
    const encabezado = document.createElement('div');
    encabezado.className = 'mapa-tarjeta-encabezado';
    const h = document.createElement('div');
    h.textContent = titulo as unknown as string;
    h.className = 'mapa-tarjeta-titulo';
    encabezado.appendChild(h);
    if (subtitulo) {
      const sub = document.createElement('div');
      sub.textContent = subtitulo as unknown as string;
      sub.className = 'mapa-tarjeta-subtitulo';
      encabezado.appendChild(sub);
    }
    tarjeta.appendChild(encabezado);
    const divisor = document.createElement('div');
    divisor.className = 'mapa-tarjeta-divisor';
    tarjeta.appendChild(divisor);
    tarjeta.appendChild(el);
    return tarjeta;
  }

  let panelFiltros = document.getElementById('panel-filtros');
  if (!panelFiltros) {
    panelFiltros = document.createElement('div');
    panelFiltros.id = 'panel-filtros';
  }

  let columnaViz = document.getElementById('columna-visualizaciones');
  if (!columnaViz) {
    columnaViz = document.createElement('div');
    columnaViz.id = 'columna-visualizaciones';
  }
  columnaViz.classList.add('mapa-columna-viz');

  const columnaIzquierda = document.createElement('div');
  columnaIzquierda.id = 'columna-izquierda';
  columnaIzquierda.className = 'mapa-columna-izquierda';

  function paraColumnaVertical(tarjeta: HTMLElement) {
    tarjeta.classList.add('mapa-tarjeta--vertical');
    return tarjeta;
  }

  if (contenedorLineasEl) {
    columnaIzquierda.appendChild(
      paraColumnaVertical(
        envolverEnTarjeta(
          contenedorLineasEl,
          'Evolución en el tiempo',
          'Casos por década según el rango seleccionado',
        ),
      ),
    );
  }

  columnaViz.appendChild(columnaIzquierda);
  columnaViz.appendChild(
    envolverEnTarjeta(
      mapaContenedor,
      'Distribución geográfica',
      'Haz clic en un punto para fijarlo y compararlo',
    ),
  );

  if (dashboardWrap) {
    dashboardWrap.classList.add('mapa-dashboard-wrap');
    dashboardWrap.appendChild(columnaViz);
  }

  mapaContenedor.classList.add('mapa-panel-ancho-completo');
  if (contenedorLineasEl) {
    contenedorLineasEl.classList.add('mapa-panel-ancho-completo');
  }

  panelFiltros!.classList.add('panel-filtros-mapa');

  const tituloPanel = document.createElement('div');
  tituloPanel.textContent = 'Filtros';
  tituloPanel.className = 'panel-filtros-titulo';
  panelFiltros!.appendChild(tituloPanel);

  function crearComboBuscable({
    etiqueta,
    opciones,
    valorInicial,
    onChange,
    notaVacia,
  }: {
    etiqueta: string;
    opciones: any[];
    valorInicial?: any;
    onChange: (v: any) => void;
    notaVacia?: string;
  }) {
    const wrap = document.createElement('div');
    wrap.className = 'filtro-combo';

    const label = document.createElement('label');
    label.textContent = etiqueta as unknown as string;
    label.className = 'filtro-label';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = valorInicial as unknown as string;
    input.readOnly = true;
    input.className = 'filtro-combo-input';

    const lista = document.createElement('ul');
    lista.className = 'filtro-combo-lista';

    const nota = document.createElement('div');
    nota.className = 'filtro-combo-nota';

    let opcionesCompletas = ['Todos', ...opciones];

    function pintarLista(filtro: any) {
      lista.innerHTML = '';
      const f = filtro.trim().toLowerCase();
      const filtradas = f
        ? opcionesCompletas.filter((o) => o.toLowerCase().includes(f))
        : opcionesCompletas;
      filtradas.slice(0, 200).forEach((op) => {
        const li = document.createElement('li');
        li.textContent = op as unknown as string;
        li.className = 'filtro-combo-item';
        li.addEventListener('mousedown', (e) => e.preventDefault());
        li.addEventListener('click', () => {
          input.value = op as unknown as string;
          lista.classList.remove('filtro-combo-lista--abierta');
          input.blur();
          onChange(op);
        });
        lista.appendChild(li);
      });
    }

    input.addEventListener('click', () => {
      input.readOnly = false;
      const valorActual = input.value;
      input.value = '' as unknown as string;
      pintarLista('');
      lista.classList.add('filtro-combo-lista--abierta');
      input.dataset.valorPrevio = valorActual;
    });

    input.addEventListener('input', () => pintarLista(input.value));

    input.addEventListener('blur', () => {
      setTimeout(() => {
        lista.classList.remove('filtro-combo-lista--abierta');
        input.readOnly = true;
        if (!opcionesCompletas.includes(input.value)) {
          input.value = input.dataset.valorPrevio || (valorInicial as unknown as string);
        }
      }, 100);
    });

    wrap.append(label, input, lista, nota);
    panelFiltros!.appendChild(wrap);

    function actualizarOpciones(nuevasOpciones: any[]) {
      opcionesCompletas = ['Todos', ...nuevasOpciones];
      input.value = 'Todos' as unknown as string;
      if (nuevasOpciones.length === 0) {
        input.classList.add('filtro-combo-input--oculto');
        nota.textContent = notaVacia || 'Sin opciones disponibles para la selección actual.';
        nota.classList.add('filtro-combo-nota--visible');
      } else {
        input.classList.remove('filtro-combo-input--oculto');
        nota.classList.remove('filtro-combo-nota--visible');
      }
    }

    return { wrap, actualizarOpciones };
  }

  const wrapTiempo = document.createElement('div');
  wrapTiempo.className = 'mapa-wrap-tiempo';

  const labelTiempo = document.createElement('label');
  labelTiempo.textContent = 'Década';
  labelTiempo.className = 'filtro-label';

  const sliderRango = document.createElement('div');
  sliderRango.className = 'mapa-slider-rango';

  const sliderTrack = document.createElement('div');
  sliderTrack.className = 'mapa-slider-track';

  const sliderProgreso = document.createElement('div');
  sliderProgreso.className = 'mapa-slider-progreso';

  const sliderMin = document.createElement('input');
  sliderMin.type = 'range';
  sliderMin.className = 'mapa-slider mapa-slider--min';

  const sliderMax = document.createElement('input');
  sliderMax.type = 'range';
  sliderMax.className = 'mapa-slider mapa-slider--max';

  sliderRango.append(sliderTrack, sliderProgreso, sliderMin, sliderMax);

  const etiquetaTiempo = document.createElement('div');
  etiquetaTiempo.className = 'mapa-etiqueta-tiempo';

  function sincronizarSlider() {
    const maxIdx = DECADAS.length - 1;
    sliderMin.min = sliderMax.min = 0 as unknown as string;
    sliderMin.max = sliderMax.max = maxIdx as unknown as string;
    sliderMin.step = sliderMax.step = 1 as unknown as string;
    sliderMin.value = estado.decadaMinIdx as unknown as string;
    sliderMax.value = estado.decadaMaxIdx as unknown as string;
    const pctMin = maxIdx === 0 ? 0 : (estado.decadaMinIdx / maxIdx) * 100;
    const pctMax = maxIdx === 0 ? 100 : (estado.decadaMaxIdx / maxIdx) * 100;
    sliderProgreso.style.left = `${pctMin}%`;
    sliderProgreso.style.width = `${pctMax - pctMin}%`;
    sliderMin.classList.toggle('mapa-slider--encima', estado.decadaMinIdx >= estado.decadaMaxIdx);
    etiquetaTiempo.textContent = etiquetaRangoActual();
  }

  function actualizarPorCambioRango() {
    sincronizarSlider();
    actualizarMapa();
    actualizarGrafoRelacion();
    actualizarPanelSecundario(false);
    actualizarCrimenesPorTipo();
  }

  sliderMin.addEventListener('input', () => {
    estado.decadaMinIdx = Math.min(+sliderMin.value, estado.decadaMaxIdx);
    actualizarPorCambioRango();
  });
  sliderMax.addEventListener('input', () => {
    estado.decadaMaxIdx = Math.max(+sliderMax.value, estado.decadaMinIdx);
    actualizarPorCambioRango();
  });

  wrapTiempo.append(labelTiempo, sliderRango, etiquetaTiempo);
  panelFiltros!.appendChild(wrapTiempo);

  function subcrimenesParaCrimen(crimen: string) {
    if (crimen === 'Todos') return subcrimenesLista;
    return [
      ...new Set(
        datosLimpios
          .filter(
            (d: FilaCsv) =>
              d.Nombre_Codigo === crimen && !nombresGenerales.has(d.Nombre_Sub_Codigo),
          )
          .map((d: FilaCsv) => d.Nombre_Sub_Codigo),
      ),
    ].sort(compararPorLinaje);
  }

  const wrapCrimen = document.createElement('div');
  wrapCrimen.className = 'mapa-wrap-crimen';
  const labelCrimen = document.createElement('label');
  labelCrimen.textContent = 'Crimen';
  labelCrimen.className = 'filtro-label';
  const selectCrimen = document.createElement('select');
  selectCrimen.className = 'filtro-select';
  ['Todos', ...crimenesLista].forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c as unknown as string;
    opt.textContent = c as unknown as string;
    selectCrimen.appendChild(opt);
  });
  selectCrimen.value = estado.crimen as unknown as string;
  selectCrimen.addEventListener('change', (e) => {
    estado.crimen = (e.target as HTMLInputElement).value;
    estado.subcrimen = 'Todos';
    comboSubcrimen.actualizarOpciones(subcrimenesParaCrimen(estado.crimen));
    actualizarMapa();
    actualizarPanelSecundario(true);
    actualizarCrimenesPorTipo();
  });
  wrapCrimen.append(labelCrimen, selectCrimen);
  panelFiltros!.appendChild(wrapCrimen);

  const comboSubcrimen = crearComboBuscable({
    etiqueta: 'Subcrimen',
    opciones: subcrimenesParaCrimen(estado.crimen),
    valorInicial: estado.subcrimen,
    notaVacia: 'Este crimen no tiene subcrímenes registrados.',
    onChange: (valor: any) => {
      estado.subcrimen = valor;
      actualizarMapa();
      actualizarPanelSecundario(true);
      actualizarCrimenesPorTipo();
    },
  });

  crearComboBuscable({
    etiqueta: 'Lugar',
    opciones: lugaresLista,
    valorInicial: estado.lugar,
    onChange: (valor: number) => {
      estado.lugar = valor as unknown as string;
      actualizarMapa();
      actualizarCrimenesPorTipo();
    },
  });

  const btnLimpiarPines = document.createElement('button');
  btnLimpiarPines.type = 'button';
  btnLimpiarPines.textContent = 'Quitar comparaciones';
  btnLimpiarPines.className = 'btn-mapa-limpiar';
  btnLimpiarPines.addEventListener('click', () => {
    estado.lugaresFijados.clear();
    btnLimpiarPines.classList.remove('btn-mapa--visible');
    actualizarMapa();
    actualizarPanelSecundario(true);
  });
  panelFiltros!.appendChild(btnLimpiarPines);

  const avisoSinDatos = document.createElement('div');
  avisoSinDatos.className = 'filtro-aviso-sin-datos';
  panelFiltros!.appendChild(avisoSinDatos);

  function actualizarAvisoLugar() {
    if (estado.lugar === 'Todos') {
      avisoSinDatos.classList.remove('filtro-aviso-sin-datos--visible');
      return;
    }
    const [desde, hasta] = rangoDecadaActual();
    const hayDatos = datosFiltradosBase().some(
      (d: FilaCsv) => d.lugar === estado.lugar && d.decada >= desde && d.decada <= hasta,
    );
    if (hayDatos) {
      avisoSinDatos.classList.remove('filtro-aviso-sin-datos--visible');
    } else {
      avisoSinDatos.textContent = `No hay datos para "${estado.lugar}" en ${etiquetaRangoActual()}.`;
      avisoSinDatos.classList.add('filtro-aviso-sin-datos--visible');
    }
  }

  sincronizarSlider();

  const width = 760;
  const height = 820;

  const RADIO_PUNTO = 2;
  const PUNTO_COLOR = leerVariableCss('--mapa-punto-color', '#7b5ea7');
  const rScale = d3.scaleLog().range([RADIO_PUNTO, 18]);
  const colorScaleMap = d3.scaleSequentialLog(
    d3.interpolateHcl(PALETA.acentoSecundario, PALETA.acentoLinea),
  );
  let escalarPorCantidad = false;

  const botonVerCasosMapa = crearBotonVerCasos();
  botonVerCasosMapa.boton.classList.add('btn-mapa-ver-casos--separado');
  mapaContenedor.appendChild(botonVerCasosMapa.boton);

  const btnEscalarTamanio = document.createElement('button');
  btnEscalarTamanio.type = 'button';
  btnEscalarTamanio.textContent = 'Tamaño según cantidad de crímenes';
  btnEscalarTamanio.className = 'btn-mapa-escalar';
  function actualizarEstiloBotonEscalar() {
    btnEscalarTamanio.classList.toggle('btn-mapa--activo', escalarPorCantidad);
  }
  btnEscalarTamanio.addEventListener('click', () => {
    escalarPorCantidad = !escalarPorCantidad;
    actualizarEstiloBotonEscalar();
    actualizarMapa();
  });
  actualizarEstiloBotonEscalar();
  mapaContenedor.appendChild(btnEscalarTamanio);

  const svgMapa = d3
    .select(mapaContenedor)
    .append('svg')
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])
    .attr('class', 'mapa-svg');

  const domainFeature = {
    type: 'Feature',
    geometry: {
      type: 'MultiPoint',
      coordinates: [
        [-83, -5],
        [-60, 12],
      ],
    },
  };

  const projection = d3.geoMercator().fitExtent(
    [
      [0, 0],
      [width, height],
    ],
    domainFeature as any,
  );
  const path = d3.geoPath(projection);
  const gZoom = svgMapa.append('g').attr('class', 'capa-zoom');
  const gMapaBase = gZoom.append('g').attr('class', 'capa-mapa');

  gMapaBase
    .selectAll('path')
    .data(NuevaGranada.features ? NuevaGranada.features : [NuevaGranada])
    .join('path')
    .attr('d', path as any)
    .attr('fill', PALETA.tierra)
    .attr('stroke', PALETA.borde)
    .attr('stroke-opacity', 0.7);

  const gPuntos = gZoom.append('g').attr('class', 'capa-puntos');
  const gCapsulas = gZoom.append('g').attr('class', 'capa-capsulas');

  let lugarHoverActivo: NodoMutable = null;

  const zoom = d3
    .zoom()
    .scaleExtent([1, 12])
    .on('zoom', (event: any) => {
      gZoom.attr('transform', event.transform);
      const k = event.transform.k;
      gMapaBase.selectAll('path').attr('stroke-width', 0.5 / k);
      gPuntos.selectAll('circle').attr('stroke-width', 0.5 / k);
      dibujarCapsulasFijadas();
      if (lugarHoverActivo) {
        gCapsulas.selectAll('g.capsula-hover').remove();
        const gTemp = gCapsulas.append('g').attr('class', 'capsula-hover');
        construirCapsula(gTemp, lugarHoverActivo.lugar, lugarHoverActivo.coords);
      }
    });

  svgMapa.call(zoom as any);

  let seleccionFilaMapa: NodoMutable = null;

  function redibujarCapsulasVisibles() {
    dibujarCapsulasFijadas();
    const gHover = gCapsulas.select('g.capsula-hover');
    if (!gHover.empty() && lugarHoverActivo) {
      construirCapsula(gHover, lugarHoverActivo.lugar, lugarHoverActivo.coords);
    }
  }

  function limpiarSeleccionFilaMapa() {
    seleccionFilaMapa = null;
    botonVerCasosMapa.ocultar();
    redibujarCapsulasVisibles();
  }

  function seleccionarFilaCapsula(lugar: string, nombreFila: string) {
    if (
      seleccionFilaMapa &&
      seleccionFilaMapa.lugar === lugar &&
      seleccionFilaMapa.nombre === nombreFila
    ) {
      limpiarSeleccionFilaMapa();
      return;
    }
    seleccionFilaMapa = { lugar, nombre: nombreFila };
    redibujarCapsulasVisibles();
    botonVerCasosMapa.mostrar(`${nombreFila} · ${lugar}`, () => {
      if (estado.crimen === 'Todos') {
        irATablasFiltradas({ lugar, codigo: nombreFila });
      } else if (nombreFila === estado.crimen) {
        irATablasFiltradas({ lugar, codigo: estado.crimen, subcodigo: null });
      } else {
        irATablasFiltradas({ lugar, codigo: estado.crimen, subcodigo: nombreFila });
      }
    });
  }

  function medirCapsula(lugar: string) {
    const referencia = datosReferenciaLugar(lugar);
    const filasVisibles = referencia.slice(0, 5);
    const totalCasos = referencia.reduce((a, r) => a + r.casos, 0);
    const anchoC = 215;
    const altoC = totalCasos === 0 ? 56 : 38 + filasVisibles.length * 20;
    return { referencia, filasVisibles, totalCasos, anchoC, altoC };
  }

  function construirCapsula(
    g: SeleccionD3,
    lugar: string,
    coords: [number, number],
    posOverride?: any,
  ) {
    const { filasVisibles, totalCasos, anchoC, altoC } = medirCapsula(lugar);
    const provincia = getProvincia(coords);

    const k = d3.zoomTransform(svgMapa.node()!).k;
    const px = projection(coords)![0];
    const py = projection(coords)![1];
    const destino = posOverride || { x: px - anchoC / 2 / k, y: py - (altoC + 16) / k };
    g.attr('transform', `translate(${destino.x}, ${destino.y}) scale(${1 / k})`);
    g.selectAll('*').remove();

    const puntaLocalX = anchoC / 2;
    const puntaLocalY = altoC;
    const puntoLocalX = (px - destino.x) * k;
    const puntoLocalY = (py - destino.y) * k;
    if (Math.abs(puntoLocalX - puntaLocalX) > 1 || Math.abs(puntoLocalY - (puntaLocalY + 8)) > 1) {
      g.append('line')
        .attr('x1', puntaLocalX)
        .attr('y1', puntaLocalY + 4)
        .attr('x2', puntoLocalX)
        .attr('y2', puntoLocalY)
        .attr('class', 'mapa-capsula-linea-guia');
      g.append('circle')
        .attr('cx', puntoLocalX)
        .attr('cy', puntoLocalY)
        .attr('r', 3)
        .attr('class', 'mapa-capsula-punto-guia');
    }

    g.append('rect')
      .attr('width', anchoC)
      .attr('height', altoC)
      .attr('rx', 5)
      .attr('class', 'mapa-capsula-fondo mapa-capsula-fondo--interactivo');

    g.append('text')
      .attr('x', 10)
      .attr('y', 16)
      .attr('class', 'mapa-capsula-titulo')
      .text(lugar.length > 26 ? lugar.slice(0, 24) + '…' : lugar);

    g.append('text')
      .attr('x', 10)
      .attr('y', 30)
      .attr('class', 'mapa-capsula-subtitulo')
      .text(`${provincia} · ${etiquetaRangoActual()}`);

    if (totalCasos === 0) {
      g.append('text')
        .attr('x', anchoC / 2)
        .attr('y', altoC - 16)
        .attr('text-anchor', 'middle')
        .attr('class', 'mapa-capsula-sin-casos')
        .text('Sin casos');
    } else {
      const maxCasos = d3.max(filasVisibles, (d: FilaCsv) => d.casos) || 1;
      const xBarra = d3.scaleLinear().domain([0, maxCasos]).range([0, 60]);
      filasVisibles.forEach((r, i) => {
        const yRow = 38 + i * 20;
        const filaSeleccionada = !!(
          seleccionFilaMapa &&
          seleccionFilaMapa.lugar === lugar &&
          seleccionFilaMapa.nombre === r.nombre
        );
        g.append('text')
          .attr('x', 10)
          .attr('y', yRow + 10)
          .attr(
            'class',
            `mapa-capsula-fila-texto${filaSeleccionada ? ' mapa-capsula-fila-texto--activa' : ''}`,
          )
          .text(r.nombre.length > 18 ? r.nombre.slice(0, 16) + '…' : r.nombre);
        g.append('rect')
          .attr('x', 122)
          .attr('y', yRow + 2)
          .attr('width', xBarra(r.casos))
          .attr('height', 9)
          .attr('rx', 2)
          .attr('class', 'mapa-capsula-barra')
          .attr('stroke', filaSeleccionada ? '#fff' : 'none')
          .attr('stroke-width', filaSeleccionada ? 1 : 0);
        g.append('text')
          .attr('x', anchoC - 10)
          .attr('y', yRow + 10)
          .attr('text-anchor', 'end')
          .attr('class', 'mapa-capsula-fila-conteo')
          .text(r.casos);

        g.append('rect')
          .attr('x', 0)
          .attr('y', yRow - 3)
          .attr('width', anchoC)
          .attr('height', 20)
          .attr('class', 'mapa-capsula-fila-clic')
          .attr('fill', filaSeleccionada ? 'rgba(255,255,255,0.16)' : 'transparent')
          .on('mouseenter', function (this: any) {
            if (!filaSeleccionada) d3.select(this).attr('fill', 'rgba(255,255,255,0.08)');
          })
          .on('mouseleave', function (this: any) {
            if (!filaSeleccionada) d3.select(this).attr('fill', 'transparent');
          })
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            seleccionarFilaCapsula(lugar, r.nombre);
          });
      });
    }

    g.append('path')
      .attr(
        'd',
        `M${anchoC / 2 - 5},${altoC} L${anchoC / 2 + 5},${altoC} L${anchoC / 2},${altoC + 8} Z`,
      )
      .attr('class', 'mapa-capsula-fondo');
  }

  function actualizarMapa() {
    const datos = agruparMapaInstante();
    const minCasos = d3.min(datos, (d: FilaCsv) => d.count) || 1;
    const maxCasosCrudo = d3.max(datos, (d: FilaCsv) => d.count) || 1;
    const maxCasos = maxCasosCrudo > minCasos ? maxCasosCrudo : minCasos + 1;
    rScale.domain([minCasos, maxCasos]);
    colorScaleMap.domain([minCasos, maxCasos]);
    const radioDe = (d: FilaCsv) => (escalarPorCantidad ? rScale(d.count) : RADIO_PUNTO);
    const colorDe = (d: FilaCsv) => (escalarPorCantidad ? colorScaleMap(d.count) : PUNTO_COLOR);

    const puntos = gPuntos.selectAll('circle').data(datos, (d: FilaCsv) => d.lugar);

    puntos.join(
      (enter) =>
        enter
          .append('circle')
          .attr('class', 'mapa-punto')
          .attr('cx', (d: FilaCsv) => projection(d.coords)![0] as any)
          .attr('cy', (d: FilaCsv) => projection(d.coords)![1] as any)
          .attr('r', 0)
          .attr('fill', colorDe)
          .call((enter) => enter.transition().duration(220).attr('r', radioDe))
          .on('mouseenter', (event: MouseEvent, d: FilaCsv) => manejarHoverPunto(event, d, true))
          .on('mouseleave', (event: MouseEvent, d: FilaCsv) => manejarHoverPunto(event, d, false))
          .on('click', (event: MouseEvent, d: FilaCsv) => alternarPin(d.lugar)),
      (update) =>
        update.call((update) =>
          update
            .transition()
            .duration(180)
            .attr('cx', (d: FilaCsv) => projection(d.coords)![0] as any)
            .attr('cy', (d: FilaCsv) => projection(d.coords)![1] as any)
            .attr('r', radioDe)
            .attr('fill', colorDe),
        ),
      (exit) => exit.transition().duration(150).attr('r', 0).remove(),
    );

    dibujarCapsulasFijadas();
    actualizarAvisoLugar();
  }

  function manejarHoverPunto(event: any, d: FilaCsv, entrando: boolean) {
    if (entrando) {
      cancelarOcultarCapsulaHover();
      if (!estado.lugaresFijados.has(d.lugar)) {
        lugarHoverActivo = { lugar: d.lugar, coords: d.coords };
        gCapsulas.selectAll('g.capsula-hover').remove();
        const gTemp = gCapsulas
          .append('g')
          .attr('class', 'capsula-hover')
          .on('mouseenter', cancelarOcultarCapsulaHover)
          .on('mouseleave', programarOcultarCapsulaHover);
        construirCapsula(gTemp, d.lugar, d.coords);
      }
    } else {
      programarOcultarCapsulaHover();
    }
  }

  let hideCapsulaHoverTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelarOcultarCapsulaHover() {
    if (hideCapsulaHoverTimer) {
      clearTimeout(hideCapsulaHoverTimer);
      hideCapsulaHoverTimer = null;
    }
  }

  function programarOcultarCapsulaHover() {
    cancelarOcultarCapsulaHover();
    hideCapsulaHoverTimer = setTimeout(() => {
      lugarHoverActivo = null;
      gCapsulas.selectAll('g.capsula-hover').remove();
    }, 220);
  }

  function alternarPin(lugar: string) {
    if (estado.lugaresFijados.has(lugar)) {
      estado.lugaresFijados.delete(lugar);
    } else {
      estado.lugaresFijados.add(lugar);
    }
    btnLimpiarPines.classList.toggle('btn-mapa--visible', estado.lugaresFijados.size > 0);
    dibujarCapsulasFijadas();
    actualizarPanelSecundario(true);
  }

  function seSuperponen(a: NodoMutable, b: NodoMutable, margen = 4) {
    return !(
      a.x + a.w + margen < b.x ||
      b.x + b.w + margen < a.x ||
      a.y + a.h + margen < b.y ||
      b.y + b.h + margen < a.y
    );
  }

  function dibujarCapsulasFijadas() {
    gCapsulas.selectAll('g.capsula-fija').remove();
    const datosActuales = agruparMapaInstante();
    const GAP = 10;
    const cajasOcupadas: any[] = [];

    const t = d3.zoomTransform(svgMapa.node()!);
    const k = t.k;

    estado.lugaresFijados.forEach((lugar: any) => {
      const punto = datosActuales.find((d: FilaCsv) => d.lugar === lugar);
      const coords = punto ? punto.coords : coordPorLugar[lugar];
      if (!coords) return;

      const { anchoC, altoC } = medirCapsula(lugar);
      const px = projection(coords)![0];
      const py = projection(coords)![1];
      const [sx, sy] = t.apply([px, py]);

      let caja = { x: sx - anchoC / 2, y: sy - altoC - 16, w: anchoC, h: altoC };
      let intento = 0;
      while (cajasOcupadas.some((c) => seSuperponen(c, caja)) && intento < 24) {
        intento++;
        const lado = intento % 2 === 0 ? 1 : -1;
        const paso = Math.ceil(intento / 2);
        caja = {
          x: sx - anchoC / 2 + lado * paso * (anchoC + GAP),
          y: sy - altoC - 16 - Math.floor(paso / 3) * (altoC + GAP),
          w: anchoC,
          h: altoC,
        };
      }
      cajasOcupadas.push(caja);

      const destino = { x: (caja.x - t.x) / k, y: (caja.y - t.y) / k };

      const g = gCapsulas.append('g').attr('class', 'capsula-fija');
      construirCapsula(g, lugar, coords, destino);
      g.select('rect').attr('stroke', PALETA.acentoLinea).attr('stroke-width', 1.5);
    });
  }

  const contenedorLineas = document.getElementById('crimenesChart');
  let timerRef: NodoMutable = null;

  if (contenedorLineas) {
    contenedorLineas!.classList.add('mapa-contenedor-lineas');

    const botonVerCasosLinea = crearBotonVerCasos();
    if (contenedorLineas!.parentElement) {
      contenedorLineas!.parentElement.insertBefore(botonVerCasosLinea.boton, contenedorLineas);
    }
    let seleccionPuntoLinea: NodoMutable = null;
    let lineGroupsPorSerie = new Map();

    const tooltipLineas = document.createElement('div');
    tooltipLineas.className = 'tooltip-grafico tooltip-grafico--sans';

    const MARGIN = { top: 60, right: 170, bottom: 50, left: 55 };
    const WIDTH = 700,
      HEIGHT = 300;
    const IW = WIDTH - MARGIN.left - MARGIN.right;
    const IH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const DURACION_LINEA = 700;
    const PAUSA = 130;

    function buildSerieTotal() {
      const lista = decadasSeleccionadas();
      const filtrados = datosFiltradosBase();
      const puntos = lista.map((t) => {
        const set = new Set(
          filtrados
            .filter((d: FilaCsv) => d.decada === t)
            .map((d: FilaCsv) => `${d.ID_Documento}|${d.Sub_Código}`),
        );
        const cantidad = set.size;
        return {
          tiempo: t,
          cantidad,
          etiqueta: `Todos los crímenes\n${formatoDecada(t)}: ${cantidad} casos`,
        };
      });
      const total = puntos.reduce((a, p) => a + p.cantidad, 0);
      return [{ nombre: 'Todos los crímenes', total, puntos }];
    }

    function buildSeriesSubcrimen() {
      const lista = decadasSeleccionadas();
      const filtrados = datosFiltradosBase();
      const filtradosConSubcrimen = filtrados.filter(
        (d: FilaCsv) => !nombresGenerales.has(d.Nombre_Sub_Codigo),
      );
      const subNombres = [
        ...new Set(filtradosConSubcrimen.map((d: FilaCsv) => d.Nombre_Sub_Codigo)),
      ].sort(compararPorLinaje);

      if (subNombres.length === 0) {
        const puntos = lista.map((t) => {
          const set = new Set(
            filtrados
              .filter((d: FilaCsv) => d.decada === t)
              .map((d: FilaCsv) => `${d.ID_Documento}|${d.Sub_Código}`),
          );
          const cantidad = set.size;
          return {
            tiempo: t,
            cantidad,
            etiqueta: `${estado.crimen}\n${formatoDecada(t)}: ${cantidad} casos`,
          };
        });
        const total = puntos.reduce((a, p) => a + p.cantidad, 0);
        return [{ nombre: estado.crimen, total, puntos }];
      }

      return subNombres.map((sub) => {
        const filas = filtradosConSubcrimen.filter((d: FilaCsv) => d.Nombre_Sub_Codigo === sub);
        const puntos = lista.map((t) => {
          const set = new Set(
            filas
              .filter((d: FilaCsv) => d.decada === t)
              .map((d: FilaCsv) => `${d.ID_Documento}|${d.Sub_Código}`),
          );
          const cantidad = set.size;
          return { tiempo: t, cantidad, etiqueta: `${sub}\n${formatoDecada(t)}: ${cantidad} casos` };
        });
        const total = puntos.reduce((a, p) => a + p.cantidad, 0);
        return { nombre: sub, total, puntos };
      });
    }

    function buildSeriesLugaresFijados() {
      const lista = decadasSeleccionadas();
      const filtrados = datosFiltradosBase();

      return [...estado.lugaresFijados].map((lugar: any) => {
        const filas = filtrados.filter((d: FilaCsv) => d.lugar === lugar);
        const puntos = lista.map((t) => {
          const set = new Set(
            filas
              .filter((d: FilaCsv) => d.decada === t)
              .map((d: FilaCsv) => `${d.ID_Documento}|${d.Sub_Código}`),
          );
          const cantidad = set.size;
          return {
            tiempo: t,
            cantidad,
            etiqueta: `${lugar}\n${formatoDecada(t)}: ${cantidad} casos`,
          };
        });
        const total = puntos.reduce((a, p) => a + p.cantidad, 0);
        return { nombre: lugar, total, puntos };
      });
    }

    function renderPanelSecundario(conAnimacion: boolean) {
      if (timerRef) {
        timerRef.stop();
        timerRef = null;
      }
      contenedorLineas!.innerHTML = '';
      contenedorLineas!.appendChild(tooltipLineas);

      seleccionPuntoLinea = null;
      lineGroupsPorSerie = new Map();
      botonVerCasosLinea.ocultar();

      const enModoComparacion = estado.lugaresFijados.size > 0;
      const series = enModoComparacion
        ? buildSeriesLugaresFijados()
        : estado.crimen === 'Todos'
          ? buildSerieTotal()
          : buildSeriesSubcrimen();
      const lista = decadasSeleccionadas();
      const totalGeneral = series.reduce((a, s) => a + s.total, 0);

      function irDesdeLineaSerie(serie: NodoMutable, tiempo: number) {
        if (enModoComparacion) {
          irATablasFiltradas({ lugar: serie.nombre, fecha: tiempo });
        } else if (estado.crimen === 'Todos') {
          irATablasFiltradas({ fecha: tiempo });
        } else if (serie.nombre === estado.crimen) {
          irATablasFiltradas({
            codigo: estado.crimen,
            subcodigo: null,
            fecha: tiempo,
          });
        } else {
          irATablasFiltradas({
            codigo: estado.crimen,
            subcodigo: serie.nombre,
            fecha: tiempo,
          });
        }
      }

      function aplicarResaltadoLinea() {
        if (!seleccionPuntoLinea) {
          lineGroupsPorSerie.forEach((grp) => grp.style('opacity', 1));
          return;
        }
        const nombreSerieActiva = seleccionPuntoLinea.split('||')[0];
        lineGroupsPorSerie.forEach((grp, nombre) => {
          grp.style('opacity', nombre === nombreSerieActiva ? 1 : 0.2);
        });
      }

      function limpiarSeleccionLinea() {
        seleccionPuntoLinea = null;
        botonVerCasosLinea.ocultar();
        aplicarResaltadoLinea();
      }

      function seleccionarPuntoLinea(serie: NodoMutable, tiempo: number) {
        const clave = `${serie.nombre}||${tiempo}`;
        if (seleccionPuntoLinea === clave) {
          limpiarSeleccionLinea();
          return;
        }
        seleccionPuntoLinea = clave;
        aplicarResaltadoLinea();
        botonVerCasosLinea.mostrar(`${serie.nombre} · ${tiempo}`, () =>
          irDesdeLineaSerie(serie, tiempo),
        );
      }

      if (totalGeneral === 0) {
        const aviso = document.createElement('div');
        aviso.className = 'mapa-aviso-vacio';
        aviso.textContent = 'Sin casos con los filtros actuales';
        contenedorLineas!.appendChild(aviso);
        return;
      }

      const colorScaleLine = d3
        .scaleOrdinal()
        .domain(series.map((s) => s.nombre))
        .range(COLORES_SERIE);

      const svgLine = d3
        .create('svg')
        .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
        .attr('class', 'mapa-linea-svg')
        .on('click', () => limpiarSeleccionLinea());

      const g = svgLine.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);
      const x = d3.scalePoint().domain(lista).range([0, IW]).padding(0.2);
      const valores = series.flatMap((s) => s.puntos.map((p) => p.cantidad));
      const yMax = d3.max(valores) || 1;
      const yTope = Math.ceil(yMax * 1.15) || 1;
      const y = d3.scaleLinear().domain([0, yTope]).range([IH, 0]);

      g.append('g')
        .call(
          d3
            .axisLeft(y)
            .ticks(5)
            .tickSize(-IW)
            .tickFormat('' as any),
        )
        .call((gg) => {
          gg.select('.domain').remove();
          gg.selectAll('line').attr('class', 'mapa-linea-grid-linea');
        });

      const ejeXTiempo = d3
        .axisBottom(x)
        .tickSize(0)
        .tickFormat((d) => formatoDecada(d as unknown as number) as unknown as string);
      if (lista.length > 2) {
        ejeXTiempo.tickValues([lista[0], lista[lista.length - 1]]);
      }
      g.append('g')
        .attr('transform', `translate(0,${IH})`)
        .call(ejeXTiempo)
        .call((gg) => {
          gg.select('.domain').attr('class', 'mapa-linea-eje-dominio');
          gg.selectAll('text')
            .attr('class', 'mapa-linea-eje-x-texto')
            .style('font-size', lista.length > 6 ? '9px' : '12px')
            .attr('dy', '1.4em');
        });

      g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d')))
        .call((gg) => {
          gg.select('.domain').remove();
          gg.selectAll('text').attr('class', 'mapa-linea-eje-y-texto');
        });

      const tituloTexto = enModoComparacion
        ? `Comparando ${series.length} lugar(es) fijado(s)`
        : estado.crimen === 'Todos'
          ? 'Todos los crímenes'
          : estado.crimen;

      svgLine
        .append('text')
        .attr('x', MARGIN.left + IW / 2)
        .attr('y', 22)
        .attr('text-anchor', 'middle')
        .attr('class', 'mapa-linea-titulo')
        .text(tituloTexto);

      svgLine
        .append('text')
        .attr('x', MARGIN.left + IW / 2)
        .attr('y', 40)
        .attr('text-anchor', 'middle')
        .attr('class', 'mapa-linea-subtitulo')
        .text(`${totalGeneral} registros únicos · por década`);

      const lineGen = (d3.line() as any)
        .x((d: FilaCsv) => x(d.tiempo))
        .y((d: FilaCsv) => y(d.cantidad))
        .curve(d3.curveLinear);

      function dibujarSerieInstante(idx: number) {
        const serie = series[idx];
        const color = colorScaleLine(serie.nombre);
        const lineGroup = g.append('g');
        lineGroupsPorSerie.set(serie.nombre, lineGroup);
        if (seleccionPuntoLinea) {
          const nombreSerieActiva = seleccionPuntoLinea.split('||')[0];
          lineGroup.style('opacity', serie.nombre === nombreSerieActiva ? 1 : 0.2);
        }

        lineGroup
          .append('path')
          .datum(serie.puntos as any)
          .attr('class', 'mapa-linea-trazo')
          .attr('stroke', color as string)
          .attr('d', lineGen as any);

        serie.puntos.forEach((p) => {
          lineGroup
            .append('circle')
            .attr('cx', x(p.tiempo) as any)
            .attr('cy', y(p.cantidad) as any)
            .attr('r', 4)
            .attr('class', 'mapa-linea-punto')
            .attr('stroke', color as string);
          lineGroup
            .append('circle')
            .attr('cx', x(p.tiempo) as any)
            .attr('cy', y(p.cantidad) as any)
            .attr('r', 10)
            .attr('class', 'mapa-linea-punto-hit')
            .on('mouseenter', () => {
              tooltipLineas.innerHTML = p.etiqueta.replace(/\n/g, '<br/>');
              tooltipLineas.classList.add('tooltip-grafico--visible');
            })
            .on('mousemove', (event: MouseEvent) => {
              const rect = contenedorLineas!.getBoundingClientRect();
              tooltipLineas.style.left = event.clientX - rect.left + 12 + 'px';
              tooltipLineas.style.top = event.clientY - rect.top + 12 + 'px';
            })
            .on('mouseleave', () => tooltipLineas.classList.remove('tooltip-grafico--visible'))
            .on('click', (event: MouseEvent) => {
              event.stopPropagation();
              seleccionarPuntoLinea(serie, p.tiempo);
            });
        });

        const ultimoPunto: NodoMutable =
          [...serie.puntos].reverse().find((p) => p.cantidad > 0) ||
          serie.puntos[serie.puntos.length - 1];
        lineGroup
          .append('text')
          .attr('x', (x(ultimoPunto!.tiempo)! + 8) as any)
          .attr('y', (y(ultimoPunto!.cantidad) + 4) as any)
          .attr('class', 'mapa-linea-etiqueta-serie')
          .style('fill', color as string)
          .text(serie.nombre.length > 22 ? serie.nombre.slice(0, 20) + '…' : serie.nombre);
      }

      function revelarSecuencial(idx: number) {
        if (idx >= series.length) return;
        const color = colorScaleLine(series[idx].nombre);
        const lineGroup = g.append('g');
        const pathLine = lineGroup
          .append('path')
          .datum(series[idx].puntos as any)
          .attr('class', 'mapa-linea-trazo')
          .attr('stroke', color as string)
          .attr('d', lineGen as any);
        const totalLength = pathLine.node()!.getTotalLength();
        pathLine
          .attr('stroke-dasharray', `${totalLength} ${totalLength}`)
          .attr('stroke-dashoffset', totalLength)
          .transition()
          .duration(DURACION_LINEA)
          .ease(d3.easeLinear)
          .attr('stroke-dashoffset', 0)
          .on('end', () => {
            lineGroup.remove();
            dibujarSerieInstante(idx);
            timerRef = d3.timeout(() => revelarSecuencial(idx + 1), PAUSA);
          });
      }

      if (conAnimacion) {
        timerRef = d3.timeout(() => revelarSecuencial(0), 100);
      } else {
        series.forEach((_, idx) => dibujarSerieInstante(idx));
      }

      contenedorLineas!.append(svgLine.node()!);
    }

    window.__actualizarPanelSecundarioDashboard = renderPanelSecundario as (c?: boolean) => void;
  }

  function actualizarPanelSecundario(conAnimacion: boolean) {
    if (window.__actualizarPanelSecundarioDashboard) {
      window.__actualizarPanelSecundarioDashboard(conAnimacion);
    }
  }

  actualizarMapa();
  actualizarPanelSecundario(true);
}
