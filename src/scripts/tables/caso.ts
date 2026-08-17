import * as d3 from 'd3';

const CSV_CRIMENES = `${import.meta.env.BASE_URL}data/crimenes.csv`;
const CSV_FUENTES  = `${import.meta.env.BASE_URL}data/Source.csv`;
const CSV_Personas    = `${import.meta.env.BASE_URL}data/Visualizaciones.csv`;

function buildCasesMap(crimenes, fuentes) {
  const fuentesIdx = {};
  fuentes.forEach(f => {
    fuentesIdx[f.ID_Documento] = f;
  });
  const casesMap = new Map();
  crimenes.forEach(row => {
    const caseId = row.ID_Caso;

    if (!casesMap.has(caseId)) {
      casesMap.set(caseId, {
        id: caseId,
        descripcion: row['Descripción'],
        año: row['Año'],
        lugar: row['Lugar'],
        especificaciones: row['Especificaciones'],
        documentos: [],
      });
    }
    const caso = casesMap.get(caseId);
    caso.documentos.push({
      id_documento: row.ID_Documento,
      crimen: row.crimen,
      subcrimen: row.subcrimen,
      fuente: fuentesIdx[row.ID_Documento] ?? null,
    });
  });
  return casesMap;
}

export function inicializarCaso() {
  const params  = new URLSearchParams(window.location.search);
  const casoId  = params.get('caso');

  const main    = document.getElementById('main-content');
  const loading = document.getElementById('loading-msg');

  if (!casoId) {
    loading.textContent = 'No se especificó un caso. Vuelve a la tabla.';
  } else {
    loadCase(casoId, { main, loading });
  }
}

async function loadCase(id, { main, loading }) {
  try {
    const [crimenes, fuentes, personas] = await Promise.all([
      d3.csv(CSV_CRIMENES),
      d3.csv(CSV_FUENTES),
      d3.csv(CSV_Personas),
    ]);

    const casesMap = buildCasesMap(crimenes, fuentes);
    const caso = casesMap.get(id);

    if (!caso) {
      loading.textContent = `No se encontró el caso con ID "${id}".`;
      return;
    }

    loading.remove();

    renderCase(caso, personas, main);

  } catch (err) {
    loading.textContent = 'Error al cargar los datos. Revisa la consola.';
    console.error(err);
  }
}

function renderCase(caso, personas, main) {

  const header = document.createElement('div');
  header.innerHTML = `
    <h1 class="case-title">${caso.descripcion}</h1>
    <div class="meta-row">
      <div class="meta-pill">
        <span class="label">Año</span>
        ${caso.año}
      </div>
      <div class="meta-pill">
        <span class="label">Lugar</span>
        ${caso.lugar}
      </div>
    </div>
  `;
  main.appendChild(header);

  const secTitle = document.createElement('h2');
  secTitle.className = 'section-title';
  secTitle.textContent = caso.documentos.length === 1
    ? 'Crimen registrado'
    : `Crímenes registrados (${caso.documentos.length})`;
  main.appendChild(secTitle);

  const list = document.createElement('div');
  list.className = 'crimes-list';

  caso.documentos.forEach(doc => {
    const card = document.createElement('article');
    card.className = 'crime-card';

const agentesDocumento = personas.filter(
  p => String(p.ID_Documento).trim() === String(doc.id_documento).trim()
);

let agentesHTML = "";

if (agentesDocumento.length > 0) {

  const grupos = {};

  agentesDocumento.forEach(p => {
    const atributo = p.Atributo || "Sin especificar";

    if (!grupos[atributo]) {
      grupos[atributo] = [];
    }

    grupos[atributo].push(p);
  });

  agentesHTML = `
        <div class="agents-block">

          <h4>Agentes involucrados</h4>

          ${Object.entries(grupos)
            .map(([atributo, personasGrupo]) => `

              <div class="agent-group">

                <div class="agent-role">
                  ${atributo}
                </div>

                <div class="agents-list">

                  ${personasGrupo
                    .map(
                      p => `
                        <div class="agent-person">

                          <div class="agent-name">
                            ${p.Agente}
                          </div>

                          <div class="agent-meta">
                            ${[
                              { label: 'Género', valor: p.Género },
                              { label: 'Calidad', valor: p.Calidad },
                              { label: 'Labor', valor: p.Labor },
                            ]
                              .filter(
                                c =>
                                  c.valor &&
                                  c.valor !== "null"
                              )
                              .map(c => `<span data-tooltip="${c.label}">${c.valor}</span>`)
                              .join(" · ")}
                          </div>

                        </div>
                      `
                    )
                    .join("")}

                </div>

              </div>

            `)
            .join("")}

        </div>
      `;
    }
    const fuenteHTML = doc.fuente
      ? `<div class="source-block">
          <div class="source-field">
            <span class="sf-label">Archivo</span>
            <span class="sf-value">${doc.fuente.Archivo ?? '—'}</span>
          </div>
          <div class="source-field">
            <span class="sf-label">Sección</span>
            <span class="sf-value">${doc.fuente['Sección'] ?? '—'}</span>
          </div>
          <div class="source-field">
            <span class="sf-label">Fondo</span>
            <span class="sf-value">${doc.fuente.Fondo ?? '—'}</span>
          </div>
          <div class="source-field">
            <span class="sf-label">Legajo</span>
            <span class="sf-value">${doc.fuente.Legajo ?? '—'}</span>
          </div>
          <div class="source-field">
            <span class="sf-label">Documento</span>
            <span class="sf-value">${doc.fuente.Documento ?? '—'}</span>
          </div>
          <div class="source-field">
            <span class="sf-label">Folios</span>
            <span class="sf-value">${doc.fuente.Folios ?? '—'}</span>
          </div>
        </div>`
      : `<p class="no-source">Fuente documental no disponible para este documento.</p>`;

    card.innerHTML = `
      <div class="crime-info">
        <div class="crime-fields">
          <div class="crime-field">
            <p class="crime-name" data-tooltip="Crimen">${doc.crimen.trim()}</p>
          </div>
          <div class="crime-field">
            <p class="crime-sub" data-tooltip="Subcrimen">${doc.subcrimen.trim()}</p>
          </div>
        </div>

        ${agentesHTML}

        ${fuenteHTML}
      </div>
    `;

    list.appendChild(card);
  });

  main.appendChild(list);
}
