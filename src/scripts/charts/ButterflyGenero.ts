import * as d3 from "d3";
import { PALETA_GENERO } from "./agentesComun.js";
import { crearBotonVerCasos, irATablasFiltradas } from "./verCasos.js";

const GENEROS = ["Mujer", "Hombre", "Sin información"];
const RADIO_PUNTA = 4;
const MAX_CHARS_ETIQUETA = 30;

function pathBarra(x, y, w, h, redondearDerecha) {
  if (w <= 0) return "";
  const r = Math.min(RADIO_PUNTA, w, h / 2);
  if (redondearDerecha) {
    return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
  }
  return `M${x + r},${y} L${x + w},${y} L${x + w},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`;
}

function truncar(texto, max = MAX_CHARS_ETIQUETA) {
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}


export function dibujarButterflyGenero({ filtrosContainerId, chartContainerId, datos, crimenTop, estadoLocal }) {
  const filtrosContainer = document.getElementById(filtrosContainerId);
  const chartContainer = document.getElementById(chartContainerId);
  if (!filtrosContainer || !chartContainer) return;

  filtrosContainer.innerHTML = "";
  chartContainer.innerHTML = "";

  if (datos.length === 0) {
    chartContainer.innerHTML = `<p class="grafico-vacio">No hay datos para esta selección.</p>`;
    return;
  }

  const CRIMENES = [...d3.rollup(datos, v => v.length, d => d.crimen)]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre]) => nombre);

  const SUBCRIMENES_POR_CRIMEN = new Map();
  CRIMENES.forEach(crimen => {
    const subs = [...d3.rollup(
      datos.filter(d => d.crimen === crimen && d.subcrimen),
      v => v.length,
      d => d.subcrimen
    )].sort((a, b) => b[1] - a[1]).map(([nombre]) => nombre);
    SUBCRIMENES_POR_CRIMEN.set(crimen, subs);
  });

  filtrosContainer.innerHTML = `<div class="filtros-chip-panel"></div>`;
  const wrapperFiltros = filtrosContainer.querySelector(".filtros-chip-panel");

  function renderFiltros() {
    wrapperFiltros.innerHTML = "";

    const barra = document.createElement("div");
    barra.className = "filtros-barra-selectores";

    function crearSelectorLado(etiqueta, ladoKey) {
      const grupo = document.createElement("div");
      grupo.className = "filtro-selector filtro-selector--ancho";
      const label = document.createElement("div");
      label.className = "filtros-grupo-titulo";
      label.textContent = etiqueta;
      grupo.appendChild(label);
      const select = document.createElement("select");
      select.className = "filtro-select-generico";
      GENEROS.forEach(g => {
        const opt = document.createElement("option");
        opt.value = g;
        opt.textContent = g;
        select.appendChild(opt);
      });
      select.value = estadoLocal[ladoKey];
      select.addEventListener("change", () => {
        const otroKey = ladoKey === "generoIzquierda" ? "generoDerecha" : "generoIzquierda";
        if (select.value === estadoLocal[otroKey]) estadoLocal[otroKey] = estadoLocal[ladoKey];
        estadoLocal[ladoKey] = select.value;
        actualizar();
      });
      grupo.appendChild(select);
      return grupo;
    }
    barra.appendChild(crearSelectorLado("Lado izquierdo", "generoIzquierda"));
    barra.appendChild(crearSelectorLado("Lado derecho", "generoDerecha"));

    wrapperFiltros.appendChild(barra);
  }

  function actualizar() {
    renderFiltros();
    dibujarMariposa();
  }

  const MARGIN = { top: 50, right: 16, bottom: 16, left: 16 };
  const WIDTH = 820;
  const LABEL_WIDTH = 190;
  const IW = WIDTH - MARGIN.left - MARGIN.right;
  const IW_MITAD = (IW - LABEL_WIDTH) / 2;
  const CENTRO_X = LABEL_WIDTH + IW_MITAD;
  const PASO_FILA = 38;

  function crearBotonVolver() {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "mariposa-btn-volver";
    boton.textContent = "‹ Volver a todos los crímenes";
    boton.addEventListener("click", () => {
      estadoLocal.crimenLocal = null;
      dibujarMariposa();
    });
    return boton;
  }

  const botonVerCasos = crearBotonVerCasos();

  function dibujarMariposa() {
    chartContainer.innerHTML = "";
    botonVerCasos.ocultar();

    const crimenActivoLocal = crimenTop !== "Todos" ? crimenTop : estadoLocal.crimenLocal;
    const enSubnivel = crimenActivoLocal !== null;
    const puedeVolver = enSubnivel && crimenTop === "Todos";

    if (puedeVolver) {
      chartContainer.appendChild(crearBotonVolver());
    }

    if (enSubnivel) {
      chartContainer.appendChild(botonVerCasos.boton);
    }

    const filas = (enSubnivel ? datos.filter(d => d.crimen === crimenActivoLocal) : datos);
    const filasGeneros = filas.filter(d => d.genero === estadoLocal.generoIzquierda || d.genero === estadoLocal.generoDerecha);

    const nombresFila = enSubnivel ? (SUBCRIMENES_POR_CRIMEN.get(crimenActivoLocal) || []) : CRIMENES;

    if (nombresFila.length === 0) {
      const vacio = document.createElement("p");
      vacio.className = "grafico-vacio";
      vacio.textContent = `"${crimenActivoLocal}" no tiene subcrímenes registrados para esta selección.`;
      chartContainer.appendChild(vacio);
      return;
    }

    function conteoPorFila(genero) {
      const mapa = new Map(nombresFila.map(f => [f, 0]));
      filasGeneros.filter(d => d.genero === genero).forEach(d => {
        const clave = enSubnivel ? d.subcrimen : d.crimen;
        if (mapa.has(clave)) mapa.set(clave, mapa.get(clave) + 1);
      });
      return mapa;
    }
    const conteoIzq = conteoPorFila(estadoLocal.generoIzquierda);
    const conteoDer = conteoPorFila(estadoLocal.generoDerecha);

    const totalIzq = d3.sum(conteoIzq.values());
    const totalDer = d3.sum(conteoDer.values());

    if (totalIzq === 0 && totalDer === 0) {
      const vacio = document.createElement("p");
      vacio.className = "grafico-vacio";
      vacio.textContent = `No hay datos de "${estadoLocal.generoIzquierda}" ni "${estadoLocal.generoDerecha}" para esta selección.`;
      chartContainer.appendChild(vacio);
      return;
    }

    const filasConDatos = nombresFila.filter(f => conteoIzq.get(f) > 0 || conteoDer.get(f) > 0);
    const IH = filasConDatos.length * PASO_FILA;
    const HEIGHT = MARGIN.top + IH + MARGIN.bottom;

    const máximoFila = d3.max(filasConDatos, f => Math.max(conteoIzq.get(f), conteoDer.get(f))) || 1;

    const escala = d3.scaleLinear().domain([0, máximoFila]).nice().range([0, IW_MITAD]);
    const y = d3.scaleBand().domain(filasConDatos).range([0, IH]).paddingInner(0.35);
    const centroX = CENTRO_X;
    const colorIzq = PALETA_GENERO[estadoLocal.generoIzquierda];
    const colorDer = PALETA_GENERO[estadoLocal.generoDerecha];

    const wrapper = document.createElement("div");
    wrapper.className = "grafico-wrapper--centrado";
    chartContainer.appendChild(wrapper);

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip-grafico tooltip-grafico--neutro";
    wrapper.appendChild(tooltip);
    function moverTooltip(event) {
      const rect = wrapper.getBoundingClientRect();
      tooltip.style.left = (event.clientX - rect.left + 12) + "px";
      tooltip.style.top = (event.clientY - rect.top + 12) + "px";
    }

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
      .attr("class", "grafico-svg");

    svg.append("text")
      .attr("x", MARGIN.left + LABEL_WIDTH + IW_MITAD / 2)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .attr("class", "mariposa-encabezado-lado")
      .attr("fill", colorIzq)
      .text(estadoLocal.generoIzquierda);
    svg.append("text")
      .attr("x", MARGIN.left + centroX + IW_MITAD / 2)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .attr("class", "mariposa-encabezado-lado")
      .attr("fill", colorDer)
      .text(estadoLocal.generoDerecha);

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
      const yTop = y(nombreFila);
      const alto = Math.min(20, y.bandwidth());
      const yCentrado = yTop + (y.bandwidth() - alto) / 2;
      const valorIzq = conteoIzq.get(nombreFila);
      const valorDer = conteoDer.get(nombreFila);

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
            dibujarMariposa();
          });
      }

      const etiquetaTexto = filaGrupo.append("text")
        .attr("x", 0)
        .attr("y", yTop + y.bandwidth() / 2)
        .attr("dy", "0.32em")
        .attr("text-anchor", "start")
        .attr("class", "mariposa-etiqueta-fila")
        .style("pointer-events", "none")
        .text(truncar(nombreFila));
      etiquetaTexto.append("title").text(nombreFila);

      function dibujarLado(valor, genero, color, esDerecha) {
        const anchoPx = escala(valor);
        const xBase = esDerecha ? centroX : centroX - anchoPx;
        const d = pathBarra(xBase, yCentrado, anchoPx, alto, esDerecha);
        if (d) {
          const barra = filaGrupo.append("path")
            .attr("d", d)
            .attr("fill", color)
            .attr("class", "mariposa-barra-dato");
          if (enSubnivel && valor > 0) {
            barra.style("cursor", "pointer")
              .on("click", event => {
                event.stopPropagation();
                botonVerCasos.mostrar(`${genero} · ${nombreFila}`, () => irATablasFiltradas({
                  genero,
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

      dibujarLado(valorIzq, estadoLocal.generoIzquierda, colorIzq, false);
      dibujarLado(valorDer, estadoLocal.generoDerecha, colorDer, true);

      filaGrupo.on("mouseenter", (event) => {
        tooltip.innerHTML = `
          <strong>${nombreFila}</strong><br/>
          ${estadoLocal.generoIzquierda}: ${valorIzq.toLocaleString("es")} · ${estadoLocal.generoDerecha}: ${valorDer.toLocaleString("es")}
          ${!enSubnivel ? "<br/><em>Clic para ver subcrímenes</em>" : "<br/><em>Clic en una barra para ver sus casos</em>"}
        `;
        tooltip.classList.add("tooltip-grafico--visible");
        moverTooltip(event);
      })
        .on("mousemove", moverTooltip)
        .on("mouseleave", () => tooltip.classList.remove("tooltip-grafico--visible"));
    });

    wrapper.appendChild(svg.node());

    const nota = document.createElement("p");
    nota.className = "filtro-nota filtro-nota--centrada";
    const etiquetaNivel = enSubnivel ? `Subcrímenes de "${crimenActivoLocal}"` : "Todos los crímenes";
    nota.textContent = `${etiquetaNivel} · ${estadoLocal.generoIzquierda}: ${totalIzq.toLocaleString("es")} · ${estadoLocal.generoDerecha}: ${totalDer.toLocaleString("es")}`
      + (!enSubnivel ? " · Clic en un crimen para ver sus subcrímenes." : "");
    chartContainer.appendChild(nota);
  }

  renderFiltros();
  dibujarMariposa();
}
