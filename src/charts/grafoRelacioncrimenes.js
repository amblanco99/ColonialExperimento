import * as d3 from "d3";

export async function crearRelacionCrimenes() {

  const raw = await d3.csv("/data/Visualizaciones.csv");

  // ── Siglo ──────────────────────────────────────────────────────────────
  const getSiglo = y => {
    if (y >= 1500 && y <= 1599) return "Siglo XVI";
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800 && y <= 1899) return "Siglo XIX";
    return null;
  };

  const datos = raw.map(d => ({ ...d, siglo: getSiglo(+d.Año) }));

  // ── Opciones para selects ────────────────────────────────────────────────
  const SIGLOS    = ["Siglo XVI", "Siglo XVII", "Siglo XVIII", "Siglo XIX"];
  const AGENTES   = [...new Set(datos.map(d => d.Agente))].filter(Boolean).sort();
  const ATRIBUTOS = [...new Set(datos.map(d => d.Atributo))].filter(Boolean).sort();
  const GENEROS   = [...new Set(datos.map(d => d.Género))].filter(Boolean).sort();

  const selSiglo    = document.getElementById("grafoSiglo");
  const selAgente   = document.getElementById("grafoAgente");
  const selAtributo = document.getElementById("grafoAtributo");
  const selGenero   = document.getElementById("grafoGenero");

  function poblarSelect(select, opciones) {
    select.innerHTML = "";
    const optTodos = document.createElement("option");
    optTodos.value = "Todos";
    optTodos.textContent = "Todos";
    select.append(optTodos);
    opciones.forEach(o => {
      const opt = document.createElement("option");
      opt.value = o;
      opt.textContent = o;
      select.append(opt);
    });
    select.value = "Todos";
  }

  poblarSelect(selSiglo, SIGLOS);
  poblarSelect(selAgente, AGENTES);
  poblarSelect(selAtributo, ATRIBUTOS);
  poblarSelect(selGenero, GENEROS);

  // ── Dimensiones fijas ─────────────────────────────────────────────────────
  const WIDTH = 700;
  const HEIGHT = 500;
  const PADDING = 50; // margen interno para que los nodos no toquen el borde

  const contenedor = document.getElementById("grafoCrimenes");
  contenedor.style.position = "relative"; // necesario para el tooltip

  // ── Tooltip flotante ──────────────────────────────────────────────────────
  const tooltip = document.createElement("div");
  tooltip.style.cssText = `
    position: absolute;
    pointer-events: none;
    background: rgba(0,0,0,0.85);
    color: #fff;
    padding: 6px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-family: system-ui, sans-serif;
    opacity: 0;
    transition: opacity 0.1s;
    z-index: 10;
    max-width: 220px;
  `;

  let simulationRef = null;

  function dibujar() {
    if (simulationRef) simulationRef.stop();

    // ── Filtrar datos según selects ───────────────────────────────────────
    const fSiglo    = selSiglo.value;
    const fAgente   = selAgente.value;
    const fAtributo = selAtributo.value;
    const fGenero   = selGenero.value;

    const filtrados = datos.filter(d =>
      (fSiglo    === "Todos" || d.siglo    === fSiglo) &&
      (fAgente   === "Todos" || d.Agente   === fAgente) &&
      (fAtributo === "Todos" || d.Atributo === fAtributo) &&
      (fGenero   === "Todos" || d.Género   === fGenero)
    );

    // ── 1. Agrupar: por cada ID_Agente, qué crímenes (Código) cometió ──────
    const agenteCrimenes = new Map();
    const crimenInfo = new Map();

    filtrados.forEach(d => {
      const idAgente = d.ID_Agente;
      const codigo = d.Código;
      const nombre = d.Nombre_Codigo;

      if (!agenteCrimenes.has(idAgente)) agenteCrimenes.set(idAgente, new Set());
      agenteCrimenes.get(idAgente).add(codigo);

      if (!crimenInfo.has(codigo)) crimenInfo.set(codigo, { nombre, count: 0 });
      crimenInfo.get(codigo).count += 1;
    });

    // ── 2. Nodos ─────────────────────────────────────────────────────────
    const nodes = Array.from(crimenInfo, ([codigo, info]) => ({
      id: codigo,
      nombre: info.nombre,
      count: info.count
    }));

    // ── 3. Aristas ───────────────────────────────────────────────────────
    const edgeMap = new Map();

    agenteCrimenes.forEach(codigosSet => {
      const codigos = Array.from(codigosSet);
      if (codigos.length < 2) return;

      for (let i = 0; i < codigos.length; i++) {
        for (let j = i + 1; j < codigos.length; j++) {
          const [a, b] = [codigos[i], codigos[j]].sort();
          const key = `${a}|${b}`;
          edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
        }
      }
    });

    const links = Array.from(edgeMap, ([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight };
    });

    // ── Mapa de adyacencia para resaltado ────────────────────────────────
    const adyacencia = new Map(); // id -> Set de ids conectados
    nodes.forEach(n => adyacencia.set(n.id, new Set()));
    links.forEach(l => {
      adyacencia.get(l.source)?.add(l.target);
      adyacencia.get(l.target)?.add(l.source);
    });

    const vinculadosPorCodigo = new Map(); // codigo -> Set de ID_Agente vinculados a otro crimen
    nodes.forEach(n => vinculadosPorCodigo.set(n.id, new Set()));

    agenteCrimenes.forEach((codigosSet, idAgente) => {
      if (codigosSet.size < 2) return;
      codigosSet.forEach(codigo => {
        vinculadosPorCodigo.get(codigo)?.add(idAgente);
      });
    });

    // ── Limpiar contenedor ───────────────────────────────────────────────
    contenedor.innerHTML = "";
    contenedor.appendChild(tooltip);

    if (nodes.length === 0) {
      const msg = document.createElement("p");
      msg.style.cssText = "color:#999;text-align:center;";
      msg.textContent = "No hay datos para esta combinación de filtros.";
      contenedor.appendChild(msg);
      return;
    }

    const svg = d3.create("svg")
      .attr("width", WIDTH)
      .attr("height", HEIGHT)
      .attr("viewBox", [0, 0, WIDTH, HEIGHT])
      .style("font-family", "system-ui, sans-serif")
      .style("display", "block")
      .style("max-width", "100%");

    // ── Escalas ──────────────────────────────────────────────────────────
    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(nodes, d => d.count) || 1])
      .range([8, 40]);

    const linkScale = d3.scaleLinear()
      .domain([1, d3.max(links, d => d.weight) || 1])
      .range([1, 8]);

    const color = d3.scaleOrdinal(d3.schemeTableau10)
      .domain(nodes.map(d => d.id));

    // ── Simulación con fuerzas de contención ──────────────────────────────
    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links)
        .id(d => d.id)
        .distance(d => 150 - linkScale(d.weight) * 5)
        .strength(d => 0.1 + linkScale(d.weight) * 0.02)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(WIDTH / 2, HEIGHT / 2))
      .force("collide", d3.forceCollide(d => radiusScale(d.count) + 5))
      .force("x", d3.forceX(WIDTH / 2).strength(0.05))
      .force("y", d3.forceY(HEIGHT / 2).strength(0.05));

    simulationRef = simulation;

    // ── Aristas ──────────────────────────────────────────────────────────
    const link = svg.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", d => linkScale(d.weight));

    // ── Nodos ────────────────────────────────────────────────────────────
    const node = svg.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", d => radiusScale(d.count))
      .attr("fill", d => color(d.id))
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .call(drag(simulation));

    // ── Etiquetas ────────────────────────────────────────────────────────
    const label = svg.append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text(d => d.nombre)
      .attr("font-size", 10)
      .attr("text-anchor", "middle")
      .attr("dy", d => -radiusScale(d.count) - 6)
      .attr("fill", "#333")
      .style("pointer-events", "none");

    // ── Resaltado al clic ────────────────────────────────────────────────
    let seleccionado = null;

    function aplicarResaltado() {
      if (seleccionado === null) {
        node.attr("opacity", 1).attr("stroke", "#fff");
        link.attr("stroke", "#999").attr("stroke-opacity", 0.4)
          .attr("stroke-width", d => linkScale(d.weight));
        label.attr("opacity", 1);
        return;
      }

      const conectados = adyacencia.get(seleccionado) || new Set();

      node
        .attr("opacity", d => d.id === seleccionado || conectados.has(d.id) ? 1 : 0.15)
        .attr("stroke", d => d.id === seleccionado ? "#333" : "#fff")
        .attr("stroke-width", d => d.id === seleccionado ? 3 : 1.5);

      label
        .attr("opacity", d => d.id === seleccionado || conectados.has(d.id) ? 1 : 0.15);

      link
        .attr("stroke", d =>
          (d.source.id === seleccionado || d.target.id === seleccionado) ? "#e05a5a" : "#ccc")
        .attr("stroke-opacity", d =>
          (d.source.id === seleccionado || d.target.id === seleccionado) ? 0.9 : 0.1)
        .attr("stroke-width", d =>
          (d.source.id === seleccionado || d.target.id === seleccionado)
            ? linkScale(d.weight) + 2
            : linkScale(d.weight));
    }

    node.on("click", (event, d) => {
      event.stopPropagation();
      seleccionado = (seleccionado === d.id) ? null : d.id;
      aplicarResaltado();
    });

    // clic en fondo del SVG limpia la selección
    svg.on("click", () => {
      seleccionado = null;
      aplicarResaltado();
    });

    // ── Tooltips ─────────────────────────────────────────────────────────
     node
      .on("mouseenter", (event, d) => {
        const vinculados = vinculadosPorCodigo.get(d.id)?.size || 0;
        tooltip.innerHTML = `
          <strong>${d.nombre}</strong><br/>
          Total de registros: ${d.count}<br/>
          Total de vínculos a otros crímenes: ${vinculados}
        `;
        tooltip.style.opacity = 1;
      })
      .on("mousemove", (event) => {
        const rect = contenedor.getBoundingClientRect();
        tooltip.style.left = (event.clientX - rect.left + 12) + "px";
        tooltip.style.top  = (event.clientY - rect.top + 12) + "px";
      })
      .on("mouseleave", () => {
        tooltip.style.opacity = 0;
      });

    link
      .style("pointer-events", "stroke") // permite hover incluso si stroke-width es chico
      .on("mouseenter", (event, d) => {
        tooltip.innerHTML = `${d.source.nombre || d.source} ↔ ${d.target.nombre || d.target}<br/>Agentes en común: <strong>${d.weight}</strong>`;
        tooltip.style.opacity = 1;
      })
      .on("mousemove", (event) => {
        const rect = contenedor.getBoundingClientRect();
        tooltip.style.left = (event.clientX - rect.left + 12) + "px";
        tooltip.style.top  = (event.clientY - rect.top + 12) + "px";
      })
      .on("mouseleave", () => {
        tooltip.style.opacity = 0;
      });

    // ── Tick: clamping para mantener nodos dentro del área ────────────────
    simulation.on("tick", () => {
      nodes.forEach(d => {
        const r = radiusScale(d.count);
        d.x = Math.max(r + PADDING, Math.min(WIDTH - r - PADDING, d.x));
        d.y = Math.max(r + PADDING, Math.min(HEIGHT - r - PADDING, d.y));
      });

      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node
        .attr("cx", d => d.x)
        .attr("cy", d => d.y);

      label
        .attr("x", d => d.x)
        .attr("y", d => d.y);
    });

    contenedor.appendChild(svg.node());
  }

  // ── Drag handler ─────────────────────────────────────────────────────────
  function drag(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }
    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
    return d3.drag()
      .on("start", dragstarted)
      .on("drag", dragged)
      .on("end", dragended);
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  [selSiglo, selAgente, selAtributo, selGenero].forEach(sel =>
    sel.addEventListener("change", dibujar)
  );

  dibujar();
}