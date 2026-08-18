import * as d3 from "d3";
import { TIPOS_AGENTE, PALETA_TIPO, grupoDeTipo } from "./agentesComun.js";
import { crearAgentesButterfly } from "./AgentesButterfly.js";
import { dibujarParticipacionTiempoAgentes } from "./ParticipacionTiempoAgentes.js";
import { dibujarSunburst } from "./InstitucionesAtributo.js";

export async function crearOtrosAgentesDashboard() {
  const filtrosContainer = document.getElementById("agentesFiltrosTop");
  if (!filtrosContainer) return;

  const raw = await d3.csv(`${import.meta.env.BASE_URL}data/Visualizaciones.csv`);

  const vistos = new Set();
  const eventos = raw
    .filter(d => d.Agente && d.Agente !== "Persona" && d.Año && !isNaN(+d.Año) && d.Nombre_Codigo && d.Atributo)
    .map(d => {
      const tipo = d.Agente.trim();
      const subcrimen = d.Nombre_Sub_Codigo && d.Nombre_Sub_Codigo.trim() !== "" && d.Nombre_Sub_Codigo.trim().toUpperCase() !== "NULL"
        ? d.Nombre_Sub_Codigo.trim()
        : null;
      return {
        idAgente: d.ID_Agente,
        idEvento: `${d.ID_Documento}|${d.Sub_Código}|${d.ID_Agente}`,
        tipo,
        grupo: grupoDeTipo(tipo),
        atributo: d.Atributo.trim(),
        crimen: d.Nombre_Codigo.trim(),
        subcrimen,
        año: +d.Año,
        década: Math.floor(+d.Año / 10) * 10,
      };
    })
    .filter(d => {
      if (vistos.has(d.idEvento)) return false;
      vistos.add(d.idEvento);
      return true;
    });

  if (eventos.length === 0) {
    filtrosContainer.innerHTML = `<p class="agentes-vacio">No hay datos de otros agentes para mostrar.</p>`;
    return;
  }

  const TIPOS_PRESENTES = TIPOS_AGENTE.filter(t => eventos.some(d => d.tipo === t));
  const CRIMENES = [...d3.rollup(eventos, v => v.length, d => d.crimen)]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre]) => nombre);

  const [decadaMin, decadaMax] = d3.extent(eventos, d => d.década);
  // d3.extent devuelve [T | undefined, T | undefined]; aquí siempre hay datos.
  const DECADAS = d3.range(decadaMin!, decadaMax! + 10, 10);

  const estado = {
    tipo: null,
    decadaDesde: decadaMin,
    decadaHasta: decadaMax,
    crimen: "Todos",
  };

  function filtrarEventos() {
    return eventos.filter(d =>
      (!estado.tipo || d.tipo === estado.tipo) &&
      d.década >= estado.decadaDesde! && d.década <= estado.decadaHasta! &&
      (estado.crimen === "Todos" || d.crimen === estado.crimen)
    );
  }

  filtrosContainer.innerHTML = `
    <div class="ag-filtros">
      <div class="ag-filtros-fila">
        <div class="ag-filtros-grupo">
          <div class="ag-filtros-titulo">Tipo de agente (clic de nuevo para ver todos)</div>
          <div class="ag-chip-fila" id="agTipoFila"></div>
        </div>
        <div class="ag-filtros-grupo">
          <div class="ag-filtros-titulo">Década desde</div>
          <select class="filtro-select-generico" id="agDecadaDesde"></select>
        </div>
        <div class="ag-filtros-grupo">
          <div class="ag-filtros-titulo">Década hasta</div>
          <select class="filtro-select-generico" id="agDecadaHasta"></select>
        </div>
        <div class="ag-filtros-grupo ag-filtros-grupo-crimen">
          <div class="ag-filtros-titulo">Crimen</div>
          <select class="filtro-select-generico" id="agCrimenSelect"></select>
        </div>
      </div>
      <div class="ag-filtros-pie">
        <div class="ag-leyenda" id="agLeyenda"></div>
        <button type="button" class="ag-btn-limpiar" id="agLimpiar">Limpiar filtros</button>
      </div>
    </div>
  `;

  const tipoFila = document.getElementById("agTipoFila")!;
  const selectDecadaDesde = document.getElementById("agDecadaDesde") as HTMLSelectElement;
  const selectDecadaHasta = document.getElementById("agDecadaHasta") as HTMLSelectElement;
  const selectCrimen = document.getElementById("agCrimenSelect") as HTMLSelectElement;
  const leyenda = document.getElementById("agLeyenda")!;

  TIPOS_PRESENTES.forEach(t => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ag-chip";
    chip.textContent = t;
    chip.style.setProperty("--chip-color", (PALETA_TIPO as Record<string, string>)[t]);
    chip.addEventListener("click", () => {
      estado.tipo = estado.tipo === t ? null : t as any;
      onFiltroCambiado();
    });
    tipoFila.appendChild(chip);
  });

  function llenarSelectDecadas(select: HTMLSelectElement) {
    DECADAS.forEach(dc => {
      const opt = document.createElement("option");
      opt.value = dc as unknown as string;
      opt.textContent = dc as unknown as string;
      select.appendChild(opt);
    });
  }
  llenarSelectDecadas(selectDecadaDesde);
  llenarSelectDecadas(selectDecadaHasta);
  selectDecadaDesde.value = estado.decadaDesde as unknown as string;
  selectDecadaHasta.value = estado.decadaHasta as unknown as string;
  selectDecadaDesde.addEventListener("change", () => {
    estado.decadaDesde = Math.min(+selectDecadaDesde.value, estado.decadaHasta!);
    onFiltroCambiado();
  });
  selectDecadaHasta.addEventListener("change", () => {
    estado.decadaHasta = Math.max(+selectDecadaHasta.value, estado.decadaDesde!);
    onFiltroCambiado();
  });

  const optTodosCrimenes = document.createElement("option");
  optTodosCrimenes.value = "Todos";
  optTodosCrimenes.textContent = "Todos los crímenes";
  selectCrimen.appendChild(optTodosCrimenes);
  CRIMENES.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    selectCrimen.appendChild(opt);
  });
  selectCrimen.value = estado.crimen;
  selectCrimen.addEventListener("change", () => {
    estado.crimen = selectCrimen.value;
    onFiltroCambiado();
  });

  TIPOS_PRESENTES.forEach(t => {
    const item = document.createElement("div");
    item.className = "ag-leyenda-item";
    item.innerHTML = `<span class="ag-leyenda-swatch" style="background:${(PALETA_TIPO as Record<string, string>)[t]}"></span>${t}`;
    leyenda.appendChild(item);
  });

  document.getElementById("agLimpiar")!.addEventListener("click", () => {
    estado.tipo = null;
    estado.decadaDesde = decadaMin;
    estado.decadaHasta = decadaMax;
    estado.crimen = "Todos";
    onFiltroCambiado();
  });

  function pintarEstadoChips() {
    tipoFila.querySelectorAll(".ag-chip").forEach(chip => {
      chip.classList.toggle("ag-chip-activo", chip.textContent === estado.tipo);
    });
    selectDecadaDesde.value = estado.decadaDesde as unknown as string;
    selectDecadaHasta.value = estado.decadaHasta as unknown as string;
    selectCrimen.value = estado.crimen;
  }

  const butterflyCtrl = crearAgentesButterfly("agButterfly");

  function actualizarGraficas() {
    const eventosFiltrados = filtrarEventos();
    const decadasRango = d3.range(estado.decadaDesde!, estado.decadaHasta! + 10, 10);
    butterflyCtrl.actualizar(eventosFiltrados, estado.crimen);
    dibujarParticipacionTiempoAgentes({
      chartContainerId: "agParticipacionTiempo",
      eventos: eventosFiltrados,
      decadas: decadasRango,
      tiposActivos: estado.tipo ? [estado.tipo] : TIPOS_PRESENTES,
      crimenActivo: estado.crimen === "Todos" ? null : estado.crimen,
    });
    dibujarSunburst("agSunburst", eventosFiltrados, estado.crimen === "Todos" ? null : estado.crimen);
  }

  function onFiltroCambiado() {
    pintarEstadoChips();
    actualizarGraficas();
  }

  pintarEstadoChips();
  actualizarGraficas();
}
