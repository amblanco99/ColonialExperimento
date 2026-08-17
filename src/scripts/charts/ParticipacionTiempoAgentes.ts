import * as d3 from "d3";
import { PALETA_TIPO } from "./agentesComun.js";
import { crearBotonVerCasos, irATablasFiltradas } from "./verCasos.js";

const MARGIN_LINEA = { top: 30, right: 20, bottom: 36, left: 50 };
const WIDTH_LINEA = 820;
const ALTO_LINEA = 380;
const DURACION_LINEA = 700;
const PAUSA_LINEA = 130;

function contarPorDecada(eventos, decadas, tipos) {
  const idsPorTipoDecada = new Map(
    tipos.map(t => [t, new Map(decadas.map(dc => [dc, new Set()]))])
  );
  eventos.forEach(d => {
    const mapaDecada = idsPorTipoDecada.get(d.tipo);
    const set = mapaDecada && mapaDecada.get(d.década);
    if (set) set.add(d.idAgente);
  });
  const conteos = new Map();
  idsPorTipoDecada.forEach((mapaDecada, tipo) => {
    const serie = decadas.map(dc => ({ década: dc, valor: mapaDecada.get(dc).size }));
    conteos.set(tipo, serie);
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

export function dibujarParticipacionTiempoAgentes({ chartContainerId, eventos, decadas, tiposActivos, crimenActivo }) {
  const chartContainer = document.getElementById(chartContainerId);
  if (!chartContainer) return;

  if (chartContainer._timerLineas) {
    chartContainer._timerLineas.stop();
    chartContainer._timerLineas = null;
  }

  chartContainer.innerHTML = "";

  if (tiposActivos.length === 0) {
    chartContainer.innerHTML = `<p class="grafico-vacio">Elige al menos un tipo de agente para mostrar.</p>`;
    return;
  }

  const botonVerCasos = crearBotonVerCasos();
  chartContainer.appendChild(botonVerCasos.boton);

  function dibujarLeyenda(padre) {
    const leyenda = document.createElement("div");
    leyenda.className = "leyenda-swatches";
    tiposActivos.forEach(t => {
      const item = document.createElement("div");
      item.className = "leyenda-swatch-item";
      const swatch = document.createElement("span");
      swatch.className = "leyenda-swatch-color";
      swatch.style.background = PALETA_TIPO[t];
      const texto = document.createElement("span");
      texto.textContent = t;
      item.appendChild(swatch);
      item.appendChild(texto);
      leyenda.appendChild(item);
    });
    padre.appendChild(leyenda);
  }

  function dibujarLinea(padre, conteosPorTipo) {
    const IW = WIDTH_LINEA - MARGIN_LINEA.left - MARGIN_LINEA.right;
    const IH = ALTO_LINEA - MARGIN_LINEA.top - MARGIN_LINEA.bottom;

    const maxValor = d3.max(tiposActivos, t => d3.max(conteosPorTipo.get(t), d => d.valor)) || 1;

    const x = d3.scaleLinear().domain(d3.extent(decadas)).range([0, IW]);
    const y = d3.scaleLinear().domain([0, maxValor]).nice().range([IH, 0]);

    const wrapper = document.createElement("div");
    wrapper.className = "grafico-wrapper lineas-wrapper";
    padre.appendChild(wrapper);

    const { tooltip, mover } = crearTooltip(wrapper);

    let seleccionTipo = null;
    let seleccionPuntoClave = null;
    const gruposPorTipo = new Map();

    function aplicarResaltadoLinea() {
      gruposPorTipo.forEach((grp, tipo) => {
        grp.style("opacity", !seleccionTipo || tipo === seleccionTipo ? 1 : 0.2);
      });
    }

    function limpiarSeleccionLinea() {
      seleccionTipo = null;
      seleccionPuntoClave = null;
      botonVerCasos.ocultar();
      aplicarResaltadoLinea();
    }

    function seleccionarTipo(tipo) {
      seleccionTipo = seleccionTipo === tipo ? null : tipo;
      seleccionPuntoClave = null;
      botonVerCasos.ocultar();
      aplicarResaltadoLinea();
    }

    function seleccionarPunto(tipo, década) {
      const clave = `${tipo}||${década}`;
      if (seleccionPuntoClave === clave) { limpiarSeleccionLinea(); return; }
      seleccionPuntoClave = clave;
      seleccionTipo = tipo;
      aplicarResaltadoLinea();
      botonVerCasos.mostrar(`${tipo} · ${década}`, () => irATablasFiltradas({
        agente: tipo,
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

    function dibujarSerieInstante(tipo) {
      const serie = conteosPorTipo.get(tipo);
      const color = PALETA_TIPO[tipo];
      const grupo = g.append("g").attr("class", "lineas-grupo-serie");
      gruposPorTipo.set(tipo, grupo);

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
          seleccionarTipo(tipo);
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
            <strong>${tipo}</strong><br/>
            década de ${d.década}<br/>
            ${d.valor.toLocaleString("es")} agente(s)
          `;
          tooltip.classList.add("tooltip-grafico--visible");
          mover(event);
        })
        .on("mousemove", mover)
        .on("mouseleave", () => tooltip.classList.remove("tooltip-grafico--visible"))
        .on("click", (event, d) => {
          event.stopPropagation();
          seleccionarPunto(tipo, d.década);
        });

      aplicarResaltadoLinea();
    }

    function revelarSecuencial(idx) {
      if (idx >= tiposActivos.length) return;
      const tipo = tiposActivos[idx];
      const serie = conteosPorTipo.get(tipo);
      const color = PALETA_TIPO[tipo];
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
          dibujarSerieInstante(tipo);
          chartContainer._timerLineas = d3.timeout(() => revelarSecuencial(idx + 1), PAUSA_LINEA);
        });
    }

    wrapper.appendChild(svg.node());
    chartContainer._timerLineas = d3.timeout(() => revelarSecuencial(0), 100);
  }

  dibujarLeyenda(chartContainer);
  dibujarLinea(chartContainer, contarPorDecada(eventos, decadas, tiposActivos));

  const nota = document.createElement("p");
  nota.className = "filtro-nota";
  nota.textContent = `${eventos.length.toLocaleString("es")} evento(s) registrados con los filtros actuales.`;
  chartContainer.appendChild(nota);
}
