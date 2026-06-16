import * as d3 from "d3";
import rewind from "@turf/rewind";

export async function crearMapaDelitos() {
  const [NuevaGranadaRaw, rawViz, rawLugar] = await Promise.all([
    d3.json(`${import.meta.env.BASE_URL}/data/NuevaGranada.json`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Lugar.csv`),
  ]);

  const NuevaGranada = rewind(NuevaGranadaRaw, { reverse: true });

  // ── Construir diccionario lugar → [longitud, latitud] ───────────────────
  const coordPorLugar = {};
  rawLugar.forEach(d => {
    const nombre = d.Lugar?.trim();
    const lon = +d.Longitud;
    const lat = +d.Latitud;
    if (nombre && !isNaN(lon) && !isNaN(lat)) {
      coordPorLugar[nombre] = [lon, lat];
    }
  });

  // ── Constantes ──────────────────────────────────────────────────────────
  const SIGLOS = ["Siglo XVI", "Siglo XVII", "Siglo XVIII", "Siglo XIX"];

  const getSiglo = y => {
    if (y >= 1500 && y <= 1599) return "Siglo XVI";
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800 && y <= 1899) return "Siglo XIX";
    return null;
  };

  // ── Limpiar y enriquecer filas ─────────────────────────────────────────
  const filas = rawViz
    .filter(d => d.Año && d.Nombre_Codigo && d.ID_Documento && d.Lugar)
    .map(d => ({
      ...d,
      año: +d.Año,
      siglo: getSiglo(+d.Año),
      lugar: d.Lugar.trim(),
      coords: coordPorLugar[d.Lugar.trim()] || null,
    }))
    .filter(d =>
      d.siglo &&
      d.coords &&
      !isNaN(d.coords[0]) &&
      !isNaN(d.coords[1])
    );

 // ── Función: encontrar provincia por coordenadas ────────────────────────
function getProvincia(coords) {
    const features = NuevaGranada.features ? NuevaGranada.features : [NuevaGranada];
    const feature = features.find(f => d3.geoContains(f, coords));
    return feature ? (feature.properties?.Nombre || "Desconocida") : "Desconocida";
  }

  // ── Agregar: crimen × subcrimen × siglo × lugar → casos únicos ─────────
  function agrupar(datos) {
    const map = {};
    datos.forEach(d => {
      const key = `${d.lugar}||${d.Nombre_Codigo}||${d["Sub_Código"]}||${d.siglo}`;
      if (!map[key]) map[key] = {
        lugar: d.lugar,
        coords: d.coords,
        Nombre_Codigo: d.Nombre_Codigo,
        Sub_Código: d["Sub_Código"],
        Nombre_Sub_Codigo: d.Nombre_Sub_Codigo,
        siglo: d.siglo,
        año: d.año,
        docs: new Set(),
      };
      map[key].docs.add(d.ID_Documento);
    });
    return Object.values(map).map(r => ({
      ...r,
      count: r.docs.size,
      provincia: getProvincia(r.coords),
    }));
  }

  const todosAgrupados = agrupar(filas);

  // ── Listas únicas para selectores ──────────────────────────────────────
  const crimenes = ["Todos", ...[...new Set(filas.map(d => d.Nombre_Codigo))].sort()];

  // ── Elementos existentes en index.html ──────────────────────────────────
  const selectSiglo = document.getElementById("select-siglo");
  const selectCrimen = document.getElementById("select-crimen");
  const mapaContenedor = document.getElementById("mapa-contenedor");

   // ── Poblar selectores ────────────────────────────────────────────────────
  selectSiglo.innerHTML = SIGLOS.map(s => `<option value="${s}">${s}</option>`).join("");
  selectCrimen.innerHTML = crimenes.map(c => `<option value="${c}">${c}</option>`).join("");

  // ── Valor inicial por defecto ────────────────────────────────────────────
  selectSiglo.value = "Siglo XVII";
  selectCrimen.value = "Todos";

  // ── Filtrado dinámico según selección ───────────────────────────────────
  function getDatosFiltrados() {
    const siglo = selectSiglo.value;
    const crimen = selectCrimen.value;

    return todosAgrupados.filter(d => {
      const okSiglo = d.siglo === siglo;
      const okCrimen = crimen === "Todos" || d.Nombre_Codigo === crimen;
      return okSiglo && okCrimen;
    });
  }

  // ── Configuración del lienzo ────────────────────────────────────────────
  const width = 600;
  const height = 700;

  const svg = d3.select(mapaContenedor)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", "max-width: 100%; height: auto; background-color: #f4ecd8;");

  // ── Proyección equivalente al domain de Plot ────────────────────────────
  // El domain en Plot se calcula a partir de un MultiPoint; replicamos con fitExtent
  const domainFeature = {
    type: "Feature",
    geometry: {
      type: "MultiPoint",
      coordinates: [
        [-83, -5],
        [-60, 12],
      ],
    },
  };

  const projection = d3.geoMercator()
    .fitExtent([[0, 0], [width, height]], domainFeature);

  const path = d3.geoPath(projection);
  const gZoom = svg.append("g").attr("class", "capa-zoom");
  // ── Capa base: NuevaGranada ──────────────────────────────────────────────
  const gMapa = gZoom.append("g").attr("class", "capa-mapa");

  gMapa.selectAll("path")
    .data(NuevaGranada.features ? NuevaGranada.features : [NuevaGranada])
    .join("path")
    .attr("d", path)
    .attr("fill", "#e8dcc0")
    .attr("stroke", "#6b4f2a")
    .attr("stroke-opacity", 0.7);

  // ── Capa de puntos ────────────────────────────────────────────────────────
  const gPuntos = gZoom.append("g").attr("class", "capa-puntos");

  // ── Escala de radio (equivalente a r en Plot) ───────────────────────────
  const rScale = d3.scaleSqrt()
    .domain([0, d3.max(todosAgrupados, d => d.count) || 1])
    .range([0, 20]);

  // ── Escala de color por año (equivalente a fill: d => d.año) ───────────
  const colorScale = d3.scaleSequential()
    .domain(d3.extent(todosAgrupados, d => d.año))
    .interpolator(d3.interpolateReds);

  const zoom = d3.zoom()
    .scaleExtent([1, 12])
    .on("zoom", (event) => {
      gZoom.attr("transform", event.transform);
      const k = event.transform.k;
      gMapa.selectAll("path").attr("stroke-width", 0.5 / k);
      gPuntos.selectAll("circle")
        .attr("stroke-width", 0.5 / k)
        .attr("r", d => rScale(d.count) / k);
    });

  svg.call(zoom);

  // ── Tooltip ──────────────────────────────────────────────────────────────
  let tooltip = d3.select("body").select(".mapa-tooltip");
  if (tooltip.empty()) {
    tooltip = d3.select("body")
      .append("div")
      .attr("class", "mapa-tooltip")
      .style("position", "absolute")
      .style("pointer-events", "none")
      .style("background", "#3a2d1a")
      .style("color", "#f4ecd8")
      .style("padding", "4px 8px")
      .style("border-radius", "4px")
      .style("font-size", "12px")
      .style("font-family", "Georgia, 'Times New Roman', serif")
      .style("white-space", "pre-line")
      .style("opacity", 0);
     }

  // ── Render del mapa ──────────────────────────────────────────────────────
  function render() {
    const datos = getDatosFiltrados();

    const puntos = gPuntos.selectAll("circle")
      .data(datos, d => `${d.lugar}||${d.Nombre_Codigo}||${d["Sub_Código"]}||${d.siglo}`);

    puntos.join(
      enter => enter.append("circle")
        .attr("cx", d => projection(d.coords)[0])
        .attr("cy", d => projection(d.coords)[1])
        .attr("r", d => rScale(d.count))
        .attr("fill", d => colorScale(d.año))
        .attr("fill-opacity", 0.65)
        .attr("stroke", "#f4ecd8")
        .attr("stroke-width", 0.5)
        .on("mouseover", (event, d) => {
          tooltip
            .style("opacity", 1)
            .text(`Lugar: ${d.lugar}\nProvincia:${d.provincia}\n${d.siglo}\nCrimen: ${d.Nombre_Codigo}\nCasos: ${d.count}`);
        })
        .on("mousemove", (event) => {
          tooltip
            .style("left", `${event.pageX + 10}px`)
            .style("top", `${event.pageY - 10}px`);
        })
        .on("mouseout", () => {
          tooltip.style("opacity", 0);
        }),
      update => update
        .attr("cx", d => projection(d.coords)[0])
        .attr("cy", d => projection(d.coords)[1])
        .attr("r", d => rScale(d.count))
        .attr("fill", d => colorScale(d.año)),
      exit => exit.remove()
    );
  }

  // ── Eventos ──────────────────────────────────────────────────────────────
  selectSiglo.addEventListener("change", render);
  selectCrimen.addEventListener("change", render);

  // ── Render inicial ───────────────────────────────────────────────────────
  render();
}