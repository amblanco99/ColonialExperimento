import * as d3 from 'd3';
import type { Fila, Grupo } from './ComposicionDatos.js';
import { fmt } from './ComposicionDatos.js';
import { PALETA_ATRIBUTO, PALETA_GENERO } from './agentesComun.js';

const ANCHO = 1000;
const ALTO = 460;
const RELACIONES_COMUNES = 10;
// A partir de aquí el grafo se considera denso: nodos y vínculos más chicos y
// sin etiquetas en los nodos que no son destacados (el tooltip los nombra).
const UMBRAL_DENSO = 30;
const SEP = ' ↔ ';

// Sin grupo elegido, los delitos principales de la barra van en color y el resto
// en un tono apagado. Con un grupo elegido, todos toman el color de ese grupo.
const COLORES_DESTACADOS = [
  (PALETA_GENERO as Record<string, string>).Hombre,
  (PALETA_GENERO as Record<string, string>).Mujer,
  (PALETA_GENERO as Record<string, string>)['Sin información'],
  (PALETA_ATRIBUTO as Record<string, string>)['Víctima'],
];
const COLOR_APAGADO = '#8b7048';

interface Nodo extends d3.SimulationNodeDatum {
  id: string;
  casos: number;
}

interface Vinculo extends d3.SimulationLinkDatum<Nodo> {
  source: Nodo;
  target: Nodo;
  peso: number;
  /** Casos donde coinciden los dos crímenes, para "Ver casos". */
  idCasos: string[];
}

interface Opciones {
  contenedor: HTMLElement;
  /** Filas del rango de años y del grupo activo, sin filtrar por crimen. */
  filas: Fila[];
  /** Los delitos principales de la barra doble: se dibujan en color. */
  destacados: string[];
  /** Grupo (género o tipo) elegido: sus casos son los únicos que se cuentan. */
  grupoActivo: Grupo | null;
  crimenActivo: string | null;
  /** false: solo las relaciones más comunes; true: todas. */
  verTodas: boolean;
  alAlternarVerTodas: () => void;
  alSeleccionarCrimen: (crimen: string) => void;
}

// La simulación sigue viva mientras se arrastra un nodo; al redibujar hay que
// detener la anterior o seguirían moviendo nodos que ya no existen.
const simulaciones = new WeakMap<HTMLElement, d3.Simulation<Nodo, Vinculo>>();

function abreviar(texto: string, max: number) {
  return texto.length > max ? `${texto.slice(0, Math.max(1, max - 1)).trimEnd()}.` : texto;
}

function irATabla(params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  window.location.href = `${import.meta.env.BASE_URL}base-de-datos/index.html?${query}`;
}

