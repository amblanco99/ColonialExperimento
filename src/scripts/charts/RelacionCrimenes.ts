import * as d3 from 'd3';
import type { FilaCsv } from './agentesComun.js';

// TODO: type — nodo/dato mutado por d3 (fuerza del grafo). Ver MIGRATION.md.
type NodoMutable = any;

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

// TiempoCrimenesMapa.ts expone el rango de década del panel de filtros
// compartido por este hook (cuando este gráfico vive ahí) y llama al segundo
// cada vez que ese rango cambia. En páginas donde el grafo va solo (p. ej.
// Personas) nadie los define, así que se muestra el corpus completo sin
// restricción de tiempo.
declare global {
  interface Window {
    __obtenerRangoDecadaGrafo?: () => [number, number] | null;
    __actualizarGrafoRelacionDashboard?: () => void;
  }
}

function getDecada(y: number) {
  return Math.floor(y / 10) * 10;
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

// Versión reducida de la de TiempoCrimenesMapa.ts: aquí el grafo solo navega
// con un código de crimen o una lista de casos, nunca con lugar/subcrimen/
// fecha (ese contexto solo existe en el dashboard de Tiempo).
function irATablasFiltradas(overrides: { codigo?: string; casos?: string[] }) {
  const params = new URLSearchParams();
  if (overrides.casos) {
    params.set('casos', overrides.casos.join(','));
  } else if (overrides.codigo) {
    params.set('codigo', overrides.codigo);
  }
  window.location.href = `${import.meta.env.BASE_URL}base-de-datos/index.html?${params.toString()}`;
}

function dragGrafo(simulation: NodoMutable) {
  function dragstarted(event: any, d: NodoMutable) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }
  function dragged(event: any, d: NodoMutable) {
    d.fx = event.x;
    d.fy = event.y;
  }
  function dragended(event: any, d: NodoMutable) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }
  return d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended);
}

