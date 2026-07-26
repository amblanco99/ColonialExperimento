import * as d3 from "d3";
import { PALETA_TIPO, SIGLOS } from "./agentesComun.js";

const ORDEN_ATRIBUTO = ["Víctima", "Perpetrador", "Cómplice"];

function pathBarra(x, y, w, h, redondearDerecha) {
  if (w <= 0) return "";
  const RADIO_PUNTA = 4;
  const r = Math.min(RADIO_PUNTA, w, h / 2);
  if (redondearDerecha) {
    return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
  }
  return `M${x + r},${y} L${x + w},${y} L${x + w},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`;
}

export function crearAgentesButterfly(containerId) {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return { actualizar() {} };

  chartContainer.innerHTML = `
    <div class="ag-mariposa-selectores"></div>
    <div class="ag-mariposa-chart"></div>
  `;
  const wrapperSelectores = chartContainer.querySelector(".ag-mariposa-selectores");
  const wrapperChart = chartContainer.querySelector(".ag-mariposa-chart");

  const estado = { izquierda: null, derecha: null };

  const MARGIN = { top: 60, right: 16, bottom: 16, left: 16 };
  const WIDTH = 700;
  const GUTTER = 100;
  const IW = WIDTH - MARGIN.left - MARGIN.right;
  const IW_MITAD = (IW - GUTTER) / 2;
  const PASO_FILA = 64;

  function actualizar(eventosFiltrados, siglosActivos, tipoActivo) {
    const atributosPresentes = [...new Set(eventosFiltrados.map(d => d.atributo))]
      .sort((a, b) => ORDEN_ATRIBUTO.indexOf(a) - ORDEN_ATRIBUTO.indexOf(b));

    if (atributosPresentes.length === 0) {
      wrapperSelectores.innerHTML = "";
      wrapperChart.innerHTML = `<p class="agentes-vacio">No hay datos para esta selección de filtros.</p>`;
      return;
    }

    if (!estado.izquierda || !atributosPresentes.includes(estado.izquierda)) {
      estado.izquierda = atributosPresentes.includes("Víctima") ? "Víctima" : atributosPresentes[0];
    }
    if (!estado.derecha || !atributosPresentes.includes(estado.derecha) || estado.derecha === estado.izquierda) {
      estado.derecha = atributosPresentes.find(a => a !== estado.izquierda) || atributosPresentes[0];
    }

    renderSelectores(atributosPresentes);
    renderMariposa(eventosFiltrados, siglosActivos, tipoActivo);
  }

  function renderSelectores(atributosPresentes) {
    wrapperSelectores.innerHTML = "";
    const barra = document.createElement("div");
    barra.className = "filtros-barra-selectores filtros-barra-selectores--con-margen";

    function crearSelectorLado(etiqueta, ladoKey) {
      const grupo = document.createElement("div");
      grupo.className = "filtro-selector filtro-selector--ancho";
      const label = document.createElement("div");
      label.className = "filtros-grupo-titulo";
      label.textContent = etiqueta;
      grupo.appendChild(label);
      const select = document.createElement("select");
      select.className = "filtro-select-generico";
      atributosPresentes.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = a;
        select.appendChild(opt);
      });
      select.value = estado[ladoKey];
      select.addEventListener("change", () => {
        const otroKey = ladoKey === "izquierda" ? "derecha" : "izquierda";
        if (select.value === estado[otroKey]) estado[otroKey] = estado[ladoKey];
        estado[ladoKey] = select.value;
        renderSelectores(atributosPresentes);
        renderMariposa(ultimoEventos, ultimoSiglos, ultimoTipo);
      });
      grupo.appendChild(select);
      return grupo;
    }
    barra.appendChild(crearSelectorLado("Lado izquierdo", "izquierda"));
    barra.appendChild(crearSelectorLado("Lado derecho", "derecha"));
    wrapperSelectores.appendChild(barra);
  }

  let ultimoEventos = [];
  let ultimoSiglos = new Set(SIGLOS);
  let ultimoTipo = null;

  function renderMariposa(eventosFiltrados, siglosActivos, tipoActivo) {
    ultimoEventos = eventosFiltrados;
    ultimoSiglos = siglosActivos;
    ultimoTipo = tipoActivo;

    wrapperChart.innerHTML = "";

    const siglosFila = SIGLOS.filter(s => siglosActivos.has(s));
    if (siglosFila.length === 0) {
      wrapperChart.innerHTML = `<p class="agentes-vacio">Activa al menos un siglo para ver esta gráfica.</p>`;
      return;
    }

    function conteoPorSiglo(atributo) {
      const mapa = new Map(siglosFila.map(s => [s, 0]));
      eventosFiltrados
        .filter(d => d.atributo === atributo && mapa.has(d.siglo))
        .forEach(d => mapa.set(d.siglo, mapa.get(d.siglo) + 1));
      return mapa;
    }
    const conteoIzq = conteoPorSiglo(estado.izquierda);
    const conteoDer = conteoPorSiglo(estado.derecha);
    const totalIzq = d3.sum(conteoIzq.values());
    const totalDer = d3.sum(conteoDer.values());

    if (totalIzq === 0 && totalDer === 0) {
      wrapperChart.innerHTML = `<p class="agentes-vacio">No hay datos de "${estado.izquierda}" ni "${estado.derecha}" para esta selección.</p>`;
      return;
    }

    const IH = siglosFila.length * PASO_FILA;
    const HEIGHT = MARGIN.top + IH + MARGIN.bottom;
    const máximoFila = d3.max(siglosFila, s => Math.max(conteoIzq.get(s), conteoDer.get(s))) || 1;
    const escala = d3.scaleLinear().domain([0, máximoFila]).nice().range([0, IW_MITAD]);
    const y = d3.scaleBand().domain(siglosFila).range([0, IH]).paddingInner(0.4);
    const centroX = IW_MITAD + GUTTER / 2;
    const colorActivo = tipoActivo ? (PALETA_TIPO[tipoActivo] || "var(--accent)") : "var(--accent)";

    const wrapper = document.createElement("div");
    wrapper.className = "grafico-wrapper--centrado";
    wrapperChart.appendChild(wrapper);

    const tooltip = document.createElement("div");
    tooltip.className = "tooltip-grafico tooltip-grafico--neutro";
    wrapper.appendChild(tooltip);
    function moverTooltip(event) {
      const rect = wrapper.getBoundingClientRect();
      tooltip.style.left = (event.clientX - rect.left + 12) + "px";
      tooltip.style.top = (event.clientY - rect.top + 12) + "px";
    }

    const svg = d3.create("svg")
      .attr("viewBox", [0, 0, WIDTH, HEIGHT])
      .attr("width", WIDTH)
      .attr("height", HEIGHT)
      .attr("class", "grafico-svg");

    svg.append("text")
      .attr("x", MARGIN.left + centroX - GUTTER / 2 - 4)
      .attr("y", 20)
      .attr("text-anchor", "end")
      .attr("class", "mariposa-encabezado-lado")
      .text(estado.izquierda);
    svg.append("text")
      .attr("x", MARGIN.left + centroX + GUTTER / 2 + 4)
      .attr("y", 20)
      .attr("text-anchor", "start")
      .attr("class", "mariposa-encabezado-lado")
      .text(estado.derecha);

    const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);

    const ticks = escala.ticks(4).filter(t => t > 0);
    const ejeTicks = g.append("g");
    ticks.forEach(t => {
      const offset = escala(t);
      [centroX - GUTTER / 2 - offset, centroX + GUTTER / 2 + offset].forEach(x => {
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

    siglosFila.forEach(siglo => {
      const yTop = y(siglo);
      const alto = Math.min(24, y.bandwidth());
      const yCentrado = yTop + (y.bandwidth() - alto) / 2;
      const valorIzq = conteoIzq.get(siglo);
      const valorDer = conteoDer.get(siglo);

      g.append("text")
        .attr("x", centroX)
        .attr("y", yTop + y.bandwidth() / 2)
        .attr("dy", "0.32em")
        .attr("text-anchor", "middle")
        .attr("class", "mariposa-etiqueta-siglo")
        .text(siglo.replace("Siglo ", ""));

      function dibujarLado(valor, atributo, esDerecha) {
        const anchoPx = escala(valor);
        const xBase = esDerecha ? centroX + GUTTER / 2 : centroX - GUTTER / 2 - anchoPx;
        const d = pathBarra(xBase, yCentrado, anchoPx, alto, esDerecha);
        if (d) {
          g.append("path")
            .attr("d", d)
            .attr("fill", colorActivo)
            .attr("class", "mariposa-barra-dato")
            .on("mouseenter", (event) => {
              tooltip.innerHTML = `<strong>${siglo} · ${atributo}</strong><br/>${valor.toLocaleString("es")} agente(s)`;
              tooltip.classList.add("tooltip-grafico--visible");
              moverTooltip(event);
            })
            .on("mousemove", moverTooltip)
            .on("mouseleave", () => { tooltip.classList.remove("tooltip-grafico--visible"); });
        }
        if (valor > 0) {
          g.append("text")
            .attr("x", esDerecha ? xBase + anchoPx + 6 : xBase - 6)
            .attr("y", yCentrado + alto / 2)
            .attr("dy", "0.32em")
            .attr("text-anchor", esDerecha ? "start" : "end")
            .attr("class", "mariposa-valor-texto")
            .text(valor.toLocaleString("es"));
        }
      }

      dibujarLado(valorIzq, estado.izquierda, false);
      dibujarLado(valorDer, estado.derecha, true);
    });

    wrapper.appendChild(svg.node());

    const nota = document.createElement("p");
    nota.className = "filtro-nota filtro-nota--centrada";
    nota.textContent = `${estado.izquierda}: ${totalIzq.toLocaleString("es")} · ${estado.derecha}: ${totalDer.toLocaleString("es")}`;
    wrapperChart.appendChild(nota);
  }

  return { actualizar };
}
