import * as d3 from 'd3';
import { esLinajeCriminal } from './linajeComun.js';
import { crearBotonVerCasos } from './verCasos.js';
import { colorDeCrimen } from './coloresCrimen.js';

// TODO: type — genéricos de selección de d3. Ver MIGRATION.md (mismo patrón que Linaje.ts).
type SeleccionD3 = any;

interface ConteoCrimen {
  nombre: string;
  total: number;
}

// El corpus documental colonial llega hasta 1824 aunque la década calculada
// sea 1820 (mismo ajuste que en TiempoCrimenesMapa.ts). Se usa tanto para
// acotar la serie histórica del spike (ver contar()) como para formatear
// su eje.
const ULTIMO_ANIO_COLONIAL = 1824;
const ULTIMA_DECADA = Math.floor(ULTIMO_ANIO_COLONIAL / 10) * 10;

function formatoDecada(decada: number): number {
  return decada === ULTIMA_DECADA ? ULTIMO_ANIO_COLONIAL : decada;
}

function getDecada(y: number): number {
  return Math.floor(y / 10) * 10;
}

function decadaValida(y: number): boolean {
  return y >= 1500 && y <= 1899;
}

interface FiltrosCrimenesPorTipo {
  decadaDesde: number;
  decadaHasta: number;
  codigo: string | null;
  subcodigo: string | null;
  lugar: string | null;
}

// Reconstruye exactamente los mismos filtros que ya se usaron para contar
// las barras/el spike/la dona, para que "Ver casos" lleve a la tabla general
// con precisión. subcodigoNombre va aparte (no adentro de filtros) porque
// tablageneral.ts espera el NOMBRE del subcrimen en ese parámetro, mientras
// que filtros.subcodigo (el del panel compartido) es el ID_Código crudo
// (p.ej. "20.1") — quien llama debe resolverlo contra linajeMap primero (ver
// los tres call sites más abajo). decada, cuando viene, reemplaza el rango
// fechaDesde/fechaHasta por una década puntual (clic en un punto del spike).
function irATablasFiltradas(
  nombre: string,
  filtros: FiltrosCrimenesPorTipo | null,
  subcodigoNombre: string | null,
  overrides: { decada?: number } = {},
) {
  const params = new URLSearchParams();
  params.set('codigo', nombre);
  if (subcodigoNombre) params.set('subcodigo', subcodigoNombre);
  if (filtros?.lugar) params.set('lugar', filtros.lugar);
  if (overrides.decada != null) {
    params.set('fecha', String(overrides.decada));
  } else if (filtros) {
    params.set('fechaDesde', String(filtros.decadaDesde));
    params.set('fechaHasta', String(filtros.decadaHasta));
  }
  window.location.href = `${import.meta.env.BASE_URL}base-de-datos/index.html?${params.toString()}`;
}

// TiempoCrimenesMapa.ts expone los filtros del panel compartido (década,
// crimen, subcrimen, lugar) por este hook y llama al segundo cada vez que
// cambian, para que este módulo — cargado aparte — se pueda re-renderizar
// sin acoplarse directamente a su estado interno.
declare global {
  interface Window {
    __obtenerFiltrosCrimenesPorTipo?: () => FiltrosCrimenesPorTipo | null;
    __actualizarCrimenesPorTipoDashboard?: () => void;
    // Implementado en TiempoCrimenesMapa.ts: si el filtro compartido "Crimen"
    // sigue apuntando a `nombre`, lo vuelve a "Todos" — ver limpiarSeleccion
    // y alternarSeleccion en renderizar() más abajo.
    __limpiarFiltroCrimenSiCoincide?: (nombre: string) => void;
  }
}

// Presentación tipo embudo (la misma que tenía el "Top 5" que se fusionó
// aquí), aplicada a TODOS los delitos en vez de solo los 5 primeros. Ningún
// escalón se dibuja a un ancho ilegible aunque tenga muy pocos casos frente
// al primero: por debajo de esto el rótulo y la cifra no caben juntos.
const ANCHO_MINIMO_PCT = 30;

interface ContenedoresCrimenesPorTipo {
  /** Barras "Crímenes por tipo" — clic para fijar/quitar un crimen a comparar. */
  barrasId: string;
  /** Tarjeta independiente (columna derecha) con la tendencia por década de
   *  los crímenes fijados; oculta mientras no haya ninguno, ver
   *  actualizarVisibilidadSpike. */
  spikeId: string;
  /** Tarjeta debajo del spike, con el donut de subcrímenes del crimen
   *  fijado (o un selector entre varios si hay más de uno fijado). */
  donutId: string;
}