export async function crearRelacionCrimenes(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const PALETA = {
    fondoPergamino: leerVariableCss('--mapa-fondo-pergamino', '#f4ecd8'),
    borde: leerVariableCss('--mapa-borde', '#6b4f2a'),
    tintaOscura: leerVariableCss('--mapa-tinta-oscura', '#3a2d1a'),
    acentoLinea: leerVariableCss('--mapa-acento-linea', '#bb4e99'),
  };
  const COLORES_SERIE = SERIE_FALLBACK.map((valor, i) =>
    leerVariableCss(`--mapa-serie-${i + 1}`, valor),
  );

  const rawViz = await d3.csv(`${import.meta.env.BASE_URL}data/Visualizaciones.csv`);

  const datosLimpios = rawViz
    .filter((d: FilaCsv) => d.Nombre_Codigo && d['Código'] && d.ID_Agente)
    .map((d: FilaCsv) => ({
      ...d,
      decada: getDecada(+d.Año),
    }));

  const estadoGrafo = { agente: 'Todos', atributo: 'Todos', genero: 'Todos' };

  const agentesLista = [...new Set(datosLimpios.map((d: FilaCsv) => d.Agente))]
    .filter(Boolean)
    .sort();
  const atributosLista = [...new Set(datosLimpios.map((d: FilaCsv) => d.Atributo))]
    .filter(Boolean)
    .sort();
  const generosLista = [...new Set(datosLimpios.map((d: FilaCsv) => d.Género))]
    .filter(Boolean)
    .sort();

  function crearSelectGrafo(etiqueta: string, opciones: any[], onChange: (v: any) => void) {
    const wrap = document.createElement('div');
    wrap.className = 'mapa-wrap-select-grafo';
    const label = document.createElement('label');
    label.textContent = etiqueta as unknown as string;
    label.className = 'filtro-label filtro-label--chico';
    const select = document.createElement('select');
    select.className = 'filtro-select filtro-select--compacto';
    ['Todos', ...opciones].forEach((op) => {
      const opt = document.createElement('option');
      opt.value = op as unknown as string;
      opt.textContent = op as unknown as string;
      select.appendChild(opt);
    });
    select.value = 'Todos';
    select.addEventListener('change', () => onChange(select.value));
    wrap.append(label, select);
    return wrap;
  }

  const filaFiltrosGrafo = document.createElement('div');
  filaFiltrosGrafo.className = 'mapa-fila-filtros-grafo';
  filaFiltrosGrafo.append(
    crearSelectGrafo('Agente', agentesLista, (valor: any) => {
      estadoGrafo.agente = valor;
      dibujarGrafo();
    }),
    crearSelectGrafo('Atributo', atributosLista, (valor: any) => {
      estadoGrafo.atributo = valor;
      dibujarGrafo();
    }),
    crearSelectGrafo('Género', generosLista, (valor: any) => {
      estadoGrafo.genero = valor;
      dibujarGrafo();
    }),
  );

  const botonVerCasosGrafo = crearBotonVerCasos();

  const areaGrafo = document.createElement('div');
  areaGrafo.className = 'mapa-area-grafo';

  container.append(filaFiltrosGrafo, botonVerCasosGrafo.boton, areaGrafo);

  const GRAFO_WIDTH = 700;
  const GRAFO_HEIGHT = 380;
  const GRAFO_PADDING = 40;

  const tooltipGrafo = document.createElement('div');
  tooltipGrafo.className = 'tooltip-grafico';

  let simulationGrafoRef: NodoMutable = null;

  function dibujarGrafo() {
    if (simulationGrafoRef) simulationGrafoRef.stop();
    botonVerCasosGrafo.ocultar();

    const rango = window.__obtenerRangoDecadaGrafo?.() ?? null;
    const filtrados = datosLimpios.filter(
      (d: FilaCsv) =>
        (!rango || (d.decada >= rango[0] && d.decada <= rango[1])) &&
        (estadoGrafo.agente === 'Todos' || d.Agente === estadoGrafo.agente) &&
        (estadoGrafo.atributo === 'Todos' || d.Atributo === estadoGrafo.atributo) &&
        (estadoGrafo.genero === 'Todos' || d.Género === estadoGrafo.genero),
    );

    const agenteCrimenes = new Map();
    const crimenInfo = new Map();
    filtrados.forEach((d: FilaCsv) => {
      const idAgente = d.ID_Agente;
      const codigo = d.Código;
      const nombre = d.Nombre_Codigo;
      if (!idAgente || !codigo) return;
      if (!agenteCrimenes.has(idAgente))
        agenteCrimenes.set(idAgente, { codigos: new Set(), idCaso: d.ID_Caso });
      agenteCrimenes.get(idAgente).codigos.add(codigo);
      if (!crimenInfo.has(codigo)) crimenInfo.set(codigo, { nombre, count: 0 });
      crimenInfo.get(codigo).count += 1;
    });

    const nodes = Array.from(crimenInfo, ([codigo, info]) => ({
      id: codigo,
      nombre: (info as any).nombre,
      count: (info as any).count,
    }));

    const edgeMap = new Map();
    const casosPorEdge = new Map();
    agenteCrimenes.forEach(({ codigos: codigosSet, idCaso }) => {
      const codigos = Array.from(codigosSet);
      if (codigos.length < 2) return;
      for (let i = 0; i < codigos.length; i++) {
        for (let j = i + 1; j < codigos.length; j++) {
          const [a, b] = [codigos[i], codigos[j]].sort();
          const key = `${a}|${b}`;
          edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
          if (!casosPorEdge.has(key)) casosPorEdge.set(key, new Set());
          if (idCaso) casosPorEdge.get(key).add(idCaso);
        }
      }
    });
    const links = Array.from(edgeMap, ([key, weight]) => {
      const [source, target] = key.split('|');
      return { source, target, weight, casos: [...(casosPorEdge.get(key) || [])] };
    });

    const adyacencia = new Map();
    nodes.forEach((n) => adyacencia.set(n.id, new Set()));
    links.forEach((l) => {
      adyacencia.get(l.source)?.add(l.target);
      adyacencia.get(l.target)?.add(l.source);
    });

    const vinculadosPorCodigo = new Map();
    nodes.forEach((n) => vinculadosPorCodigo.set(n.id, new Set()));
    agenteCrimenes.forEach(({ codigos: codigosSet }, idAgente) => {
      if (codigosSet.size < 2) return;
      codigosSet.forEach((codigo: string) => vinculadosPorCodigo.get(codigo)?.add(idAgente));
    });

    areaGrafo.innerHTML = '';
    areaGrafo.appendChild(tooltipGrafo);

    if (nodes.length === 0) {
      const aviso = document.createElement('div');
      aviso.className = 'mapa-aviso-vacio mapa-aviso-vacio--compacto';
      aviso.textContent = 'Sin casos con los filtros actuales';
      areaGrafo.appendChild(aviso);
      return;
    }

    const svg = d3
      .create('svg')
      .attr('viewBox', `0 0 ${GRAFO_WIDTH} ${GRAFO_HEIGHT}`)
      .attr('class', 'mapa-grafo-svg');

    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(nodes, (d: FilaCsv) => d.count) || 1])
      .range([7, 32]);
    const linkScale = d3
      .scaleLinear()
      .domain([1, d3.max(links, (d: FilaCsv) => d.weight) || 1])
      .range([1, 7]);
    const color = d3.scaleOrdinal(COLORES_SERIE).domain(nodes.map((d: FilaCsv) => d.id));

    const simulation = d3
      .forceSimulation(nodes as any)
      .force(
        'link',
        d3
          .forceLink(links)
          .id((d: FilaCsv) => d.id)
          .distance((d: FilaCsv) => 120 - linkScale(d.weight) * 4)
          .strength((d: FilaCsv) => 0.1 + linkScale(d.weight) * 0.02),
      )
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(GRAFO_WIDTH / 2, GRAFO_HEIGHT / 2))
      .force(
        'collide',
        d3.forceCollide((d: FilaCsv) => radiusScale(d.count) + 5),
      )
      .force('x', d3.forceX(GRAFO_WIDTH / 2).strength(0.05))
      .force('y', d3.forceY(GRAFO_HEIGHT / 2).strength(0.05));

    simulationGrafoRef = simulation;

    const link = svg
      .append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('class', 'mapa-grafo-link')
      .attr('stroke', PALETA.borde)
      .attr('stroke-opacity', 0.35)
      .attr('stroke-width', (d: FilaCsv) => linkScale(d.weight));

    const node = svg
      .append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('class', 'mapa-grafo-nodo')
      .attr('r', (d: FilaCsv) => radiusScale(d.count))
      .attr('fill', (d: FilaCsv) => color(d.id))
      .attr('stroke', PALETA.fondoPergamino)
      .attr('stroke-width', 1.5)
      .call(dragGrafo(simulation) as any);

    const label = svg
      .append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text((d: FilaCsv) => d.nombre)
      .attr('class', 'mapa-grafo-etiqueta')
      .attr('dy', (d: FilaCsv) => -radiusScale(d.count) - 6);

    let seleccionNodo: NodoMutable = null;
    let seleccionLink: NodoMutable = null;

    function limpiarSeleccionGrafo() {
      seleccionNodo = null;
      seleccionLink = null;
      botonVerCasosGrafo.ocultar();
      aplicarResaltado();
    }

    function aplicarResaltado() {
      if (seleccionNodo === null && seleccionLink === null) {
        node.attr('opacity', 1).attr('stroke', PALETA.fondoPergamino).attr('stroke-width', 1.5);
        link
          .attr('stroke', PALETA.borde)
          .attr('stroke-opacity', 0.35)
          .attr('stroke-width', (d: FilaCsv) => linkScale(d.weight));
        label.attr('opacity', 1);
        return;
      }

      const nodosActivos = new Set();
      const linksActivos = new Set();

      if (seleccionNodo !== null) {
        nodosActivos.add(seleccionNodo);
        (adyacencia.get(seleccionNodo) || new Set()).forEach((id: string) => nodosActivos.add(id));
        links.forEach((l) => {
          if (l.source.id === seleccionNodo || l.target.id === seleccionNodo) linksActivos.add(l);
        });
      } else if (seleccionLink !== null) {
        nodosActivos.add(seleccionLink.source.id);
        nodosActivos.add(seleccionLink.target.id);
        linksActivos.add(seleccionLink);
      }

      node
        .attr('opacity', (d: FilaCsv) => (nodosActivos.has(d.id) ? 1 : 0.15))
        .attr('stroke', (d: FilaCsv) =>
          seleccionNodo !== null && d.id === seleccionNodo
            ? PALETA.tintaOscura
            : PALETA.fondoPergamino,
        )
        .attr('stroke-width', (d: FilaCsv) =>
          seleccionNodo !== null && d.id === seleccionNodo ? 3 : 1.5,
        );
      label.attr('opacity', (d: FilaCsv) => (nodosActivos.has(d.id) ? 1 : 0.15));
      link
        .attr('stroke', (d: FilaCsv) => (linksActivos.has(d) ? PALETA.acentoLinea : '#ccc'))
        .attr('stroke-opacity', (d: FilaCsv) => (linksActivos.has(d) ? 0.9 : 0.1))
        .attr('stroke-width', (d: FilaCsv) =>
          linksActivos.has(d) ? linkScale(d.weight) + 2 : linkScale(d.weight),
        );
    }

    node.on('click', (event: MouseEvent, d: FilaCsv) => {
      event.stopPropagation();
      if (seleccionNodo === d.id) {
        limpiarSeleccionGrafo();
        return;
      }
      seleccionNodo = d.id;
      seleccionLink = null;
      aplicarResaltado();
      botonVerCasosGrafo.mostrar(d.nombre, () => irATablasFiltradas({ codigo: d.nombre }));
    });

    link.on('click', (event: MouseEvent, d: FilaCsv) => {
      event.stopPropagation();
      if (seleccionLink === d) {
        limpiarSeleccionGrafo();
        return;
      }
      seleccionLink = d;
      seleccionNodo = null;
      aplicarResaltado();
      const nombreOrigen = d.source.nombre || d.source;
      const nombreDestino = d.target.nombre || d.target;
      botonVerCasosGrafo.mostrar(`${nombreOrigen} ↔ ${nombreDestino}`, () =>
        irATablasFiltradas({ casos: d.casos }),
      );
    });

    svg.on('click', () => limpiarSeleccionGrafo());

    node
      .on('mouseenter', (event: MouseEvent, d: FilaCsv) => {
        const vinculados = vinculadosPorCodigo.get(d.id)?.size || 0;
        tooltipGrafo.innerHTML = `<strong>${d.nombre}</strong><br/>Casos: ${d.count}<br/>Vínculos con otros crímenes: ${vinculados}`;
        tooltipGrafo.classList.add('tooltip-grafico--visible');
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = areaGrafo.getBoundingClientRect();
        tooltipGrafo.style.left = event.clientX - rect.left + 12 + 'px';
        tooltipGrafo.style.top = event.clientY - rect.top + 12 + 'px';
      })
      .on('mouseleave', () => tooltipGrafo.classList.remove('tooltip-grafico--visible'));

    link
      .on('mouseenter', (event: MouseEvent, d: FilaCsv) => {
        tooltipGrafo.innerHTML = `${d.source.nombre || d.source} ↔ ${d.target.nombre || d.target}<br/>Agentes en común: <strong>${d.weight}</strong>`;
        tooltipGrafo.classList.add('tooltip-grafico--visible');
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = areaGrafo.getBoundingClientRect();
        tooltipGrafo.style.left = event.clientX - rect.left + 12 + 'px';
        tooltipGrafo.style.top = event.clientY - rect.top + 12 + 'px';
      })
      .on('mouseleave', () => tooltipGrafo.classList.remove('tooltip-grafico--visible'));

    simulation.on('tick', () => {
      nodes.forEach((d: FilaCsv) => {
        const r = radiusScale(d.count);
        d.x = Math.max(r + GRAFO_PADDING, Math.min(GRAFO_WIDTH - r - GRAFO_PADDING, d.x));
        d.y = Math.max(r + GRAFO_PADDING, Math.min(GRAFO_HEIGHT - r - GRAFO_PADDING, d.y));
      });
      link
        .attr('x1', (d: FilaCsv) => d.source.x)
        .attr('y1', (d: FilaCsv) => d.source.y)
        .attr('x2', (d: FilaCsv) => d.target.x)
        .attr('y2', (d: FilaCsv) => d.target.y);
      node.attr('cx', (d: FilaCsv) => d.x).attr('cy', (d: FilaCsv) => d.y);
      label.attr('x', (d: FilaCsv) => d.x).attr('y', (d: FilaCsv) => d.y);
    });

    areaGrafo.appendChild(svg.node()!);
  }

  window.__actualizarGrafoRelacionDashboard = dibujarGrafo;

  dibujarGrafo();
}
