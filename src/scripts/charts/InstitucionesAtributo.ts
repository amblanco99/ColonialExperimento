import * as d3 from 'd3';

// TODO: type — nodo de jerarquía de d3 mutado por el patrón del sunburst con
// zoom: se le cuelgan current y target con las coordenadas de la animación, y
// se leen x0/x1/y0/y1, que no están en HierarchyNode. Ver MIGRATION.md.
type NodoMutable = any;

// TODO: type — genéricos de selección/transición de d3. Ver MIGRATION.md.
type SeleccionD3 = any;
import { PALETA_TIPO, PALETA_ATRIBUTO } from './agentesComun.js';
import { crearBotonVerCasos, irATablasFiltradas } from './verCasos.js';
import { colorDeCrimen } from './coloresCrimen.js';

export function dibujarSunburst(
  containerId: string,
  eventosFiltrados: any[],
  crimenSeleccionado: string | null,
  opciones: { unNivel?: boolean } = {},
) {
  const contenedor = document.getElementById(containerId);
  if (!contenedor) return;
  // Un nivel a la vez: solo se ve el anillo pegado al centro. Al hacer clic en
  // un sector se baja al siguiente nivel y el centro sube de vuelta.
  const unNivel = opciones.unNivel === true;
  const nivelesVisibles = unNivel ? 2 : 3;
  contenedor.innerHTML = '';

  const hayCrimenFijado = !!crimenSeleccionado && crimenSeleccionado !== 'Todos';
  const eventosHierarchy = hayCrimenFijado
    ? eventosFiltrados.filter((d: NodoMutable) => d.crimen === crimenSeleccionado && d.subcrimen)
    : eventosFiltrados;

  if (eventosHierarchy.length === 0) {
    contenedor.innerHTML = hayCrimenFijado
      ? `<p class="agentes-vacio">"${crimenSeleccionado}" no tiene subcrímenes registrados para esta selección.</p>`
      : `<p class="agentes-vacio">No hay datos para esta selección.</p>`;
    return;
  }

  const nestedMap = hayCrimenFijado
    ? d3.rollup(
        eventosHierarchy,
        (v) => v.length,
        (d: NodoMutable) => d.tipo,
        (d: NodoMutable) => d.atributo,
        (d: NodoMutable) => d.subcrimen,
      )
    : d3.rollup(
        eventosHierarchy,
        (v) => v.length,
        (d: NodoMutable) => d.tipo,
        (d: NodoMutable) => d.atributo,
        (d: NodoMutable) => d.crimen,
      );

  function mapToNode(name: any, value: any): NodoMutable {
    if (typeof value === 'number') {
      return { name, value };
    }
    return {
      name,
      children: Array.from(value, ([k, v]) => mapToNode(k, v)),
    };
  }

  const hierarchyData = mapToNode('root', nestedMap);

  const root: NodoMutable = d3
    .hierarchy(hierarchyData)
    .sum((d: NodoMutable) => d.value!)
    .sort((a: NodoMutable, b: NodoMutable) => b.value! - a.value!);

  const width = 550;
  const height = width;
  const radius = unNivel ? width / 4.5 : width / 6;

  d3.partition().size([2 * Math.PI, root.height + 1])(root);
  root.each((d: NodoMutable) => (d.current = d));

  // La hoja (depth 3) es un crimen o un subcrimen, según haya uno fijado —
  // usa el mismo color establecido para ese crimen en todo el sitio (ver
  // coloresCrimen.ts), no un matiz derivado del atributo del padre.
  const codigoPorNombreCrimen = new Map<string, string>();
  const codigoPorNombreSubcrimen = new Map<string, string>();
  eventosFiltrados.forEach((f: NodoMutable) => {
    if (f.crimen && !codigoPorNombreCrimen.has(f.crimen)) {
      codigoPorNombreCrimen.set(f.crimen, f.codigoCrimen);
    }
    if (f.subcrimen && !codigoPorNombreSubcrimen.has(f.subcrimen)) {
      codigoPorNombreSubcrimen.set(f.subcrimen, f.codigoSubcrimen);
    }
  });

  function getColor(d: NodoMutable) {
    if (d.depth === 1) return (PALETA_TIPO as Record<string, string>)[d.data.name] || '#999';
    if (d.depth === 2) return (PALETA_ATRIBUTO as Record<string, string>)[d.data.name] || '#888';

    const codigo = hayCrimenFijado
      ? codigoPorNombreSubcrimen.get(d.data.name)
      : codigoPorNombreCrimen.get(d.data.name);
    return colorDeCrimen(codigo);
  }

  const arc = (d3.arc() as SeleccionD3)
    .startAngle((d: NodoMutable) => d.x0)
    .endAngle((d: NodoMutable) => d.x1)
    .padAngle((d: NodoMutable) => Math.min((d.x1 - d.x0) / 2, 0.005))
    .padRadius(radius * 1.5)
    .innerRadius((d: NodoMutable) => d.y0 * radius)
    .outerRadius((d: NodoMutable) => Math.max(d.y0 * radius, d.y1 * radius - 1));

  const botonVerCasos = crearBotonVerCasos();
  contenedor.appendChild(botonVerCasos.boton);

  function cadenaDe(d: NodoMutable) {
    return d
      .ancestors()
      .map((n: NodoMutable) => n.data.name)
      .reverse()
      .slice(1)
      .join(' → ');
  }

  let leafSeleccionado: NodoMutable = null;
  function overridesDeHoja(d: NodoMutable) {
    const agente = d.parent.parent.data.name;
    const atributo = d.parent.data.name;
    return hayCrimenFijado
      ? { agente, atributo, codigo: crimenSeleccionado, subcodigo: d.data.name }
      : { agente, atributo, codigo: d.data.name };
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

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('class', `sunburst-svg grafico-svg${unNivel ? ' sunburst-svg--un-nivel' : ''}`);

  const g = svg.append('g').attr('transform', `translate(${width / 2},${height / 2})`);

  const path: SeleccionD3 = g
    .append('g')
    .selectAll('path')
    .data(root.descendants().slice(1))
    .join('path')
    .attr('fill', (d: NodoMutable) => getColor(d))
    .attr('fill-opacity', (d: NodoMutable) =>
      arcVisible(d.current) ? (d.children ? 0.65 : 0.45) : 0,
    )
    .attr('pointer-events', (d: NodoMutable) => (arcVisible(d.current) ? 'auto' : 'none'))
    .attr('d', (d: NodoMutable) => arc(d.current));

  path.append('title').text((d: NodoMutable) => {
    const pct = d.parent && d.parent.value ? ((d.value! / d.parent.value) * 100).toFixed(1) : '100';
    const ruta = d
      .ancestors()
      .map((n: NodoMutable) => n.data.name)
      .reverse()
      .slice(1)
      .join(' → ');
    return `${ruta}\n${d.value!} agentes (${pct}% de "${d.parent?.data.name ?? ''}")`;
  });

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
      const name = truncate(d.data.name, d.current);
      d3.select(this).append('tspan').attr('x', 0).attr('dy', '-0.4em').text(name);
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
    .text(unNivel ? '' : '← volver');

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
        arcVisible(d.target) ? (d.children ? 0.65 : 0.45) : 0,
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
    return d.y1 <= nivelesVisibles && d.y0 >= 1 && d.x1 > d.x0;
  }

  function labelVisible(d: NodoMutable) {
    return d.y1 <= nivelesVisibles && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.05;
  }

  function labelTransform(d: NodoMutable) {
    const x = ((d.x0 + d.x1) / 2) * (180 / Math.PI);
    const y = ((d.y0 + d.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  }

  function truncate(text: any, d: NodoMutable) {
    const available = (d.y1 - d.y0) * radius;
    const maxChars = Math.floor(available / (unNivel ? 8.5 : 7));
    if (text.length > maxChars && maxChars > 3) {
      return text.slice(0, Math.max(0, maxChars - 2)) + '…';
    }
    return text;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'grafico-wrapper';
  wrapper.appendChild(svg.node()!);
  contenedor.appendChild(wrapper);
}
