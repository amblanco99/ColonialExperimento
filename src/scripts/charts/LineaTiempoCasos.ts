import * as d3 from 'd3';
import Lenis from 'lenis';
import { esLinajeCriminal } from './linajeComun.js';
import type { FilaCsv } from './agentesComun.js';

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

// Tope de década del dashboard de Tiempo (fallback cuando no hay filtros).
const ULTIMA_DECADA = 1820;

interface ResumenCaso {
  id: string;
  anioDesde: number;
  anioHasta: number;
  lugar: string;
  esCriminal: boolean;
  filas: FilaCsv[];
}

// Distancia (px) usada solo para normalizar la distancia al centro al
// calcular el desvanecido (ver actualizarDesvanecido) — el año más cercano
// al centro se ve nítido y grande; los de alrededor se van desvaneciendo
// con la distancia — efecto de rueda selectora. No depende del zoom: al
// acercar (más px por año), menos años entran en un mismo "paso" de
// desvanecido; al alejar, entran más — es el comportamiento esperado.
const FADE_PASO_PX = 90;

// La barra representa el tiempo real (no un índice de años-con-casos): el
// eje usa una escala lineal año→px, así que un hueco de años sin casos se
// ve como un hueco real en la barra. ESPACIO_ANIO_BASE es la densidad fija
// (px por año) de la barra — no hay zoom, solo desplazamiento (ver la guía
// de fecha / time slider).
const ESPACIO_ANIO_BASE = 42;


