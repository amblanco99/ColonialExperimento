import * as d3 from "d3";

export async function crearConteoInteractivo() {

  const datos = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);

  const getSiglo = (year) => {
    const y = +year;
    if (y <= 1599) return "Siglo XVI";  
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800) return "Siglo XIX";  
    return "Siglo XVI";
  };

  function contarPersonasUnicas(filas) {
    const agentesUnicos = new Set();
    filas.forEach(d => {
      if (d.ID_Agente) agentesUnicos.add(d.ID_Agente);
    });
    return agentesUnicos.size;
  }

  const primerRegistroPorAgente = new Map();

  datos.forEach(d => {
    const id = d.ID_Agente;
    if (!id) return; 

    const añoActual = +d.Año;

    if (!primerRegistroPorAgente.has(id)) {
      primerRegistroPorAgente.set(id, d);
    } else {
      const añoRegistrado = +primerRegistroPorAgente.get(id).Año;
      if (añoActual < añoRegistrado) {
        primerRegistroPorAgente.set(id, d);
      }
    }
  });

  const personasUnicas = Array.from(primerRegistroPorAgente.values());

  function contarCrimenesUnicos(filas) {
    const set = new Set();
    filas.forEach(d => {
      if (d.ID_Documento && d.Código) {
        set.add(`${d.ID_Documento}|${d.Código}`);
      }
    });
    return set.size;
  }

  const siglosInteres = [
    "Siglo XVI",
    "Siglo XVII",
    "Siglo XVIII",
    "Siglo XIX"
  ];

  // ==========================================
  // PERSONAS Y COLECTIVOS POR SIGLO (Modificado)
  // ==========================================
  const estructuraPersonas = {};
  const estructuraColectivos = {}; // <-- Nueva estructura para guardar colectivos por siglo

  siglosInteres.forEach(siglo => {
    // Datos filtrados por el siglo actual
    const dataSiglo = personasUnicas.filter(d => getSiglo(d.Año) === siglo);
    const datosCompletosSiglo = datos.filter(d => getSiglo(d.Año) === siglo);

    // 1. Procesar Colectivos por Siglo (Tomando como referencia el filtro de personas)
    estructuraColectivos[siglo] = {
      instituciones: contarPersonasUnicas(datosCompletosSiglo.filter(d => d.Agente === "Institución")),
      poblacionC: contarPersonasUnicas(datosCompletosSiglo.filter(d => d.Agente === "Población Completa")),
      poblacionI: contarPersonasUnicas(datosCompletosSiglo.filter(d => d.Agente === "Población Indígena Completa"))
    };
    estructuraColectivos[siglo].total = 
      estructuraColectivos[siglo].instituciones + 
      estructuraColectivos[siglo].poblacionC + 
      estructuraColectivos[siglo].poblacionI;

    // 2. Procesar Roles de Personas (Se mantiene igual)
    const procesarRol = (rol) => {
      const miembrosRol = dataSiglo.filter(d => d.Atributo === rol);
      return {
        total: contarPersonasUnicas(miembrosRol),
        mujeres: contarPersonasUnicas(miembrosRol.filter(d => d.Género === "Mujer")),
        hombres: contarPersonasUnicas(miembrosRol.filter(d => d.Género === "Hombre")),
        sin: contarPersonasUnicas(miembrosRol.filter(d => d.Género === "Sin información" || !d.Género || d.Género.trim() === ""))
      };
    };

    estructuraPersonas[siglo] = {
      total: dataSiglo.length, 
      victimas: procesarRol("Víctima"),
      perpetradores: procesarRol("Perpetrador"),
      complices: procesarRol("Cómplice")
    };
  });

  // ==========================
  // CRÍMENES POR SIGLO
  // ==========================
  const estructuraCrimenes = {};
  siglosInteres.forEach(siglo => {
    const crimenesSiglo = datos.filter(d => getSiglo(d.Año) === siglo);
    estructuraCrimenes[siglo] = contarCrimenesUnicos(crimenesSiglo);
  });

  // ==========================
  // OBJETO FINAL
  // ==========================
  const conteo = {
    personas: estructuraPersonas,
    totalPersonas: personasUnicas.length,
    colectivos: estructuraColectivos, // <-- Cambiado: Ahora contiene la estructura por siglos
    totalColectivos: contarPersonasUnicas(datos.filter(d => d.Agente === "Institución" || d.Agente === "Población Completa" || d.Agente === "Población Indígena Completa")),
    crimenes: estructuraCrimenes,
    totalCrimenes: contarCrimenesUnicos(datos)
  };

  console.log(conteo);

  // ==========================
  // RENDERIZADO EN DOM
  // ==========================
  const container = document.getElementById("conteoInteractivo");
  if (!container) return;

  container.innerHTML = `
    <style>
      .col-root { font-family: serif; color: #1a2e2a; max-width: 800px; }
      .card { background: #f0ebe0; border-radius: 8px; padding: 25px; margin-bottom: 20px; border: 1px solid #dcd7ca; }
      .row { display: flex; justify-content: space-between; padding: 12px 10px; border-bottom: 1px solid rgba(26,46,42,0.1); }
      .row-clickable { cursor: pointer; }
      .row-clickable:hover { background: rgba(26,46,42,0.05); }
      .total-header {  display: flex; justify-content: space-between; align-items: center;font-size: 1.5rem; font-weight: bold; margin-bottom: 20px; }
      .btn-back { cursor: pointer; margin-bottom: 15px; color: #666; }
      .btn-back:hover { text-decoration: underline; }
      .val-bold { font-weight: bold; }
    </style>
    <div class="col-root cards-container"></div>
  `;

  const root = container.querySelector(".col-root");

  function renderHome() {
    root.innerHTML = "";

    // Card de Personas
    const personasCard = document.createElement("div");
    personasCard.className = "card";
    personasCard.innerHTML = `
      <div class="total-header">
        Personas
        <span style="float:right; font-size:1rem;">Total: ${conteo.totalPersonas}</span>
      </div>
      ${Object.keys(conteo.personas).map(s => `
        <div class="row row-clickable" data-siglo="${s}">
          <span>${s}</span>
          <span class="val-bold">${conteo.personas[s].total}</span>
        </div>
      `).join("")}
    `;
    root.append(personasCard);

    personasCard.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => { renderSiglo(row.dataset.siglo); });
    });

    // Card de Otros Agentes / Colectivos (Modificado a interactivo por siglo)
    const institucionesCard = document.createElement("div");
    institucionesCard.className = "card";
    institucionesCard.innerHTML = `
      <div class="total-header">
        Otros agentes
        <span style="float:right; font-size:1rem;">Total: ${conteo.totalColectivos}</span>
      </div>
      ${Object.keys(conteo.colectivos).map(s => `
        <div class="row row-clickable" data-siglo="${s}">
          <span>${s}</span>
          <span class="val-bold">${conteo.colectivos[s].total}</span>
        </div>
      `).join("")}
    `;
    root.append(institucionesCard);

    institucionesCard.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => { renderSigloColectivos(row.dataset.siglo); });
    });

    // Card de Crímenes
    const crimenCard = document.createElement("div");
    crimenCard.className = "card";
    crimenCard.innerHTML = `
      <div class="total-header">
        Crímenes
        <span style="float:right; font-size:1rem;">Total: ${conteo.totalCrimenes}</span>
      </div>
      ${Object.keys(conteo.crimenes).map(s => `
        <div class="row">
          <span>${s}</span>
          <span class="val-bold">${conteo.crimenes[s]}</span>
        </div>
      `).join("")}
    `;
    root.append(crimenCard);
  }

  // Vista de Personas por Siglo (Se mantiene igual)
  function renderSiglo(siglo) {
    root.innerHTML = "";
    const s = conteo.personas[siglo];

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="btn-back">← Volver</div>
      <div class="total-header">Personas - ${siglo}</div>
      <div class="row row-clickable" data-rol="victimas">
        <span>Víctimas</span>
        <span class="val-bold">${s.victimas.total}</span>
      </div>
      <div class="row row-clickable" data-rol="perpetradores">
        <span>Perpetradores</span>
        <span class="val-bold">${s.perpetradores.total}</span>
      </div>
      <div class="row row-clickable" data-rol="complices">
        <span>Cómplices</span>
        <span class="val-bold">${s.complices.total}</span>
      </div>
    `;
    root.append(card);

    card.querySelector(".btn-back").addEventListener("click", renderHome);
    card.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => { renderGenero(siglo, row.dataset.rol); });
    });
  }

  // Nueva función para renderizar el desglose de colectivos por siglo elegido
  function renderSigloColectivos(siglo) {
    root.innerHTML = "";
    const col = conteo.colectivos[siglo];

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="btn-back">← Volver</div>
      <div class="total-header">Otros Agentes - ${siglo}</div>
      <div class="row">
        <span>Instituciones</span>
        <span class="val-bold">${col.instituciones}</span>
      </div>
      <div class="row">
        <span>Población Indígena</span>
        <span class="val-bold">${col.poblacionI}</span>
      </div>
      <div class="row">
        <span>Población General</span>
        <span class="val-bold">${col.poblacionC}</span>
      </div>
    `;
    root.append(card);
    card.querySelector(".btn-back").addEventListener("click", renderHome);
  }

  function renderGenero(siglo, rolId) {
    root.innerHTML = "";
    const stats = conteo.personas[siglo][rolId];
    const nombres = { victimas: "Víctimas", perpetradores: "Perpetradores", complices: "Cómplices" };

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="btn-back">← Volver</div>
      <div class="total-header">${nombres[rolId]} (${siglo})</div>
      <div class="row">
        <span>Mujeres</span>
        <span class="val-bold">${stats.mujeres}</span>
      </div>
      <div class="row">
        <span>Hombres</span>
        <span class="val-bold">${stats.hombres}</span>
      </div>
      <div class="row">
        <span>Sin información</span>
        <span class="val-bold">${stats.sin}</span>
      </div>
    `;
    root.append(card);
    card.querySelector(".btn-back").addEventListener("click", () => renderSiglo(siglo));
  }

  renderHome();
}