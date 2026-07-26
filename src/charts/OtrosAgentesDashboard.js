import * as d3 from "d3";
import { TIPOS_AGENTE, PALETA_TIPO, grupoDeTipo, SIGLOS, getSiglo } from "./agentesComun.js";
import { dibujarAgentesBeeswarm } from "./AgentesBeeswarm.js";
import { crearAgentesButterfly } from "./AgentesButterfly.js";
import { dibujarAgentesSankey } from "./AgentesSankey.js";
import { dibujarSunburst } from "./InstitucionesAtributo.js";
import { initCarruselPreguntas } from "../ui/carruselPreguntas.js";

const ORDEN_ATRIBUTO = ["Víctima", "Perpetrador", "Cómplice"];

export async function crearOtrosAgentesDashboard() {
  const filtrosContainer = document.getElementById("agentesFiltros");
  if (!filtrosContainer) return;

  const raw = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);

  const vistos = new Set();
  const eventos = raw
    .filter(d => d.Agente && d.Agente !== "Persona" && d.Año && !isNaN(+d.Año) && d.Nombre_Codigo && d.Atributo)
    .map(d => {
      const tipo = d.Agente.trim();
      return {
        idAgente: d.ID_Agente,
        idEvento: `${d.ID_Documento}|${d.Sub_Código}|${d.ID_Agente}`,
        tipo,
        grupo: grupoDeTipo(tipo),
        atributo: d.Atributo.trim(),
        crimen: d.Nombre_Codigo.trim(),
        año: +d.Año,
        siglo: getSiglo(+d.Año),
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
  const SIGLOS_PRESENTES = SIGLOS.filter(s => eventos.some(d => d.siglo === s));
  const ATRIBUTOS_PRESENTES = ORDEN_ATRIBUTO.filter(a => eventos.some(d => d.atributo === a));
  const CRIMENES = [...d3.rollup(eventos, v => v.length, d => d.crimen)]
    .sort((a, b) => b[1] - a[1])
    .map(([nombre]) => nombre);

  const estado = {
    tipo: null,
    siglos: new Set(SIGLOS_PRESENTES),
    atributos: new Set(ATRIBUTOS_PRESENTES),
    crimenes: new Set(),
  };

  function filtrarEventos() {
    return eventos.filter(d =>
      (!estado.tipo || d.tipo === estado.tipo) &&
      estado.siglos.has(d.siglo) &&
      estado.atributos.has(d.atributo) &&
      (estado.crimenes.size === 0 || estado.crimenes.has(d.crimen))
    );
  }

  function entidadesDesdeEventos(eventosFiltrados) {
    const primerPorAgente = new Map();
    eventosFiltrados.forEach(d => {
      const actual = primerPorAgente.get(d.idAgente);
      if (!actual || d.año < actual.año) primerPorAgente.set(d.idAgente, d);
    });
    return [...primerPorAgente.values()];
  }

  filtrosContainer.innerHTML = `
    <div class="ag-filtros">
      <div class="ag-filtros-fila">
        <div class="ag-filtros-grupo">
          <div class="ag-filtros-titulo">Tipo de agente (clic de nuevo para ver todos)</div>
          <div class="ag-chip-fila" id="agTipoFila"></div>
        </div>
        <div class="ag-filtros-grupo">
          <div class="ag-filtros-titulo">Tiempo</div>
          <div class="ag-chip-fila" id="agSigloFila"></div>
        </div>
        <div class="ag-filtros-grupo">
          <div class="ag-filtros-titulo">Atributo</div>
          <div class="ag-chip-fila" id="agAtributoFila"></div>
        </div>
        <div class="ag-filtros-grupo ag-filtros-grupo-crimen">
          <div class="ag-filtros-titulo">Crimen (ninguno elegido = todos)</div>
          <div class="ag-chip-fila ag-chip-crimenes" id="agCrimenFila"></div>
        </div>
      </div>
      <div class="ag-filtros-pie">
        <div class="ag-leyenda" id="agLeyenda"></div>
        <button type="button" class="ag-btn-limpiar" id="agLimpiar">Limpiar filtros</button>
      </div>
    </div>
  `;

  const tipoFila = document.getElementById("agTipoFila");
  const sigloFila = document.getElementById("agSigloFila");
  const atributoFila = document.getElementById("agAtributoFila");
  const crimenFila = document.getElementById("agCrimenFila");
  const leyenda = document.getElementById("agLeyenda");

  TIPOS_PRESENTES.forEach(t => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ag-chip";
    chip.textContent = t;
    chip.style.setProperty("--chip-color", PALETA_TIPO[t]);
    chip.addEventListener("click", () => {
      estado.tipo = estado.tipo === t ? null : t;
      onFiltroCambiado();
    });
    tipoFila.appendChild(chip);
  });

  SIGLOS_PRESENTES.forEach(s => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ag-chip";
    chip.textContent = s.replace("Siglo ", "S. ");
    chip.addEventListener("click", () => {
      if (estado.siglos.has(s)) estado.siglos.delete(s);
      else estado.siglos.add(s);
      onFiltroCambiado();
    });
    sigloFila.appendChild(chip);
  });

  ATRIBUTOS_PRESENTES.forEach(a => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ag-chip";
    chip.textContent = a;
    chip.addEventListener("click", () => {
      if (estado.atributos.has(a)) estado.atributos.delete(a);
      else estado.atributos.add(a);
      onFiltroCambiado();
    });
    atributoFila.appendChild(chip);
  });

  const chipTodosCrimenes = document.createElement("button");
  chipTodosCrimenes.type = "button";
  chipTodosCrimenes.className = "ag-chip ag-chip-small";
  chipTodosCrimenes.textContent = "Todos";
  chipTodosCrimenes.addEventListener("click", () => {
    estado.crimenes.clear();
    onFiltroCambiado();
  });
  crimenFila.appendChild(chipTodosCrimenes);
  CRIMENES.forEach(c => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "ag-chip ag-chip-small";
    chip.textContent = c;
    chip.addEventListener("click", () => {
      if (estado.crimenes.has(c)) estado.crimenes.delete(c);
      else estado.crimenes.add(c);
      onFiltroCambiado();
    });
    crimenFila.appendChild(chip);
  });

  TIPOS_PRESENTES.forEach(t => {
    const item = document.createElement("div");
    item.className = "ag-leyenda-item";
    item.innerHTML = `<span class="ag-leyenda-swatch" style="background:${PALETA_TIPO[t]}"></span>${t}`;
    leyenda.appendChild(item);
  });

  document.getElementById("agLimpiar").addEventListener("click", () => {
    estado.tipo = null;
    estado.siglos = new Set(SIGLOS_PRESENTES);
    estado.atributos = new Set(ATRIBUTOS_PRESENTES);
    estado.crimenes.clear();
    onFiltroCambiado();
  });

  function pintarEstadoChips() {
    tipoFila.querySelectorAll(".ag-chip").forEach(chip => {
      chip.classList.toggle("ag-chip-activo", chip.textContent === estado.tipo);
    });
    sigloFila.querySelectorAll(".ag-chip").forEach(chip => {
      const valor = SIGLOS_PRESENTES.find(s => s.replace("Siglo ", "S. ") === chip.textContent);
      chip.classList.toggle("ag-chip-activo", estado.siglos.has(valor));
    });
    atributoFila.querySelectorAll(".ag-chip").forEach(chip => {
      chip.classList.toggle("ag-chip-activo", estado.atributos.has(chip.textContent));
    });
    chipTodosCrimenes.classList.toggle("ag-chip-activo", estado.crimenes.size === 0);
    crimenFila.querySelectorAll(".ag-chip-small").forEach(chip => {
      if (chip === chipTodosCrimenes) return;
      chip.classList.toggle("ag-chip-activo", estado.crimenes.has(chip.textContent));
    });
  }

  const butterflyCtrl = crearAgentesButterfly("agButterfly");
  let activo = 0;
  const sucio = [true, true, true, true];

  function dibujar(indice) {
    const eventosFiltrados = filtrarEventos();
    if (indice === 0) dibujarAgentesBeeswarm("agBeeswarm", eventosFiltrados);
    else if (indice === 1) butterflyCtrl.actualizar(eventosFiltrados, estado.siglos, estado.tipo);
    else if (indice === 2) dibujarAgentesSankey("agSankey", eventosFiltrados, estado.crimenes);
    else if (indice === 3) dibujarSunburst("agSunburst", entidadesDesdeEventos(eventosFiltrados));
  }

  function onFiltroCambiado() {
    pintarEstadoChips();
    sucio.fill(true);
    dibujar(activo);
    sucio[activo] = false;
  }

  pintarEstadoChips();

  initCarruselPreguntas({
    wheelId: "agWheel",
    stageId: "agStage",
    prevId: "agPrev",
    nextId: "agNext",
    onActivate: (indice) => {
      activo = indice;
      if (sucio[indice]) {
        dibujar(indice);
        sucio[indice] = false;
      }
    },
  });
}
