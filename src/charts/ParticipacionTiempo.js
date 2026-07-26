import * as d3 from "d3";
import { PALETA_GENERO } from "./agentesComun.js";

const GENEROS = ["Mujer", "Hombre", "Sin información"];
const MAX_CRIMENES_SELECCIONADOS = 5;
const TOP_N_DEFECTO = 6;

function colorPorIndice(i) {
  const hue = (i * 137.508) % 360;
  const bandaLuz = [0.40, 0.48, 0.56][i % 3];
  return d3.hsl(hue, 0.55, bandaLuz).formatHex();
}

export async function crearParticipacionTiempo() {

  const raw = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);

  const filtrosContainer = document.getElementById("participacionFiltros");
  const bumpContainer = document.getElementById("participacionBump");
  if (!filtrosContainer || !bumpContainer) return;

  const vistos = new Set();
  const datos = raw
    .filter(d => d.Agente === "Persona" && d.Año && !isNaN(+d.Año) && d.Nombre_Codigo)
    .map(d => {
      const genero = d.Género && d.Género.trim() !== "" && d.Género !== "null"
        ? d.Género.trim()
        : "Sin información";
      const año = +d.Año;
      return {
        id: `${d.ID_Documento}|${d.Sub_Código}|${d.ID_Agente}`,
        genero,
        atributo: d.Atributo,
        crimen: d.Nombre_Codigo,
        año,
        década: Math.floor(año / 10) * 10,
      };
    })
    .filter(d => {
      if (vistos.has(d.id)) return false;
      vistos.add(d.id);
      return true;
    });

  const atributosPresentes = [...new Set(datos.map(d => d.atributo))];
  const ATRIBUTOS = ["Víctima", "Perpetrador", "Cómplice"].filter(a => atributosPresentes.includes(a));

  const CRIMENES = [...d3.rollup(datos, v => v.length, d => d.crimen)]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre, total], i) => ({ nombre, total, color: colorPorIndice(i), rank: i }));
  const CRIMEN_POR_NOMBRE = new Map(CRIMENES.map(c => [c.nombre, c]));

  const [minAño, maxAño] = d3.extent(datos, d => d.año);
  const MIN_DÉCADA = Math.floor(minAño / 10) * 10;
  const MAX_DÉCADA = Math.floor(maxAño / 10) * 10;
  const DÉCADAS = d3.range(MIN_DÉCADA, MAX_DÉCADA + 10, 10);

  const colorDe = nombre => CRIMEN_POR_NOMBRE.get(nombre).color;

  const estado = {
    genero: GENEROS[0],
    atributo: "Todos",
    crimenes: [],
  };

  filtrosContainer.innerHTML = `<div class="filtros-chip-panel"></div>`;
  const wrapperFiltros = filtrosContainer.querySelector(".filtros-chip-panel");

  function agregarCrimen(nombre) {
    if (estado.crimenes.includes(nombre) || estado.crimenes.length >= MAX_CRIMENES_SELECCIONADOS) return;
    estado.crimenes.push(nombre);
    actualizar();
  }
  function quitarCrimen(nombre) {
    estado.crimenes = estado.crimenes.filter(c => c !== nombre);
    actualizar();
  }

  function renderFiltros() {
    wrapperFiltros.innerHTML = "";

    const grupoGenero = document.createElement("div");
    const labelGenero = document.createElement("div");
    labelGenero.className = "filtros-grupo-titulo";
    labelGenero.textContent = "Género";
    grupoGenero.appendChild(labelGenero);
    const filaGenero = document.createElement("div");
    filaGenero.className = "filtros-chip-fila";
    GENEROS.forEach(g => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = `filtro-chip filtro-chip--genero${estado.genero === g ? " filtro-chip--activo" : ""}`;
      chip.textContent = g;
      chip.style.setProperty("--chip-color", PALETA_GENERO[g]);
      chip.addEventListener("click", () => { estado.genero = g; actualizar(); });
      filaGenero.appendChild(chip);
    });
    grupoGenero.appendChild(filaGenero);
    wrapperFiltros.appendChild(grupoGenero);

    const barraSelectores = document.createElement("div");
    barraSelectores.className = "filtros-barra-selectores";

    const grupoAtributo = document.createElement("div");
    grupoAtributo.className = "filtro-selector";
    const labelAtributo = document.createElement("div");
    labelAtributo.className = "filtros-grupo-titulo";
    labelAtributo.textContent = "Atributo";
    grupoAtributo.appendChild(labelAtributo);
    const selectAtributo = document.createElement("select");
    selectAtributo.className = "filtro-select-generico";
    ["Todos", ...ATRIBUTOS].forEach(a => {
      const opt = document.createElement("option");
      opt.value = a;
      opt.textContent = a;
      selectAtributo.appendChild(opt);
    });
    selectAtributo.value = estado.atributo;
    selectAtributo.addEventListener("change", () => { estado.atributo = selectAtributo.value; actualizar(); });
    grupoAtributo.appendChild(selectAtributo);
    barraSelectores.appendChild(grupoAtributo);

    const grupoCrimen = document.createElement("div");
    grupoCrimen.className = "filtro-selector filtro-selector--crimen";
    const labelCrimen = document.createElement("div");
    labelCrimen.className = "filtros-grupo-titulo";
    labelCrimen.textContent = `Crimen (hasta ${MAX_CRIMENES_SELECCIONADOS}, o "Todos" = los más frecuentes)`;
    grupoCrimen.appendChild(labelCrimen);

    const alCope = estado.crimenes.length >= MAX_CRIMENES_SELECCIONADOS;
    const selectCrimen = document.createElement("select");
    selectCrimen.className = "filtro-select-generico";
    selectCrimen.disabled = alCope;
    const optPlaceholder = document.createElement("option");
    optPlaceholder.value = "";
    optPlaceholder.textContent = alCope ? `Máximo ${MAX_CRIMENES_SELECCIONADOS} — quita uno primero` : "+ Elegir crimen…";
    selectCrimen.appendChild(optPlaceholder);
    CRIMENES.forEach(c => {
      if (estado.crimenes.includes(c.nombre)) return;
      const opt = document.createElement("option");
      opt.value = c.nombre;
      opt.textContent = c.nombre.trim();
      selectCrimen.appendChild(opt);
    });
    selectCrimen.addEventListener("change", () => {
      if (selectCrimen.value) agregarCrimen(selectCrimen.value);
    });
    grupoCrimen.appendChild(selectCrimen);

    const filaChipsCrimen = document.createElement("div");
    filaChipsCrimen.className = "filtros-chip-fila filtros-chip-fila--con-margen";
    estado.crimenes.forEach(nombre => {
      const info = CRIMEN_POR_NOMBRE.get(nombre);
      const chip = document.createElement("span");
      chip.className = "filtro-chip filtro-chip--crimen";
      chip.style.background = info.color;
      chip.style.borderColor = info.color;
      const texto = document.createElement("span");
      texto.textContent = nombre.trim();
      const btnQuitar = document.createElement("button");
      btnQuitar.type = "button";
      btnQuitar.className = "filtro-chip-quitar";
      btnQuitar.textContent = "×";
      btnQuitar.addEventListener("click", () => quitarCrimen(nombre));
      chip.appendChild(texto);
      chip.appendChild(btnQuitar);
      filaChipsCrimen.appendChild(chip);
    });
    grupoCrimen.appendChild(filaChipsCrimen);

    barraSelectores.appendChild(grupoCrimen);
    wrapperFiltros.appendChild(barraSelectores);
  }

  function actualizar() {
    renderFiltros();
    dibujarBump();
  }

  function calcularCapas(filas) {
    if (estado.crimenes.length > 0) return [...estado.crimenes];
    const conteoPorCrimen = d3.rollup(filas, v => v.length, d => d.crimen);
    return [...conteoPorCrimen.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_N_DEFECTO)
      .map(([nombre]) => nombre);
  }

  function dibujarLeyenda(contenedor, nombresCapas) {
    const leyenda = document.createElement("div");
    leyenda.className = "leyenda-swatches";
    nombresCapas.forEach(nombre => {
      const item = document.createElement("div");
      item.className = "leyenda-swatch-item";
      const swatch = document.createElement("span");
      swatch.className = "leyenda-swatch-color";
      swatch.style.background = colorDe(nombre);
      const texto = document.createElement("span");
      texto.textContent = nombre.trim();
      item.appendChild(swatch);
      item.appendChild(texto);
      leyenda.appendChild(item);
    });
    contenedor.appendChild(leyenda);
  }

  function notaCapas(nombresCapas) {
    return estado.crimenes.length > 0
      ? `Mostrando los ${estado.crimenes.length} crimen(es) elegidos.`
      : `Mostrando los ${nombresCapas.length} crímenes más frecuentes para "${estado.genero}"${estado.atributo !== "Todos" ? " · " + estado.atributo : ""}.`;
  }

  function separarEtiquetas(items, gapMínimo = 15) {
    const ordenado = [...items].sort((a, b) => a.y - b.y);
    for (let i = 1; i < ordenado.length; i++) {
      if (ordenado[i].y - ordenado[i - 1].y < gapMínimo) {
        ordenado[i].y = ordenado[i - 1].y + gapMínimo;
      }
    }
    return ordenado;
  }

  const MARGIN_BUMP = { top: 20, right: 150, bottom: 30, left: 150 };
  const PX_POR_DÉCADA = 22;
  const nombreCorto = clave => clave.trim();

  function dibujarBump() {
    bumpContainer.innerHTML = "";

    const filas = datos.filter(d =>
      d.genero === estado.genero &&
      (estado.atributo === "Todos" || d.atributo === estado.atributo)
    );

    if (filas.length === 0) {
      bumpContainer.innerHTML = `<p class="grafico-vacio">No hay datos para esta selección de filtros.</p>`;
      return;
    }

    const nombresCapas = calcularCapas(filas);
    const claves = nombresCapas;
    const numCapas = claves.length;

    const porDécadaCrimen = d3.rollup(filas, v => v.length, d => d.década, d => d.crimen);

    const rankingPorDécada = new Map(DÉCADAS.map(década => {
      const porCrimen = porDécadaCrimen.get(década);
      const valores = claves
        .map(clave => ({ clave, valor: (porCrimen && porCrimen.get(clave)) || 0 }))
        .sort((a, b) => b.valor - a.valor);

      valores.forEach((d, i) => {
        d.rank = (i > 0 && d.valor === valores[i - 1].valor) ? valores[i - 1].rank : i + 1;
      });
      return [década, new Map(valores.map(d => [d.clave, { valor: d.valor, rank: d.rank }]))];
    }));

    const serieCapas = claves.map(clave => ({
      clave,
      puntos: DÉCADAS.map(década => ({ década, ...rankingPorDécada.get(década).get(clave) })),
    }));

    const IW = Math.max(500, (MAX_DÉCADA - MIN_DÉCADA) / 10 * PX_POR_DÉCADA);
    const IH = Math.max(140, numCapas * 34);
    const WIDTH = IW + MARGIN_BUMP.left + MARGIN_BUMP.right;
    const HEIGHT = IH + MARGIN_BUMP.top + MARGIN_BUMP.bottom;

    const x = d3.scaleLinear().domain([MIN_DÉCADA, MAX_DÉCADA]).range([0, IW]);
    const y = d3.scalePoint().domain(d3.range(1, numCapas + 1)).range([10, IH - 10]);

    const línea = d3.line()
      .x(d => x(d.década))
      .y(d => y(d.rank))
      .curve(d3.curveMonotoneX);

    const wrapper = document.createElement("div");
    wrapper.className = "grafico-wrapper";
    bumpContainer.appendChild(wrapper);

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip-grafico tooltip-grafico--neutro tooltip-grafico--ancho";
    wrapper.appendChild(tooltip);

    const svg = d3.create("svg")
      .attr("viewBox", [0, 0, WIDTH, HEIGHT])
      .attr("width", WIDTH)
      .attr("height", HEIGHT)
      .attr("class", "grafico-svg");

    const g = svg.append("g").attr("transform", `translate(${MARGIN_BUMP.left},${MARGIN_BUMP.top})`);

    const primerDécada50 = Math.ceil(MIN_DÉCADA / 50) * 50;
    const ticksDécada = d3.range(primerDécada50, MAX_DÉCADA + 1, 50);
    g.append("g")
      .attr("transform", `translate(0,${IH})`)
      .call(d3.axisBottom(x).tickValues(ticksDécada).tickSize(0).tickFormat(d3.format("d")))
      .call(gg => {
        gg.select(".domain").remove();
        gg.selectAll("text").attr("class", "grafico-eje-texto");
      });

    serieCapas.forEach(serie => {
      const color = colorDe(serie.clave);
      g.append("path")
        .datum(serie.puntos)
        .attr("class", "grafico-serie-linea")
        .attr("stroke", color)
        .attr("d", línea);

      g.selectAll(null)
        .data(serie.puntos.filter(p => p.valor > 0))
        .join("circle")
        .attr("cx", d => x(d.década))
        .attr("cy", d => y(d.rank))
        .attr("r", 3)
        .attr("fill", color);
    });

    const etiquetasInicio = separarEtiquetas(serieCapas.map(s => ({ clave: s.clave, y: y(s.puntos[0].rank) })));
    const etiquetasFin = separarEtiquetas(serieCapas.map(s => ({ clave: s.clave, y: y(s.puntos[s.puntos.length - 1].rank) })));
    const yInicioPorClave = new Map(etiquetasInicio.map(p => [p.clave, p.y]));
    const yFinPorClave = new Map(etiquetasFin.map(p => [p.clave, p.y]));

    serieCapas.forEach(serie => {
      const color = colorDe(serie.clave);
      const primero = serie.puntos[0];
      const último = serie.puntos[serie.puntos.length - 1];
      g.append("text")
        .attr("x", -10).attr("y", yInicioPorClave.get(serie.clave))
        .attr("dy", "0.32em").attr("text-anchor", "end")
        .attr("class", "grafico-etiqueta-serie").style("fill", color)
        .text(`${nombreCorto(serie.clave)} (#${primero.rank})`);
      g.append("text")
        .attr("x", IW + 10).attr("y", yFinPorClave.get(serie.clave))
        .attr("dy", "0.32em").attr("text-anchor", "start")
        .attr("class", "grafico-etiqueta-serie").style("fill", color)
        .text(`${nombreCorto(serie.clave)} (#${último.rank})`);
    });

    const bisector = d3.bisector(d => d).center;
    const líneaGuía = g.append("line")
      .attr("y1", 0).attr("y2", IH)
      .attr("class", "grafico-linea-guia");

    svg.append("rect")
      .attr("x", MARGIN_BUMP.left).attr("y", MARGIN_BUMP.top)
      .attr("width", IW).attr("height", IH)
      .attr("class", "grafico-rect-hit")
      .on("mousemove", event => {
        const [mx] = d3.pointer(event, g.node());
        const décadaAprox = x.invert(mx);
        const i = bisector(DÉCADAS, décadaAprox);
        const década = DÉCADAS[Math.max(0, Math.min(DÉCADAS.length - 1, i))];
        líneaGuía.attr("x1", x(década)).attr("x2", x(década)).classed("grafico-linea-guia--visible", true);

        const ranking = [...rankingPorDécada.get(década).entries()].sort((a, b) => a[1].rank - b[1].rank);
        tooltip.innerHTML = `
          <strong>Década de ${década}</strong><br/>
          ${ranking.map(([clave, info]) => `#${info.rank} ${nombreCorto(clave)}: ${info.valor}`).join("<br/>")}
        `;
        tooltip.classList.add("tooltip-grafico--visible");
        const rect = wrapper.getBoundingClientRect();
        tooltip.style.left = (event.clientX - rect.left + 12) + "px";
        tooltip.style.top = (event.clientY - rect.top + 12) + "px";
      })
      .on("mouseleave", () => {
        tooltip.classList.remove("tooltip-grafico--visible");
        líneaGuía.classed("grafico-linea-guia--visible", false);
      });

    wrapper.appendChild(svg.node());

    dibujarLeyenda(bumpContainer, nombresCapas);

    const nota = document.createElement("p");
    nota.className = "filtro-nota";
    nota.textContent = notaCapas(nombresCapas);
    bumpContainer.appendChild(nota);
  }

  renderFiltros();
  dibujarBump();
}
