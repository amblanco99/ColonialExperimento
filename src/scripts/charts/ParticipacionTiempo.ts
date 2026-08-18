import * as d3 from "d3";

/** Fila de eventos tal como la arman los dashboards. */
type FilaEvento = any; // TODO: type

/** El módulo guarda el id del temporizador colgándolo del propio contenedor.
 *  No es una propiedad estándar de HTMLElement, así que se declara aquí. */
type ContenedorConTimer = HTMLElement & { _timerLineas?: any };
import { PALETA_GENERO } from "./agentesComun.js";
import { crearBotonVerCasos, irATablasFiltradas } from "./verCasos.js";

const MARGIN_LINEA = { top: 30, right: 20, bottom: 36, left: 50 };
const WIDTH_LINEA = 820;
const ALTO_LINEA = 380;
const DURACION_LINEA = 700;
const PAUSA_LINEA = 130;

function contarPorDecada(filas: FilaEvento[], decadas: number[], generos: string[]) {
  const idsPorGeneroDecada = new Map<string, Map<number, Set<string>>>(
    generos.map((g: string) => [g, new Map(decadas.map((dc: number) => [dc, new Set<string>()]))] as [string, Map<number, Set<string>>])
  );
  filas.forEach(d => {
    const mapaDecada = idsPorGeneroDecada.get(d.genero);
    const set = mapaDecada && mapaDecada.get(d.década);
    if (set) set.add(d.idAgente);
  });
  const conteos = new Map();
  idsPorGeneroDecada.forEach((mapaDecada: Map<number, Set<string>>, genero: string) => {
    const serie = decadas.map((dc: number) => ({ década: dc, valor: mapaDecada.get(dc)!.size }));
    conteos.set(genero, serie);
  });
  return conteos;
}

function crearTooltip(padreRelativo: HTMLElement) {
  const tooltip = document.createElement("div");
  tooltip.className = "tooltip-grafico tooltip-grafico--neutro";
  padreRelativo.appendChild(tooltip);
  function mover(event: MouseEvent) {
    const rect = padreRelativo.getBoundingClientRect();
    tooltip.style.left = (event.clientX - rect.left + 12) + "px";
    tooltip.style.top = (event.clientY - rect.top + 12) + "px";
  }
  return { tooltip, mover };
}

interface OpcionesParticipacion {
  chartContainerId: string
  datos: FilaEvento[]
  decadas: number[]
  generosActivos: string[]
  etiquetaCrimen: string
}

export function dibujarParticipacionTiempo({ chartContainerId, datos, decadas, generosActivos, etiquetaCrimen }: OpcionesParticipacion) {
  const chartContainer = document.getElementById(chartContainerId) as ContenedorConTimer;
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

  function dibujarLeyenda(padre: HTMLElement) {
    const leyenda = document.createElement("div");
    leyenda.className = "leyenda-swatches";
    generosActivos.forEach((g: string) => {
      const item = document.createElement("div");
      item.className = "leyenda-swatch-item";
      const swatch = document.createElement("span");
      swatch.className = "leyenda-swatch-color";
      swatch.style.background = (PALETA_GENERO as Record<string, string>)[g];
      const texto = document.createElement("span");
      texto.textContent = g;
      item.appendChild(swatch);
      item.appendChild(texto);
      leyenda.appendChild(item);
    });
    padre.appendChild(leyenda);
  }

  function dibujarLinea(padre: HTMLElement, conteosPorGenero: any) {
    const IW = WIDTH_LINEA - MARGIN_LINEA.left - MARGIN_LINEA.right;
    const IH = ALTO_LINEA - MARGIN_LINEA.top - MARGIN_LINEA.bottom;

    const maxValor = d3.max(generosActivos, (g: string) => d3.max(conteosPorGenero.get(g), (d: FilaEvento) => d.valor)) || 1;

    const x = d3.scaleLinear().domain(d3.extent(decadas) as [number, number]).range([0, IW]);
    const y = d3.scaleLinear().domain([0, maxValor as number]).nice().range([IH, 0]);

    const wrapper = document.createElement("div");
    wrapper.className = "grafico-wrapper lineas-wrapper";
    padre.appendChild(wrapper);

    const { tooltip, mover } = crearTooltip(wrapper);

    let seleccionGenero: string | null = null;
    let seleccionPuntoClave: string | null = null;
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

    function seleccionarGenero(genero: string) {
      seleccionGenero = seleccionGenero === genero ? null : genero;
      seleccionPuntoClave = null;
      botonVerCasos.ocultar();
      aplicarResaltadoLinea();
    }

    function seleccionarPunto(genero: string, década: number) {
      const clave = `${genero}||${década}`;
      if (seleccionPuntoClave === clave) { limpiarSeleccionLinea(); return; }
      seleccionPuntoClave = clave;
      seleccionGenero = genero;
      aplicarResaltadoLinea();
      botonVerCasos.mostrar(`${genero} · ${década}`, () => irATablasFiltradas({
        genero,
        codigo: crimenActivo as string | undefined,
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

    const línea = (d3.line() as any)
      .x((d: FilaEvento) => x(d.década))
      .y((d: FilaEvento) => y(d.valor))
      .curve(d3.curveMonotoneX);

    function dibujarSerieInstante(genero: string) {
      const serie = conteosPorGenero.get(genero);
      const color = (PALETA_GENERO as Record<string, string>)[genero];
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
        .on("click", (event: MouseEvent) => {
          event.stopPropagation();
          seleccionarGenero(genero);
        });

      grupo.selectAll(null)
        .data(serie)
        .join("circle")
        .attr("cx", (d: FilaEvento) => x(d.década))
        .attr("cy", (d: FilaEvento) => y(d.valor))
        .attr("r", 3)
        .attr("fill", color)
        .attr("class", "lineas-punto")
        .on("mouseenter", (event: MouseEvent, d: FilaEvento) => {
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
        .on("click", (event: MouseEvent, d: FilaEvento) => {
          event.stopPropagation();
          seleccionarPunto(genero, d.década);
        });

      aplicarResaltadoLinea();
    }

    function revelarSecuencial(idx: number) {
      if (idx >= generosActivos.length) return;
      const genero = generosActivos[idx];
      const serie = conteosPorGenero.get(genero);
      const color = (PALETA_GENERO as Record<string, string>)[genero];
      const grupoTemp = g.append("g");
      const pathTemp = grupoTemp.append("path")
        .datum(serie)
        .attr("d", línea)
        .attr("fill", "none")
        .attr("stroke", color)
        .attr("class", "lineas-trazo");
      const totalLength = pathTemp.node()!.getTotalLength();
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

    wrapper.appendChild(svg.node()!);
    chartContainer._timerLineas = d3.timeout(() => revelarSecuencial(0), 100);
  }

  dibujarLeyenda(chartContainer);
  dibujarLinea(chartContainer, contarPorDecada(datos, decadas, generosActivos));

  const nota = document.createElement("p");
  nota.className = "filtro-nota";
  nota.textContent = `${datos.length.toLocaleString("es")} participación(es) registradas en "${etiquetaCrimen}".`;
  chartContainer.appendChild(nota);
}
