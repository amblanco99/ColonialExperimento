import * as d3 from 'd3';

// TODO: type — nodo de jerarquía de d3 mutado por el patrón del sunburst con
// zoom: se le cuelgan current y target con las coordenadas de la animación, y
// se leen x0/x1/y0/y1, que no están en HierarchyNode. Ver MIGRATION.md.
type NodoMutable = any;

// TODO: type — genéricos de selección/transición de d3. Ver MIGRATION.md.
type SeleccionD3 = any;
import { PALETA_GENERO, PALETA_ATRIBUTO } from './agentesComun.js';
import { crearBotonVerCasos, irATablasFiltradas } from './verCasos.js';

export function dibujarDelitosSunburstGenero(
  containerId: string,
  filas: any[],
  crimenSeleccionado: string | null,
) {
  const contenedor = document.getElementById(containerId);
  if (!contenedor) return;
  contenedor.innerHTML = '';
  contenedor.className = '';

  const hayCrimenFijado = !!crimenSeleccionado && crimenSeleccionado !== 'Todos';
  const filasHierarchy = hayCrimenFijado
    ? filas.filter((d: NodoMutable) => d.crimen === crimenSeleccionado && d.subcrimen)
    : filas;

  if (filasHierarchy.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'grafico-vacio';
    vacio.textContent = hayCrimenFijado
      ? `"${crimenSeleccionado}" no tiene subcrímenes registrados para los géneros activos.`
      : 'No hay datos para los géneros activos.';
    contenedor.appendChild(vacio);
    return;
  }

  const nestedMap = hayCrimenFijado
    ? d3.rollup(
        filasHierarchy,
        (v) => v.length,
        (d: NodoMutable) => d.genero,
        (d: NodoMutable) => d.atributo,
        (d: NodoMutable) => d.subcrimen,
      )
    : d3.rollup(
        filasHierarchy,
        (v) => v.length,
        (d: NodoMutable) => d.genero,
        (d: NodoMutable) => d.atributo,
        (d: NodoMutable) => d.crimen,
      );

  function mapToNode(name: any, value: any): NodoMutable {
    if (typeof value === 'number') return { name, value };
    return { name, children: Array.from(value, ([k, v]) => mapToNode(k, v)) };
  }

  const root: NodoMutable = d3
    .hierarchy(mapToNode('root', nestedMap))
    .sum((d: NodoMutable) => d.value!)
    .sort((a: NodoMutable, b: NodoMutable) => b.value! - a.value!);

  const width = 600;
  const height = width;
  const radius = width / 6;

  d3.partition().size([2 * Math.PI, root.height + 1])(root);
  root.each((d: NodoMutable) => (d.current = d));

  const PASOS_SOMBRA = [
    { l: 0.3, s: -0.05 },
    { l: -0.28, s: 0.1 },
    { l: 0.46, s: -0.1 },
    { l: -0.14, s: 0.05 },
    { l: 0.14, s: 0 },
    { l: -0.42, s: 0.15 },
    { l: 0.06, s: -0.08 },
    { l: -0.06, s: 0.08 },
  ];

  function getColor(d: NodoMutable) {
    if (d.depth === 1) return (PALETA_GENERO as Record<string, string>)[d.data.name] || '#999';
    if (d.depth === 2) return (PALETA_ATRIBUTO as Record<string, string>)[d.data.name] || '#888';

    const base = d3.hsl((PALETA_ATRIBUTO as Record<string, string>)[d.parent.data.name] || '#888');
    const hermanos = d.parent.children || [d];
    const idx = hermanos.indexOf(d);
    const paso = PASOS_SOMBRA[idx % PASOS_SOMBRA.length];
    const l = Math.min(0.88, Math.max(0.14, base.l + paso.l));
    const s = Math.min(1, Math.max(0.15, base.s + paso.s));
    return d3.hsl(base.h, s, l).formatHex();
  }

  const arc = (d3.arc() as SeleccionD3)
    .startAngle((d: NodoMutable) => d.x0)
    .endAngle((d: NodoMutable) => d.x1)
    .padAngle((d: NodoMutable) => Math.min((d.x1 - d.x0) / 2, 0.005))
    .padRadius(radius * 1.5)
    .innerRadius((d: NodoMutable) => d.y0 * radius)
    .outerRadius((d: NodoMutable) => Math.max(d.y0 * radius, d.y1 * radius - 1));

  const wrapper = document.createElement('div');
  wrapper.className = 'apilado-sankey-wrapper';
  contenedor.appendChild(wrapper);

  const botonVerCasos = crearBotonVerCasos();
  wrapper.appendChild(botonVerCasos.boton);

  let leafSeleccionado: NodoMutable = null;
  function overridesDeHoja(d: NodoMutable) {
    const genero = d.parent.parent.data.name;
    const atributo = d.parent.data.name;
    return hayCrimenFijado
      ? { genero, atributo, codigo: crimenSeleccionado, subcodigo: d.data.name }
      : { genero, atributo, codigo: d.data.name };
  }
  function seleccionarHoja(d: NodoMutable) {
    if (leafSeleccionado === d) {
      leafSeleccionado = null;
      botonVerCasos.ocultar();
      return;
    }
    leafSeleccionado = d;
    botonVerCasos.mostrar(cadenaDe(d), () => irATablasFiltradas(overridesDeHoja(d)));
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-grafico tooltip-grafico--neutro tooltip-grafico--ancho';
  wrapper.appendChild(tooltip);
  function moverTooltip(event: MouseEvent) {
    const rect = wrapper.getBoundingClientRect();
    tooltip.style.left = event.clientX - rect.left + 12 + 'px';
    tooltip.style.top = event.clientY - rect.top + 12 + 'px';
  }
  function cadenaDe(d: NodoMutable) {
    return d
      .ancestors()
      .map((n: NodoMutable) => n.data.name)
      .reverse()
      .slice(1)
      .join(' → ');
  }

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', 'sunburst-svg grafico-svg');

  const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);

  const path: SeleccionD3 = g
    .append('g')
    .selectAll('path')
    .data(root.descendants().slice(1))
    .join('path')
    .attr('fill', (d: NodoMutable) => getColor(d))
    .attr('fill-opacity', (d: NodoMutable) =>
      arcVisible(d.current) ? (d.children ? 0.75 : 0.55) : 0,
    )
    .attr('pointer-events', (d: NodoMutable) => (arcVisible(d.current) ? 'auto' : 'none'))
    .attr('d', (d: NodoMutable) => arc(d.current))
    .on('mouseenter', (event: MouseEvent, d: NodoMutable) => {
      const pct =
        d.parent && d.parent.value ? ((d.value! / d.parent.value) * 100).toFixed(1) : '100';
      tooltip.innerHTML = `
        <strong>${cadenaDe(d)}</strong><br/>
        ${d.value!.toLocaleString('es')} persona(s) (${pct}% de "${d.parent?.data.name ?? ''}")
      `;
      tooltip.classList.add('tooltip-grafico--visible');
      moverTooltip(event);
    })
    .on('mousemove', moverTooltip)
    .on('mouseleave', () => tooltip.classList.remove('tooltip-grafico--visible'));

  (path as SeleccionD3)
    .filter((d: NodoMutable) => d.children)
    .classed('sunburst-arco--clicable', true)
    .on('click', clicked);

  (path as SeleccionD3)
    .filter((d: NodoMutable) => !d.children)
    .classed('sunburst-arco--clicable', true)
    .on('click', (event: MouseEvent, d: NodoMutable) => {
      event.stopPropagation();
      seleccionarHoja(d);
    });

  const label: SeleccionD3 = g
    .append('g')
    .attr('class', 'sunburst-etiquetas')
    .selectAll('text')
    .data(root.descendants().slice(1))
    .join('text')
    .attr('class', 'sunburst-etiqueta')
    .attr('dy', '0.35em')
    .attr('fill-opacity', (d: NodoMutable) => +labelVisible(d.current))
    .attr('transform', (d: NodoMutable) => labelTransform(d.current))
    .each(function (this: any, d: NodoMutable) {
      const pct =
        d.parent && d.parent.value ? ((d.value! / d.parent.value) * 100).toFixed(1) : '100';
      d3.select(this)
        .append('tspan')
        .attr('x', 0)
        .attr('dy', '-0.4em')
        .text(truncate(d.data.name, d.current));
      d3.select(this)
        .append('tspan')
        .attr('class', 'sunburst-etiqueta-pct')
        .attr('x', 0)
        .attr('dy', '1.2em')
        .text(`${pct}%`);
    });

  const parent = g
    .append('circle')
    .datum(root)
    .attr('r', radius)
    .attr('class', 'sunburst-centro')
    .on('click', clicked);

  const centerText = g
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.35em')
    .attr('class', 'sunburst-texto-central')
    .text('← volver');

  function clicked(event: MouseEvent | null, p: NodoMutable) {
    parent.datum(p.parent || root);

    root.each(
      (d: NodoMutable) =>
        (d.target = {
          x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth),
        }),
    );

    const t = g.transition().duration(750);

    path
      .transition(t as SeleccionD3)
      .tween('data', (d: NodoMutable) => {
        const i = d3.interpolate(d.current, d.target);
        return (t: number) => (d.current = i(t));
      })
      .filter(function (this: any, d: NodoMutable) {
        return +(this as SVGElement).getAttribute('fill-opacity')! || arcVisible(d.target);
      })
      .attr('fill-opacity', (d: NodoMutable) =>
        arcVisible(d.target) ? (d.children ? 0.75 : 0.55) : 0,
      )
      .attr('pointer-events', (d: NodoMutable) => (arcVisible(d.target) ? 'auto' : 'none'))
      .attrTween('d', (d: NodoMutable) => () => arc(d.current));

    (label as SeleccionD3)
      .filter(function (this: any, d: NodoMutable) {
        return +(this as SVGElement).getAttribute('fill-opacity')! || labelVisible(d.target);
      })
      .transition(t as SeleccionD3)
      .attr('fill-opacity', (d: NodoMutable) => +labelVisible(d.target))
      .attrTween('transform', (d: NodoMutable) => () => labelTransform(d.current))
      .each(function (this: any, d: NodoMutable) {
        const pct =
          d.parent && d.parent.value ? ((d.value! / d.parent.value) * 100).toFixed(1) : '100';
        d3.select(this).selectAll('tspan').remove();
        d3.select(this)
          .append('tspan')
          .attr('x', 0)
          .attr('dy', '-0.4em')
          .text(truncate(d.data.name, d.target));
        d3.select(this)
          .append('tspan')
          .attr('class', 'sunburst-etiqueta-pct')
          .attr('x', 0)
          .attr('dy', '1.2em')
          .text(`${pct}%`);
      });

    centerText.text(p === root ? '' : `↩ ${p.data.name}`);
  }

  function arcVisible(d: NodoMutable) {
    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  }

  function labelVisible(d: NodoMutable) {
    return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.05;
  }

  function labelTransform(d: NodoMutable) {
    const x = ((d.x0 + d.x1) / 2) * (180 / Math.PI);
    const y = ((d.y0 + d.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  }

  function truncate(text: any, d: NodoMutable) {
    const available = (d.y1 - d.y0) * radius;
    const maxChars = Math.floor(available / 7);
    if (text.length > maxChars && maxChars > 3) {
      return text.slice(0, Math.max(0, maxChars - 2)) + '…';
    }
    return text;
  }

  wrapper.appendChild(svg.node()!);

  const nota = document.createElement('p');
  nota.className = 'filtro-nota';
  nota.textContent = hayCrimenFijado
    ? `Recorrido de las ${filasHierarchy.length.toLocaleString('es')} persona(s) con subcrimen registrado en "${crimenSeleccionado}". Clic en un anillo para hacer zoom.`
    : `Recorrido de las ${filasHierarchy.length.toLocaleString('es')} persona(s) registradas, todos los crímenes. Clic en un anillo para hacer zoom.`;
  contenedor.appendChild(nota);
}
