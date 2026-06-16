import * as d3 from "d3";

export async function crearPoblaInstiSunburst() {

  // ── Cargar datos ──────────────────────────────────────────────────────────
  const raw = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);
// ── Sacar el siglo ──────────────────────────────────────────────────────────
  
   const getSiglo = y => {
    if (y >= 1500 && y <= 1599) return "Siglo XVI";
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800 && y <= 1899) return "Siglo XIX";
    return null;
  };

  // Filtrar: Agentes que sean no-Persona
  const personasFiltradas = raw.filter(d => d.Agente !== "Persona");
 // Para mantener la lógica del caso se mantiene el primer año registrado, para evitar repetir
 // el conteo en otros siglos. 
  const primerRegistroPorAgente = new Map();

  personasFiltradas.forEach(d => {
    const id = d.ID_Agente;

    const añoActual = +d.Año;

    if (!primerRegistroPorAgente.has(id)) {
      primerRegistroPorAgente.set(id, d);
    } else {
      const añoRegistrado = +primerRegistroPorAgente.get(id).Año;
      if (añoActual < añoRegistrado) {
        primerRegistroPorAgente.set(id, d);
      }
    }
  });

  // La jerarquía es: Agente → Atributo → Siglo ───────────────────────

  const nestedMap = d3.rollup(
    primerRegistroPorAgente.values(), 
    v => v.length,                    
    d => (d.Agente || "").trim(),
    d => (d.Atributo || "").trim(),
    d => getSiglo(d.Año)
  );

  // Convertir Map anidado → { name, children } para d3.hierarchy
  function mapToNode(name, value) {
    if (typeof value === "number") {
      return { name, value };
    }
    return {
      name,
      children: Array.from(value, ([k, v]) => mapToNode(k, v))
    };
  }

  const hierarchyData = mapToNode("root", nestedMap);

  //Hierarchy + partition ─────────────────────────────────────────────────
  const root = d3.hierarchy(hierarchyData)
    .sum(d => d.value)
    .sort((a, b) => b.value - a.value);

  const width  = 550;
  const height = width;
  const radius = width / 6;

  d3.partition().size([2 * Math.PI, root.height + 1])(root);
  root.each(d => (d.current = d));

  // ── Escalas de color ──────────────────────────────────────────────────────
  // Color fijo por agente (nivel 1), heredado hacia abajo
  const colorScale = d3.scaleOrdinal(
    d3.quantize(d3.interpolateRainbow, (root.children?.length ?? 1) + 1)
  );

  function getColor(d) {
    let node = d;
    while (node.depth > 1) node = node.parent;
    return colorScale(node.data.name);
  }

  // ── Arco ──────────────────────────────────────────────────────────────────
  const arc = d3.arc()
    .startAngle(d => d.x0)
    .endAngle(d => d.x1)
    .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
    .padRadius(radius * 1.5)
    .innerRadius(d => d.y0 * radius)
    .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

  // ── SVG ───────────────────────────────────────────────────────────────────
  const svg = d3.create("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .style("max-width", "100%")
    .style("font-family", "sans-serif");

  const g = svg.append("g")
    .attr("transform", `translate(${width / 2},${height / 2})`);

  // ── Arcos ─────────────────────────────────────────────────────────────────
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

  // Tooltip: nombre + docs + % relativo al padre
  path.append("title").text(d => {
    const pct = d.parent && d.parent.value
      ? ((d.value / d.parent.value) * 100).toFixed(1)
      : "100";
    const ruta = d.ancestors()
      .map(n => n.data.name)
      .reverse()
      .slice(1)   
      .join(" → ");
    return `${ruta}\n${d.value} documentos (${pct}% de "${d.parent?.data.name ?? ""}")`;
  });

  path.filter(d => d.children)
    .style("cursor", "pointer")
    .on("click", clicked);

  // ── Etiquetas ─────────────────────────────────────────────────────────────
  const label = g.append("g")
    .attr("pointer-events", "none")
    .attr("text-anchor", "middle")
    .style("user-select", "none")
    .selectAll("text")
    .data(root.descendants().slice(1))
    .join("text")
    .attr("dy", "0.35em")
    .style("font-size", "12px")
    .style("fill", "#222")
    .attr("fill-opacity", d => +labelVisible(d.current))
    .attr("transform", d => labelTransform(d.current))
    .each(function(d) {
      // Dos líneas: nombre y porcentaje
      const pct = d.parent && d.parent.value
        ? ((d.value / d.parent.value) * 100).toFixed(1)
        : "100";
      const name = truncate(d.data.name, d.current);
      d3.select(this).append("tspan")
        .attr("x", 0).attr("dy", "-0.4em")
        .text(name);
      d3.select(this).append("tspan")
        .attr("x", 0).attr("dy", "1.2em")
        .style("font-size", "10px")
        .style("fill", "#555")
        .text(`${pct}%`);
    });

  // ── Círculo central (volver atrás) ────────────────────────────────────────
  const parent = g.append("circle")
    .datum(root)
    .attr("r", radius)
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .style("cursor", "pointer")
    .on("click", clicked);

  // Texto central
  const centerText = g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .style("font-size", "13px")
    .style("fill", "#555")
    .style("pointer-events", "none")
    .text("← volver");

  // ── Click / zoom ─────────────────────────────────────────────────────────
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
      .filter(function(d) {
        return +this.getAttribute("fill-opacity") || arcVisible(d.target);
      })
      .attr("fill-opacity", d =>
        arcVisible(d.target) ? (d.children ? 0.65 : 0.45) : 0
      )
      .attr("pointer-events", d => arcVisible(d.target) ? "auto" : "none")
      .attrTween("d", d => () => arc(d.current));

    label.filter(function(d) {
      return +this.getAttribute("fill-opacity") || labelVisible(d.target);
    }).transition(t)
      .attr("fill-opacity", d => +labelVisible(d.target))
      .attrTween("transform", d => () => labelTransform(d.current))
      .each(function(d) {
        const pct = d.parent && d.parent.value
          ? ((d.value / d.parent.value) * 100).toFixed(1)
          : "100";
        d3.select(this).selectAll("tspan").remove();
        d3.select(this).append("tspan")
          .attr("x", 0).attr("dy", "-0.4em")
          .text(truncate(d.data.name, d.target));
        d3.select(this).append("tspan")
          .attr("x", 0).attr("dy", "1.2em")
          .style("font-size", "10px")
          .style("fill", "#555")
          .text(`${pct}%`);
      });

    // Actualizar texto central con el nodo actual
    centerText.text(p === root ? "" : `↩ ${p.data.name}`);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
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
    const maxChars  = Math.floor(available / 7);
    if (text.length > maxChars && maxChars > 3) {
      return text.slice(0, Math.max(0, maxChars - 2)) + "…";
    }
    return text;
  }

  // ── 11. Montar ───────────────────────────────────────────────────────────────
  document.getElementById("chartPoblaInsti").append(svg.node());
}