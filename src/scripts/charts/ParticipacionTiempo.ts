import * as d3 from "d3";
import { PALETA_GENERO } from "./agentesComun.js";
import { crearBotonVerCasos, irATablasFiltradas } from "./verCasos.js";

const MARGIN_LINEA = { top: 30, right: 20, bottom: 36, left: 50 };
const WIDTH_LINEA = 820;
const ALTO_LINEA = 380;
const DURACION_LINEA = 700;
const PAUSA_LINEA = 130;

function contarPorDecada(filas, decadas, generos) {
  const idsPorGeneroDecada = new Map(
    generos.map(g => [g, new Map(decadas.map(dc => [dc, new Set()]))])
  );
  filas.forEach(d => {
    const mapaDecada = idsPorGeneroDecada.get(d.genero);
    const set = mapaDecada && mapaDecada.get(d.década);
    if (set) set.add(d.idAgente);
  });
  const conteos = new Map();
  idsPorGeneroDecada.forEach((mapaDecada, genero) => {
    const serie = decadas.map(dc => ({ década: dc, valor: mapaDecada.get(dc).size }));
    conteos.set(genero, serie);
  });
  return conteos;
}

function crearTooltip(padreRelativo) {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip-grafico tooltip-grafico--neutro";
  padreRelativo.appendChild(tooltip);
  function mover(event) {
    const rect = padreRelativo.getBoundingClientRect();
    tooltip.style.left = (event.clientX - rect.left + 12) + "px";
    tooltip.style.top = (event.clientY - rect.top + 12) + "px";
  }
  return { tooltip, mover };
}