export async function crearCrimenesPorTipo(ids: ContenedoresCrimenesPorTipo) {
  const contenedorBarras = document.getElementById(ids.barrasId);
  const contenedorSpike = document.getElementById(ids.spikeId);
  const contenedorDonut = document.getElementById(ids.donutId);
  if (!contenedorBarras) return;

  // Igual que mapa-lugar-layout/mapa-lugar-col-spike en TiempoCrimenesMapa.ts:
  // la columna del spike arranca oculta y las barras solas ocupan todo el
  // ancho; al fijar el primer crimen la columna se revela y las barras se
  // recorren a la izquierda.
  const layoutCrimenes = contenedorSpike?.closest('.mapa-crimenes-layout') ?? null;
  const columnaDerecha = contenedorSpike?.closest('.mapa-crimenes-col-derecha') ?? null;

  // Botones "Ver casos" para un punto del spike y un gajo de la dona (mismo
  // widget que botonVerCasosLinea en TiempoCrimenesMapa.ts): se crean una
  // sola vez e insertan ANTES de su contenedor, no adentro — cada render
  // vacía ese contenedor con innerHTML='', lo que borraría el botón si
  // fuera su hijo.
  const botonVerCasosSpike = crearBotonVerCasos();
  contenedorSpike?.parentElement?.insertBefore(botonVerCasosSpike.boton, contenedorSpike);
  const botonVerCasosDonut = crearBotonVerCasos();
  contenedorDonut?.parentElement?.insertBefore(botonVerCasosDonut.boton, contenedorDonut);

  // Fila de "fijados": los crímenes marcados para comparar en el spike/dona
  // (clic en una barra, o clic en el filtro compartido "Crimen" de arriba,
  // que fija el elegido sin poder quitarlo desde ahí — ver el manejo de
  // filtros.codigo en renderizar()). Se muestra ARRIBA de las barras, no
  // solo en la leyenda del spike, para poder desfijar uno o todos sin bajar
  // hasta la columna derecha. Mismo motivo que los botones "Ver casos": se
  // crea una sola vez e inserta ANTES de contenedorBarras porque dibujarBarras
  // vacía ese contenedor en cada render.
  const contenedorFijados = document.createElement('div');
  contenedorFijados.className = 'crimenes-tipo-fijados crimenes-tipo-fijados--oculto';
  contenedorBarras.parentElement?.insertBefore(contenedorFijados, contenedorBarras);

  function actualizarVisibilidadSpike() {
    const haySeleccion = crimenesSeleccionados.size > 0;
    layoutCrimenes?.classList.toggle('mapa-crimenes-layout--con-spike', haySeleccion);
    columnaDerecha?.classList.toggle('mapa-crimenes-col-derecha--oculta', !haySeleccion);
  }

  const [crimenes, linaje] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);

  // Código en crimenes.csv apunta a ID_Código en Linaje.csv (mismo join que
  // usa tablageneral.ts), y solo se cuentan los delitos criminales (se
  // excluyen documentos, traslados, juicios civiles y demás linajes "No
  // criminal"; ver linajeComun.ts), más los linajes "No aplica" (p.ej. "Sin
  // codificar": no es un delito específico, es el cajón de crímenes sin
  // clasificar). Los filtros del panel compartido (década, crimen, subcrimen,
  // lugar) se aplican encima de ese filtro base; ver __obtenerFiltrosCrimenesPorTipo.
  const linajeMap = new Map(linaje.map((d) => [d['ID_Código'], d.Nombre]));
  const tipoDelitoMap = new Map(linaje.map((d) => [d['ID_Código'], d.Tipo_delito]));

  // Definición histórico-legal de cada crimen (columna Explicación): varios
  // ID_Código pueden compartir Nombre (p.ej. "1" y "1.1" son ambos
  // "Homicidio", el nivel general y el específico) — se queda con la primera
  // explicación no vacía que encuentra para ese nombre.
  const explicacionPorNombre = new Map<string, string>();
  linaje.forEach((d) => {
    const explicacion = (d['Explicación'] || '').trim();
    if (explicacion && !explicacionPorNombre.has(d.Nombre)) {
      explicacionPorNombre.set(d.Nombre, explicacion);
    }
  });

  const crimenesAplicables = crimenes.filter(
    (d) => esLinajeCriminal(d['Código']) && tipoDelitoMap.get(d['Código']) !== 'No aplica',
  );

  // Color por crimen/subcrimen: coloresCrimen.ts lo declara por ID_Código, no
  // por nombre (dos ID_Código pueden compartir Nombre, ver el comentario de
  // explicacionPorNombre arriba), así que hace falta la traducción inversa
  // (Nombre -> ID_Código) que linajeMap no da, para resolver el color de lo
  // que muestran barras/spike/dona antes de pedirlo.
  const codigoPorNombreCrimen = new Map<string, string>();
  const codigoPorNombreSubcrimen = new Map<string, string>();
  crimenesAplicables.forEach((d) => {
    const codigo = (d['Código'] || '').trim();
    const nombre = linajeMap.get(codigo);
    if (nombre && !codigoPorNombreCrimen.has(nombre)) codigoPorNombreCrimen.set(nombre, codigo);

    const subCodigo = (d['Sub_Código'] || '').trim();
    if (subCodigo && subCodigo.toLowerCase() !== 'null') {
      const nombreSub = linajeMap.get(subCodigo);
      if (nombreSub && !codigoPorNombreSubcrimen.has(nombreSub)) {
        codigoPorNombreSubcrimen.set(nombreSub, subCodigo);
      }
    }
  });
  // Para el spike, que puede tener fijados nombres de crimen o de subcrimen
  // mezclados (ver crimenesSeleccionados más abajo).
  function codigoDeNombre(nombre: string): string | null {
    return codigoPorNombreCrimen.get(nombre) ?? codigoPorNombreSubcrimen.get(nombre) ?? null;
  }

  // Décadas del corpus completo — solo se usa como límite por defecto en
  // contar() cuando todavía no hay filtro de década activo (ver
  // decadaMinGlobal ahí abajo).
  const decadasConDatos = [
    ...new Set(
      crimenesAplicables.filter((d) => decadaValida(+d.Año)).map((d) => getDecada(+d.Año)),
    ),
  ].sort((a, b) => a - b);
  const decadaMinGlobal = decadasConDatos[0];

  // Crímenes fijados para comparar en el spike (por nombre) — persiste entre
  // renders, igual que estado.lugaresFijados en TiempoCrimenesMapa.ts: cambiar
  // los filtros de arriba no limpia la selección, solo recalcula sus datos.
  const crimenesSeleccionados = new Set<string>();
  // Cuál de los crímenes fijados se muestra en el donut cuando hay más de
  // uno (ver renderizarDonut) — el selector de pestañas cambia este valor.
  let crimenActivoDonut: string | null = null;
  // Punto del spike / gajo de la dona con el botón "Ver casos" abierto
  // (clave `${nombre}||${década}` para el spike, nombre del subcrimen para
  // la dona) — clic de nuevo sobre el mismo lo cierra (toggle), igual que
  // seleccionarPuntoLinea en TiempoCrimenesMapa.ts. Se reinicia en cada
  // render porque la selección de crímenes/filtros pudo cambiar debajo.
  let puntoSeleccionadoSpike: string | null = null;
  let subcrimenSeleccionadoDonut: string | null = null;

  function contar(filtros: FiltrosCrimenesPorTipo | null) {
    // El filtro "Crimen" compartido NO acota el desglose: acá crimen es
    // justamente la dimensión que se está mostrando (una barra por cada
    // uno). Elegir uno específico en ese filtro no filtra las barras, sino
    // que dispara la misma selección que un clic en su barra — ver el
    // manejo de filtros.codigo en renderizar() más abajo.
    const pasaFiltrosBase = (d: (typeof crimenesAplicables)[number]) => {
      const okSubcodigo = !filtros?.subcodigo || d['Sub_Código'] === filtros.subcodigo;
      const okLugar = !filtros?.lugar || d.Lugar?.trim() === filtros.lugar;
      return okSubcodigo && okLugar;
    };

    // Rango de décadas a mostrar: el del filtro compartido si hay uno, o el
    // corpus completo si no (mismo rango que usaban las barras antes de
    // tener filtro). Barras, spike y dona comparten este mismo recorte para
    // que las tres vistas correspondan entre sí.
    const decadaDesde = filtros?.decadaDesde ?? decadaMinGlobal;
    const decadaHasta = filtros?.decadaHasta ?? ULTIMA_DECADA;
    const decadasRango: number[] = [];
    for (let t = decadaDesde; t <= decadaHasta; t += 10) decadasRango.push(t);

    const filtrados = crimenesAplicables.filter((d) => {
      const decada = getDecada(+d.Año);
      const okDecada = decada >= decadaDesde && decada <= decadaHasta;
      return okDecada && pasaFiltrosBase(d);
    });

    const conteos = new Map<string, number>();
    filtrados.forEach((d) => {
      const nombre = linajeMap.get(d['Código']) || 'Sin código';
      conteos.set(nombre, (conteos.get(nombre) || 0) + 1);
    });

    // El spike ahora respeta el mismo rango de décadas que las barras y la
    // dona (antes mostraba siempre el corpus completo, lo que lo
    // desincronizaba de los otros dos al mover el deslizador).
    const porDecadaPorNombre = new Map<string, number[]>();
    filtrados.forEach((d) => {
      const nombre = linajeMap.get(d['Código']) || 'Sin código';
      const decada = getDecada(+d.Año);
      if (!porDecadaPorNombre.has(nombre)) {
        porDecadaPorNombre.set(nombre, decadasRango.map(() => 0));
      }
      const idx = decadasRango.indexOf(decada);
      if (idx >= 0) porDecadaPorNombre.get(nombre)![idx]++;
    });

    const barras: ConteoCrimen[] = [...conteos.entries()]
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total);

    return { barras, porDecadaPorNombre, filtrados, decadasRango };
  }

  // Subcrímenes de un crimen fijado, con los mismos filtros/rango de década
  // que las barras (a diferencia del spike, que ignora el rango). Se agrupa
  // por Sub_Código (no por su nombre): en Linaje.csv el ID_Código del hijo
  // (p.ej. "1.1") es una entrada de pleno derecho, con su propia Explicación,
  // aunque su Nombre repita el del padre (p.ej. "1" y "1.1" son ambos
  // "Homicidio" — el segundo es "dar muerte", la forma específica del
  // primero, no un duplicado a descartar). Por eso NO se excluye un
  // subcódigo solo porque su nombre coincida con el del crimen padre.
  function subcrimenesDeCrimen(nombreCrimen: string, filtrados: typeof crimenesAplicables) {
    const conteos = new Map<string, number>();
    filtrados
      .filter((d) => (linajeMap.get(d['Código']) || 'Sin código') === nombreCrimen)
      .forEach((d) => {
        const subCodigo = (d['Sub_Código'] || '').trim();
        if (!subCodigo || subCodigo.toLowerCase() === 'null') return;
        const nombreSub = linajeMap.get(subCodigo);
        if (!nombreSub) return;
        conteos.set(nombreSub, (conteos.get(nombreSub) || 0) + 1);
      });

    return [...conteos.entries()]
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total);
  }

  function dibujarBarras(
    barras: ConteoCrimen[],
    alternarSeleccion: (nombre: string) => void,
    filtros: FiltrosCrimenesPorTipo | null,
  ) {
    contenedorBarras!.innerHTML = '';

    if (barras.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'mapa-aviso-vacio mapa-aviso-vacio--compacto';
      aviso.textContent = 'Sin casos con los filtros actuales';
      contenedorBarras!.appendChild(aviso);
      return;
    }

    const maxTotal = barras[0].total || 1;
    const totalGeneral = barras.reduce((a, d) => a + d.total, 0);

    const wrapper = document.createElement('div');
    wrapper.className = 'crimenes-tipo-wrapper';

    barras.forEach((delito, i) => {
      const anchoPct = ANCHO_MINIMO_PCT + (100 - ANCHO_MINIMO_PCT) * (delito.total / maxTotal);

      const fila = document.createElement('div');
      fila.className = 'crimenes-tipo-fila';
      fila.dataset.nombre = delito.nombre;
      fila.classList.toggle('crimenes-tipo-fila--seleccionada', crimenesSeleccionados.has(delito.nombre));

      const barra = document.createElement('div');
      barra.className = 'crimenes-tipo-barra';
      barra.style.width = `${anchoPct}%`;
      barra.style.background = colorDeCrimen(codigoPorNombreCrimen.get(delito.nombre));

      const nombreEl = document.createElement('div');
      nombreEl.className = 'crimenes-tipo-nombre';
      const marca = document.createElement('span');
      marca.className = 'crimenes-tipo-marca';
      nombreEl.append(marca, document.createTextNode(` #${i + 1} · ${delito.nombre}`));

      const numero = document.createElement('div');
      numero.className = 'crimenes-tipo-numero';
      numero.textContent = delito.total.toLocaleString('es');

      barra.append(nombreEl, numero);
      barra.addEventListener('click', () => alternarSeleccion(delito.nombre));

      // Panel de definición inline, en el mismo lugar donde antes vivía el
      // mini-spike de este delito: display:none/block via
      // .crimenes-tipo-fila--seleccionada (misma técnica que usaba
      // --expandida), como si la barra "abriera" su definición.
      const panelDefinicion = document.createElement('div');
      panelDefinicion.className = 'crimenes-tipo-definicion';
      const explicacion = explicacionPorNombre.get(delito.nombre);
      const cuerpo = document.createElement('p');
      cuerpo.className = explicacion ? 'crimenes-tipo-definicion-texto' : 'mapa-info-lugar-vacio';
      cuerpo.textContent = explicacion || 'Sin definición registrada en la tabla de linaje.';
      panelDefinicion.appendChild(cuerpo);

      // Solo tiene sentido mientras la fila está seleccionada (el panel que
      // la contiene arranca oculto, ver .crimenes-tipo-definicion en el
      // .scss) — no hace falta un mostrar/ocultar aparte, se recrea entera
      // en cada render().
      const botonVerCasos = document.createElement('button');
      botonVerCasos.type = 'button';
      botonVerCasos.className = 'btn-mapa-ver-casos btn-mapa--visible crimenes-tipo-boton-ver-casos';
      botonVerCasos.textContent = `Ver casos: ${delito.nombre}`;
      botonVerCasos.addEventListener('click', (evento) => {
        evento.stopPropagation();
        const subcodigoNombre = filtros?.subcodigo ? linajeMap.get(filtros.subcodigo) || null : null;
        irATablasFiltradas(delito.nombre, filtros, subcodigoNombre);
      });
      panelDefinicion.appendChild(botonVerCasos);

      fila.append(barra, panelDefinicion);
      wrapper.appendChild(fila);
    });

    const nota = document.createElement('div');
    nota.className = 'crimenes-tipo-nota';
    nota.textContent = `${totalGeneral.toLocaleString('es')} casos · clic en uno o más delitos para ver su definición y comparar su tendencia por década`;
    wrapper.appendChild(nota);

    contenedorBarras!.appendChild(wrapper);
  }

  function marcarSeleccionEnBarras() {
    contenedorBarras!.querySelectorAll<HTMLElement>('.crimenes-tipo-fila').forEach((fila) => {
      const nombre = fila.dataset.nombre || '';
      fila.classList.toggle('crimenes-tipo-fila--seleccionada', crimenesSeleccionados.has(nombre));
    });
  }

  function renderizarSpike(
    porDecadaPorNombre: Map<string, number[]>,
    decadas: number[],
    filtros: FiltrosCrimenesPorTipo | null,
    alternarSeleccion: (nombre: string) => void,
  ) {
    if (!contenedorSpike) return;
    contenedorSpike.innerHTML = '';
    puntoSeleccionadoSpike = null;
    botonVerCasosSpike.ocultar();

    // La columna entera queda oculta sin selección (ver
    // actualizarVisibilidadSpike), así que no hace falta un aviso vacío acá.
    if (crimenesSeleccionados.size === 0) return;

    const seleccion = [...crimenesSeleccionados].map((nombre) => {
      const porDecada = porDecadaPorNombre.get(nombre) || decadas.map(() => 0);
      return { nombre, porDecada, total: porDecada.reduce((a: number, b: number) => a + b, 0) };
    });

    const colorDe = new Map(seleccion.map((s) => [s.nombre, colorDeCrimen(codigoDeNombre(s.nombre))]));

    const MARGIN = { top: 16, right: 20, bottom: 30, left: 40 };
    const WIDTH = 700;
    const HEIGHT = 320;
    const IW = WIDTH - MARGIN.left - MARGIN.right;
    const IH = HEIGHT - MARGIN.top - MARGIN.bottom;

    const x = d3.scalePoint<number>().domain(d3.range(decadas.length)).range([0, IW]);
    const maxValor = d3.max(seleccion.flatMap((s) => s.porDecada)) || 1;
    const y = d3.scaleLinear().domain([0, maxValor]).nice().range([IH, 0]);

    const svg = d3
      .create('svg')
      .attr('viewBox', `0 0 ${WIDTH} ${HEIGHT}`)
      .attr('class', 'crimenes-tipo-spike-svg');
    const g = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    g.append('g')
      .call(d3.axisLeft(y).ticks(5).tickSize(-IW).tickFormat(d3.format('d')) as SeleccionD3)
      .call((gg: SeleccionD3) => gg.select('.domain').remove())
      .call((gg: SeleccionD3) => gg.selectAll('line').attr('class', 'mapa-linea-grid-linea'))
      .call((gg: SeleccionD3) => gg.selectAll('text').attr('class', 'mapa-linea-eje-y-texto'));

    const ejeX = d3
      .axisBottom(x)
      .tickSize(0)
      .tickFormat((idx) => formatoDecada(decadas[idx as number]) as unknown as string);
    if (decadas.length > 10) {
      const paso = Math.ceil(decadas.length / 10);
      const valores = d3
        .range(decadas.length)
        .filter((i) => i % paso === 0 || i === decadas.length - 1);
      ejeX.tickValues(valores);
    }
    g.append('g')
      .attr('transform', `translate(0,${IH})`)
      .call(ejeX)
      .call((gg: SeleccionD3) => gg.select('.domain').attr('class', 'mapa-linea-eje-dominio'))
      .call((gg: SeleccionD3) => gg.selectAll('text').attr('class', 'mapa-linea-eje-x-texto'));

    const lineGen = (d3.line() as any)
      .x((_: number, i: number) => x(i))
      .y((v: number) => y(v))
      .curve(d3.curveMonotoneX);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-grafico tooltip-grafico--sans';
    contenedorSpike.appendChild(tooltip);

    seleccion.forEach((serie) => {
      const color = colorDe.get(serie.nombre)!;
      g.append('path')
        .datum(serie.porDecada)
        .attr('d', lineGen)
        .attr('class', 'crimenes-tipo-spike-trazo')
        .attr('stroke', color);

      serie.porDecada.forEach((valor, i) => {
        g.append('circle')
          .attr('cx', x(i) as number)
          .attr('cy', y(valor))
          .attr('r', 3)
          .attr('class', 'crimenes-tipo-spike-punto')
          .attr('fill', color);
        g.append('circle')
          .attr('cx', x(i) as number)
          .attr('cy', y(valor))
          .attr('r', 9)
          .attr('class', 'crimenes-tipo-spike-punto-hit')
          .on('mouseenter', () => {
            tooltip.innerHTML = `<strong>${serie.nombre}</strong><br/>${formatoDecada(decadas[i])}: ${valor.toLocaleString('es')} caso${valor === 1 ? '' : 's'}`;
            tooltip.classList.add('tooltip-grafico--visible');
          })
          .on('mousemove', (event: MouseEvent) => {
            const rect = contenedorSpike!.getBoundingClientRect();
            tooltip.style.left = event.clientX - rect.left + 12 + 'px';
            tooltip.style.top = event.clientY - rect.top + 12 + 'px';
          })
          .on('mouseleave', () => tooltip.classList.remove('tooltip-grafico--visible'))
          .on('click', (event: MouseEvent) => {
            event.stopPropagation();
            const decada = decadas[i];
            const clave = `${serie.nombre}||${decada}`;
            if (puntoSeleccionadoSpike === clave) {
              puntoSeleccionadoSpike = null;
              botonVerCasosSpike.ocultar();
              return;
            }
            puntoSeleccionadoSpike = clave;
            const subcodigoNombre = filtros?.subcodigo ? linajeMap.get(filtros.subcodigo) || null : null;
            botonVerCasosSpike.mostrar(`${serie.nombre} · ${formatoDecada(decada)}`, () =>
              irATablasFiltradas(serie.nombre, filtros, subcodigoNombre, { decada }),
            );
          });
      });
    });

    contenedorSpike.appendChild(svg.node()!);

    // Leyenda: cada chip también quita ese crimen de la comparación al
    // hacer clic, sin tener que volver a buscarlo en la lista de barras.
    const leyenda = document.createElement('div');
    leyenda.className = 'crimenes-tipo-leyenda';
    seleccion.forEach((serie) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'crimenes-tipo-leyenda-chip';
      const punto = document.createElement('span');
      punto.className = 'crimenes-tipo-leyenda-punto';
      punto.style.background = colorDe.get(serie.nombre)!;
      chip.append(
        punto,
        document.createTextNode(
          ` ${serie.nombre} · ${serie.total.toLocaleString('es')} caso${serie.total === 1 ? '' : 's'}`,
        ),
      );
      chip.addEventListener('click', () => alternarSeleccion(serie.nombre));
      leyenda.appendChild(chip);
    });
    contenedorSpike.appendChild(leyenda);
  }

  // Donut de subcrímenes del crimen fijado (o de uno elegido en el selector
  // de pestañas, si hay más de uno fijado) — ver subcrimenesDeCrimen.
  function renderizarDonut(filtrados: typeof crimenesAplicables, filtros: FiltrosCrimenesPorTipo | null) {
    if (!contenedorDonut) return;
    contenedorDonut.innerHTML = '';
    subcrimenSeleccionadoDonut = null;
    botonVerCasosDonut.ocultar();

    // La columna entera queda oculta sin selección (ver
    // actualizarVisibilidadSpike), así que no hace falta un aviso vacío acá.
    if (crimenesSeleccionados.size === 0) return;

    const seleccion = [...crimenesSeleccionados];
    if (!crimenActivoDonut || !crimenesSeleccionados.has(crimenActivoDonut)) {
      crimenActivoDonut = seleccion[seleccion.length - 1];
    }

    // Con más de un crimen fijado, un selector de pestañas elige cuál
    // donut mostrar — un donut no puede comparar dos crímenes a la vez.
    if (seleccion.length > 1) {
      const selector = document.createElement('div');
      selector.className = 'crimenes-tipo-donut-selector';
      seleccion.forEach((nombre) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'crimenes-tipo-donut-tab';
        boton.classList.toggle('crimenes-tipo-donut-tab--activo', nombre === crimenActivoDonut);
        boton.textContent = nombre;
        boton.addEventListener('click', () => {
          crimenActivoDonut = nombre;
          renderizarDonut(filtrados, filtros);
        });
        selector.appendChild(boton);
      });
      contenedorDonut.appendChild(selector);
    }

    const datos = subcrimenesDeCrimen(crimenActivoDonut, filtrados);
    if (datos.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'mapa-aviso-vacio mapa-aviso-vacio--compacto';
      aviso.textContent = `"${crimenActivoDonut}" no tiene subcrímenes registrados.`;
      contenedorDonut.appendChild(aviso);
      return;
    }

    const colorDe = new Map(
      datos.map((d) => [d.nombre, colorDeCrimen(codigoPorNombreSubcrimen.get(d.nombre))]),
    );
    const totalDonut = datos.reduce((a, d) => a + d.total, 0);

    const LADO = 220;
    const RADIO = LADO / 2;
    const svg = d3
      .create('svg')
      .attr('viewBox', `0 0 ${LADO} ${LADO}`)
      .attr('class', 'crimenes-tipo-donut-svg');
    const g = svg.append('g').attr('transform', `translate(${RADIO},${RADIO})`);

    const pie = d3
      .pie<{ nombre: string; total: number }>()
      .value((d) => d.total)
      .sort(null);
    const arco = d3
      .arc<d3.PieArcDatum<{ nombre: string; total: number }>>()
      .innerRadius(RADIO * 0.55)
      .outerRadius(RADIO * 0.95);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-grafico tooltip-grafico--sans';
    contenedorDonut.appendChild(tooltip);

    g.selectAll('path')
      .data(pie(datos))
      .join('path')
      .attr('d', arco as SeleccionD3)
      .attr('class', 'crimenes-tipo-donut-porcion')
      .attr('fill', (d) => colorDe.get(d.data.nombre)!)
      .on('mouseenter', (event: MouseEvent, d) => {
        const pct = ((d.data.total / totalDonut) * 100).toFixed(1);
        tooltip.innerHTML = `<strong>${d.data.nombre}</strong><br/>${d.data.total.toLocaleString('es')} caso${d.data.total === 1 ? '' : 's'} · ${pct}%`;
        tooltip.classList.add('tooltip-grafico--visible');
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = contenedorDonut!.getBoundingClientRect();
        tooltip.style.left = event.clientX - rect.left + 12 + 'px';
        tooltip.style.top = event.clientY - rect.top + 12 + 'px';
      })
      .on('mouseleave', () => tooltip.classList.remove('tooltip-grafico--visible'))
      .on('click', (event: MouseEvent, d) => {
        event.stopPropagation();
        if (subcrimenSeleccionadoDonut === d.data.nombre) {
          subcrimenSeleccionadoDonut = null;
          botonVerCasosDonut.ocultar();
          return;
        }
        subcrimenSeleccionadoDonut = d.data.nombre;
        botonVerCasosDonut.mostrar(d.data.nombre, () =>
          irATablasFiltradas(crimenActivoDonut!, filtros, d.data.nombre),
        );
      });

    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.2em')
      .attr('class', 'crimenes-tipo-donut-total-num')
      .text(totalDonut.toLocaleString('es'));
    g.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '1.1em')
      .attr('class', 'crimenes-tipo-donut-total-label')
      .text(totalDonut === 1 ? 'caso' : 'casos');

    contenedorDonut.appendChild(svg.node()!);

    const leyenda = document.createElement('div');
    leyenda.className = 'crimenes-tipo-leyenda';
    datos.forEach((d) => {
      const chip = document.createElement('div');
      // Div, no botón: a diferencia de la leyenda del spike, acá no quita
      // nada al hacer clic — el modificador --estatico le saca el cursor y
      // el subrayado al pasar el mouse que sí tiene la leyenda clicable.
      chip.className = 'crimenes-tipo-leyenda-chip crimenes-tipo-leyenda-chip--estatico';
      const punto = document.createElement('span');
      punto.className = 'crimenes-tipo-leyenda-punto';
      punto.style.background = colorDe.get(d.nombre)!;
      chip.append(
        punto,
        document.createTextNode(` ${d.nombre} · ${d.total.toLocaleString('es')} caso${d.total === 1 ? '' : 's'}`),
      );
      leyenda.appendChild(chip);
    });
    contenedorDonut.appendChild(leyenda);
  }

  // Última vez que se vio filtros.codigo, para notar cuándo el filtro
  // compartido de arriba cambia a un crimen puntual (y no confundir eso con
  // cualquier otro re-render, p.ej. al mover el deslizador de década).
  let ultimoCodigoFiltro: string | null = null;

  function renderizar() {
    const filtros = window.__obtenerFiltrosCrimenesPorTipo?.() ?? null;
    const { barras, porDecadaPorNombre, filtrados, decadasRango } = contar(filtros);

    function alternarSeleccion(nombre: string) {
      let desfijado = false;
      if (crimenesSeleccionados.has(nombre)) {
        crimenesSeleccionados.delete(nombre);
        desfijado = true;
      } else {
        crimenesSeleccionados.add(nombre);
        // El donut sigue al crimen recién fijado, no al que ya estaba.
        crimenActivoDonut = nombre;
      }
      marcarSeleccionEnBarras();
      actualizarVisibilidadSpike();
      renderizarSpike(porDecadaPorNombre, decadasRango, filtros, alternarSeleccion);
      renderizarDonut(filtrados, filtros);
      renderizarFijados();
      // Si el filtro compartido "Crimen" de arriba seguía apuntando a este
      // crimen (porque fue lo que lo fijó), lo vuelve a "Todos" — ver
      // __limpiarFiltroCrimenSiCoincide en TiempoCrimenesMapa.ts.
      if (desfijado) window.__limpiarFiltroCrimenSiCoincide?.(nombre);
    }

    // Quita TODOS los crímenes fijados de una vez (botón "Quitar selección"
    // en contenedorFijados) — a diferencia de alternarSeleccion, que solo
    // saca uno.
    function limpiarSeleccion() {
      if (crimenesSeleccionados.size === 0) return;
      const nombresQuitados = [...crimenesSeleccionados];
      crimenesSeleccionados.clear();
      crimenActivoDonut = null;
      marcarSeleccionEnBarras();
      actualizarVisibilidadSpike();
      renderizarSpike(porDecadaPorNombre, decadasRango, filtros, alternarSeleccion);
      renderizarDonut(filtrados, filtros);
      renderizarFijados();
      nombresQuitados.forEach((nombre) => window.__limpiarFiltroCrimenSiCoincide?.(nombre));
    }

    // Un chip por crimen fijado, con su propio × (reutiliza alternarSeleccion:
    // como el chip solo existe para un crimen ya fijado, "alternar" siempre
    // lo quita), más un botón para quitarlos todos de un saque.
    function renderizarFijados() {
      contenedorFijados.innerHTML = '';
      const haySeleccion = crimenesSeleccionados.size > 0;
      contenedorFijados.classList.toggle('crimenes-tipo-fijados--oculto', !haySeleccion);
      if (!haySeleccion) return;

      const etiqueta = document.createElement('span');
      etiqueta.className = 'crimenes-tipo-fijados-etiqueta';
      etiqueta.textContent = 'Fijados para comparar:';
      contenedorFijados.appendChild(etiqueta);

      [...crimenesSeleccionados].forEach((nombre) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'crimenes-tipo-fijados-chip';
        chip.title = `Quitar "${nombre}" de la comparación`;
        const quitar = document.createElement('span');
        quitar.className = 'crimenes-tipo-fijados-chip-quitar';
        quitar.textContent = '×';
        chip.append(document.createTextNode(`${nombre} `), quitar);
        chip.addEventListener('click', () => alternarSeleccion(nombre));
        contenedorFijados.appendChild(chip);
      });

      const botonLimpiar = document.createElement('button');
      botonLimpiar.type = 'button';
      botonLimpiar.className = 'crimenes-tipo-fijados-limpiar';
      botonLimpiar.textContent = 'Quitar selección';
      botonLimpiar.addEventListener('click', limpiarSeleccion);
      contenedorFijados.appendChild(botonLimpiar);
    }

    // Elegir un crimen puntual en el filtro compartido de arriba fija ese
    // crimen para comparar, igual que un clic en su barra — no reemplaza la
    // selección vigente ni la vacía al volver a "Todos" (para vaciarla del
    // todo está el botón "Quitar selección" de renderizarFijados).
    const codigoActual = filtros?.codigo ?? null;
    if (codigoActual && codigoActual !== ultimoCodigoFiltro) {
      const nombre = linajeMap.get(codigoActual);
      if (nombre && !crimenesSeleccionados.has(nombre)) {
        crimenesSeleccionados.add(nombre);
        crimenActivoDonut = nombre;
      }
    }
    ultimoCodigoFiltro = codigoActual;

    dibujarBarras(barras, alternarSeleccion, filtros);
    renderizarFijados();
    actualizarVisibilidadSpike();
    renderizarSpike(porDecadaPorNombre, decadasRango, filtros, alternarSeleccion);
    renderizarDonut(filtrados, filtros);
  }

  window.__actualizarCrimenesPorTipoDashboard = renderizar;

  renderizar();
}
