import * as d3 from 'd3';
import Lenis from 'lenis';
import { esLinajeCriminal } from './linajeComun.js';
import type { FilaCsv } from './agentesComun.js';

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

// Alto de referencia (no fijo: ver dibujar()) para dimensionar la ventana
// visible y la velocidad de desvanecido. El año más cercano al centro se ve
// nítido y grande; los de alrededor se van desvaneciendo con la distancia
// (ver actualizarDesvanecido) — efecto de rueda selectora, no una lista
// plana. A diferencia de antes, cada fila de año NO tiene una altura fija:
// un año con muchos casos crece (varias líneas de puntos) en vez de
// recortarlos, así que ALTO_FILA_BASE ya no es "la" altura de fila, sino
// solo la unidad usada para calcular cuántas filas típicas (de un solo
// renglón de puntos) entran en la ventana.
const ALTO_FILA_BASE = 72;
const FILAS_VISIBLES = 4;
const ALTO_LISTA = ALTO_FILA_BASE * FILAS_VISIBLES;

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

  // cuerpo centra la columna de la rueda; al mostrarse la tarjeta de detalle
  // a la derecha, ese mismo centrado hace que la rueda se corra un poco a
  // la izquierda para dejarle sitio (sin animar nada a mano).
  const cuerpo = document.createElement('div');
  cuerpo.className = 'linea-tiempo-casos-cuerpo';
  wrapper.appendChild(cuerpo);

  const columnaIzq = document.createElement('div');
  columnaIzq.className = 'linea-tiempo-casos-columna-izq';
  cuerpo.appendChild(columnaIzq);

  const lista = document.createElement('div');
  lista.className = 'linea-tiempo-casos-lista';
  lista.style.maxHeight = `${ALTO_LISTA}px`;
  columnaIzq.appendChild(lista);

  // Lenis necesita un único hijo directo que envuelva todo el contenido
  // desplazable (ver README de lenis: wrapper/content).
  const contenido = document.createElement('div');
  contenido.className = 'linea-tiempo-casos-lista-contenido';
  lista.appendChild(contenido);

  const lenis = new Lenis({ wrapper: lista, content: contenido, duration: 1 });

  // Filas actualmente en el roll, en orden — se recalcula en cada dibujar().
  // El desvanecido corre en el mismo raf de Lenis: en vez de un observer
  // binario (activo/no activo), la opacidad de cada fila depende de qué tan
  // lejos está su centro del centro de la ventana visible.
  let filas: HTMLElement[] = [];

  // Con filas de alto variable (ver dibujar()) la posición de cada una ya no
  // se puede calcular como índice × alto fijo — se usa su offsetTop/
  // offsetHeight real. Con como mucho unos pocos cientos de años en el roll,
  // recorrerlas todas en cada frame sigue siendo barato.
  function actualizarDesvanecido() {
    if (filas.length === 0) return;
    const centroVentana = lista.scrollTop + ALTO_LISTA / 2;

    let indiceActivo = 0;
    let menorDistancia = Infinity;
    const distancias = filas.map((fila) => {
      const centroFila = fila.offsetTop + fila.offsetHeight / 2;
      return Math.abs(centroFila - centroVentana);
    });
    distancias.forEach((distancia, i) => {
      if (distancia < menorDistancia) {
        menorDistancia = distancia;
        indiceActivo = i;
      }
    });

    filas.forEach((fila, i) => {
      const distanciaEnFilas = distancias[i] / ALTO_FILA_BASE;
      fila.style.opacity = Math.max(0.16, 1 - distanciaEnFilas * 0.32).toFixed(2);
      fila.classList.toggle('linea-tiempo-casos-anio--activo', i === indiceActivo);
    });
  }

  // Padding arriba/abajo del contenido para que el primer y el último año
  // puedan llegar al centro de la ventana visible (sin esto, el scroll se
  // corta cuando el borde del contenido toca el borde de la ventana, mucho
  // antes de que esas filas lleguen al centro — quedaban siempre desvanecidas,
  // nunca "activas"). Se recalcula cada vez que cambian las filas porque
  // depende del alto real de la primera y la última.
  function actualizarPaddingExtremos() {
    if (filas.length === 0) {
      contenido.style.paddingTop = '';
      contenido.style.paddingBottom = '';
      return;
    }
    const primera = filas[0];
    const ultima = filas[filas.length - 1];
    contenido.style.paddingTop = `${Math.max(0, ALTO_LISTA / 2 - primera.offsetHeight / 2)}px`;
    contenido.style.paddingBottom = `${Math.max(0, ALTO_LISTA / 2 - ultima.offsetHeight / 2)}px`;
  }

  function raf(time: number) {
    lenis.raf(time);
    actualizarDesvanecido();
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

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
    <ul class="linea-tiempo-casos-panel-caso__lista"></ul>
    <button type="button" class="linea-tiempo-casos-panel-caso__boton-mapa">Ver en el mapa</button>
    <button type="button" class="linea-tiempo-casos-panel-caso__boton-caso">Ver caso</button>
  `;
  cuerpo.appendChild(panelCaso);

  const elFecha = panelCaso.querySelector<HTMLElement>('.linea-tiempo-casos-panel-caso__fecha')!;
  const elLugar = panelCaso.querySelector<HTMLElement>('.linea-tiempo-casos-panel-caso__lugar')!;
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
    elLugar.textContent = caso.lugar || 'Lugar sin especificar';

    elLista.innerHTML = '';
    caso.filas.forEach((f) => {
      const nombre = linajeMap.get(f['Código']) || 'Sin código';
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

  function dibujar() {
    const filtros = window.__obtenerFiltrosCrimenesPorTipo?.() ?? null;
    const decadaDesde = filtros?.decadaDesde ?? decadaMinGlobal;
    const decadaHasta = filtros?.decadaHasta ?? ULTIMA_DECADA;

    const casos = calcularCasos(decadaDesde, decadaHasta);

    contenido.innerHTML = '';
    ocultarPopup();
    filas = [];

    if (casos.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'mapa-aviso-vacio mapa-aviso-vacio--compacto';
      aviso.textContent = 'Sin casos con los filtros actuales';
      contenido.appendChild(aviso);
      nota.textContent = '';
      return;
    }

    const porAnio = d3.group(casos, (c) => c.anioDesde);
    // Solo entran al roll los años que sí tienen casos: si hay un crimen
    // filtrado y ese delito solo aparece en un puñado de años sueltos, no
    // tiene sentido mostrar de por medio todos los años vacíos.
    const aniosConCasos = [...porAnio.keys()].sort((a, b) => a - b);

    aniosConCasos.forEach((anio) => {
      const casosAnio = porAnio.get(anio)!;

      const fila = document.createElement('div');
      fila.className = 'linea-tiempo-casos-anio';

      const numero = document.createElement('div');
      numero.className = 'linea-tiempo-casos-anio-numero';
      numero.textContent = String(anio);

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
        punto.title = `${caso.lugar || 'Lugar sin especificar'} · ${rango}${caso.esCriminal ? '' : ' · No criminal'}`;
        punto.addEventListener('click', () => mostrarPopup(caso));
        circulos.appendChild(punto);
      });

      fila.append(numero, circulos);
      contenido.appendChild(fila);
    });

    filas = [...contenido.querySelectorAll<HTMLElement>('.linea-tiempo-casos-anio')];
    actualizarPaddingExtremos();

    // scrollTop directo pisaría el estado interno de Lenis (que anima su
    // propio scroll objetivo); scrollTo(..., { immediate: true }) lo
    // mantiene sincronizado con el reinicio del render. Con el padding de
    // arriba, quedarse en scrollTop 0 ya centra el primer año (activo desde
    // el arranque), no solo lo deja asomado en el borde.
    lenis.scrollTo(0, { immediate: true });
    actualizarDesvanecido();

    nota.textContent = `${casos.length.toLocaleString('es')} caso${casos.length === 1 ? '' : 's'} en ${aniosConCasos.length} año${aniosConCasos.length === 1 ? '' : 's'} · clic en un punto para ver el detalle`;
  }

  window.__actualizarLineaTiempoCasosDashboard = dibujar;

  container.appendChild(wrapper);
  dibujar();
}
