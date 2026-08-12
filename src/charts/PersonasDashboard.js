import * as d3 from "d3";
import { PALETA_GENERO } from "./agentesComun.js";
import { dibujarButterflyGenero } from "./ButterflyGenero.js";
import { dibujarParticipacionTiempo } from "./ParticipacionTiempo.js";
import { dibujarDelitosSunburstGenero } from "./DelitosSunburstGenero.js";

const GENEROS = ["Mujer", "Hombre", "Sin información"];

export async function crearPersonasDashboard() {
  const raw = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);

  const filtrosContainer = document.getElementById("personasFiltrosTop");
  if (!filtrosContainer) return;

  const vistos = new Set();
  const datosBase = raw
    .filter(d => d.Agente === "Persona" && d.Año && !isNaN(+d.Año) && d.Nombre_Codigo && d.Atributo && d.ID_Agente)
    .map(d => {
      const genero = d.Género && d.Género.trim() !== "" && d.Género !== "null"
        ? d.Género.trim()
        : "Sin información";
      const crimen = d.Nombre_Codigo.trim();
      const subcrimen = d.Nombre_Sub_Codigo && d.Nombre_Sub_Codigo.trim() !== "" && d.Nombre_Sub_Codigo.trim().toUpperCase() !== "NULL"
        ? d.Nombre_Sub_Codigo.trim()
        : null;
      const año = +d.Año;
      return {
        id: `${d.ID_Documento}|${d.Sub_Código}|${d.ID_Agente}`,
        idAgente: d.ID_Agente,
        genero,
        atributo: d.Atributo,
        crimen,
        subcrimen,
        década: Math.floor(año / 10) * 10,
      };
    })
    .filter(d => {
      if (vistos.has(d.id)) return false;
      vistos.add(d.id);
      return true;
    });

  if (datosBase.length === 0) {
    filtrosContainer.innerHTML = `<p class="grafico-vacio">No hay datos disponibles.</p>`;
    return;
  }

  const CRIMENES = [...d3.rollup(datosBase, v => v.length, d => d.crimen)]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre]) => nombre);

  const [decadaMin, decadaMax] = d3.extent(datosBase, d => d.década);
  const DECADAS = d3.range(decadaMin, decadaMax + 10, 10);

  const estado = {
    generosActivos: new Set(GENEROS),
    crimen: "Todos",
    decadaDesde: decadaMin,
    decadaHasta: decadaMax,
    butterfly: { generoIzquierda: "Mujer", generoDerecha: "Hombre", crimenLocal: null },
  };

  filtrosContainer.innerHTML = `<div class="filtros-chip-panel"></div>`;
  const wrapperFiltros = filtrosContainer.querySelector(".filtros-chip-panel");

  function renderFiltrosTop() {
    wrapperFiltros.innerHTML = "";

    const barraCategorias = document.createElement("div");
    barraCategorias.className = "filtros-barra-selectores";

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
    optTodos.textContent = "Todos los crímenes";
    selectCrimen.appendChild(optTodos);
    CRIMENES.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      selectCrimen.appendChild(opt);
    });
    selectCrimen.value = estado.crimen;
    selectCrimen.addEventListener("change", () => {
      estado.crimen = selectCrimen.value;
      actualizarTodo();
    });
    grupoCrimen.appendChild(selectCrimen);
    barraCategorias.appendChild(grupoCrimen);

    function crearSelectorDecada(etiqueta, campo) {
      const grupo = document.createElement("div");
      grupo.className = "filtro-selector";
      const label = document.createElement("div");
      label.className = "filtros-grupo-titulo";
      label.textContent = etiqueta;
      grupo.appendChild(label);
      const select = document.createElement("select");
      select.className = "filtro-select-generico";
      DECADAS.forEach(dc => {
        const opt = document.createElement("option");
        opt.value = dc;
        opt.textContent = dc;
        select.appendChild(opt);
      });
      select.value = estado[campo];
      select.addEventListener("change", () => {
        const valor = +select.value;
        if (campo === "decadaDesde") {
          estado.decadaDesde = Math.min(valor, estado.decadaHasta);
        } else {
          estado.decadaHasta = Math.max(valor, estado.decadaDesde);
        }
        actualizarTodo();
      });
      grupo.appendChild(select);
      return grupo;
    }
    barraCategorias.appendChild(crearSelectorDecada("Década desde", "decadaDesde"));
    barraCategorias.appendChild(crearSelectorDecada("Década hasta", "decadaHasta"));

    wrapperFiltros.appendChild(barraCategorias);

    const grupoGenero = document.createElement("div");
    const labelGenero = document.createElement("div");
    labelGenero.className = "filtros-grupo-titulo";
    labelGenero.textContent = "Género (línea de tiempo y sunburst; el butterfly usa sus propios selectores)";
    grupoGenero.appendChild(labelGenero);
    const filaGenero = document.createElement("div");
    filaGenero.className = "filtros-chip-fila";

    const chipTodos = document.createElement("button");
    chipTodos.type = "button";
    const todosActivos = GENEROS.every(g => estado.generosActivos.has(g));
    chipTodos.className = `filtro-chip filtro-chip--genero${todosActivos ? " filtro-chip--activo" : ""}`;
    chipTodos.textContent = "Todos";
    chipTodos.style.setProperty("--chip-color", "var(--accent)");
    chipTodos.addEventListener("click", () => {
      estado.generosActivos = new Set(GENEROS);
      actualizarTodo();
    });
    filaGenero.appendChild(chipTodos);

    GENEROS.forEach(g => {
      const chip = document.createElement("button");
      chip.type = "button";
      const activo = estado.generosActivos.has(g);
      chip.className = `filtro-chip filtro-chip--genero${activo ? " filtro-chip--activo" : ""}`;
      chip.textContent = g;
      chip.style.setProperty("--chip-color", PALETA_GENERO[g]);
      chip.addEventListener("click", () => {
        if (estado.generosActivos.has(g)) {
          if (estado.generosActivos.size > 1) estado.generosActivos.delete(g);
        } else {
          estado.generosActivos.add(g);
        }
        actualizarTodo();
      });
      filaGenero.appendChild(chip);
    });
    grupoGenero.appendChild(filaGenero);
    wrapperFiltros.appendChild(grupoGenero);
  }

  function actualizarTodo() {
    renderFiltrosTop();

    const datosFecha = datosBase.filter(d => d.década >= estado.decadaDesde && d.década <= estado.decadaHasta);
    const decadasRango = d3.range(estado.decadaDesde, estado.decadaHasta + 10, 10);
    const generosActivos = GENEROS.filter(g => estado.generosActivos.has(g));

    dibujarButterflyGenero({
      filtrosContainerId: "butterflyFiltros",
      chartContainerId: "butterflyGenero",
      datos: datosFecha,
      crimenTop: estado.crimen,
      estadoLocal: estado.butterfly,
    });

    const datosFechaCrimen = estado.crimen === "Todos" ? datosFecha : datosFecha.filter(d => d.crimen === estado.crimen);
    dibujarParticipacionTiempo({
      chartContainerId: "participacionLineaGeneral",
      datos: datosFechaCrimen,
      decadas: decadasRango,
      generosActivos,
      etiquetaCrimen: estado.crimen === "Todos" ? "Todos los crímenes" : estado.crimen,
    });

    const filasSunburst = datosFecha.filter(d => generosActivos.includes(d.genero));
    dibujarDelitosSunburstGenero("delitosGeneroSunburst", filasSunburst, estado.crimen === "Todos" ? null : estado.crimen);
  }

  actualizarTodo();
}
