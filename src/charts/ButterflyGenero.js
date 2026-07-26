import * as d3 from "d3";
import { PALETA_GENERO } from "./agentesComun.js";

const GENEROS = ["Mujer", "Hombre", "Sin información"];
const RADIO_PUNTA = 4;

const getSiglo = (año) => {
  if (año <= 1599) return "Siglo XVI";
  if (año <= 1699) return "Siglo XVII";
  if (año <= 1799) return "Siglo XVIII";
  return "Siglo XIX";
};
const SIGLOS = ["Siglo XVI", "Siglo XVII", "Siglo XVIII", "Siglo XIX"];

function pathBarra(x, y, w, h, redondearDerecha) {
  if (w <= 0) return "";
  const r = Math.min(RADIO_PUNTA, w, h / 2);
  if (redondearDerecha) {
    return `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} L${x},${y + h} Z`;
  }
  return `M${x + r},${y} L${x + w},${y} L${x + w},${y + h} L${x + r},${y + h} Q${x},${y + h} ${x},${y + h - r} L${x},${y + r} Q${x},${y} ${x + r},${y} Z`;
}

export async function crearButterflyGenero() {

  const raw = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);

  const filtrosContainer = document.getElementById("butterflyFiltros");
  const chartContainer = document.getElementById("butterflyGenero");
  if (!filtrosContainer || !chartContainer) return;

  const vistos = new Set();
  const datos = raw
    .filter(d => d.Agente === "Persona" && d.Año && !isNaN(+d.Año) && d.Nombre_Codigo && d.Atributo)
    .map(d => {
      const genero = d.Género && d.Género.trim() !== "" && d.Género !== "null"
        ? d.Género.trim()
        : "Sin información";
      return {
        id: `${d.ID_Documento}|${d.Sub_Código}|${d.ID_Agente}`,
        genero,
        atributo: d.Atributo,
        crimen: d.Nombre_Codigo,
        siglo: getSiglo(+d.Año),
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
    .map(([nombre]) => nombre);

  const estado = {
    genero: GENEROS[0],
    izquierda: ATRIBUTOS.includes("Víctima") ? "Víctima" : ATRIBUTOS[0],
    derecha: ATRIBUTOS.includes("Perpetrador") ? "Perpetrador" : ATRIBUTOS[1] || ATRIBUTOS[0],
    crimen: "Todos",
  };

  filtrosContainer.innerHTML = `<div class="filtros-chip-panel"></div>`;
  const wrapperFiltros = filtrosContainer.querySelector(".filtros-chip-panel");

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
      ATRIBUTOS.forEach(a => {
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
        actualizar();
      });
      grupo.appendChild(select);
      return grupo;
    }
    barra.appendChild(crearSelectorLado("Lado izquierdo", "izquierda"));
    barra.appendChild(crearSelectorLado("Lado derecho", "derecha"));

    const grupoCrimen = document.createElement("div");
    grupoCrimen.className = "filtro-selector filtro-selector--ancho";
    const labelCrimen = document.createElement("div");
    labelCrimen.className = "filtros-grupo-titulo";
    labelCrimen.textContent = "Crimen";
    grupoCrimen.appendChild(labelCrimen);
    const selectCrimen = document.createElement("select");
    selectCrimen.className = "filtro-select-generico";
    const optTodos = document.createElement("option");
    optTodos.value = "Todos";
    optTodos.textContent = "Todos los crímenes (resumen)";
    selectCrimen.appendChild(optTodos);
    CRIMENES.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c.trim();
      selectCrimen.appendChild(opt);
    });
    selectCrimen.value = estado.crimen;
    selectCrimen.addEventListener("change", () => { estado.crimen = selectCrimen.value; actualizar(); });
    grupoCrimen.appendChild(selectCrimen);
    barra.appendChild(grupoCrimen);

    wrapperFiltros.appendChild(barra);
  }

  function actualizar() {
    renderFiltros();
    dibujarMariposa();
  }

  const MARGIN = { top: 60, right: 16, bottom: 16, left: 16 };
  const WIDTH = 700;
  const GUTTER = 100;
  const IW = WIDTH - MARGIN.left - MARGIN.right;
  const IW_MITAD = (IW - GUTTER) / 2;
  const PASO_FILA = 64;
  const IH = SIGLOS.length * PASO_FILA;
  const HEIGHT = MARGIN.top + IH + MARGIN.bottom;

  function dibujarMariposa() {
    chartContainer.innerHTML = "";

    const filas = (estado.crimen === "Todos" ? datos : datos.filter(d => d.crimen === estado.crimen))
      .filter(d => d.genero === estado.genero);

    if (filas.length === 0) {
      chartContainer.innerHTML = `<p class="grafico-vacio">No hay datos de "${estado.genero}" para esta selección.</p>`;
      return;
    }

    function conteoPorSiglo(atributo) {
      const mapa = new Map(SIGLOS.map(s => [s, 0]));
      filas.filter(d => d.atributo === atributo).forEach(d => {
        mapa.set(d.siglo, mapa.get(d.siglo) + 1);
      });
      return mapa;
    }
    const conteoIzq = conteoPorSiglo(estado.izquierda);
    const conteoDer = conteoPorSiglo(estado.derecha);

    const totalIzq = d3.sum(conteoIzq.values());
    const totalDer = d3.sum(conteoDer.values());

    if (totalIzq === 0 && totalDer === 0) {
      chartContainer.innerHTML = `<p class="grafico-vacio">No hay datos de "${estado.izquierda}" ni "${estado.derecha}" para "${estado.genero}" en esta selección.</p>`;
      return;
    }

    const máximoFila = d3.max(SIGLOS, s => Math.max(conteoIzq.get(s), conteoDer.get(s))) || 1;

    const escala = d3.scaleLinear().domain([0, máximoFila]).nice().range([0, IW_MITAD]);
    const y = d3.scaleBand().domain(SIGLOS).range([0, IH]).paddingInner(0.4);
    const centroX = IW_MITAD + GUTTER / 2;
    const colorActivo = PALETA_GENERO[estado.genero];

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

    SIGLOS.forEach(siglo => {
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
              tooltip.innerHTML = `<strong>${siglo} · ${atributo}</strong><br/>${estado.genero}: ${valor.toLocaleString("es")}`;
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
    const etiquetaCrimen = estado.crimen === "Todos" ? "Todos los crímenes (resumen)" : estado.crimen.trim();
    nota.textContent = `${estado.genero} · ${etiquetaCrimen} · ${estado.izquierda}: ${totalIzq.toLocaleString("es")} · ${estado.derecha}: ${totalDer.toLocaleString("es")}`;
    chartContainer.appendChild(nota);
  }

  renderFiltros();
  dibujarMariposa();
}
