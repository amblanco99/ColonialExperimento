import * as d3 from "d3";
import { PALETA_TIPO } from "./agentesComun.js";
import { agregarZoomBeeswarm } from "./zoomBeeswarm.js";

export function dibujarAgentesBeeswarm(containerId, eventosFiltrados) {
  const chartContainer = document.getElementById(containerId);
  if (!chartContainer) return;
  chartContainer.innerHTML = "";

  if (eventosFiltrados.length === 0) {
    chartContainer.innerHTML = `<p class="agentes-vacio">No hay datos para esta selección de filtros.</p>`;
    return;
  }

  const MARGIN = { top: 30, right: 30, bottom: 40, left: 30 };
  const PX_POR_AÑO = 9;
  const RADIO = 3.4;
  const PASO_BANDA = 15;

  const [minAño, maxAñoBruto] = d3.extent(eventosFiltrados, d => d.año);
  const maxAño = maxAñoBruto === minAño ? minAño + 1 : maxAñoBruto;

  const crimenesPresentes = [...d3.rollup(eventosFiltrados, v => v.length, d => d.crimen)]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre]) => nombre);
  const bandaPorCrimen = new Map(
    crimenesPresentes.map((c, i) => [c, (i - (crimenesPresentes.length - 1) / 2) * PASO_BANDA])
  );

  const IW = Math.max(700, (maxAño - minAño) * PX_POR_AÑO);
  const x = d3.scaleLinear().domain([minAño, maxAño]).range([0, IW]);

  const nodos = eventosFiltrados.map(d => ({ ...d, r: RADIO }));
  nodos.forEach(d => {
    d.targetX = x(d.año);
    d.x = d.targetX;
    d.y = bandaPorCrimen.get(d.crimen) + (Math.random() - 0.5) * 6;
  });

  const simulacion = d3.forceSimulation(nodos)
    .force("x", d3.forceX(d => d.targetX).strength(0.9))
    .force("y", d3.forceY(d => bandaPorCrimen.get(d.crimen)).strength(0.08))
    .force("collide", d3.forceCollide(d => d.r + 0.6).strength(1))
    .stop();
  for (let i = 0; i < 160; i++) simulacion.tick();

  const extentY = d3.extent(nodos, d => d.y);
  const mitadAlto = Math.max(70, Math.max(Math.abs(extentY[0]), Math.abs(extentY[1])) + RADIO + 10);
  const IH = mitadAlto * 2;
  const WIDTH = IW + MARGIN.left + MARGIN.right;
  const HEIGHT = IH + MARGIN.top + MARGIN.bottom;

  const wrapper = document.createElement("div");
  wrapper.className = "grafico-wrapper";
  chartContainer.appendChild(wrapper);

  const tooltip = document.createElement("div");
  tooltip.className = "tooltip-grafico tooltip-grafico--neutro tooltip-grafico--ancho";
  wrapper.appendChild(tooltip);

  const svg = d3.create("svg")
    .attr("viewBox", [0, 0, WIDTH, HEIGHT])
    .attr("width", WIDTH)
    .attr("height", HEIGHT)
    .attr("class", "grafico-svg");

  const g = svg.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top + mitadAlto})`);

  const ejeX = g.append("g").attr("transform", `translate(0,${mitadAlto})`);

  const contenido = g.append("g");

  contenido.append("line")
    .attr("x1", 0).attr("x2", IW)
    .attr("y1", 0).attr("y2", 0)
    .attr("stroke", "#ccc");

  contenido.append("g")
    .selectAll("circle")
    .data(nodos)
    .join("circle")
    .attr("cx", d => d.x)
    .attr("cy", d => d.y)
    .attr("r", d => d.r)
    .attr("fill", d => PALETA_TIPO[d.tipo] || "#999")
    .attr("fill-opacity", 0.85)
    .attr("stroke", "#fff")
    .attr("stroke-width", 0.6)
    .attr("class", "grafico-punto-clic")
    .on("mouseenter", (event, d) => {
      tooltip.innerHTML = `
        <strong>${d.crimen}</strong><br/>
        ${d.año} · ${d.tipo} · ${d.atributo}
      `;
      tooltip.classList.add("tooltip-grafico--visible");
    })
    .on("mousemove", event => {
      const rect = wrapper.getBoundingClientRect();
      tooltip.style.left = (event.clientX - rect.left + 12) + "px";
      tooltip.style.top = (event.clientY - rect.top + 12) + "px";
    })
    .on("mouseleave", () => {
      tooltip.classList.remove("tooltip-grafico--visible");
    });

  wrapper.appendChild(svg.node());

  agregarZoomBeeswarm({ svg, contenido, ejeX, x, IW, mitadAlto, wrapper });
}