export async function crearLineaTiempoCasos(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const [crimenes, linaje] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);

  // A diferencia de CrimenesPorTipo.ts, aquí SÍ entran los linajes "No
  // criminal" (documentos, traslados, juicios civiles, etc.) — el punto de
  // este widget es mostrar todos los casos del corpus, no solo los delitos;
  // "No aplica" (el cajón de "Sin codificar") se sigue dejando fuera. Se
  // agrupa por caso (ID_Caso) en vez de por fila: un caso puede traer varios
  // delitos y subdelitos (p. ej. un juicio de residencia con varias
  // contrademandas), y el popup los lista todos juntos.
  const linajeMap = new Map(linaje.map((d) => [d['ID_Código'], d.Nombre]));
  const tipoDelitoMap = new Map(linaje.map((d) => [d['ID_Código'], d.Tipo_delito]));

  const crimenesAplicables = crimenes
    .filter((d: FilaCsv) => tipoDelitoMap.get(d['Código']) !== 'No aplica' && decadaValida(+d.Año))
    .map((d: FilaCsv) => ({
      ...d,
      año: +d.Año,
      decada: getDecada(+d.Año),
      esCriminal: esLinajeCriminal(d['Código']),
    }));

  const casosPorId = new Map<string, FilaCsv[]>();
  crimenesAplicables.forEach((d) => {
    const id = d['ID_Caso'];
    if (!id) return;
    if (!casosPorId.has(id)) casosPorId.set(id, []);
    casosPorId.get(id)!.push(d);
  });

  // El resumen (rango de años, lugar más frecuente) se calcula una sola vez
  // sobre TODAS las filas del caso, sin importar el filtro activo: el popup
  // siempre muestra el caso completo, aunque el filtro solo haya calificado
  // una de sus filas (ver calcularCasos).
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
      // Un caso con al menos un delito criminal cuenta como criminal, aunque
      // también traiga filas administrativas (p. ej. el documento del
      // traslado de ese mismo proceso).
      esCriminal: filas.some((f) => f.esCriminal),
      filas,
    });
  });

  const decadasConDatos = [...new Set(crimenesAplicables.map((d) => d.decada))].sort(
    (a, b) => a - b,
  );
  const decadaMinGlobal = decadasConDatos[0] as number;

  // El popup siempre muestra el caso completo (todas sus filas), pero cuáles
  // casos CALIFICAN para aparecer en la lista sí depende de los filtros.
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

  // ── Estructura fija: se crea una sola vez. dibujar() solo repone el
  // contenido de la lista de años; la tarjeta de detalle se reutiliza entre
  // renders (evita acumular listeners de teclado en cada refiltrado).
  const wrapper = document.createElement('div');
  wrapper.className = 'linea-tiempo-casos-wrapper';

  // Selector de vista: "Vista en línea" (conteo de casos por año, criminal
  // vs no criminal, como un gráfico de líneas — para ver TODOS los casos
  // sumados sin que un año con muchos casos ocupe más espacio que otro) y
  // "Rueda de años" (la vista de puntos/píldoras con zoom que ya existía).
  // Ambas se recalculan en cada dibujar(); acá solo se alterna cuál se ve.
  const selectorVista = document.createElement('div');
  selectorVista.className = 'linea-tiempo-casos-selector-vista';
  selectorVista.innerHTML = `
    <button type="button" class="linea-tiempo-casos-selector-vista__boton" data-vista="linea">Vista en línea</button>
    <button type="button" class="linea-tiempo-casos-selector-vista__boton linea-tiempo-casos-selector-vista__boton--activo" data-vista="rueda">Rueda de años</button>
  `;
  wrapper.appendChild(selectorVista);
  const botonVistaLinea = selectorVista.querySelector<HTMLButtonElement>('[data-vista="linea"]')!;
  const botonVistaRueda = selectorVista.querySelector<HTMLButtonElement>('[data-vista="rueda"]')!;

  // cuerpo centra la columna de la rueda; al mostrarse la tarjeta de detalle
  // a la derecha, ese mismo centrado hace que la rueda se corra un poco a
  // la izquierda para dejarle sitio (sin animar nada a mano).
  const cuerpo = document.createElement('div');
  cuerpo.className = 'linea-tiempo-casos-cuerpo';
  wrapper.appendChild(cuerpo);

  const contenedorLinea = document.createElement('div');
  contenedorLinea.className = 'linea-tiempo-casos-contenedor-linea linea-tiempo-casos-contenedor-linea--oculto';
  wrapper.appendChild(contenedorLinea);

  // Título/subtítulo viven fuera del widget (en tiempo/index.astro, junto
  // al resto del encabezado de la tarjeta) — se referencian por id porque
  // ninguno de los dos es hijo de `wrapper`.
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
        'Cada línea suma los casos por año — criminal y no criminal por separado — según los filtros de arriba.',
    },
  } as const;

  function mostrarVistaTimeline(vista: 'linea' | 'rueda') {
    cuerpo.classList.toggle('linea-tiempo-casos-cuerpo--oculto', vista !== 'rueda');
    contenedorLinea.classList.toggle('linea-tiempo-casos-contenedor-linea--oculto', vista !== 'linea');
    botonVistaLinea.classList.toggle('linea-tiempo-casos-selector-vista__boton--activo', vista === 'linea');
    botonVistaRueda.classList.toggle('linea-tiempo-casos-selector-vista__boton--activo', vista === 'rueda');

    if (elTitulo) elTitulo.textContent = TEXTOS_VISTA[vista].titulo;
    if (elSubtitulo) elSubtitulo.textContent = TEXTOS_VISTA[vista].subtitulo;

    // La leyenda es la misma para las dos vistas (mismos colores/categorías),
    // pero el "chip" de color debe leerse como el trazo que representa en
    // cada una: un puntito redondo en la rueda, un segmento de línea en la
    // vista en línea.
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

  // Guía de fecha / time slider: un slider simple (mismo patrón visual que
  // el filtro de década — <input type="range">, ver sincronizarSlider en
  // TiempoCrimenesMapa.ts) que muestra y controla QUÉ TRAMO de la barra se
  // ve en la rueda. Su ancho de "ventana" es fijo (lo que entre a
  // ESPACIO_ANIO_BASE px/año en el ancho de la rueda); arrastrarlo desplaza
  // esa ventana a lo largo de todo el rango filtrado, sin cambiar la
  // escala (ver irAAnio). Se mantiene sincronizado con cualquier otra forma
  // de desplazarse (rueda/arrastre) — ver sincronizarGuia, llamada en cada
  // frame desde actualizarDesvanecido. Va DEBAJO de la rueda (después de
  // `lista`), no arriba, para no competir con los años de las columnas.
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

  // Lenis necesita un único hijo directo que envuelva todo el contenido
  // desplazable (ver README de lenis: wrapper/content).
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

  // Columnas actualmente en el roll, en orden — se recalcula en cada
  // dibujar(). aniosFilas guarda el año real de cada columna en el mismo
  // orden (para recolocarColumnas/aplicarZoom, que necesitan la posición en
  // la escala de tiempo, no solo el índice). El desvanecido corre en el
  // mismo raf de Lenis: en vez de un observer binario (activo/no activo),
  // la opacidad de cada columna depende de qué tan lejos está su centro del
  // centro de la ventana visible.
  let filas: HTMLElement[] = [];
  let aniosFilas: number[] = [];

  // Espaciador final: un padding-right en `contenido` NO alcanza para dejar
  // sitio al último año, porque `contenido` (flex, sin ancho propio fijo)
  // no llega a medir tan ancho como sus columnas (que ya lo desbordan por
  // flex-shrink:0) — el padding queda mucho más adentro que el borde real
  // del contenido y el scroll nunca llega a él. Un hijo real al final del
  // flex (como el margin-left de la primera columna, que si funciona) sí
  // cuenta para el ancho desbordado, así que un div vacío con su propio
  // ancho hace de "colchón" real al final.
  let espaciadorFinal: HTMLElement | null = null;

  // Rango de años que cubre la barra en este render (decadaDesde..
  // decadaHasta+9, ver dibujar() — el dominio completo del filtro, no solo
  // los años con casos, para que los huecos sin casos se vean como huecos
  // reales).
  let anioMinActual = decadaMinGlobal;
  let anioMaxActual = ULTIMA_DECADA + 9;
  // Ancho (px) del rango [anioMinActual, anioMaxActual] a ESPACIO_ANIO_BASE
  // — se recalcula en cada recolocarColumnas(); lo necesitan
  // contenidoXDeAnio/anioDeContenidoX (usadas por la guía de fecha) para
  // convertir entre año y posición sin depender de que ese año tenga una
  // columna renderizada.
  let anchoInterior = 0;
  const xScale = d3.scaleLinear();

  // Con columnas de ancho variable (ver dibujar()) la posición de cada una
  // ya no se puede calcular como índice × ancho fijo — se usa su
  // offsetLeft/offsetWidth real. El ancho de la ventana visible se lee de
  // lista.clientWidth (no una constante fija) para que siga siendo correcto
  // sea cual sea el ancho real que le toque en el layout. Con como mucho
  // unos pocos cientos de años en el roll, recorrerlas todas en cada frame
  // sigue siendo barato.
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
      const distanciaEnPasos = distancias[i] / FADE_PASO_PX;
      fila.style.opacity = Math.max(0.16, 1 - distanciaEnPasos * 0.32).toFixed(2);
      fila.classList.toggle('linea-tiempo-casos-anio--activo', i === indiceActivo);
    });
  }

  // Recalcula el espaciado horizontal de las columnas según la escala de
  // tiempo real (xScale) — el margen izquierdo de cada columna (salvo la
  // primera) se fija para que la distancia entre sus centros reproduzca la
  // distancia real en años, no un ancho de columna fijo. El margen de la
  // primera/el espaciador final dejan sitio para que el primer/último año
  // puedan llegar al centro de la ventana visible.
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

  // Convierte entre año y posición en el contenido (compatible con
  // offsetLeft/scrollLeft) para CUALQUIER año, no solo los que tienen
  // columna propia — necesario para la guía de fecha, que puede pedir
  // desplazarse a un año sin casos.
  //
  // NO extrapola desde una sola ancla con un px/año fijo: recolocarColumnas
  // fija el margen entre columnas ADYACENTES con Math.max(0, ...), así que
  // en un tramo denso (muchos años consecutivos con casos, como 1790-1810 en
  // este corpus) el ancho natural de cada píldora/columna termina pesando
  // más que el hueco teórico de la escala, y esa distancia "de más" se
  // acumula. Una extrapolación lineal desde un solo punto ignora esa
  // acumulación y con un rango largo se desvía muchísimo de dónde están las
  // columnas de verdad (se comprobó: pedía año 1799 y el scroll terminaba
  // centrado en 1666). Por eso acá se interpola/extrapola SIEMPRE contra las
  // posiciones reales de las columnas más cercanas (búsqueda binaria sobre
  // aniosFilas/filas, que están en orden), y solo se usa ESPACIO_ANIO_BASE
  // como tasa de relleno en los extremos (antes de la primera columna o
  // después de la última), donde no hay clamping real que compensar.
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

  // Ventana de años actualmente visible en la ventana de la rueda (lo que
  // entra entre el borde izquierdo y el derecho de `lista`).
  function obtenerVentanaVisible(): [number, number] {
    return [anioDeContenidoX(lista.scrollLeft), anioDeContenidoX(lista.scrollLeft + lista.clientWidth)];
  }

  // Se desplaza para que anioDesdeVentana quede en el borde izquierdo de la
  // ventana visible — usado por la guía de fecha (un time slider: solo
  // mueve la ventana, no cambia su ancho/escala). El scroll se acota al
  // máximo real (scrollWidth - clientWidth): contenidoXDeAnio puede pedir
  // una posición más allá de eso (p. ej. al pedir el último año del
  // dominio, que cae en el relleno vacío después de la última columna), y
  // sin este tope el propio scroll ya lo recorta pero de forma menos
  // predecible que hacerlo acá explícito.
  function irAAnio(anioDesdeVentana: number) {
    if (filas.length === 0) return;
    const maxScrollLeft = Math.max(0, lista.scrollWidth - lista.clientWidth);
    const destino = Math.min(maxScrollLeft, Math.max(0, contenidoXDeAnio(anioDesdeVentana)));
    lenis.scrollTo(destino, { immediate: true });
    actualizarDesvanecido();
  }

  // Mantiene la guía de fecha reflejando la ventana visible actual — se
  // llama en cada frame desde actualizarDesvanecido, así que sirve tanto
  // para lo que dispara la propia guía como para cualquier otra forma de
  // desplazarse (rueda/arrastre). No toca el valor mientras el usuario lo
  // esté arrastrando (su .value ya lo está actualizando el navegador) para
  // no pelearle el gesto.
  //
  // guiaPos.min/max son SIEMPRE anioMinActual/anioMaxActual (el dominio
  // completo, fijo) — no un "máximo posible según el ancho de ventana
  // actual". Ese cálculo dinámico (max = anioMaxActual - anchoVentana)
  // parecía más preciso, pero crea un circuito: anchoVentana depende de la
  // posición actual del scroll, que depende de dónde clampeó el .max en el
  // frame anterior — en un tramo denso (donde el ancho de ventana en años
  // se achica) ese circuito converge en un punto fijo ANTES del final real,
  // y el slider se queda "trabado" sin poder avanzar más (el glitch
  // reportado al mover de 1803 a 1824). Con límites fijos, cualquier
  // posición entre anioMinActual y anioMaxActual es siempre alcanzable;
  // irAAnio ya se encarga de no pasarse del scroll real.
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
  leyenda.innerHTML = `
    <span class="linea-tiempo-casos-leyenda-item">
      <span class="linea-tiempo-casos-leyenda-punto"></span>Delito criminal
    </span>
    <span class="linea-tiempo-casos-leyenda-item">
      <span class="linea-tiempo-casos-leyenda-punto linea-tiempo-casos-leyenda-punto--no-criminal"></span>No criminal (documentos, traslados, juicios civiles, etc.)
    </span>
  `;
  wrapper.appendChild(leyenda);

  // Tarjeta de detalle a la derecha de la rueda (no un popup modal): al
  // mostrarse, gana ancho y empuja el centrado de .linea-tiempo-casos-cuerpo,
  // por eso la rueda se corre sola hacia la izquierda.
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

    // La primera fila del caso, para ilustrar de qué se trata sin tener que
    // abrir "Ver caso" — mismo campo (Descripción de crimenes.csv) y misma
    // limpieza de negrilla (**texto**) que usa formatearDescripcion en
    // caso.ts, sin la versión con <strong> porque acá va a textContent, no
    // a innerHTML.
    const descripcion = (caso.filas[0]?.['Descripción'] || '').trim().replace(/\*\*(.+?)\*\*/g, '$1');
    elDescripcion.textContent = descripcion;
    elDescripcion.hidden = !descripcion;

    elLista.innerHTML = '';
    caso.filas.forEach((f) => {
      const nombre = linajeMap.get(f['Código']) || 'Sin información';
      const nombreSub = linajeMap.get(f['Sub_Código']);
      const li = document.createElement('li');
      li.textContent = nombreSub && nombreSub !== nombre ? `${nombre} — ${nombreSub}` : nombre;
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

  const colorCriminal = leerVariableCss('--mapa-punto-color', '#7b5ea7');
  const colorNoCriminal = leerVariableCss('--mapa-acento-secundario', '#4e9bbb');

  // Vista en línea: conteo de casos POR AÑO (no acumulado), una línea para
  // delitos criminales y otra para el resto — a diferencia de la rueda de
  // puntos, acá un año con muchísimos casos no ocupa más espacio que otro:
  // solo hace más alta la línea en ese punto, así que siempre se ven TODOS
  // los casos sumados de un vistazo. El dominio es todo el rango de décadas
  // filtrado (anioDesde..anioHasta), no solo los años con casos, para que
  // los huecos se vean como huecos reales (en 0), igual que en la rueda.
  function renderizarLinea(anioDesde: number, anioHasta: number, casos: ResumenCaso[]) {
    contenedorLinea.innerHTML = '';

    if (casos.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'mapa-aviso-vacio mapa-aviso-vacio--compacto';
      aviso.textContent = 'Sin casos con los filtros actuales';
      contenedorLinea.appendChild(aviso);
      return;
    }

    const conteoPorAnio = new Map<number, { criminal: number; noCriminal: number }>();
    casos.forEach((c) => {
      const entrada = conteoPorAnio.get(c.anioDesde) || { criminal: 0, noCriminal: 0 };
      if (c.esCriminal) entrada.criminal += 1;
      else entrada.noCriminal += 1;
      conteoPorAnio.set(c.anioDesde, entrada);
    });

    const anios = d3.range(anioDesde, anioHasta + 1);
    const serieCriminal = anios.map((a) => conteoPorAnio.get(a)?.criminal ?? 0);
    const serieNoCriminal = anios.map((a) => conteoPorAnio.get(a)?.noCriminal ?? 0);

    const MARGIN = { top: 16, right: 20, bottom: 30, left: 44 };
    const WIDTH = 900;
    const HEIGHT = 320;
    const IW = WIDTH - MARGIN.left - MARGIN.right;
    const IH = HEIGHT - MARGIN.top - MARGIN.bottom;

    const x = d3.scaleLinear().domain([anioDesde, anioHasta]).range([0, IW]);
    const maxValor = Math.max(1, d3.max([...serieCriminal, ...serieNoCriminal]) || 1);
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

    // Recorte para el botón "Reproducir": un <clipPath> con un rect cuyo
    // ancho se anima de 0 a IW revela las DOS líneas en sincronía por
    // posición X (o sea por año), sin importar que cada trazo tenga un
    // largo real distinto — la alternativa típica (stroke-dasharray/
    // -dashoffset por trazo) las revelaría a velocidades distintas porque
    // el largo del trazo depende de cuánto sube y baja, no solo del año.
    // El id incluye un azar para no chocar con el de un render anterior que
    // el navegador todavía no haya limpiado.
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
    grupoLineas
      .append('path')
      .datum(serieCriminal)
      .attr('d', lineGen)
      .attr('class', 'linea-tiempo-casos-linea-trazo')
      .attr('stroke', colorCriminal);
    grupoLineas
      .append('path')
      .datum(serieNoCriminal)
      .attr('d', lineGen)
      .attr('class', 'linea-tiempo-casos-linea-trazo')
      .attr('stroke', colorNoCriminal);

    // Sin un puntito por año fijo (con ~300 años en el eje sería puro
    // ruido): la guía vertical y los dos puntos de foco solo aparecen bajo
    // el cursor (o siguiendo la animación de "Reproducir"), siguiendo el
    // mismo patrón de tooltip que el resto del dashboard (ver
    // renderizarSpike en CrimenesPorTipo.ts).
    const guia = g
      .append('line')
      .attr('class', 'linea-tiempo-casos-linea-guia')
      .attr('y1', 0)
      .attr('y2', IH)
      .style('display', 'none');
    const focoCriminal = g
      .append('circle')
      .attr('r', 4)
      .attr('fill', colorCriminal)
      .style('display', 'none');
    const focoNoCriminal = g
      .append('circle')
      .attr('r', 4)
      .attr('fill', colorNoCriminal)
      .style('display', 'none');

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-grafico tooltip-grafico--sans';
    contenedorLinea.appendChild(tooltip);

    // Comparte la posición del foco (guía + puntos + tooltip) entre el
    // hover del mouse y la animación de "Reproducir" — ambos solo difieren
    // en QUIÉN decide el año a mostrar.
    function moverFocoA(anioBruto: number) {
      const anio = Math.min(anioHasta, Math.max(anioDesde, Math.round(anioBruto)));
      const idx = anio - anioDesde;
      const vCriminal = serieCriminal[idx];
      const vNoCriminal = serieNoCriminal[idx];
      const xPix = x(anio);
      guia.attr('x1', xPix).attr('x2', xPix).style('display', null);
      focoCriminal.attr('cx', xPix).attr('cy', y(vCriminal)).style('display', null);
      focoNoCriminal.attr('cx', xPix).attr('cy', y(vNoCriminal)).style('display', null);
      tooltip.innerHTML = `<strong>${anio}</strong><br/>Delito criminal: ${vCriminal.toLocaleString('es')}<br/>No criminal: ${vNoCriminal.toLocaleString('es')}`;
      tooltip.classList.add('tooltip-grafico--visible');
      return xPix;
    }

    function ocultarFoco() {
      guia.style('display', 'none');
      focoCriminal.style('display', 'none');
      focoNoCriminal.style('display', 'none');
      tooltip.classList.remove('tooltip-grafico--visible');
    }

    // Mientras "Reproducir" está animando, el hover del mouse se ignora
    // (si no, el mousemove del usuario pelearía con el foco automático).
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

    // Botón "Reproducir": anima el recorte de 0 a IW para revelar las
    // líneas de a poco (año por año) en vez de mostrarlas ya completas, así
    // se alcanza a ver cómo va cambiando la tendencia en vez de solo el
    // resultado final. La duración escala con la cantidad de años (más
    // años, más tiempo para poder seguirlos), acotada para que ni un rango
    // corto se sienta instantáneo ni uno largo (todo el corpus) se haga
    // eterno.
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

    // Dominio real de la barra: todo el rango de décadas filtrado, no solo
    // los años con casos — así un hueco sin casos se ve como un hueco real
    // en el eje, en vez de comprimirse.
    anioMinActual = decadaDesde;
    anioMaxActual = decadaHasta + 9;

    const porAnio = d3.group(casos, (c) => c.anioDesde);
    // Solo entran al roll los años que sí tienen casos: si hay un crimen
    // filtrado y ese delito solo aparece en un puñado de años sueltos, no
    // tiene sentido mostrar de por medio todos los años vacíos.
    const aniosConCasos = [...porAnio.keys()].sort((a, b) => a - b);

    aniosConCasos.forEach((anio) => {
      const casosAnio = porAnio.get(anio)!;

      const fila = document.createElement('div');
      fila.className = 'linea-tiempo-casos-anio';

      // Los puntos van arriba y el año abajo (align-items: flex-end en el
      // contenedor los alinea por abajo; ver dibujar()/CSS) — un año con
      // muchos casos crece hacia arriba en vez de recortar puntos.
      const circulos = document.createElement('div');
      circulos.className = 'linea-tiempo-casos-anio-circulos';
      casosAnio.forEach((caso) => {
        const punto = document.createElement('button');
        punto.type = 'button';
        punto.className = caso.esCriminal
          ? 'linea-tiempo-casos-punto'
          : 'linea-tiempo-casos-punto linea-tiempo-casos-punto--no-criminal';
        const rango =
          caso.anioDesde === caso.anioHasta
            ? `${caso.anioDesde}`
            : `${caso.anioDesde}–${caso.anioHasta}`;
        punto.title = `${caso.lugar || 'Sin información'} · ${rango}${caso.esCriminal ? '' : ' · No criminal'}`;
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

    // Ver el comentario junto a la declaración de espaciadorFinal: un
    // padding-right en `contenido` no alcanza a ser parte del contenido
    // desbordado, así que el "colchón" final es un hijo real.
    espaciadorFinal = document.createElement('div');
    espaciadorFinal.className = 'linea-tiempo-casos-espaciador';
    contenido.appendChild(espaciadorFinal);

    filas = [...contenido.querySelectorAll<HTMLElement>('.linea-tiempo-casos-anio')];
    recolocarColumnas();

    // scrollTop directo pisaría el estado interno de Lenis (que anima su
    // propio scroll objetivo); scrollTo(..., { immediate: true }) lo
    // mantiene sincronizado con el reinicio del render. Con el margen de
    // la primera columna (ver recolocarColumnas), quedarse en scrollLeft 0
    // ya centra el primer año (activo desde el arranque), no solo lo deja
    // asomado en el borde.
    lenis.scrollTo(0, { immediate: true });
    actualizarDesvanecido();

    nota.textContent = `${casos.length.toLocaleString('es')} caso${casos.length === 1 ? '' : 's'} en ${aniosConCasos.length} año${aniosConCasos.length === 1 ? '' : 's'} · clic en un punto para ver el detalle`;
  }

  window.__actualizarLineaTiempoCasosDashboard = dibujar;

  container.appendChild(wrapper);
  dibujar();
}
