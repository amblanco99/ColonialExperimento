import * as d3 from "d3";
import { PALETA_GRUPO } from "./agentesComun.js";
import type { FilaCsv } from "./agentesComun.js";
import { crearBotonVerCasos, irATablasFiltradas } from "./verCasos.js";

const TOP_CRIMENES = 10;

function pathBarra(x: number, y: number, w: number, h: number, redondearDerecha: boolean) {
  if (w <= 0) return "";
  const RADIO_PUNTA = 4;
  const r = Math.min(RADIO_PUNTA, w, h / 2);
  if (redondearDerecha) {
    return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
  }
  return `M${x + r},${y} L${x + w},${y} L${x + w},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`;
}

function truncar(texto: string, maxChars: number) {
  if (texto.length > maxChars && maxChars > 3) {
    return texto.slice(0, Math.max(0, maxChars - 2)) + "…";
  }
  return texto;
}

export function crearAgentesButterfly(containerId: string) {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return { actualizar() {} };

  chartContainer.innerHTML = `<div class="ag-mariposa-chart"></div>`;
  // El propio módulo crea .ag-mariposa-chart unas líneas antes, así que existe.
  const wrapperChart = chartContainer.querySelector(".ag-mariposa-chart")!;

  const MARGIN = { top: 40, right: 16, bottom: 16, left: 16 };
  const WIDTH = 700;
  const LABEL_WIDTH = 150;
  const IW = WIDTH - MARGIN.left - MARGIN.right;
  const IW_MITAD = (IW - LABEL_WIDTH) / 2;
  const PASO_FILA = 46;

  const estadoLocal: { crimenLocal: string | null } = { crimenLocal: null };
  let ultimoEventos: FilaCsv[] = [];
  let ultimoCrimenTop = "Todos";

  function crearBotonVolver() {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "mariposa-btn-volver";
    boton.textContent = "‹ Volver a todos los crímenes";
    boton.addEventListener("click", () => {
      estadoLocal.crimenLocal = null;
      actualizar(ultimoEventos, ultimoCrimenTop);
    });
    return boton;
  }

  const botonVerCasos = crearBotonVerCasos();

  function actualizar(eventosFiltrados: FilaCsv[], crimenTop = "Todos") {
    ultimoEventos = eventosFiltrados;
    ultimoCrimenTop = crimenTop;
    wrapperChart.innerHTML = "";
    botonVerCasos.ocultar();

    if (eventosFiltrados.length === 0) {
      wrapperChart.innerHTML = `<p class="agentes-vacio">No hay datos para esta selección de filtros.</p>`;
      return;
    }

    const crimenActivoLocal = crimenTop !== "Todos" ? crimenTop : estadoLocal.crimenLocal;
    const enSubnivel = crimenActivoLocal !== null;
    const puedeVolver = enSubnivel && crimenTop === "Todos";

    if (puedeVolver) {
      wrapperChart.appendChild(crearBotonVolver());
    }

    if (enSubnivel) {
      wrapperChart.appendChild(botonVerCasos.boton);
    }

    let filasBase: FilaCsv[];
    let nombresFila: any[]; // TODO: type
    if (enSubnivel) {
      filasBase = eventosFiltrados.filter(d => d.crimen === crimenActivoLocal);
      nombresFila = [...d3.rollup(filasBase.filter(d => d.subcrimen), v => v.length, (d: FilaCsv) => d.subcrimen)]
        .sort((a, b) => b[1] - a[1])
        .map(([nombre]) => nombre);
    } else {
      filasBase = eventosFiltrados;
      nombresFila = [...d3.rollup(eventosFiltrados, v => v.length, (d: FilaCsv) => d.crimen)]
        .sort((a, b) => b[1] - a[1])
        .slice(0, TOP_CRIMENES)
        .map(([nombre]) => nombre);
    }

    if (nombresFila.length === 0) {
      const vacio = document.createElement("p");
      vacio.className = "agentes-vacio";
      vacio.textContent = `"${crimenActivoLocal}" no tiene subcrímenes registrados para esta selección.`;
      wrapperChart.appendChild(vacio);
      return;
    }

    function conteoPorGrupo(grupo: string) {
      const mapa = new Map(nombresFila.map((f: any) => [f, 0]));
      filasBase.filter(d => d.grupo === grupo).forEach(d => {
        const clave = enSubnivel ? d.subcrimen : d.crimen;
        if (mapa.has(clave)) mapa.set(clave, mapa.get(clave)! + 1);
      });
      return mapa;
    }
    const conteoInst = conteoPorGrupo("Instituciones");
    const conteoPobl = conteoPorGrupo("Poblaciones");
    const totalInst = d3.sum(conteoInst.values());
    const totalPobl = d3.sum(conteoPobl.values());

    if (totalInst === 0 && totalPobl === 0) {
      const vacio = document.createElement("p");
      vacio.className = "agentes-vacio";
      vacio.textContent = "No hay datos para esta selección de filtros.";
      wrapperChart.appendChild(vacio);
      return;
    }

    const filasConDatos = nombresFila.filter((f: any) => conteoInst.get(f)! > 0 || conteoPobl.get(f)! > 0);
    const IH = filasConDatos.length * PASO_FILA;
    const HEIGHT = MARGIN.top + IH + MARGIN.bottom;
    const máximoFila = d3.max(filasConDatos, (f: any) => Math.max(conteoInst.get(f)!, conteoPobl.get(f)!)) || 1;
    const escala = d3.scaleLinear().domain([0, máximoFila]).nice().range([0, IW_MITAD]);
    const y = d3.scaleBand().domain(filasConDatos).range([0, IH]).paddingInner(0.35);
    const centroX = LABEL_WIDTH + IW_MITAD;
    const maxCharsEtiqueta = Math.floor((LABEL_WIDTH - 10) / 6.5);

    const wrapper = document.createElement("div");
    wrapper.className = "grafico-wrapper--centrado";
    wrapperChart.appendChild(wrapper);

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip-grafico tooltip-grafico--neutro";
    wrapper.appendChild(tooltip);
    function moverTooltip(event: MouseEvent) {
      const rect = wrapper.getBoundingClientRect();
      tooltip.style.left = (event.clientX - rect.left + 12) + "px";
      tooltip.style.top = (event.clientY - rect.top + 12) + "px";
    }

    const svg = d3.create("svg")
      .attr("width", WIDTH)
      .attr("height", HEIGHT)
      .attr("class", "grafico-svg");

    svg.append("text")
      .attr("x", MARGIN.left + centroX - 4)
      .attr("y", 20)
      .attr("text-anchor", "end")
      .attr("class", "mariposa-encabezado-lado")
      .text("Instituciones");
    svg.append("text")
      .attr("x", MARGIN.left + centroX + 4)
      .attr("y", 20)
      .attr("text-anchor", "start")
      .attr("class", "mariposa-encabezado-lado")
      .text("Poblaciones");

    const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const ticks = escala.ticks(4).filter(t => t > 0);
    const ejeTicks = g.append("g");
    ticks.forEach(t => {
      const offset = escala(t);
      [centroX - offset, centroX + offset].forEach(x => {
        ejeTicks.append("line")
          .attr("x1", x).attr("x2", x)
          .attr("y1", -8).attr("y2", IH)
          .attr("class", "mariposa-eje-tick-linea");
        ejeTicks.append("text")
          .attr("x", x).attr("y", -14)
          .attr("text-anchor", "middle")
          .attr("class", "mariposa-eje-tick-texto")
          .text(d3.format(",")(t));
      });
    });

    g.append("line")
      .attr("x1", centroX).attr("x2", centroX)
      .attr("y1", -8).attr("y2", IH)
      .attr("class", "mariposa-linea-central");

    filasConDatos.forEach(nombreFila => {
      const yTop = y(nombreFila)!;
      const alto = Math.min(24, y.bandwidth());
      const yCentrado = yTop + (y.bandwidth() - alto) / 2;
      const valorInst = conteoInst.get(nombreFila)!;
      const valorPobl = conteoPobl.get(nombreFila)!;

      const filaGrupo = g.append("g")
        .attr("class", `mariposa-fila${!enSubnivel ? " mariposa-fila-boton" : ""}`);

      if (!enSubnivel) {
        filaGrupo.append("rect")
          .attr("x", 0)
          .attr("y", yTop)
          .attr("width", IW)
          .attr("height", y.bandwidth())
          .attr("fill", "transparent")
          .style("cursor", "pointer")
          .on("click", () => {
            estadoLocal.crimenLocal = nombreFila;
            actualizar(ultimoEventos, ultimoCrimenTop);
          });
      }

      const etiquetaTexto = filaGrupo.append("text")
        .attr("x", 0)
        .attr("y", yTop + y.bandwidth() / 2)
        .attr("dy", "0.32em")
        .attr("text-anchor", "start")
        .attr("class", "mariposa-etiqueta-fila")
        .style("pointer-events", "none")
        .text(truncar(nombreFila, maxCharsEtiqueta));
      etiquetaTexto.append("title").text(nombreFila);

      function dibujarLado(valor: number, grupo: string, esDerecha: boolean) {
        const anchoPx = escala(valor);
        const xBase = esDerecha ? centroX : centroX - anchoPx;
        const d = pathBarra(xBase, yCentrado, anchoPx, alto, esDerecha);
        // OJO: `var(--accent)` acaba en un ATRIBUTO de presentación SVG (.attr("fill")),
        // donde var() no resuelve. Está roto desde antes del port y se deja igual;
        // ver MIGRATION.md, trabajo posterior.
        const color = (PALETA_GRUPO as Record<string, string>)[grupo] || "var(--accent)";
        if (d) {
          const barra = filaGrupo.append("path")
            .attr("d", d)
            .attr("fill", color)
            .attr("class", "mariposa-barra-dato");
          if (enSubnivel && valor > 0) {
            barra.style("cursor", "pointer")
              .on("click", (event: MouseEvent) => {
                event.stopPropagation();
                botonVerCasos.mostrar(`${grupo} · ${nombreFila}`, () => irATablasFiltradas({
                  codigo: crimenActivoLocal,
                  subcodigo: nombreFila,
                }));
              });
          } else {
            barra.style("pointer-events", "none");
          }
        }
        if (valor > 0) {
          filaGrupo.append("text")
            .attr("x", esDerecha ? xBase + anchoPx + 6 : xBase - 6)
            .attr("y", yCentrado + alto / 2)
            .attr("dy", "0.32em")
            .attr("text-anchor", esDerecha ? "start" : "end")
            .attr("class", "mariposa-valor-texto")
            .style("pointer-events", "none")
            .text(valor.toLocaleString("es"));
        }
      }

      dibujarLado(valorInst, "Instituciones", false);
      dibujarLado(valorPobl, "Poblaciones", true);

      filaGrupo.on("mouseenter", (event: MouseEvent) => {
        tooltip.innerHTML = `
          <strong>${nombreFila}</strong><br/>
          Instituciones: ${valorInst.toLocaleString("es")} · Poblaciones: ${valorPobl.toLocaleString("es")}
          ${!enSubnivel ? "<br/><em>Clic para ver subcrímenes</em>" : "<br/><em>Clic en una barra para ver sus casos</em>"}
        `;
        tooltip.classList.add("tooltip-grafico--visible");
        moverTooltip(event);
      })
        .on("mousemove", moverTooltip)
        .on("mouseleave", () => tooltip.classList.remove("tooltip-grafico--visible"));
    });

    wrapper.appendChild(svg.node()!);

    const nota = document.createElement("p");
    nota.className = "filtro-nota filtro-nota--centrada";
    const etiquetaNivel = enSubnivel ? `Subcrímenes de "${crimenActivoLocal}"` : "Crímenes más frecuentes";
    nota.textContent = `${etiquetaNivel} · Instituciones: ${totalInst.toLocaleString("es")} · Poblaciones: ${totalPobl.toLocaleString("es")}`
      + (!enSubnivel ? " · Clic en un crimen para ver sus subcrímenes." : "");
    wrapperChart.appendChild(nota);
  }

  return { actualizar };
}
