import * as d3 from 'd3';
import type { Fila, Grupo } from './ComposicionDatos.js';
import { fmt } from './ComposicionDatos.js';

const ANCHO = 900;
const ALTO = 300;
const MARGEN = { top: 16, right: 24, bottom: 30, left: 44 };

interface Opciones {
  contenedor: HTMLElement;
  filas: Fila[];
  /** Grupos a dibujar, cada uno con su color (ya filtrados por el grupo activo). */
  grupos: Grupo[];
  desde: number;
  hasta: number;
  etiquetaCrimen: string;
  /** Cómo se llama lo que se cuenta, con plural entre paréntesis: "persona(s)". */
  unidad: string;
}

/** Personas distintas (por ID de agente) por década y grupo. */
function serie(filas: Fila[], grupo: Grupo, decadas: number[]) {
  // Una persona (ID_Agente) aparece en cada década en la que participa, pero
  // solo una vez por década aunque tenga varias participaciones.
  const agentes = new Map<number, Set<string>>(decadas.map((dc) => [dc, new Set()]));
  filas.forEach((f) => {
    if (f.grupo === grupo.clave) agentes.get(f.década)?.add(f.idAgente);
  });
  return decadas.map((dc) => ({ década: dc, valor: agentes.get(dc)!.size }));
}

export function dibujarLineaEvolucion({
  contenedor,
  filas,
  grupos,
  desde,
  hasta,
  etiquetaCrimen,
  unidad,
}: Opciones) {
  contenedor.innerHTML = '';

  if (filas.length === 0 || grupos.length === 0) {
    contenedor.innerHTML = `<p class="cs-vacio">No hay registros para esta selección.</p>`;
    return;
  }

  const decadas = d3.range(Math.floor(desde / 10) * 10, hasta + 1, 10);
  const series = grupos.map((g) => ({ grupo: g, puntos: serie(filas, g, decadas) }));
  const maxValor = d3.max(series, (s) => d3.max(s.puntos, (p) => p.valor)) || 1;

  const iw = ANCHO - MARGEN.left - MARGEN.right;
  const ih = ALTO - MARGEN.top - MARGEN.bottom;
  const x = d3
    .scalePoint<number>()
    .domain(decadas)
    .range([0, iw])
    .padding(decadas.length > 1 ? 0 : 0.5);
  const y = d3.scaleLinear().domain([0, maxValor]).nice().range([ih, 0]);

  const wrapper = document.createElement('div');
  wrapper.className = 'cs-linea-wrapper';
  contenedor.appendChild(wrapper);

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-grafico tooltip-grafico--neutro';
  wrapper.appendChild(tooltip);
  const moverTooltip = (event: MouseEvent) => {
    const rect = wrapper.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - rect.left + 12}px`;
    tooltip.style.top = `${event.clientY - rect.top + 12}px`;
  };

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${ANCHO} ${ALTO}`)
    .attr('class', 'cs-svg')
    .attr('role', 'img')
    .attr('aria-label', `Personas registradas por década · ${etiquetaCrimen}`);
  const g = svg.append('g').attr('transform', `translate(${MARGEN.left},${MARGEN.top})`);

  const ejeY = g.append('g').call(
    d3
      .axisLeft(y)
      .ticks(4)
      .tickSize(-iw)
      .tickFormat((v) => fmt(v as number)),
  );
  ejeY.select('.domain').remove();
  ejeY.selectAll('line').attr('class', 'cs-grilla');
  ejeY.selectAll('text').attr('class', 'cs-eje-texto').attr('x', -10);

  const paso = Math.max(1, Math.ceil(decadas.length / 10));
  g.append('g')
    .attr('transform', `translate(0,${ih})`)
    .call(
      d3
        .axisBottom(x)
        .tickValues(decadas.filter((_, i) => i % paso === 0))
        .tickSize(0),
    )
    .call((s) => s.select('.domain').attr('class', 'cs-eje-base'))
    .selectAll('text')
    .attr('class', 'cs-eje-texto')
    .attr('dy', '1.6em');

  const linea = d3
    .line<{ década: number; valor: number }>()
    .x((d) => x(d.década)!)
    .y((d) => y(d.valor))
    .curve(d3.curveMonotoneX);

  series.forEach(({ grupo, puntos }) => {
    const capa = g.append('g');
    capa
      .append('path')
      .datum(puntos)
      .attr('d', linea)
      .attr('fill', 'none')
      .attr('stroke', grupo.color)
      .attr('class', 'cs-trazo');
    capa
      .selectAll('circle')
      .data(puntos)
      .join('circle')
      .attr('cx', (d) => x(d.década)!)
      .attr('cy', (d) => y(d.valor))
      .attr('r', 3.5)
      .attr('fill', grupo.color)
      .attr('class', 'cs-punto')
      .on('mouseenter', (event: MouseEvent, d) => {
        tooltip.innerHTML = `<strong>${grupo.etiqueta}</strong><br/>Década de ${d.década}<br/>${fmt(d.valor)} ${unidad}`;
        tooltip.classList.add('tooltip-grafico--visible');
        moverTooltip(event);
      })
      .on('mousemove', moverTooltip)
      .on('mouseleave', () => tooltip.classList.remove('tooltip-grafico--visible'));
  });

  wrapper.appendChild(svg.node()!);

  const leyenda = document.createElement('div');
  leyenda.className = 'cs-leyenda-lineas';
  grupos.forEach((gr) => {
    const item = document.createElement('span');
    item.className = 'cs-leyenda-linea';
    item.innerHTML = `<i style="background:${gr.color}"></i>${gr.etiqueta}`;
    leyenda.appendChild(item);
  });
  contenedor.appendChild(leyenda);
}
