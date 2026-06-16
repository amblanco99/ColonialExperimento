import * as d3 from "d3";

export async function crearCrimenesTiempo() {

  // ── Cargar y preparar datos ───────────────────────────────────────────────
  const raw = await d3.csv("/data/Visualizaciones.csv");

 // ── Convertir a Siglo ───────────────────────────────────────────────
  const getSiglo = y => {
    if (y >= 1500 && y <= 1599) return "Siglo XVI";
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800 && y <= 1899) return "Siglo XIX";
    return null;
  };

  const SIGLOS = ["Siglo XVI", "Siglo XVII", "Siglo XVIII", "Siglo XIX"];
// ── Filtro de los datos ───────────────────────────────────────────────
  const datos = raw
    .filter(d => d.Año && d.Nombre_Codigo && d.Nombre_Sub_Codigo)
    .map(d => ({ ...d, siglo: getSiglo(d.Año) }))
    .filter(d => d.siglo);

  // ── Para select, se deja como default Concubinato ────────────────────────────────────────────────────
  const selectCrimen = document.getElementById("Nombre_Codigo");
  const crimenes = [...new Set(datos.map(d => d.Nombre_Codigo))].sort();

  selectCrimen.innerHTML = "";
  crimenes.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    selectCrimen.append(opt);
  });
  selectCrimen.value = "Concubinato";

  // ── EL conteo para las lineas ──────────────────────────────────────────────────────
  //
  // Se calcula el porcentaje de cada siglo = todos los casos únicos del subcrímen dividido por los cuatro siglos
  // El total es la suma de los 4 siglos para ese subcrimen, si no existen subcrimenes es la categoría principal del crímen.
  //
  function buildSeries(crimen) {
    const filtrados = datos.filter(d => d.Nombre_Codigo === crimen);
    const subNombres = [...new Set(filtrados.map(d => d.Nombre_Sub_Codigo))].sort();

    return subNombres.map(sub => {
      const filasSub = filtrados.filter(d => d.Nombre_Sub_Codigo === sub);

      const cuentasPorSiglo = {};
      SIGLOS.forEach(s => {
        const set = new Set(
          filasSub
            .filter(d => d.siglo === s)
            .map(d => `${d.ID_Documento}|${d.Sub_Código}`)
        );
        cuentasPorSiglo[s] = set.size;
      });

      const total = Object.values(cuentasPorSiglo).reduce((a, b) => a + b, 0);

      const puntos = SIGLOS.map(s => ({
        siglo: s,
        cantidad: cuentasPorSiglo[s],
        porcentaje: total > 0 ? (cuentasPorSiglo[s] / total) * 100 : 0,
      }));

      return { subcrimen: sub, total, puntos };
    });
  }

  // ── Paleta ────────────────────────────────────────────────────────────────
  const COLORES = [
    "#bb4e99", "#4e9bbb", "#e8a838", "#56b87e",
    "#e05a5a", "#7b5ea7", "#3ab8b0", "#d4784e",
    "#6a8fce", "#a05080",
  ];

  // ── Dibujar ───────────────────────────────────────────────────────────────
  const MARGIN = { top: 60, right: 170, bottom: 50, left: 55 };
  const WIDTH  = 700;
  const HEIGHT = 420;
  const IW = WIDTH  - MARGIN.left - MARGIN.right;
  const IH = HEIGHT - MARGIN.top  - MARGIN.bottom;

  const DURACION_LINEA = 800;
  const PAUSA          = 150;

  let timerRef = null;

  // ── Tooltip flotante (mismo estilo que el grafo de relaciones) ────────────
  const contenedorBase = document.getElementById("crimenesChart");
  contenedorBase.style.position = "relative";

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

  function dibujar() {
    if (timerRef) { timerRef.stop(); timerRef = null; }

    const contenedor = document.getElementById("crimenesChart");
    contenedor.innerHTML = "";
    contenedor.appendChild(tooltip);

    const crimen = selectCrimen.value;
    const series = buildSeries(crimen);
    const totalGeneral = series.reduce((a, s) => a + s.total, 0);

    const colorScale = d3.scaleOrdinal()
      .domain(series.map(s => s.subcrimen))
      .range(COLORES);

    // SVG
    const svg = d3.create("svg")
      .attr("width", WIDTH)
      .attr("height", HEIGHT)
      .style("font-family", "system-ui, sans-serif")
      .style("overflow", "visible");

    const g = svg.append("g")
      .attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    // ── Escalas ────────────────────────────────────────────────────────────────
    const x = d3.scalePoint()
      .domain(SIGLOS)
      .range([0, IW])
      .padding(0.2);

    const yMax = d3.max(series.flatMap(s => s.puntos.map(p => p.porcentaje))) || 100;

    const y = d3.scaleLinear()
      .domain([0, Math.min(100, Math.ceil(yMax / 10) * 10 + 5)])
      .range([IH, 0]);

    // ── Grilla horizontal ──────────────────────────────────────────────────────
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickSize(-IW).tickFormat(""))
      .call(gg => {
        gg.select(".domain").remove();
        gg.selectAll("line").attr("stroke", "#e8e8e8");
      });

    // ── Eje X ──────────────────────────────────────────────────────────────────
    g.append("g")
      .attr("transform", `translate(0,${IH})`)
      .call(d3.axisBottom(x).tickSize(0))
      .call(gg => {
        gg.select(".domain").attr("stroke", "#ccc");
        gg.selectAll("text")
          .style("font-size", "12px")
          .style("fill", "#555")
          .attr("dy", "1.4em");
      });

    // ── Eje Y ──────────────────────────────────────────────────────────────────
    g.append("g")
      .call(d3.axisLeft(y).ticks(5).tickFormat(d => `${d.toFixed(0)}%`))
      .call(gg => {
        gg.select(".domain").remove();
        gg.selectAll("text").style("font-size", "11px").style("fill", "#666");
        gg.selectAll("line").remove();
      });

    // ── Títulos ────────────────────────────────────────────────────────────────
    svg.append("text")
      .attr("x", MARGIN.left + IW / 2)
      .attr("y", 22)
      .attr("text-anchor", "middle")
      .style("font-size", "14px")
      .style("font-weight", "700")
      .style("fill", "#222")
      .text(crimen);

    svg.append("text")
      .attr("x", MARGIN.left + IW / 2)
      .attr("y", 40)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("fill", "#999")
      .text(`${totalGeneral} registros únicos · porcentaje por subcrimen a través del tiempo`);

    // ── Generador de línea ──────
    const lineGen = d3.line()
      .x(d => x(d.siglo))
      .y(d => y(d.porcentaje))
      .curve(d3.curveLinear);

    // ── Reveal con strokeDashoffset ──────────────────────────────────────────
    function revelarLinea(idx) {
      if (idx >= series.length) return;

      const serie  = series[idx];
      const color  = colorScale(serie.subcrimen);
      const lineGroup = g.append("g");

      // ── Trazar la línea completa y medir su longitud ───────────────────────
      const path = lineGroup.append("path")
        .datum(serie.puntos)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("stroke-width", 2.2)
        .attr("stroke-linejoin", "round")
        .attr("stroke-linecap", "round")
        .attr("d", lineGen);

      const totalLength = path.node().getTotalLength();

      // Ocultar con dash y revelar animando offset → 0
      path
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition()
        .duration(DURACION_LINEA)
        .ease(d3.easeLinear)
        .attr("stroke-dashoffset", 0);

      // ── Puntos: aparecen cuando el frente de la línea los alcanza ─────────
      serie.puntos.forEach((p, pi) => {
        const delay = (pi / (SIGLOS.length - 1)) * DURACION_LINEA;

        lineGroup.append("circle")
          .attr("cx", x(p.siglo))
          .attr("cy", y(p.porcentaje))
          .attr("r", 0)
          .attr("fill", "white")
          .attr("stroke", color)
          .attr("stroke-width", 2)
          .transition()
          .delay(delay)
          .duration(200)
          .attr("r", 4.5);

        // Hit-area invisible para tooltip personalizado
        lineGroup.append("circle")
          .attr("cx", x(p.siglo))
          .attr("cy", y(p.porcentaje))
          .attr("r", 10)
          .attr("fill", "transparent")
          .style("pointer-events", "all")
          .on("mouseenter", () => {
            tooltip.innerHTML = `
              <strong>${serie.subcrimen}</strong><br/>
              ${p.siglo}: ${p.cantidad} casos (${p.porcentaje.toFixed(1)}%)
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
      });

      // ── Etiqueta al final de la línea ─────────────────────────────────────
      const ultimoPunto =
        [...serie.puntos].reverse().find(p => p.porcentaje > 0)
        || serie.puntos[serie.puntos.length - 1];

      lineGroup.append("text")
        .attr("x", x(ultimoPunto.siglo) + 8)
        .attr("y", y(ultimoPunto.porcentaje) + 4)
        .style("font-size", "11px")
        .style("fill", color)
        .style("font-weight", "600")
        .style("opacity", 0)
        .text(serie.subcrimen)
        .transition()
        .delay(DURACION_LINEA * 0.85)
        .duration(250)
        .style("opacity", 1);

      // Siguiente línea
      timerRef = d3.timeout(() => revelarLinea(idx + 1), DURACION_LINEA + PAUSA);
    }

    // Botón reproducir
    const btnWrap = document.createElement("div");
    btnWrap.style.cssText = "margin-top:8px;text-align:center";
    const btn = document.createElement("button");
    btn.textContent = "▶ Reproducir de nuevo";
    btn.style.cssText = `
      padding:6px 18px;background:#bb4e99;color:white;
      border:none;border-radius:4px;cursor:pointer;font-size:13px;
    `;
    btn.addEventListener("click", dibujar);
    btnWrap.append(btn);

    contenedor.append(svg.node());
    contenedor.append(btnWrap);

    timerRef = d3.timeout(() => revelarLinea(0), 200);
  }

  // ── 6. Arranque ──────────────────────────────────────────────────────────────
  dibujar();
  selectCrimen.addEventListener("change", dibujar);
}