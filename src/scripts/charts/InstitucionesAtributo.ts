import * as d3 from "d3";
import { PALETA_TIPO, PALETA_ATRIBUTO } from "./agentesComun.js";
import { crearBotonVerCasos, irATablasFiltradas } from "./verCasos.js";

export function dibujarSunburst(containerId, eventosFiltrados, crimenSeleccionado) {
  const contenedor = document.getElementById(containerId);
  if (!contenedor) return;
  contenedor.innerHTML = "";

  const hayCrimenFijado = !!crimenSeleccionado && crimenSeleccionado !== "Todos";
  const eventosHierarchy = hayCrimenFijado
    ? eventosFiltrados.filter(d => d.crimen === crimenSeleccionado && d.subcrimen)
    : eventosFiltrados;

  if (eventosHierarchy.length === 0) {
    contenedor.innerHTML = hayCrimenFijado
      ? `<p class="agentes-vacio">"${crimenSeleccionado}" no tiene subcrímenes registrados para esta selección.</p>`
      : `<p class="agentes-vacio">No hay datos para esta selección.</p>`;
    return;
  }

  const nestedMap = hayCrimenFijado
    ? d3.rollup(eventosHierarchy, v => v.length, d => d.tipo, d => d.atributo, d => d.subcrimen)
    : d3.rollup(eventosHierarchy, v => v.length, d => d.tipo, d => d.atributo, d => d.crimen);

  function mapToNode(name, value) {
    if (typeof value === "number") {
      return { name, value };
    }
    return {
      name,
      children: Array.from(value, ([k, v]) => mapToNode(k, v)),
    };
  }

  const hierarchyData = mapToNode("root", nestedMap);

  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);

  const width = 550;
  const height = width;
  const radius = width / 6;

  d3.partition().size([2 * Math.PI, root.height + 1])(root);
  root.each(d => (d.current = d));

  const PASOS_SOMBRA = [
    { l: 0.30, s: -0.05 },
    { l: -0.28, s: 0.10 },
    { l: 0.46, s: -0.10 },
    { l: -0.14, s: 0.05 },
    { l: 0.14, s: 0 },
    { l: -0.42, s: 0.15 },
    { l: 0.06, s: -0.08 },
    { l: -0.06, s: 0.08 },
  ];

  function getColor(d) {
    if (d.depth === 1) return PALETA_TIPO[d.data.name] || "#999";
    if (d.depth === 2) return PALETA_ATRIBUTO[d.data.name] || "#888";

    const base = d3.hsl(PALETA_ATRIBUTO[d.parent.data.name] || "#888");
    const hermanos = d.parent.children || [d];
    const idx = hermanos.indexOf(d);
    const paso = PASOS_SOMBRA[idx % PASOS_SOMBRA.length];
    const l = Math.min(0.88, Math.max(0.14, base.l + paso.l));
    const s = Math.min(1, Math.max(0.15, base.s + paso.s));
    return d3.hsl(base.h, s, l).formatHex();
  }

  const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
    .padRadius(radius * 1.5)
    .innerRadius(d => d.y0 * radius)
    .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

  const botonVerCasos = crearBotonVerCasos();
  contenedor.appendChild(botonVerCasos.boton);

  function cadenaDe(d) {
    return d.ancestors().map(n => n.data.name).reverse().slice(1).join(" → ");
  }

  let leafSeleccionado = null;
  function overridesDeHoja(d) {
    const agente = d.parent.parent.data.name;
    const atributo = d.parent.data.name;
    return hayCrimenFijado
      ? { agente, atributo, codigo: crimenSeleccionado, subcodigo: d.data.name }
      : { agente, atributo, codigo: d.data.name };
  }
  function seleccionarHoja(d) {
    if (leafSeleccionado === d) {
      leafSeleccionado = null;
      botonVerCasos.ocultar();
      return;
    }
    leafSeleccionado = d;
    botonVerCasos.mostrar(cadenaDe(d), () => irATablasFiltradas(overridesDeHoja(d)));
  }

  const svg = d3.create("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("class", "sunburst-svg grafico-svg");

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  const path = g.append("g")
    .selectAll("path")
    .data(root.descendants().slice(1))
    .join("path")
    .attr("fill", d => getColor(d))
    .attr("fill-opacity", d =>
      arcVisible(d.current) ? (d.children ? 0.65 : 0.45) : 0
    )
    .attr("pointer-events", d => arcVisible(d.current) ? "auto" : "none")
    .attr("d", d => arc(d.current));

  path.append("title").text(d => {
    const pct = d.parent && d.parent.value
      ? ((d.value / d.parent.value) * 100).toFixed(1)
      : "100";
    const ruta = d.ancestors()
      .map(n => n.data.name)
      .reverse()
      .slice(1)
      .join(" → ");
    return `${ruta}\n${d.value} agentes (${pct}% de "${d.parent?.data.name ?? ""}")`;
  });

  path.filter(d => d.children)
    .classed("sunburst-arco--clicable", true)
    .on("click", clicked);

  path.filter(d => !d.children)
    .classed("sunburst-arco--clicable", true)
    .on("click", (event, d) => {
      event.stopPropagation();
      seleccionarHoja(d);
    });

  const label = g.append("g")
    .attr("class", "sunburst-etiquetas")
    .selectAll("text")
    .data(root.descendants().slice(1))
    .join("text")
    .attr("class", "sunburst-etiqueta")
    .attr("dy", "0.35em")
    .attr("fill-opacity", d => +labelVisible(d.current))
    .attr("transform", d => labelTransform(d.current))
    .each(function (d) {
      const pct = d.parent && d.parent.value
        ? ((d.value / d.parent.value) * 100).toFixed(1)
        : "100";
      const name = truncate(d.data.name, d.current);
      d3.select(this).append("tspan")
        .attr("x", 0).attr("dy", "-0.4em")
        .text(name);
      d3.select(this).append("tspan")
        .attr("class", "sunburst-etiqueta-pct")
        .attr("x", 0).attr("dy", "1.2em")
        .text(`${pct}%`);
    });

  const parent = g.append("circle")
    .datum(root)
    .attr("r", radius)
    .attr("class", "sunburst-centro")
    .on("click", clicked);

  const centerText = g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .attr("class", "sunburst-texto-central")
    .text("← volver");

  function clicked(event, p) {
    parent.datum(p.parent || root);

    root.each(d => (d.target = {
      x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
      y0: Math.max(0, d.y0 - p.depth),
      y1: Math.max(0, d.y1 - p.depth),
    }));

    const t = g.transition().duration(750);

    path.transition(t)
      .tween("data", d => {
        const i = d3.interpolate(d.current, d.target);
        return t => (d.current = i(t));
      })
      .filter(function (d) {
        return +this.getAttribute("fill-opacity") || arcVisible(d.target);
      })
      .attr("fill-opacity", d =>
        arcVisible(d.target) ? (d.children ? 0.65 : 0.45) : 0
      )
      .attr("pointer-events", d => arcVisible(d.target) ? "auto" : "none")
      .attrTween("d", d => () => arc(d.current));

    label.filter(function (d) {
      return +this.getAttribute("fill-opacity") || labelVisible(d.target);
    }).transition(t)
      .attr("fill-opacity", d => +labelVisible(d.target))
      .attrTween("transform", d => () => labelTransform(d.current))
      .each(function (d) {
        const pct = d.parent && d.parent.value
          ? ((d.value / d.parent.value) * 100).toFixed(1)
          : "100";
        d3.select(this).selectAll("tspan").remove();
        d3.select(this).append("tspan")
          .attr("x", 0).attr("dy", "-0.4em")
          .text(truncate(d.data.name, d.target));
        d3.select(this).append("tspan")
          .attr("class", "sunburst-etiqueta-pct")
          .attr("x", 0).attr("dy", "1.2em")
          .text(`${pct}%`);
      });

    centerText.text(p === root ? "" : `↩ ${p.data.name}`);
  }

  function arcVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && d.x1 > d.x0;
  }

  function labelVisible(d) {
    return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.05;
  }

  function labelTransform(d) {
    const x = ((d.x0 + d.x1) / 2) * (180 / Math.PI);
    const y = ((d.y0 + d.y1) / 2) * radius;
    return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
  }

  function truncate(text, d) {
    const available = (d.y1 - d.y0) * radius;
    const maxChars = Math.floor(available / 7);
    if (text.length > maxChars && maxChars > 3) {
      return text.slice(0, Math.max(0, maxChars - 2)) + "…";
    }
    return text;
  }

  const wrapper = document.createElement("div");
  wrapper.className = "grafico-wrapper";
  wrapper.appendChild(svg.node());
  contenedor.appendChild(wrapper);
}
