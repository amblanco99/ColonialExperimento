import * as d3 from "d3";
import { agregarZoomBeeswarm } from "./zoomBeeswarm.js";
import { PALETA_GENERO } from "./agentesComun.js";

const GENEROS = ["Mujer", "Hombre", "Sin información"];
const MAX_CRIMENES_SELECCIONADOS = 3;

function colorPorIndice(i) {
  const hue = (i * 137.508) % 360;
  const bandaLuz = [0.40, 0.48, 0.56][i % 3];
  return d3.hsl(hue, 0.55, bandaLuz).formatHex();
}

export async function crearBeeswarmGenero() {

  const raw = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);

  const filtrosContainer = document.getElementById("beeswarmFiltros");
  const chartContainer = document.getElementById("beeswarmGenero");
  if (!filtrosContainer || !chartContainer) return;

  const vistos = new Set();
  const datos = raw
    .filter(d => d.Agente === "Persona" && d.Año && !isNaN(+d.Año) && d.Nombre_Codigo)
    .map(d => {
      const genero = d.Género && d.Género.trim() !== "" && d.Género !== "null"
        ? d.Género.trim()
        : "Sin información";
      const subcrimenLimpio = d.Nombre_Sub_Codigo && d.Nombre_Sub_Codigo.trim() !== "" && d.Nombre_Sub_Codigo.trim().toUpperCase() !== "NULL"
        ? d.Nombre_Sub_Codigo.trim()
        : null;
      return {
        id: `${d.ID_Documento}|${d.Sub_Código}|${d.ID_Agente}`,
        genero,
        atributo: d.Atributo,
        crimen: d.Nombre_Codigo,
        subcrimen: subcrimenLimpio,
        año: +d.Año,
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
    labelCrimen.textContent = `Crimen (hasta ${MAX_CRIMENES_SELECCIONADOS}, o clic en un punto)`;
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
    dibujarBeeswarm();
  }

  const MARGIN = { top: 30, right: 30, bottom: 40, left: 30 };
  const PX_POR_AÑO = 9;
  const RADIO_FONDO = 2.8;
  const RADIO_SELECCION = 3.8;
  const OBJETIVO_SIN_SELECCION = 1800;
  const OBJETIVO_FONDO_CON_SELECCION = 650;

  function muestrear(arr, objetivoTotal) {
    if (arr.length === 0) return [];
    const tasa = Math.min(1, objetivoTotal / arr.length);
    if (tasa >= 1) return arr;
    const porCrimen = d3.group(arr, d => d.crimen);
    const resultado = [];
    porCrimen.forEach(sub => {
      const cuota = Math.max(1, Math.round(sub.length * tasa));
      resultado.push(...[...sub].sort(() => Math.random() - 0.5).slice(0, cuota));
    });
    return resultado;
  }

  function dibujarBeeswarm() {
    chartContainer.innerHTML = "";

    const filas = datos.filter(d =>
      d.genero === estado.genero &&
      (estado.atributo === "Todos" || d.atributo === estado.atributo)
    );

    if (filas.length === 0) {
      chartContainer.innerHTML = `<p class="grafico-vacio">No hay datos para esta selección de filtros.</p>`;
      return;
    }

    const hayCrimenesActivos = estado.crimenes.length > 0;
    let notaMuestreo;
    const nodos = [];

    if (hayCrimenesActivos) {
      const seleccionados = filas.filter(d => estado.crimenes.includes(d.crimen));
      const restoCompleto = filas.filter(d => !estado.crimenes.includes(d.crimen));
      const resto = muestrear(restoCompleto, OBJETIVO_FONDO_CON_SELECCION);

      seleccionados.forEach(d => nodos.push({ ...d, r: RADIO_SELECCION, seleccionado: true }));
      resto.forEach(d => nodos.push({ ...d, r: RADIO_FONDO, seleccionado: false }));

      const totalSeleccionado = seleccionados.length;
      notaMuestreo = `${totalSeleccionado.toLocaleString("es")} participaciones reales de ${estado.crimenes.length} crimen(es) elegido(s), todas dibujadas. El resto es una muestra de contexto en gris.`;
    } else {
      const muestra = muestrear(filas, OBJETIVO_SIN_SELECCION);
      muestra.forEach(d => nodos.push({ ...d, r: RADIO_FONDO, seleccionado: false }));
      notaMuestreo = muestra.length < filas.length
        ? `Muestra representativa (${Math.round((muestra.length / filas.length) * 100)}% de ${filas.length.toLocaleString("es")} participaciones). Elige un crimen para verlo completo.`
        : "";
    }

    const crimenesPresentes = [...new Set(nodos.map(d => d.crimen))]
      .sort((a, b) => CRIMEN_POR_NOMBRE.get(a).rank - CRIMEN_POR_NOMBRE.get(b).rank);
    const PASO_BANDA = 11;
    const bandaPorCrimen = new Map(
      crimenesPresentes.map((c, i) => [c, (i - (crimenesPresentes.length - 1) / 2) * PASO_BANDA])
    );

    const IW = Math.max(700, (maxAño - minAño) * PX_POR_AÑO);
    const x = d3.scaleLinear().domain([minAño, maxAño]).range([0, IW]);

    nodos.forEach(d => {
      d.targetX = x(d.año);
      d.x = d.targetX;
      d.y = bandaPorCrimen.get(d.crimen) + (Math.random() - 0.5) * 6;
    });

    const simulacion = d3.forceSimulation(nodos)
      .force("x", d3.forceX(d => d.targetX).strength(0.9))
      .force("y", d3.forceY(d => bandaPorCrimen.get(d.crimen)).strength(0.06))
      .force("collide", d3.forceCollide(d => d.r + 0.35).strength(1))
      .stop();
    for (let i = 0; i < 140; i++) simulacion.tick();

    const extentY = d3.extent(nodos, d => d.y);
    const mitadAlto = Math.max(80, Math.max(Math.abs(extentY[0]), Math.abs(extentY[1])) + RADIO_SELECCION + 10);
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
      .attr("fill", d => d.seleccionado ? CRIMEN_POR_NOMBRE.get(d.crimen).color : "#b7ab97")
      .attr("fill-opacity", d => d.seleccionado ? 0.95 : (hayCrimenesActivos ? 0.45 : 0.8))
      .attr("stroke", "#fff")
      .attr("stroke-width", d => d.seleccionado ? 0.7 : 0)
      .attr("class", "grafico-punto-clic")
      .on("mouseenter", (event, d) => {
        tooltip.innerHTML = `
          <strong>${d.crimen}${d.subcrimen ? " — " + d.subcrimen : ""}</strong><br/>
          ${d.año} · ${d.genero} · ${d.atributo}
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
      })
      .on("click", (event, d) => {
        if (estado.crimenes.includes(d.crimen)) quitarCrimen(d.crimen);
        else agregarCrimen(d.crimen);
      });

    wrapper.appendChild(svg.node());

    agregarZoomBeeswarm({ svg, contenido, ejeX, x, IW, mitadAlto, wrapper });

    if (notaMuestreo) {
      const nota = document.createElement("p");
      nota.className = "filtro-nota";
      nota.textContent = notaMuestreo;
      chartContainer.appendChild(nota);
    }

    if (estado.crimenes.length === 1) {
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "btn-ver-casos-generico";
      boton.textContent = `Ver casos: ${estado.crimenes[0].trim()}`;
      boton.addEventListener("click", () => {
        const params = new URLSearchParams();
        params.set("genero", estado.genero);
        if (estado.atributo !== "Todos") params.set("atributo", estado.atributo);
        params.set("codigo", estado.crimenes[0]);
        window.location.href = `../base-de-datos/index.html?${params.toString()}`;
      });
      chartContainer.insertBefore(boton, wrapper);
    }
  }

  renderFiltros();
  dibujarBeeswarm();
}
