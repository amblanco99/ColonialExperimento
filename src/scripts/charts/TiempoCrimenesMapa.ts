import * as d3 from 'd3';
import rewind from '@turf/rewind';
import { crearMapaBaseTopografico } from './mapaBaseTopografico.js';
import { colorDeCrimen } from './coloresCrimen.js';
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
    __limpiarFiltroCrimenSiCoincide?: (nombre: string) => void;
    __actualizarLineaTiempoCasosDashboard?: () => void;
    __resaltarCasoEnMapa?: (lugar: string) => void;
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

// Paleta categórica para el relleno de provincias (coropletas). Solo 4 tonos:
// el grafo de provincias vecinas (ver construirGruposColorProvincia) nunca
// necesita más de 4 — teorema de los cuatro colores — y este subconjunto de 4
// tonos (de los 8 de la paleta categórica estándar) es el único que pasa las
// seis verificaciones de accesibilidad para TODOS los pares sobre el fondo
// pergamino de este sitio (#f4ecd8): las combinaciones que incluyen amarillo
// junto con naranja o rojo fallan el piso de visión normal (ΔE < 15).
const PROVINCIA_FALLBACK = ['#2a78d6', '#1baf7a', '#008300', '#4a3aa7'];

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
function construirGruposColorProvincia(features: NodoMutable[]): number[] {
  const DECIMALES = 3; // ~111 m de precisión: suficiente para igualar vértices de una misma topología
  const claveDe = ([lon, lat]: [number, number]) => `${lon.toFixed(DECIMALES)},${lat.toFixed(DECIMALES)}`;

  function anillosDe(geom: NodoMutable): NodoMutable[] {
    if (!geom) return [];
    if (geom.type === 'Polygon') return geom.coordinates;
    if (geom.type === 'MultiPolygon') return geom.coordinates.flat();
    return [];
  }

  const puntosPorFeature = features.map((f) => {
    const set = new Set<string>();
    anillosDe(f.geometry).forEach((anillo: NodoMutable) =>
      anillo.forEach((pt: NodoMutable) => set.add(claveDe(pt))),
    );
    return set;
  });

  const n = features.length;
  const UMBRAL_VERTICES_COMPARTIDOS = 4;
  const vecinos: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let compartidos = 0;
      for (const clave of puntosPorFeature[i]) {
        if (puntosPorFeature[j].has(clave)) {
          compartidos++;
          if (compartidos >= UMBRAL_VERTICES_COMPARTIDOS) break;
        }
      }
      if (compartidos >= UMBRAL_VERTICES_COMPARTIDOS) {
        vecinos[i].add(j);
        vecinos[j].add(i);
      }
    }
  }

  // Coloreado greedy (Welsh–Powell): se colorea primero la provincia con más
  // vecinas, y a cada una se le asigna el color de menor índice que ninguna
  // de sus vecinas ya coloreadas esté usando.
  const orden = [...Array(n).keys()].sort((a, b) => vecinos[b].size - vecinos[a].size);
  const grupo = new Array(n).fill(-1);
  orden.forEach((i) => {
    const usados = new Set<number>();
    vecinos[i].forEach((j) => {
      if (grupo[j] !== -1) usados.add(grupo[j]);
    });
    let c = 0;
    while (usados.has(c)) c++;
    grupo[i] = c;
  });
  return grupo;
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

  const COLORES_PROVINCIA = PROVINCIA_FALLBACK.map((valor, i) =>
    leerVariableCss(`--mapa-provincia-${i + 1}`, valor),
  );

  const [NuevaGranadaRaw, rawCrimenes, rawLugar, rawLinaje] = await Promise.all([
    d3.json(`${import.meta.env.BASE_URL}data/NuevaGranada.json`),
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Lugar.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);

  // rewind() devuelve un union de tipos GeoJSON; aquí siempre es una
  // FeatureCollection, que es lo que trae NuevaGranada.json.
  const NuevaGranada = rewind(NuevaGranadaRaw as any, { reverse: true }) as any;

  const getDecada = (y: number) => Math.floor(y / 10) * 10;
  const decadaValida = (y: number) => y >= 1500 && y <= 1899;

  const coordPorLugar: Record<string, any> = {};
  // Lugar.csv escribe "null" como texto literal (no una celda vacía) para los
  // campos sin dato; valorONulo homogeniza ambos casos a `null` real, así el
  // resto del código (ver renderizarInfoLugares) nunca tiene que comparar
  // contra la cadena "null".
  function valorONulo(v: string | undefined): string | null {
    const limpio = (v || '').trim();
    return !limpio || limpio.toLowerCase() === 'null' ? null : limpio;
  }
  const infoPorLugar: Record<
    string,
    { clasificacion: string | null; pais: string | null; notas: string | null }
  > = {};
  rawLugar.forEach((d: FilaCsv) => {
    const nombre = d.Lugar?.trim();
    const lon = +d.Longitud;
    const lat = +d.Latitud;
    if (nombre && !isNaN(lon) && !isNaN(lat)) {
      coordPorLugar[nombre] = [lon, lat];
    }
    if (nombre) {
      infoPorLugar[nombre] = {
        clasificacion: valorONulo(d['Clasificación']),
        pais: valorONulo(d['País_Contemporáneo']),
        notas: valorONulo(d['Notas']),
      };
    }
  });

  const linajeFilas = rawLinaje.map((d: FilaCsv) => ({
    idCodigo: (d['ID_Código'] || '').trim(),
    nombre: (d.Nombre || '').trim(),
    nivel: (d.Nivel || '').trim(),
  }));
  const nombresGenerales = new Set(
    linajeFilas.filter((f: any) => f.nivel === 'Nivel 0').map((f: any) => f.nombre),
  );
  const ordenPorCodigo = new Map(linajeFilas.map((f, i) => [f.idCodigo, i]));

  // Código en crimenes.csv apunta a ID_Código en Linaje.csv (mismo join que
  // usa CrimenesPorTipo.ts): traduce cada código numérico a su nombre legible.
  // El mapa muestra todos los crímenes que aparecen en el corpus (no solo los
  // "delitos" penales): solo se descartan los que no traen Código, los que
  // caen en el linaje "No aplica" (Delitos, Sin codificar), y "No Casos"
  // (ID_Código 32: registros que no son casos propiamente).
  const LINAJE_NO_CASOS = '32';
  const linajeNombreMap = new Map(linajeFilas.map((f: any) => [f.idCodigo, f.nombre]));
  const tipoDelitoMap = new Map(rawLinaje.map((d: FilaCsv) => [d['ID_Código'], d.Tipo_delito]));

  const datosLimpios = rawCrimenes
    .filter((d: FilaCsv) => {
      if (!d.Año) return false;
      const codigo = valorONulo(d['Código']);
      return !!codigo && codigo !== LINAJE_NO_CASOS && tipoDelitoMap.get(codigo) !== 'No aplica';
    })
    .map((d: FilaCsv) => {
      const codigo = (d['Código'] || '').trim();
      const subcodigo = valorONulo(d['Sub_Código']) || codigo;
      const lugar = valorONulo(d.Lugar);
      return {
        ...d,
        año: +d.Año,
        decada: getDecada(+d.Año),
        lugar,
        coords: lugar ? coordPorLugar[lugar] || null : null,
        ID_Documento: d['ID_Crímen'],
        Código: codigo,
        'Sub_Código': subcodigo,
        Nombre_Codigo: linajeNombreMap.get(codigo) || 'Sin código',
        Nombre_Sub_Codigo: linajeNombreMap.get(subcodigo) || linajeNombreMap.get(codigo) || 'Sin código',
      };
    })
    .filter((d: FilaCsv) => d.lugar && decadaValida(d.año));

  // El período colonial documentado llega hasta 1824 (ver ULTIMO_ANIO_COLONIAL
  // más abajo). Se arma la lista de décadas de forma contigua entre la mínima
  // con datos y esa década final, en vez de tomar solo las décadas presentes
  // en los datos, para que el deslizador siempre llegue hasta el final del
  // corpus aunque la última década tenga pocos registros.
  const decadasConDatos = [...new Set(datosLimpios.map((d: FilaCsv) => d.decada))].sort(
    (a: NodoMutable, b: NodoMutable) => a - b,
  );
  const DECADAS: NodoMutable[] = [];
  for (let d = decadasConDatos[0] as number; d <= ULTIMA_DECADA; d += 10) {
    DECADAS.push(d);
  }

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

  const featuresProvincias = NuevaGranada.features ? NuevaGranada.features : [NuevaGranada];
  const nombreDeProvincia = (f: NodoMutable) => f.properties?.Nombre || 'Desconocida';

  function getProvincia(coords: [number, number]) {
    const feature = featuresProvincias.find((f: any) => d3.geoContains(f, coords));
    return feature ? nombreDeProvincia(feature) : 'Desconocida';
  }

  // Grupo de color por índice de feature (0..3, ver construirGruposColorProvincia)
  // y color final por nombre de provincia, para pintar cada polígono y para
  // resaltar la provincia elegida en el selector.
  const grupoColorPorIndiceProvincia = construirGruposColorProvincia(featuresProvincias);
  const colorPorNombreProvincia = new Map<string, string>();
  featuresProvincias.forEach((f: NodoMutable, i: number) => {
    colorPorNombreProvincia.set(
      nombreDeProvincia(f),
      COLORES_PROVINCIA[grupoColorPorIndiceProvincia[i] % COLORES_PROVINCIA.length],
    );
  });

  const provinciasLista = [...new Set(featuresProvincias.map(nombreDeProvincia))].sort();

  const lugaresLista = [...new Set(datosLimpios.map((d: FilaCsv) => d.lugar))].sort();

  // Provincia de cada lugar, según sus coordenadas (Lugar.csv) contenidas en
  // el polígono de la provincia (NuevaGranada.json). Sostiene el filtro
  // "Provincia": elegir una acota el combo "Lugar" a los territorios que
  // caen dentro de sus límites geográficos.
  const provinciaPorLugar: Record<string, string> = {};
  Object.entries(coordPorLugar).forEach(([lugar, coords]) => {
    provinciaPorLugar[lugar] = getProvincia(coords as [number, number]);
  });

  function lugaresDeProvincia(provincia: string) {
    if (provincia === 'Todos') return lugaresLista;
    return lugaresLista.filter((lugar: NodoMutable) => provinciaPorLugar[lugar] === provincia);
  }
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
    provincia: 'Todos',
    lugaresFijados: new Set(),
  };

  // El lugar que se fijó al elegirlo en el combo "Lugar" (ver
  // elegirLugarDesdeCombo). Se recuerda aparte para soltar solo ese al cambiar
  // de lugar, y no los que el usuario fijó haciendo clic en el mapa.
  let lugarFijadoPorCombo: string | null = null;

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

  function actualizarCrimenesPorTipo() {
    window.__actualizarCrimenesPorTipoDashboard?.();
    window.__actualizarLineaTiempoCasosDashboard?.();
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
      const okProvincia =
        estado.provincia === 'Todos' || provinciaPorLugar[d.lugar] === estado.provincia;
      return okCrimen && okSub && okLugar && okProvincia;
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

  // Un renglón por cada crimen que ocurrió en el lugar (mismos filtros que
  // datosReferenciaLugar), con el año o los años exactos en que pasó — para
  // la tarjeta de información de lugares fijados (ver renderizarInfoLugares).
  // La vista "Lugar" no distingue por subcrimen, solo por crimen.
  function resumenCrimenesLugar(lugar: string) {
    const [desde, hasta] = rangoDecadaActual();
    const filas = datosFiltradosBase().filter(
      (d: FilaCsv) => d.lugar === lugar && d.decada >= desde && d.decada <= hasta,
    );

    const grupos = new Map<
      string,
      { crimen: string; codigo: string; anios: Set<number>; casos: Set<string> }
    >();
    filas.forEach((d: FilaCsv) => {
      if (!grupos.has(d.Nombre_Codigo)) {
        grupos.set(d.Nombre_Codigo, {
          crimen: d.Nombre_Codigo,
          codigo: d['Código'],
          anios: new Set(),
          casos: new Set(),
        });
      }
      const grupo = grupos.get(d.Nombre_Codigo)!;
      grupo.anios.add(d.año);
      grupo.casos.add(d.ID_Caso);
    });

    return [...grupos.values()]
      .map((g) => ({
        crimen: g.crimen,
        codigo: g.codigo,
        anios: [...g.anios].sort((a, b) => a - b),
        casos: g.casos.size,
      }))
      .sort((a, b) => a.crimen.localeCompare(b.crimen));
  }

  function crearElemento<K extends keyof HTMLElementTagNameMap>(
    etiqueta: K,
    clase: string,
    texto?: string,
  ) {
    const el = document.createElement(etiqueta);
    el.className = clase;
    if (texto !== undefined) el.textContent = texto;
    return el;
  }

  const rangoAnios = (desde: number, hasta: number) =>
    desde === hasta ? `${desde}` : `${desde}–${hasta}`;

  // Ficha de un lugar fijado: datos del lugar (Lugar.csv y provincia), una
  // línea de tiempo con un punto por cada crimen y año, y la lista de crímenes
  // con sus años.
  function crearFichaLugar(lugar: string): HTMLElement {
    const info = infoPorLugar[lugar];
    const ficha = crearElemento('div', 'lugar-ficha');
    ficha.appendChild(crearElemento('h3', 'lugar-ficha-titulo', lugar));

    // Solo los datos que existen: Lugar.csv trae "null" en muchos.
    const datos: [string, string | null | undefined][] = [
      ['Clasificación', info?.clasificacion],
      ['Provincia', provinciaPorLugar[lugar]],
      ['País contemporáneo', info?.pais],
    ];
    const presentes = datos.filter((d): d is [string, string] => !!d[1]);
    if (presentes.length > 0) {
      const lista = crearElemento('dl', 'lugar-ficha-datos');
      presentes.forEach(([etiqueta, valor]) => {
        const bloque = crearElemento('div', 'lugar-ficha-dato');
        bloque.append(
          crearElemento('dt', 'lugar-ficha-dato-etiqueta', etiqueta),
          crearElemento('dd', 'lugar-ficha-dato-valor', valor),
        );
        lista.appendChild(bloque);
      });
      ficha.appendChild(lista);
    }
    if (info?.notas) ficha.appendChild(crearElemento('p', 'lugar-ficha-notas', info.notas));

    const detalle = resumenCrimenesLugar(lugar);
    if (detalle.length === 0) {
      ficha.appendChild(
        crearElemento('p', 'lugar-ficha-vacio', 'Sin casos con los filtros actuales.'),
      );
      return ficha;
    }

    const todosLosAnios = detalle.flatMap((r) => r.anios);
    const anioMin = Math.min(...todosLosAnios);
    const anioMax = Math.max(...todosLosAnios);

    const encabezado = crearElemento('div', 'lugar-ficha-encabezado');
    encabezado.append(
      crearElemento('h4', 'lugar-ficha-subtitulo', 'Crímenes documentados'),
      crearElemento(
        'span',
        'lugar-ficha-resumen',
        `${detalle.length} ${detalle.length === 1 ? 'tipo' : 'tipos'} · ${rangoAnios(anioMin, anioMax)}`,
      ),
    );
    ficha.appendChild(encabezado);

    // Línea de tiempo: un punto por cada crimen y año, en su posición real.
    const linea = crearElemento('div', 'lugar-ficha-linea');
    const eje = crearElemento('div', 'lugar-ficha-linea-eje');
    detalle.forEach((r) => {
      r.anios.forEach((anio) => {
        const punto = crearElemento('span', 'lugar-ficha-linea-punto');
        const pos = anioMax === anioMin ? 50 : ((anio - anioMin) / (anioMax - anioMin)) * 100;
        punto.style.left = `${pos}%`;
        punto.style.background = colorDeCrimen(r.codigo);
        punto.title = `${anio} · ${r.crimen.trim()}`;
        eje.appendChild(punto);
      });
    });
    linea.appendChild(eje);
    const etiquetasAnio = crearElemento('div', 'lugar-ficha-linea-anios');
    etiquetasAnio.append(
      crearElemento('span', '', String(anioMin)),
      ...(anioMax === anioMin ? [] : [crearElemento('span', '', String(anioMax))]),
    );
    linea.appendChild(etiquetasAnio);
    ficha.appendChild(linea);

    // Un renglón por crimen; lleva a la tabla general filtrada por este
    // lugar y este crimen — mismo destino que "Ver casos" en el resto del
    // dashboard (ver irATablasFiltradas).
    const lista = crearElemento('ul', 'lugar-ficha-lista');
    detalle.forEach((r) => {
      const li = crearElemento('li', 'lugar-ficha-crimen');
      li.tabIndex = 0;
      li.setAttribute('role', 'link');
      li.setAttribute('aria-label', `Ver los casos de ${r.crimen.trim()} en ${lugar}`);

      const nombre = crearElemento('span', 'lugar-ficha-crimen-nombre');
      const puntoCrimen = crearElemento('i', 'lugar-ficha-punto');
      puntoCrimen.style.background = colorDeCrimen(r.codigo);
      nombre.append(puntoCrimen, r.crimen.trim());
      const casos = crearElemento(
        'span',
        'lugar-ficha-crimen-casos',
        `${r.casos} ${r.casos === 1 ? 'caso' : 'casos'}`,
      );
      const anios = crearElemento('span', 'lugar-ficha-anios');
      r.anios.forEach((anio) => anios.appendChild(crearElemento('span', 'lugar-ficha-anio', String(anio))));

      li.append(nombre, casos, anios);
      const ir = () => irATablasFiltradas({ lugar, codigo: r.crimen, subcodigo: null });
      li.addEventListener('click', ir);
      li.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          ir();
        }
      });
      lista.appendChild(li);
    });
    ficha.appendChild(lista);

    return ficha;
  }

  // Una sola tarjeta con una ficha por lugar fijado (estado.lugaresFijados),
  // debajo de "Evolución en el tiempo". Con más de un lugar fijado, las
  // fichas van una debajo de la otra, separadas por un divisor, dentro de la
  // MISMA tarjeta — no una tarjeta por lugar.
  function renderizarInfoLugares() {
    if (!contenedorInfoLugares) return;
    contenedorInfoLugares.innerHTML = '';

    [...estado.lugaresFijados].forEach((lugar: NodoMutable, i: number) => {
      if (i > 0) contenedorInfoLugares!.appendChild(crearElemento('div', 'mapa-tarjeta-divisor'));
      contenedorInfoLugares!.appendChild(crearFichaLugar(lugar));
    });
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
          porCodigo: new Map<string, number>(),
        };
      }
      map[key].docs.add(d.ID_Documento);
      const codigo = d['Código'];
      map[key].porCodigo.set(codigo, (map[key].porCodigo.get(codigo) || 0) + 1);
    });

    return Object.values(map).map((r: any) => {
      // El crimen predominante del punto: el de más participaciones dentro
      // del rango de décadas y filtros actuales — determina el color del
      // círculo (ver colorDe en actualizarMapa).
      let codigoPredominante: string | null = null;
      let maxConteo = 0;
      r.porCodigo.forEach((n: number, codigo: string) => {
        if (n > maxConteo) {
          maxConteo = n;
          codigoPredominante = codigo;
        }
      });
      return {
        ...r,
        count: r.docs.size,
        codigoPredominante,
      };
    });
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

  let layoutLugar = document.getElementById('mapa-lugar-layout');
  if (!layoutLugar) {
    layoutLugar = document.createElement('div');
    layoutLugar.id = 'mapa-lugar-layout';
  }
  layoutLugar.classList.add('mapa-lugar-layout');

  // Columna del mapa: ocupa todo el ancho y queda centrada mientras no haya
  // ningún lugar fijado (ver actualizarVisibilidadSpike). Al fijar el primer
  // lugar, el mapa se recorre a la izquierda para dejar sitio a la columna
  // del spike ("Evolución en el tiempo").
  const columnaMapa = document.createElement('div');
  columnaMapa.className = 'mapa-lugar-col-mapa';
  columnaMapa.appendChild(
    envolverEnTarjeta(
      mapaContenedor,
      'Distribución geográfica',
      'Haz clic en un punto para fijarlo y compararlo',
    ),
  );
  layoutLugar.appendChild(columnaMapa);

  // Columna del spike: arranca oculta (mapa-lugar-col-spike--oculta) y solo
  // se revela cuando estado.lugaresFijados deja de estar vacío, ver
  // actualizarVisibilidadSpike() más abajo.
  let columnaSpike: HTMLElement | null = null;
  // Una sola tarjeta con la información de todos los lugares fijados, debajo
  // de "Evolución en el tiempo" (ver renderizarInfoLugares): clasificación,
  // país contemporáneo y notas de cada lugar (Lugar.csv), más el detalle de
  // crímenes/subcrímenes y sus años según los filtros vigentes. Con más de
  // un lugar fijado, cada uno es una sección dentro de esta misma tarjeta.
  let contenedorInfoLugares: HTMLElement | null = null;
  if (contenedorLineasEl) {
    columnaSpike = document.createElement('div');
    columnaSpike.className = 'mapa-lugar-col-spike mapa-lugar-col-spike--oculta';
    columnaSpike.appendChild(
      envolverEnTarjeta(
        contenedorLineasEl,
        'Evolución en el tiempo',
        'Casos por década según el rango seleccionado',
      ),
    );
    contenedorInfoLugares = document.createElement('div');
    contenedorInfoLugares.id = 'info-lugares-fijados';
    contenedorInfoLugares.className = 'mapa-tarjeta mapa-info-lugares';
    columnaSpike.appendChild(contenedorInfoLugares);
    layoutLugar.appendChild(columnaSpike);
  }

  // También se revela con una provincia elegida (sin necesidad de fijar un
  // lugar puntual): buildSerieTotal() ya respeta estado.provincia a través
  // de datosFiltradosBase(), así que alcanza con mostrar la columna — el
  // contenido sale solo.
  function actualizarVisibilidadSpike() {
    const hayLugarSeleccionado = estado.lugaresFijados.size > 0 || estado.provincia !== 'Todos';
    layoutLugar!.classList.toggle('mapa-lugar-layout--con-spike', hayLugarSeleccionado);
    columnaSpike?.classList.toggle('mapa-lugar-col-spike--oculta', !hayLugarSeleccionado);
  }

  if (dashboardWrap) {
    dashboardWrap.classList.add('mapa-dashboard-wrap');
    dashboardWrap.appendChild(layoutLugar);
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

    function establecerValor(valor: string) {
      input.value = valor;
    }

    return { wrap, actualizarOpciones, establecerValor };
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
  // Compartida con window.__limpiarFiltroCrimenSiCoincide más abajo: mismos
  // efectos secundarios elija el usuario en el <select> o se dispare desde
  // CrimenesPorTipo.ts al desfijar un crimen que coincide con el filtro.
  function establecerCrimen(nombre: string) {
    estado.crimen = nombre;
    selectCrimen.value = nombre;
    estado.subcrimen = 'Todos';
    comboSubcrimen.actualizarOpciones(subcrimenesParaCrimen(estado.crimen));
    actualizarMapa();
    actualizarPanelSecundario(true);
    actualizarCrimenesPorTipo();
  }
  selectCrimen.addEventListener('change', (e) => {
    establecerCrimen((e.target as HTMLInputElement).value);
  });
  wrapCrimen.append(labelCrimen, selectCrimen);
  panelFiltros!.appendChild(wrapCrimen);

  // CrimenesPorTipo.ts llama esto al desfijar un crimen (× de un chip o
  // "Quitar selección"): si el filtro compartido de arriba seguía apuntando
  // justo a ese crimen (porque fue lo que lo fijó, ver
  // __obtenerFiltrosCrimenesPorTipo), lo vuelve a "Todos" — si no, no toca
  // nada (pudo haberse fijado con un clic en su barra, sin pasar por acá).
  window.__limpiarFiltroCrimenSiCoincide = function (nombre: string) {
    if (estado.crimen === nombre) establecerCrimen('Todos');
  };

  // Filtro oculto en las tres vistas ("Lugar" no habla de subcrímenes, ver
  // renderizarInfoLugares/buildSerieTotal; "Línea de tiempo" y "Crímenes"
  // ya no lo muestran en la barra de filtros, ver mostrarVista en
  // index.astro): el estado sigue existiendo (estado.subcrimen), solo que
  // ninguna vista deja elegirlo desde acá. En "Crímenes", seleccionar un
  // crimen específico en el filtro compartido de arriba dispara la misma
  // selección que un clic en su barra (ver __obtenerFiltrosCrimenesPorTipo
  // y renderizar() en CrimenesPorTipo.ts).
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
  comboSubcrimen.wrap.id = 'filtro-subcrimen-wrap';
  comboSubcrimen.wrap.classList.add('mapa-vista--oculta');

  // Al elegir una provincia se acotan las opciones de "Lugar" a los
  // territorios que caen dentro de sus límites (provinciaPorLugar, calculado
  // por lat/long contra el polígono de la provincia) y el mapa hace zoom a
  // su recuadro; ver actualizarResaltadoProvincia/zoomAProvincia más abajo.
  const comboProvincia = crearComboBuscable({
    etiqueta: 'Provincia',
    opciones: provinciasLista,
    valorInicial: estado.provincia,
    onChange: (valor: any) => {
      estado.provincia = valor;
      soltarLugarDelCombo();
      estado.lugar = 'Todos';
      comboLugar.actualizarOpciones(lugaresDeProvincia(valor));
      actualizarVisibilidadBotonLimpiar();
      actualizarMapa();
      actualizarPanelSecundario(true);
      actualizarVisibilidadSpike();
      actualizarCrimenesPorTipo();
      actualizarResaltadoProvincia();
      zoomAProvincia(valor);
    },
  });
  comboProvincia.wrap.id = 'filtro-provincia-wrap';

  // Id fijo: tiempo/index.astro lo usa para ocultar este filtro solo en la
  // vista "Línea de tiempo" (ahí no aplica, ver mostrarVista()).
  const comboLugar = crearComboBuscable({
    etiqueta: 'Lugar',
    opciones: lugaresLista,
    valorInicial: estado.lugar,
    onChange: (valor: string) => elegirLugarDesdeCombo(valor),
  });
  comboLugar.wrap.id = 'filtro-lugar-wrap';

  function soltarLugarDelCombo() {
    if (lugarFijadoPorCombo) estado.lugaresFijados.delete(lugarFijadoPorCombo);
    lugarFijadoPorCombo = null;
  }

  // Elegir un lugar en el combo equivale a hacer clic en su punto del mapa:
  // además de filtrar por ese lugar, se fija — aparece su línea "Evolución en
  // el tiempo", su ficha y el botón para quitar la selección. Si el lugar ya
  // estaba fijado por un clic, no se toca ese pin. Elegir otro lugar suelta el
  // anterior; elegir "Todos" lo suelta sin fijar nada.
  function elegirLugarDesdeCombo(valor: string) {
    soltarLugarDelCombo();
    estado.lugar = valor;
    if (valor !== 'Todos' && !estado.lugaresFijados.has(valor)) {
      estado.lugaresFijados.add(valor);
      lugarFijadoPorCombo = valor;
    }
    actualizarVisibilidadBotonLimpiar();
    actualizarMapa();
    actualizarPanelSecundario(true);
    actualizarVisibilidadSpike();
    actualizarCrimenesPorTipo();
  }

  const btnLimpiarPines = document.createElement('button');
  btnLimpiarPines.type = 'button';
  btnLimpiarPines.textContent = 'Quitar selección';
  btnLimpiarPines.className = 'btn-mapa-limpiar';
  btnLimpiarPines.addEventListener('click', () => {
    estado.lugaresFijados.clear();
    lugarFijadoPorCombo = null;
    const habiaLugarElegido = estado.lugar !== 'Todos';
    if (habiaLugarElegido) {
      estado.lugar = 'Todos';
      comboLugar.establecerValor('Todos');
    }
    limpiarMarcadorCaso();
    actualizarVisibilidadBotonLimpiar();
    actualizarMapa();
    actualizarPanelSecundario(true);
    actualizarVisibilidadSpike();
    if (habiaLugarElegido) actualizarCrimenesPorTipo();
  });
  panelFiltros!.appendChild(btnLimpiarPines);

  // Además de los lugares fijados (comparación), este botón también limpia
  // el marcador rojo "estás aquí" que deja __resaltarCasoEnMapa (ver más
  // abajo) — sin esto, el marcador podía quedar pegado sobre su punto sin
  // ninguna forma de sacarlo. hayMarcadorCaso y limpiarMarcadorCaso se
  // definen junto a gMarcadorCaso más abajo; se pueden referenciar acá porque
  // esta función solo se ejecuta al hacer clic, después de que todo el
  // dashboard ya se inicializó.
  function actualizarVisibilidadBotonLimpiar() {
    btnLimpiarPines.classList.toggle(
      'btn-mapa--visible',
      estado.lugaresFijados.size > 0 || estado.lugar !== 'Todos' || hayMarcadorCaso,
    );
  }

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
  // Grosor del borde entre provincias en unidades de viewBox (a k=1, sin
  // zoom); el handler de zoom lo divide entre k para que se vea igual de
  // grueso en pantalla sin importar el nivel de zoom. Más grueso solo con el
  // mapa topográfico de fondo activo (ver mapaBaseVisible más abajo); en el
  // mapa normal se mantiene el grosor de siempre.
  const GROSOR_BORDE_PROVINCIA_NORMAL = 0.5;
  const GROSOR_BORDE_PROVINCIA_TOPOGRAFICO = 1.5;
  const rScale = d3.scaleLog().range([RADIO_PUNTO, 18]);
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

  const btnMapaBase = document.createElement('button');
  btnMapaBase.type = 'button';
  btnMapaBase.textContent = 'Mapa topográfico de fondo';
  btnMapaBase.className = 'btn-mapa-base-topografico';
  mapaContenedor.appendChild(btnMapaBase);

  // El SVG y el mapa base de OpenLayers (ver abajo) comparten este lienzo:
  // mismo recuadro, superpuestos, con el SVG encima (todo el pan/zoom/hover
  // sigue siendo de d3, el mapa base solo se sincroniza con él — no tiene
  // interacciones propias, ver mapaBaseTopografico.ts).
  const mapaLienzo = document.createElement('div');
  mapaLienzo.className = 'mapa-lienzo';
  mapaContenedor.appendChild(mapaLienzo);

  const mapaBaseDiv = document.createElement('div');
  mapaBaseDiv.className = 'mapa-base-topografico';
  mapaBaseDiv.style.display = 'none';
  mapaLienzo.appendChild(mapaBaseDiv);

  const svgMapa = d3
    .select(mapaLienzo)
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

  const tooltipProvincia = document.createElement('div');
  tooltipProvincia.className = 'tooltip-grafico tooltip-grafico--sans';
  mapaContenedor.appendChild(tooltipProvincia);

  gMapaBase
    .selectAll('path')
    .data(featuresProvincias)
    .join('path')
    .attr('d', path as any)
    .attr('fill', (f: NodoMutable) => colorPorNombreProvincia.get(nombreDeProvincia(f)) as string)
    .attr('stroke', PALETA.borde)
    .attr('stroke-opacity', 0.7)
    .attr('class', 'mapa-provincia')
    .on('mouseenter', function (this: NodoMutable, _event: MouseEvent, f: NodoMutable) {
      d3.select(this).classed('mapa-provincia--hover', true);
      tooltipProvincia.textContent = nombreDeProvincia(f);
      tooltipProvincia.classList.add('tooltip-grafico--visible');
    })
    .on('mousemove', (event: MouseEvent) => {
      const rect = mapaContenedor.getBoundingClientRect();
      tooltipProvincia.style.left = event.clientX - rect.left + 12 + 'px';
      tooltipProvincia.style.top = event.clientY - rect.top + 12 + 'px';
    })
    .on('mouseleave', function (this: NodoMutable) {
      d3.select(this).classed('mapa-provincia--hover', false);
      tooltipProvincia.classList.remove('tooltip-grafico--visible');
    });

  const gPuntos = gZoom.append('g').attr('class', 'capa-puntos');
  const gCapsulas = gZoom.append('g').attr('class', 'capa-capsulas');
  const gMarcadorCaso = gZoom.append('g').attr('class', 'capa-marcador-caso');

  // Refleja si __resaltarCasoEnMapa dejó el marcador rojo puesto; controla,
  // junto con estado.lugaresFijados, si "Quitar selección" debe mostrarse
  // (ver actualizarVisibilidadBotonLimpiar más arriba) y qué limpia al
  // hacerle clic.
  let hayMarcadorCaso = false;
  function limpiarMarcadorCaso() {
    gMarcadorCaso.selectAll('*').remove();
    hayMarcadorCaso = false;
  }

  let lugarHoverActivo: NodoMutable = null;

  // Mapa base de OpenLayers (tiles de OpenTopoMap): opcional, oculto por
  // defecto, creado recién al activarlo por primera vez (ver btnMapaBase más
  // abajo). Mientras está visible se sincroniza en cada evento de zoom de d3
  // (más abajo) para mostrar siempre el mismo recuadro que el SVG.
  let mapaBase: ReturnType<typeof crearMapaBaseTopografico> | null = null;
  let mapaBaseVisible = false;

  const zoom = d3
    .zoom()
    .scaleExtent([1, 12])
    .on('zoom', (event: any) => {
      gZoom.attr('transform', event.transform);
      const k = event.transform.k;
      const grosorBorde = mapaBaseVisible
        ? GROSOR_BORDE_PROVINCIA_TOPOGRAFICO
        : GROSOR_BORDE_PROVINCIA_NORMAL;
      gMapaBase.selectAll('path').attr('stroke-width', grosorBorde / k);
      gPuntos.selectAll('circle').attr('stroke-width', 0.5 / k);
      dibujarCapsulasFijadas();
      if (lugarHoverActivo) {
        gCapsulas.selectAll('g.capsula-hover').remove();
        const gTemp = gCapsulas.append('g').attr('class', 'capsula-hover');
        construirCapsula(gTemp, lugarHoverActivo.lugar, lugarHoverActivo.coords);
      }
      if (mapaBaseVisible && mapaBase) {
        mapaBase.sincronizar({ projection, transform: event.transform, width, height });
      }
    });

  svgMapa.call(zoom as any);

  btnMapaBase.addEventListener('click', () => {
    mapaBaseVisible = !mapaBaseVisible;
    btnMapaBase.classList.toggle('btn-mapa--activo', mapaBaseVisible);
    svgMapa.classed('mapa-svg--fondo-transparente', mapaBaseVisible);
    // Con el mapa topográfico de fondo, las provincias quedan solo de
    // contorno (sin relleno, borde blanco y más grueso) para no taparlo —
    // se ven sus límites y los puntos; en el mapa normal el borde vuelve a
    // ser el de siempre.
    gMapaBase.selectAll('path').classed('mapa-provincia--sin-relleno', mapaBaseVisible);
    const kActual = d3.zoomTransform(svgMapa.node()!).k;
    const grosorBordeActual = mapaBaseVisible
      ? GROSOR_BORDE_PROVINCIA_TOPOGRAFICO
      : GROSOR_BORDE_PROVINCIA_NORMAL;
    gMapaBase.selectAll('path').attr('stroke-width', grosorBordeActual / kActual);
    if (mapaBaseVisible) {
      if (!mapaBase) mapaBase = crearMapaBaseTopografico(mapaBaseDiv);
      const t = d3.zoomTransform(svgMapa.node()!);
      mapaBase.sincronizar({ projection, transform: t, width, height });
      mapaBase.mostrar();
    } else {
      mapaBase?.ocultar();
    }
  });

  // Resalta con un trazo más marcado la provincia elegida en el selector
  // (ver comboProvincia más arriba); no toca el relleno, que ya distingue
  // cada provincia de sus vecinas.
  function actualizarResaltadoProvincia() {
    gMapaBase
      .selectAll('path')
      .classed(
        'mapa-provincia--seleccionada',
        (f: NodoMutable) => nombreDeProvincia(f) === estado.provincia,
      );
  }

  // Centra y hace zoom al recuadro de la provincia elegida; sin provincia
  // ("Todos") vuelve a la vista completa.
  function zoomAProvincia(nombreProvincia: string) {
    if (nombreProvincia === 'Todos') {
      svgMapa.transition().duration(600).call(zoom.transform as any, d3.zoomIdentity);
      return;
    }
    const feature = featuresProvincias.find(
      (f: NodoMutable) => nombreDeProvincia(f) === nombreProvincia,
    );
    if (!feature) return;
    const [[lonMin, latMin], [lonMax, latMax]] = d3.geoBounds(feature);
    const [x0, y1] = projection([lonMin, latMin])!;
    const [x1, y0] = projection([lonMax, latMax])!;
    const anchoBox = Math.max(Math.abs(x1 - x0), 1);
    const altoBox = Math.max(Math.abs(y1 - y0), 1);
    const escala = Math.min(6, 0.82 * Math.min(width / anchoBox, height / altoBox));
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(escala)
      .translate(-cx, -cy);
    svgMapa.transition().duration(600).call(zoom.transform as any, transform);
  }

  // Hook para LineaTiempoCasos.ts: su botón "Ver en el mapa" cambia a la
  // vista "Lugar" (ver __irAVistaLugar en index.astro) y llama a este, que
  // centra el mapa en el lugar del caso y deja un marcador rojo persistente
  // (independiente de los puntos normales, que ahora se pintan por
  // colorDeCrimen).
  window.__resaltarCasoEnMapa = function (lugar: string) {
    const coords = coordPorLugar[lugar];
    if (!coords) return;
    const destino = projection(coords);
    if (!destino) return;
    const [px, py] = destino;
    const escala = 4;
    const transform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(escala)
      .translate(-px, -py);
    svgMapa.transition().duration(600).call(zoom.transform as any, transform);

    gMarcadorCaso.selectAll('*').remove();
    gMarcadorCaso
      .append('circle')
      .attr('cx', px)
      .attr('cy', py)
      .attr('r', 10 / escala)
      .attr('class', 'mapa-marcador-caso-halo');
    gMarcadorCaso
      .append('circle')
      .attr('cx', px)
      .attr('cy', py)
      .attr('r', 4 / escala)
      .attr('class', 'mapa-marcador-caso-punto');

    hayMarcadorCaso = true;
    actualizarVisibilidadBotonLimpiar();
  };

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
    const radioDe = (d: FilaCsv) => (escalarPorCantidad ? rScale(d.count) : RADIO_PUNTO);
    // El color ya no depende de "Tamaño según cantidad de crímenes": el
    // círculo siempre se pinta del color de su crimen predominante (ver
    // agruparMapaInstante), para que coincida con el mismo crimen en el
    // resto del sitio (ver coloresCrimen.ts).
    const colorDe = (d: FilaCsv) => colorDeCrimen(d.codigoPredominante);

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
    let cambioElFiltroDeLugar = false;
    if (estado.lugaresFijados.has(lugar)) {
      estado.lugaresFijados.delete(lugar);
      if (lugarFijadoPorCombo === lugar) lugarFijadoPorCombo = null;
      // Si era el lugar elegido en el combo, soltar su pin sin quitar el filtro
      // dejaría el mapa reducido a un solo punto y sin botón para volver.
      if (estado.lugar === lugar) {
        estado.lugar = 'Todos';
        comboLugar.establecerValor('Todos');
        cambioElFiltroDeLugar = true;
      }
    } else {
      estado.lugaresFijados.add(lugar);
    }
    actualizarVisibilidadBotonLimpiar();
    if (cambioElFiltroDeLugar) {
      actualizarMapa();
      actualizarCrimenesPorTipo();
    } else {
      dibujarCapsulasFijadas();
    }
    actualizarPanelSecundario(true);
    actualizarVisibilidadSpike();
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
    let serieResaltada: string | null = null;
    let lineGroupsPorSerie = new Map();

    const tooltipLineas = document.createElement('div');
    tooltipLineas.className = 'tooltip-grafico tooltip-grafico--sans';

    const MARGIN = { top: 60, right: 170, bottom: 50, left: 55 };
    const WIDTH = 700,
      HEIGHT = 300;

    // Reparte etiquetas verticalmente para que ninguna se superponga: parte
    // de la posición "natural" de cada una (la altura de su último punto),
    // las separa de arriba hacia abajo dejando al menos `gapMinimo` entre
    // ellas y, si así se salen del alto disponible, hace una segunda pasada
    // de abajo hacia arriba para que quepan todas dentro de [0, alto].
    function repartirEtiquetasSinSuperposicion(
      entradas: { nombre: string; y: number }[],
      gapMinimo: number,
      alto: number,
    ): Map<string, number> {
      const ordenadas = entradas.map((e) => ({ ...e })).sort((a, b) => a.y - b.y);

      for (let i = 1; i < ordenadas.length; i++) {
        const yMinima = ordenadas[i - 1].y + gapMinimo;
        if (ordenadas[i].y < yMinima) ordenadas[i].y = yMinima;
      }

      const ultimo = ordenadas[ordenadas.length - 1];
      if (ultimo && ultimo.y > alto) {
        ultimo.y = alto;
        for (let i = ordenadas.length - 2; i >= 0; i--) {
          const yMaxima = ordenadas[i + 1].y - gapMinimo;
          if (ordenadas[i].y > yMaxima) ordenadas[i].y = yMaxima;
        }
      }

      return new Map(ordenadas.map((e) => [e.nombre, e.y]));
    }
    const IW = WIDTH - MARGIN.left - MARGIN.right;
    const IH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const DURACION_LINEA = 700;
    const PAUSA = 130;

    // La vista "Lugar" no distingue por subcrimen (ver comboSubcrimen oculto
    // acá en index.astro): con un crimen filtrado, esta serie ya trae solo
    // sus casos (datosFiltradosBase respeta estado.crimen) y muestra su
    // nombre en vez de "Todos los crímenes".
    function buildSerieTotal() {
      const lista = decadasSeleccionadas();
      const filtrados = datosFiltradosBase();
      const nombreSerie = estado.crimen === 'Todos' ? 'Todos los crímenes' : estado.crimen;
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
          etiqueta: `${nombreSerie}\n${formatoDecada(t)}: ${cantidad} casos`,
        };
      });
      const total = puntos.reduce((a, p) => a + p.cantidad, 0);
      return [{ nombre: nombreSerie, total, puntos }];
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
      serieResaltada = null;
      lineGroupsPorSerie = new Map();
      botonVerCasosLinea.ocultar();
      renderizarInfoLugares();

      const enModoComparacion = estado.lugaresFijados.size > 0;
      const series = enModoComparacion ? buildSeriesLugaresFijados() : buildSerieTotal();
      const lista = decadasSeleccionadas();
      const totalGeneral = series.reduce((a, s) => a + s.total, 0);

      function irDesdeLineaSerie(serie: NodoMutable, tiempo: number) {
        if (enModoComparacion) {
          irATablasFiltradas({ lugar: serie.nombre, fecha: tiempo });
        } else if (estado.crimen === 'Todos') {
          irATablasFiltradas({ fecha: tiempo });
        } else {
          irATablasFiltradas({ codigo: estado.crimen, subcodigo: null, fecha: tiempo });
        }
      }

      function aplicarResaltadoLinea() {
        if (!serieResaltada) {
          lineGroupsPorSerie.forEach((grp) => grp.style('opacity', 1));
          return;
        }
        lineGroupsPorSerie.forEach((grp, nombre) => {
          grp.style('opacity', nombre === serieResaltada ? 1 : 0.2);
        });
      }

      function limpiarSeleccionLinea() {
        seleccionPuntoLinea = null;
        serieResaltada = null;
        botonVerCasosLinea.ocultar();
        aplicarResaltadoLinea();
      }

      // Clic directo en la línea o en su nombre (ver dibujarEtiquetasSeries):
      // resalta esa serie sola, sin fijar un punto/fecha concreto (por eso no
      // muestra el botón "Ver casos", que necesita una fecha).
      function seleccionarSerie(serie: NodoMutable) {
        if (serieResaltada === serie.nombre && !seleccionPuntoLinea) {
          limpiarSeleccionLinea();
          return;
        }
        seleccionPuntoLinea = null;
        serieResaltada = serie.nombre;
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
        serieResaltada = serie.nombre;
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
            .attr(
              'class',
              lista.length > 6
                ? 'mapa-linea-eje-x-texto mapa-linea-eje-x-texto--compacto'
                : 'mapa-linea-eje-x-texto',
            )
            .attr('dy', '1.4em');
        });

      g.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('d')))
        .call((gg) => {
          gg.select('.domain').remove();
          gg.selectAll('text').attr('class', 'mapa-linea-eje-y-texto');
        });

      // Sin lugares fijados pero con una provincia elegida, el título deja
      // claro que la serie está acotada a ese territorio (el filtro mismo ya
      // lo aplica vía datosFiltradosBase(), acá solo se refleja en el rótulo).
      const sufijoProvincia =
        !enModoComparacion && estado.provincia !== 'Todos' ? ` · ${estado.provincia}` : '';
      const tituloTexto =
        (enModoComparacion
          ? `Comparando ${series.length} lugar(es) fijado(s)`
          : estado.crimen === 'Todos'
            ? 'Todos los crímenes'
            : estado.crimen) + sufijoProvincia;

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
        if (serieResaltada) {
          lineGroup.style('opacity', serie.nombre === serieResaltada ? 1 : 0.2);
        }

        // Corredor invisible más ancho que el trazo visible, para poder
        // hacer clic en la línea (no solo en sus puntos) y resaltarla; ver
        // seleccionarSerie más arriba.
        lineGroup
          .append('path')
          .datum(serie.puntos as any)
          .attr('class', 'mapa-linea-trazo-hit')
          .attr('d', lineGen as any)
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            seleccionarSerie(serie);
          });

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
      }

      function ultimoPuntoDeSerie(serie: NodoMutable) {
        return (
          [...serie.puntos].reverse().find((p: NodoMutable) => p.cantidad > 0) ||
          serie.puntos[serie.puntos.length - 1]
        );
      }

      // Pasada final, una vez dibujadas todas las series: coloca los nombres
      // más a la derecha (fuera del área de trazado, en el margen reservado)
      // y los reparte verticalmente para que no se superpongan, con una
      // línea guía delgada hasta el último punto real de cada serie. Cada
      // etiqueta entra al mismo grupo que ya tiene su línea y sus puntos
      // (lineGroupsPorSerie), así que el resaltado/atenuado los afecta a
      // todos juntos.
      function dibujarEtiquetasSeries() {
        // Debe ser mayor que el alto real del texto (11px de fuente ronda
        // ~14.5px de bounding box entre ascendentes y descendentes) — con
        // menos que eso, dos etiquetas vecinas se siguen tocando aunque la
        // línea base quede bien separada.
        const GAP_MINIMO_ETIQUETA = 16;
        const X_ETIQUETA = IW + 26;

        const posicionesNaturales = series.map((serie) => {
          const ultimo = ultimoPuntoDeSerie(serie);
          return { nombre: serie.nombre, y: y(ultimo.cantidad) as number };
        });
        const yPorSerie = repartirEtiquetasSinSuperposicion(
          posicionesNaturales,
          GAP_MINIMO_ETIQUETA,
          IH,
        );

        series.forEach((serie) => {
          const lineGroup = lineGroupsPorSerie.get(serie.nombre);
          if (!lineGroup) return;
          const color = colorScaleLine(serie.nombre);
          const ultimo = ultimoPuntoDeSerie(serie);
          const xUltimo = x(ultimo.tiempo) as number;
          const yNatural = y(ultimo.cantidad) as number;
          const yEtiqueta = yPorSerie.get(serie.nombre) as number;

          lineGroup
            .append('path')
            .attr(
              'd',
              `M${xUltimo},${yNatural} L${X_ETIQUETA - 6},${yEtiqueta}`,
            )
            .attr('class', 'mapa-linea-guia-etiqueta')
            .attr('stroke', color as string);

          lineGroup
            .append('text')
            .attr('x', X_ETIQUETA)
            .attr('y', yEtiqueta + 4)
            .attr('class', 'mapa-linea-etiqueta-serie')
            .style('fill', color as string)
            .text(serie.nombre.length > 22 ? serie.nombre.slice(0, 20) + '…' : serie.nombre)
            .on('click', (event: MouseEvent) => {
              event.stopPropagation();
              seleccionarSerie(serie);
            });
        });
      }

      function revelarSecuencial(idx: number) {
        if (idx >= series.length) {
          dibujarEtiquetasSeries();
          return;
        }
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
        dibujarEtiquetasSeries();
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
