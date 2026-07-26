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

  const siglosInteres = [
    "Siglo XVI",
    "Siglo XVII",
    "Siglo XVIII",
    "Siglo XIX"
  ];

  const generosInteres = ["Mujer", "Hombre", "Sin información"];

  const atributosInteres = [
    { key: "victimas", label: "Víctima", nombre: "Víctimas" },
    { key: "perpetradores", label: "Perpetrador", nombre: "Perpetradores" },
    { key: "complices", label: "Cómplice", nombre: "Cómplices" }
  ];

  const tiposAgenteInteres = [
    { key: "instituciones", label: "Institución", nombre: "Instituciones" },
    { key: "poblacionI", label: "Población Indígena Completa", nombre: "Población Indígena" },
    { key: "poblacionC", label: "Población Completa", nombre: "Población General" }
  ];

  const coincideGenero = (valor, genero) => {
    if (genero === "Sin información") {
      return !valor || valor.trim() === "" || valor === "Sin información";
    }
    return valor === genero;
  };

  const estructuraColectivos = {};

  tiposAgenteInteres.forEach(({ key, label }) => {
    const dataTipo = datos.filter(d => d.Agente === label);

    const atributos = {};
    atributosInteres.forEach(({ key: atribKey, label: atribLabel }) => {
      const dataAtributo = dataTipo.filter(d => d.Atributo === atribLabel);

      const siglos = {};
      siglosInteres.forEach(siglo => {
        siglos[siglo] = contarPersonasUnicas(dataAtributo.filter(d => getSiglo(d.Año) === siglo));
      });

      atributos[atribKey] = {
        total: contarPersonasUnicas(dataAtributo),
        siglos
      };
    });

    estructuraColectivos[key] = {
      total: contarPersonasUnicas(dataTipo),
      atributos
    };
  });

  const estructuraPersonas = {};

  generosInteres.forEach(genero => {
    const dataGenero = personasUnicas.filter(d => coincideGenero(d.Género, genero));

    const atributos = {};
    atributosInteres.forEach(({ key, label }) => {
      const dataAtributo = dataGenero.filter(d => d.Atributo === label);

      const siglos = {};
      siglosInteres.forEach(siglo => {
        siglos[siglo] = contarPersonasUnicas(dataAtributo.filter(d => getSiglo(d.Año) === siglo));
      });

      atributos[key] = {
        total: contarPersonasUnicas(dataAtributo),
        siglos
      };
    });

    estructuraPersonas[genero] = {
      total: contarPersonasUnicas(dataGenero),
      atributos
    };
  });

  const conteo = {
    personas: estructuraPersonas,
    totalPersonas: personasUnicas.length,
    colectivos: estructuraColectivos,
    totalColectivos: contarPersonasUnicas(datos.filter(d => d.Agente === "Institución" || d.Agente === "Población Completa" || d.Agente === "Población Indígena Completa"))
  };

  console.log(conteo);

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

  function irATabla(filtros) {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([clave, valor]) => {
      if (valor) params.set(clave, valor);
    });
    window.location.href = `../base-de-datos/index.html?${params.toString()}`;
  }

  function renderHome() {
    root.innerHTML = "";

    const personasCard = document.createElement("div");
    personasCard.className = "card";
    personasCard.innerHTML = `
      <div class="total-header">
        Personas
        <span style="float:right; font-size:1rem;">Total: ${conteo.totalPersonas}</span>
      </div>
      ${generosInteres.map(g => `
        <div class="row row-clickable" data-genero="${g}">
          <span>${g}</span>
          <span class="val-bold">${conteo.personas[g].total}</span>
        </div>
      `).join("")}
    `;
    root.append(personasCard);

    personasCard.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => { renderAtributo(row.dataset.genero); });
    });

    const institucionesCard = document.createElement("div");
    institucionesCard.className = "card";
    institucionesCard.innerHTML = `
      <div class="total-header">
        Otros agentes
        <span style="float:right; font-size:1rem;">Total: ${conteo.totalColectivos}</span>
      </div>
      ${tiposAgenteInteres.map(({ key, nombre }) => `
        <div class="row row-clickable" data-tipo="${key}">
          <span>${nombre}</span>
          <span class="val-bold">${conteo.colectivos[key].total}</span>
        </div>
      `).join("")}
    `;
    root.append(institucionesCard);

    institucionesCard.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => { renderAtributoColectivos(row.dataset.tipo); });
    });
  }

  function renderAtributo(genero) {
    root.innerHTML = "";
    const g = conteo.personas[genero];

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="btn-back">← Volver</div>
      <div class="total-header">Personas - ${genero}</div>
      ${atributosInteres.map(({ key, nombre }) => `
        <div class="row row-clickable" data-rol="${key}">
          <span>${nombre}</span>
          <span class="val-bold">${g.atributos[key].total}</span>
        </div>
      `).join("")}
    `;
    root.append(card);

    card.querySelector(".btn-back").addEventListener("click", renderHome);
    card.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => { renderSiglo(genero, row.dataset.rol); });
    });
  }

  function renderAtributoColectivos(tipoKey) {
    root.innerHTML = "";
    const t = conteo.colectivos[tipoKey];
    const { nombre } = tiposAgenteInteres.find(a => a.key === tipoKey);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="btn-back">← Volver</div>
      <div class="total-header">Otros Agentes - ${nombre}</div>
      ${atributosInteres.map(({ key, nombre: nombreAtributo }) => `
        <div class="row row-clickable" data-rol="${key}">
          <span>${nombreAtributo}</span>
          <span class="val-bold">${t.atributos[key].total}</span>
        </div>
      `).join("")}
    `;
    root.append(card);
    card.querySelector(".btn-back").addEventListener("click", renderHome);
    card.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => { renderSigloColectivos(tipoKey, row.dataset.rol); });
    });
  }

  function renderSigloColectivos(tipoKey, rolId) {
    root.innerHTML = "";
    const stats = conteo.colectivos[tipoKey].atributos[rolId];
    const { label: agenteLabel, nombre: tipoNombre } = tiposAgenteInteres.find(a => a.key === tipoKey);
    const { label: atributoLabel, nombre: rolNombre } = atributosInteres.find(a => a.key === rolId);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="btn-back">← Volver</div>
      <div class="total-header">${rolNombre} (${tipoNombre})</div>
      ${siglosInteres.map(siglo => `
        <div class="row row-clickable" data-siglo="${siglo}">
          <span>${siglo}</span>
          <span class="val-bold">${stats.siglos[siglo]}</span>
        </div>
      `).join("")}
    `;
    root.append(card);
    card.querySelector(".btn-back").addEventListener("click", () => renderAtributoColectivos(tipoKey));
    card.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => {
        irATabla({
          agente: agenteLabel,
          atributo: atributoLabel,
          fecha: row.dataset.siglo,
          escala: "siglo"
        });
      });
    });
  }

  function renderSiglo(genero, rolId) {
    root.innerHTML = "";
    const stats = conteo.personas[genero].atributos[rolId];
    const { label, nombre } = atributosInteres.find(a => a.key === rolId);

    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `
      <div class="btn-back">← Volver</div>
      <div class="total-header">${nombre} (${genero})</div>
      ${siglosInteres.map(siglo => `
        <div class="row row-clickable" data-siglo="${siglo}">
          <span>${siglo}</span>
          <span class="val-bold">${stats.siglos[siglo]}</span>
        </div>
      `).join("")}
    `;
    root.append(card);
    card.querySelector(".btn-back").addEventListener("click", () => renderAtributo(genero));
    card.querySelectorAll(".row-clickable").forEach(row => {
      row.addEventListener("click", () => {
        irATabla({
          genero,
          atributo: label,
          fecha: row.dataset.siglo,
          escala: "siglo"
        });
      });
    });
  }

  renderHome();
}