export function dibujarParticipacionTiempo({ chartContainerId, datos, decadas, generosActivos, etiquetaCrimen }) {
  const chartContainer = document.getElementById(chartContainerId);
  if (!chartContainer) return;

  if (chartContainer._timerLineas) {
    chartContainer._timerLineas.stop();
    chartContainer._timerLineas = null;
  }

  chartContainer.innerHTML = "";

  if (generosActivos.length === 0) {
    chartContainer.innerHTML = `<p class="grafico-vacio">Elige al menos un género para mostrar.</p>`;
    return;
  }

  const crimenActivo = etiquetaCrimen === "Todos los crímenes" ? null : etiquetaCrimen;
  const botonVerCasos = crearBotonVerCasos();
  chartContainer.appendChild(botonVerCasos.boton);

  function dibujarLeyenda(padre) {
    const leyenda = document.createElement("div");
    leyenda.className = "leyenda-swatches";
    generosActivos.forEach(g => {
      const item = document.createElement("div");
      item.className = "leyenda-swatch-item";
      const swatch = document.createElement("span");
      swatch.className = "leyenda-swatch-color";
      swatch.style.background = PALETA_GENERO[g];
      const texto = document.createElement("span");
      texto.textContent = g;
      item.appendChild(swatch);
      item.appendChild(texto);
      leyenda.appendChild(item);
    });
    padre.appendChild(leyenda);
  }

  function dibujarLinea(padre, conteosPorGenero) {
    const IW = WIDTH_LINEA - MARGIN_LINEA.left - MARGIN_LINEA.right;
    const IH = ALTO_LINEA - MARGIN_LINEA.top - MARGIN_LINEA.bottom;

    const maxValor = d3.max(generosActivos, g => d3.max(conteosPorGenero.get(g), d => d.valor)) || 1;

    const x = d3.scaleLinear().domain(d3.extent(decadas)).range([0, IW]);
    const y = d3.scaleLinear().domain([0, maxValor]).nice().range([IH, 0]);

    const wrapper = document.createElement("div");
    wrapper.className = "grafico-wrapper lineas-wrapper";
    padre.appendChild(wrapper);

    const { tooltip, mover } = crearTooltip(wrapper);

    let seleccionGenero = null;
    let seleccionPuntoClave = null;
    const gruposPorGenero = new Map();

    function aplicarResaltadoLinea() {
      gruposPorGenero.forEach((grp, genero) => {
        grp.style("opacity", !seleccionGenero || genero === seleccionGenero ? 1 : 0.2);
      });
    }

    function limpiarSeleccionLinea() {
      seleccionGenero = null;
      seleccionPuntoClave = null;
      botonVerCasos.ocultar();
      aplicarResaltadoLinea();
    }

    function seleccionarGenero(genero) {
      seleccionGenero = seleccionGenero === genero ? null : genero;
      seleccionPuntoClave = null;
      botonVerCasos.ocultar();
      aplicarResaltadoLinea();
    }

    function seleccionarPunto(genero, década) {
      const clave = `${genero}||${década}`;
      if (seleccionPuntoClave === clave) { limpiarSeleccionLinea(); return; }
      seleccionPuntoClave = clave;
      seleccionGenero = genero;
      aplicarResaltadoLinea();
      botonVerCasos.mostrar(`${genero} · ${década}`, () => irATablasFiltradas({
        genero,
        codigo: crimenActivo,
        fecha: década,
        escala: "decada",
      }));
    }

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${WIDTH_LINEA} ${ALTO_LINEA}`)
      .attr("class", "grafico-svg")
      .on("click", () => limpiarSeleccionLinea());

    const g = svg.append("g").attr("transform", `translate(${MARGIN_LINEA.left},${MARGIN_LINEA.top})`);

    const ejeY = d3.axisLeft(y).ticks(6).tickSize(-IW).tickFormat(d3.format(","));
    const gEjeY = g.append("g").call(ejeY);
    gEjeY.select(".domain").remove();
    gEjeY.selectAll("line").attr("stroke", "#e8e2d4");
    gEjeY.selectAll("text").attr("class", "grafico-eje-texto");

    const ejeX = d3.axisBottom(x).ticks(Math.min(decadas.length, 10)).tickFormat(d3.format("d"));
    g.append("g")
      .attr("transform", `translate(0,${IH})`)
      .call(ejeX)
      .selectAll("text")
      .attr("class", "grafico-eje-texto");

    const línea = d3.line()
      .x(d => x(d.década))
      .y(d => y(d.valor))
      .curve(d3.curveMonotoneX);

    function dibujarSerieInstante(genero) {
      const serie = conteosPorGenero.get(genero);
      const color = PALETA_GENERO[genero];
      const grupo = g.append("g").attr("class", "lineas-grupo-serie");
      gruposPorGenero.set(genero, grupo);

      grupo.append("path")
        .datum(serie)
        .attr("d", línea)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("class", "lineas-trazo");

      grupo.append("path")
        .datum(serie)
        .attr("d", línea)
        .attr("fill", "none")
        .attr("class", "lineas-trazo-hit")
        .on("click", event => {
          event.stopPropagation();
          seleccionarGenero(genero);
        });

      grupo.selectAll(null)
        .data(serie)
        .join("circle")
        .attr("cx", d => x(d.década))
        .attr("cy", d => y(d.valor))
        .attr("r", 3)
        .attr("fill", color)
        .attr("class", "lineas-punto")
        .on("mouseenter", (event, d) => {
          tooltip.innerHTML = `
            <strong>${etiquetaCrimen}</strong><br/>
            ${genero} · década de ${d.década}<br/>
            ${d.valor.toLocaleString("es")} persona(s)
          `;
          tooltip.classList.add("tooltip-grafico--visible");
          mover(event);
        })
        .on("mousemove", mover)
        .on("mouseleave", () => tooltip.classList.remove("tooltip-grafico--visible"))
        .on("click", (event, d) => {
          event.stopPropagation();
          seleccionarPunto(genero, d.década);
        });

      aplicarResaltadoLinea();
    }

    function revelarSecuencial(idx) {
      if (idx >= generosActivos.length) return;
      const genero = generosActivos[idx];
      const serie = conteosPorGenero.get(genero);
      const color = PALETA_GENERO[genero];
      const grupoTemp = g.append("g");
      const pathTemp = grupoTemp.append("path")
        .datum(serie)
        .attr("d", línea)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("class", "lineas-trazo");
      const totalLength = pathTemp.node().getTotalLength();
      pathTemp
        .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
        .attr("stroke-dashoffset", totalLength)
        .transition().duration(DURACION_LINEA).ease(d3.easeLinear).attr("stroke-dashoffset", 0)
        .on("end", () => {
          grupoTemp.remove();
          dibujarSerieInstante(genero);
          chartContainer._timerLineas = d3.timeout(() => revelarSecuencial(idx + 1), PAUSA_LINEA);
        });
    }

    wrapper.appendChild(svg.node());
    chartContainer._timerLineas = d3.timeout(() => revelarSecuencial(0), 100);
  }

  dibujarLeyenda(chartContainer);
  dibujarLinea(chartContainer, contarPorDecada(datos, decadas, generosActivos));

  const nota = document.createElement("p");
  nota.className = "filtro-nota";
  nota.textContent = `${datos.length.toLocaleString("es")} participación(es) registradas en "${etiquetaCrimen}".`;
  chartContainer.appendChild(nota);
}