export function dibujarRed({
  contenedor,
  filas,
  destacados,
  grupoActivo,
  crimenActivo,
  verTodas,
  alAlternarVerTodas,
  alSeleccionarCrimen,
}: Opciones) {
  simulaciones.get(contenedor)?.stop();
  contenedor.innerHTML = '';

  // Qué crímenes aparecen en cada caso. Una relación es "dos crímenes en el
  // mismo caso", sin importar cuántos agentes los compartan.
  const crimenesDeCaso = new Map<string, Set<string>>();
  const casosDeCrimen = new Map<string, Set<string>>();
  filas.forEach((f) => {
    if (!crimenesDeCaso.has(f.idCaso)) crimenesDeCaso.set(f.idCaso, new Set());
    crimenesDeCaso.get(f.idCaso)!.add(f.crimen);
    if (!casosDeCrimen.has(f.crimen)) casosDeCrimen.set(f.crimen, new Set());
    casosDeCrimen.get(f.crimen)!.add(f.idCaso);
  });

  const casosPorPar = new Map<string, Set<string>>();
  crimenesDeCaso.forEach((crimenes, idCaso) => {
    const lista = [...crimenes].sort();
    for (let i = 0; i < lista.length; i++) {
      for (let j = i + 1; j < lista.length; j++) {
        const clave = `${lista[i]}${SEP}${lista[j]}`;
        if (!casosPorPar.has(clave)) casosPorPar.set(clave, new Set());
        casosPorPar.get(clave)!.add(idCaso);
      }
    }
  });

  const totalRelaciones = casosPorPar.size;
  if (totalRelaciones === 0) {
    contenedor.innerHTML = `<p class="cs-vacio">Ningún caso combina dos delitos con esta selección.</p>`;
    return;
  }

  const ordenadas = [...casosPorPar].sort(
    (a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]),
  );
  const elegidas = verTodas ? ordenadas : ordenadas.slice(0, RELACIONES_COMUNES);

  const nodos = new Map<string, Nodo>();
  const nodo = (id: string) => {
    if (!nodos.has(id)) nodos.set(id, { id, casos: casosDeCrimen.get(id)?.size ?? 0 });
    return nodos.get(id)!;
  };
  const vinculos: Vinculo[] = elegidas.map(([clave, casos]) => {
    const [a, b] = clave.split(SEP);
    return { source: nodo(a), target: nodo(b), peso: casos.size, idCasos: [...casos] };
  });
  const lista = [...nodos.values()];
  const denso = vinculos.length > UMBRAL_DENSO;

  const radio = d3
    .scaleSqrt()
    .domain([0, d3.max(lista, (n) => n.casos) || 1])
    .range(denso ? [7, 30] : [10, 42]);
  const grosor = d3
    .scaleLinear()
    .domain([1, d3.max(vinculos, (v) => v.peso) || 1])
    .range(denso ? [0.8, 6] : [1.5, 7]);

  const margenX = 50;
  const margenY = 34;
  const limitar = (n: Nodo) => {
    const r = radio(n.casos);
    n.x = Math.max(r + margenX, Math.min(ANCHO - r - margenX, n.x ?? ANCHO / 2));
    n.y = Math.max(r + margenY, Math.min(ALTO - r - margenY - 10, n.y ?? ALTO / 2));
  };

  const simulacion = d3
    .forceSimulation(lista)
    .force(
      'link',
      d3
        .forceLink<Nodo, Vinculo>(vinculos)
        .id((n) => n.id)
        .distance((v) => (denso ? 150 : 190) - grosor(v.peso) * 6)
        .strength(denso ? 0.2 : 0.5),
    )
    .force('charge', d3.forceManyBody().strength(denso ? -560 : -700))
    .force('center', d3.forceCenter(ANCHO / 2, ALTO / 2))
    .force(
      'collide',
      d3.forceCollide<Nodo>((n) => radio(n.casos) + (denso ? 6 : 26)),
    )
    .force('x', d3.forceX(ANCHO / 2).strength(0.05))
    .force('y', d3.forceY(ALTO / 2).strength(0.05))
    .stop();
  simulaciones.set(contenedor, simulacion);

  // Se asienta de una vez para que el grafo no aparezca en movimiento; solo
  // vuelve a moverse cuando se arrastra un nodo.
  for (let i = 0; i < 300; i++) {
    simulacion.tick();
    lista.forEach(limitar);
  }

  const vecinos = new Map<string, Set<string>>(lista.map((n) => [n.id, new Set([n.id])]));
  vinculos.forEach((v) => {
    vecinos.get(v.source.id)!.add(v.target.id);
    vecinos.get(v.target.id)!.add(v.source.id);
  });
  const enGrafo = crimenActivo !== null && vecinos.has(crimenActivo);

  // ── Botón "Ver casos" (nodo activo o vínculo seleccionado) ──
  const botonCasos = document.createElement('button');
  botonCasos.type = 'button';
  botonCasos.className = 'cs-ver-casos';
  let alVerCasos: (() => void) | null = null;
  botonCasos.addEventListener('click', () => alVerCasos?.());
  contenedor.appendChild(botonCasos);

  function mostrarBoton(texto: string | null, accion?: () => void) {
    botonCasos.classList.toggle('cs-ver-casos--visible', texto !== null);
    botonCasos.textContent = texto === null ? '' : `Ver casos: ${texto}`;
    alVerCasos = accion ?? null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'cs-red-wrapper';
  contenedor.appendChild(wrapper);

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-grafico tooltip-grafico--neutro';
  wrapper.appendChild(tooltip);
  const moverTooltip = (event: MouseEvent) => {
    const rect = wrapper.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - rect.left + 12}px`;
    tooltip.style.top = `${event.clientY - rect.top + 12}px`;
  };
  const mostrar = (event: MouseEvent, html: string) => {
    tooltip.innerHTML = html;
    tooltip.classList.add('tooltip-grafico--visible');
    moverTooltip(event);
  };
  const ocultar = () => tooltip.classList.remove('tooltip-grafico--visible');

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${ANCHO} ${ALTO}`)
    .attr('class', 'cs-svg')
    .attr('role', 'img')
    .attr('aria-label', 'Delitos que coinciden con más frecuencia en un mismo caso');

  const capaVinculos = svg.append('g');
  const vinculoVisible = capaVinculos
    .selectAll('line')
    .data(vinculos)
    .join('line')
    .attr('class', 'cs-red-vinculo')
    .attr('stroke-width', (v) => grosor(v.peso));
  // Copia transparente y más gruesa: los vínculos finos son difíciles de acertar.
  const vinculoHit = capaVinculos
    .selectAll('line.cs-red-vinculo-hit')
    .data(vinculos)
    .join('line')
    .attr('class', 'cs-red-vinculo-hit');

  const grupos = svg
    .append('g')
    .selectAll<SVGGElement, Nodo>('g')
    .data(lista)
    .join('g')
    .attr('class', 'cs-red-nodo')
    .attr('role', 'button')
    .attr('tabindex', 0)
    .attr('aria-pressed', (n) => n.id === crimenActivo)
    .attr('aria-label', (n) => `${n.id}, ${fmt(n.casos)} caso(s)`);

  const idxDestacado = new Map(destacados.map((nombre, i) => [nombre, i]));
  const colorNodo = (id: string) => {
    if (grupoActivo) return grupoActivo.color;
    const i = idxDestacado.get(id);
    return i === undefined ? COLOR_APAGADO : COLORES_DESTACADOS[i % COLORES_DESTACADOS.length];
  };

  grupos
    .append('circle')
    .attr('r', (n) => radio(n.casos))
    .attr('fill', (n) => colorNodo(n.id))
    .attr('class', (n) =>
      n.id === crimenActivo ? 'cs-red-circulo cs-red-circulo--activo' : 'cs-red-circulo',
    );

  grupos.each(function (n) {
    const g = d3.select(this);
    const r = radio(n.casos);
    const destacado = idxDestacado.has(n.id);
    const cercano = enGrafo && vecinos.get(crimenActivo!)!.has(n.id);
    // El texto claro del interior solo se lee sobre los colores oscuros de los
    // nodos destacados; con un grupo elegido las etiquetas van fuera.
    if (!grupoActivo && destacado && r >= 22) {
      g.append('text')
        .attr('class', 'cs-red-etiqueta cs-red-etiqueta--dentro')
        .attr('dy', '0.35em')
        .text(abreviar(n.id, Math.floor((r * 2) / 6.4)));
    } else if (!denso || destacado || cercano) {
      g.append('text')
        .attr(
          'class',
          destacado
            ? 'cs-red-etiqueta cs-red-etiqueta--fuera'
            : 'cs-red-etiqueta cs-red-etiqueta--apagada',
        )
        .attr('y', r + 14)
        .text(abreviar(n.id, 16));
    }
  });

  // ── Resaltado: el delito filtrado o el vínculo seleccionado ──
  let vinculoSeleccionado: Vinculo | null = null;

  function aplicarResaltado() {
    const nodosActivos = new Set<string>();
    let hayEnfoque = false;
    if (vinculoSeleccionado) {
      hayEnfoque = true;
      nodosActivos.add(vinculoSeleccionado.source.id);
      nodosActivos.add(vinculoSeleccionado.target.id);
    } else if (enGrafo) {
      hayEnfoque = true;
      vecinos.get(crimenActivo!)!.forEach((id) => nodosActivos.add(id));
    }
    const vinculoActivo = (v: Vinculo) =>
      vinculoSeleccionado
        ? v === vinculoSeleccionado
        : v.source.id === crimenActivo || v.target.id === crimenActivo;

    grupos.attr('opacity', (n) => (!hayEnfoque || nodosActivos.has(n.id) ? 1 : 0.25));
    vinculoVisible
      .attr('opacity', (v) => (!hayEnfoque || vinculoActivo(v) ? 1 : 0.15))
      .classed('cs-red-vinculo--activo', (v) => hayEnfoque && vinculoActivo(v));
  }

  function actualizarBoton() {
    if (vinculoSeleccionado) {
      const { source, target, idCasos } = vinculoSeleccionado;
      mostrarBoton(`${source.id} ↔ ${target.id}`, () => irATabla({ casos: idCasos.join(',') }));
    } else if (enGrafo) {
      mostrarBoton(crimenActivo, () => irATabla({ codigo: crimenActivo! }));
    } else {
      mostrarBoton(null);
    }
  }

  vinculoHit
    .on('click', (event: MouseEvent, v) => {
      event.stopPropagation();
      vinculoSeleccionado = vinculoSeleccionado === v ? null : v;
      aplicarResaltado();
      actualizarBoton();
    })
    .on('mouseenter', (event: MouseEvent, v) =>
      mostrar(
        event,
        `${v.source.id} ↔ ${v.target.id}<br/>Casos en común: <strong>${fmt(v.peso)}</strong><br/><em>Clic para ver sus casos</em>`,
      ),
    )
    .on('mousemove', moverTooltip)
    .on('mouseleave', ocultar);

  svg.on('click', () => {
    if (!vinculoSeleccionado) return;
    vinculoSeleccionado = null;
    aplicarResaltado();
    actualizarBoton();
  });

  grupos
    .on('click', (event: MouseEvent, n) => {
      event.stopPropagation();
      alSeleccionarCrimen(n.id);
    })
    .on('keydown', (event: KeyboardEvent, n) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        alSeleccionarCrimen(n.id);
      }
    })
    .on('mouseenter', (event: MouseEvent, n) =>
      mostrar(
        event,
        `<strong>${n.id}</strong><br/>Casos: ${fmt(n.casos)}<br/><em>Clic para filtrar · arrastra para mover</em>`,
      ),
    )
    .on('mousemove', moverTooltip)
    .on('mouseleave', ocultar)
    .call(
      d3
        .drag<SVGGElement, Nodo>()
        .on('start', (event, n) => {
          if (!event.active) simulacion.alphaTarget(0.3).restart();
          n.fx = n.x;
          n.fy = n.y;
        })
        .on('drag', (event, n) => {
          n.fx = event.x;
          n.fy = event.y;
        })
        .on('end', (event, n) => {
          if (!event.active) simulacion.alphaTarget(0);
          n.fx = null;
          n.fy = null;
        }),
    );

  function pintarPosiciones() {
    vinculoVisible
      .attr('x1', (v) => v.source.x!)
      .attr('y1', (v) => v.source.y!)
      .attr('x2', (v) => v.target.x!)
      .attr('y2', (v) => v.target.y!);
    vinculoHit
      .attr('x1', (v) => v.source.x!)
      .attr('y1', (v) => v.source.y!)
      .attr('x2', (v) => v.target.x!)
      .attr('y2', (v) => v.target.y!);
    grupos.attr('transform', (n) => `translate(${n.x},${n.y})`);
  }
  pintarPosiciones();
  aplicarResaltado();
  actualizarBoton();

  simulacion.on('tick', () => {
    lista.forEach(limitar);
    pintarPosiciones();
  });

  wrapper.appendChild(svg.node()!);

  // ── Pie: cuántas relaciones se ven y cómo cambiar ──
  const pie = document.createElement('p');
  pie.className = 'cs-nota';
  const puedeAlternar = totalRelaciones > RELACIONES_COMUNES;
  pie.append(
    verTodas || !puedeAlternar
      ? `Mostrando las ${fmt(vinculos.length)} relaciones · `
      : `Mostrando las ${fmt(vinculos.length)} relaciones más comunes de ${fmt(totalRelaciones)} · `,
    'arrastra los nodos para moverlos',
  );
  if (puedeAlternar) {
    pie.append(' · ');
    const alternar = document.createElement('button');
    alternar.type = 'button';
    alternar.className = 'cs-enlace';
    alternar.setAttribute('aria-pressed', String(verTodas));
    alternar.textContent = verTodas
      ? 'ver solo las más comunes'
      : `ver todas las relaciones (${fmt(totalRelaciones)})`;
    alternar.addEventListener('click', alAlternarVerTodas);
    pie.appendChild(alternar);
  }
  contenedor.appendChild(pie);
}
