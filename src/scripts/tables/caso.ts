import * as d3 from 'd3';

/** Fila cruda de cualquiera de los tres CSV. Se deja abierta a propósito: el
 *  código accede a columnas por nombre y tiparlas todas sería reescribirlo. */
type Fila = d3.DSVRowString<string>;

const CSV_CRIMENES = `${import.meta.env.BASE_URL}data/crimenes.csv`;
const CSV_FUENTES = `${import.meta.env.BASE_URL}data/Source.csv`;
const CSV_Personas = `${import.meta.env.BASE_URL}data/Visualizaciones.csv`;
const CSV_LINAJE = `${import.meta.env.BASE_URL}data/Linaje.csv`;

// crimenes.csv ya no trae el nombre del crimen/subcrimen: solo Código y
// Sub_Código. Se resuelven aquí contra Linaje.csv (ID_Código → Nombre).
function buildCasesMap(crimenes: Fila[], fuentes: Fila[], linaje: Fila[]) {
  const fuentesIdx: Record<string, Fila> = {};
  fuentes.forEach((f: Fila) => {
    fuentesIdx[f.ID_Documento!] = f;
  });
  const linajeMap: Record<string, string> = {};
  linaje.forEach((l: Fila) => {
    linajeMap[l['ID_Código']!] = l.Nombre!;
  });
  const casesMap = new Map();
  crimenes.forEach((row: Fila) => {
    const caseId = row.ID_Caso;
    const idCrimen = row['ID_Crímen'];

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
      id_documento: idCrimen,
      crimen: linajeMap[row['Código']!] || '',
      subcrimen: linajeMap[row['Sub_Código']!] || '',
      fuente: fuentesIdx[idCrimen!] ?? null,
    });
  });
  return casesMap;
}

export function inicializarCaso() {
  const params = new URLSearchParams(window.location.search);
  const casoId = params.get('caso');

  const main = document.getElementById('main-content');
  const loading = document.getElementById('loading-msg');

  if (!casoId) {
    loading!.textContent = 'No se especificó un caso. Vuelve a la tabla.';
  } else {
    loadCase(casoId, { main, loading });
  }
}

async function loadCase(
  id: string,
  { main, loading }: { main: HTMLElement | null; loading: HTMLElement | null },
) {
  try {
    const [crimenes, fuentes, personas, linaje] = await Promise.all([
      d3.csv(CSV_CRIMENES),
      d3.csv(CSV_FUENTES),
      d3.csv(CSV_Personas),
      d3.csv(CSV_LINAJE),
    ]);

    const casesMap = buildCasesMap(crimenes, fuentes, linaje);
    const caso = casesMap.get(id);

    if (!caso) {
      loading!.textContent = `No se encontró el caso con ID "${id}".`;
      return;
    }

    loading!.remove();

    renderCase(caso, personas, main!, casesMap);
  } catch (err) {
    loading!.textContent = 'Error al cargar los datos. Revisa la consola.';
    console.error(err);
  }
}

// TODO: type — `caso` es la estructura que arma buildCasesMap; tiparla exige
// modelar todo el mapa de casos y documentos, que es más de lo que toca aquí.
function renderCase(caso: any, personas: Fila[], main: HTMLElement, casesMap: Map<string, any>) {
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
  secTitle.textContent =
    caso.documentos.length === 1
      ? 'Crimen registrado'
      : `Crímenes registrados (${caso.documentos.length})`;
  main.appendChild(secTitle);

  const list = document.createElement('div');
  list.className = 'crimes-list';

  caso.documentos.forEach((doc: any) => {
    const card = document.createElement('article');
    card.className = 'crime-card';

    const agentesDocumento = personas.filter(
      (p: Fila) => String(p.ID_Documento).trim() === String(doc.id_documento).trim(),
    );

    let agentesHTML = '';

    if (agentesDocumento.length > 0) {
      const grupos: Record<string, Fila[]> = {};

      agentesDocumento.forEach((p: Fila) => {
        const atributo = p.Atributo || 'Sin especificar';

        if (!grupos[atributo]) {
          grupos[atributo] = [];
        }

        grupos[atributo].push(p);
      });

      agentesHTML = `
        <div class="agents-block">

          <h4>Agentes involucrados</h4>

          ${Object.entries(grupos)
            .map(
              ([atributo, personasGrupo]) => `

              <div class="agent-group">

                <div class="agent-role">
                  ${atributo}
                </div>

                <div class="agents-list">

                  ${personasGrupo
                    .map(
                      (p: Fila) => `
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
                              .filter((c) => c.valor && c.valor !== 'null')
                              .map((c) => `<span data-tooltip="${c.label}">${c.valor}</span>`)
                              .join(' · ')}
                          </div>

                        </div>
                      `,
                    )
                    .join('')}

                </div>

              </div>

            `,
            )
            .join('')}

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

  renderCasosSimilares(caso, casesMap, main);
}

type CriterioSimilar = 'lugar' | 'crimen' | 'anio';

const CRITERIOS_SIMILARES: { criterio: CriterioSimilar; etiqueta: string }[] = [
  { criterio: 'crimen', etiqueta: 'Mismo crimen' },
  { criterio: 'lugar', etiqueta: 'Mismo lugar' },
  { criterio: 'anio', etiqueta: 'Mismo año' },
];

// Tope para que el carrusel no cargue cientos de tarjetas en crímenes o
// lugares muy comunes (p. ej. "Homicidio" o "Santafé (Bogotá)").
const MAX_CASOS_SIMILARES = 24;

function crimenesDeCaso(caso: any): Set<string> {
  return new Set(caso.documentos.map((d: any) => d.crimen).filter(Boolean));
}

function buscarCasosSimilares(criterio: CriterioSimilar, caso: any, casesMap: Map<string, any>) {
  const crimenesCaso = criterio === 'crimen' ? crimenesDeCaso(caso) : null;
  const candidatos: any[] = [];

  casesMap.forEach((otro) => {
    if (otro.id === caso.id) return;

    let coincide = false;
    if (criterio === 'lugar') {
      coincide = !!caso.lugar && otro.lugar === caso.lugar;
    } else if (criterio === 'anio') {
      coincide = !!caso.año && otro.año === caso.año;
    } else {
      coincide = [...crimenesDeCaso(otro)].some((c) => crimenesCaso!.has(c));
    }

    if (coincide) candidatos.push(otro);
  });

  return candidatos.slice(0, MAX_CASOS_SIMILARES);
}

function renderCasosSimilares(caso: any, casesMap: Map<string, any>, main: HTMLElement) {
  const base = import.meta.env.BASE_URL;

  const section = document.createElement('div');
  section.className = 'similares-section';
  section.innerHTML = `
    <h2 class="section-title">Casos similares</h2>
    <div class="similares-tabs">
      ${CRITERIOS_SIMILARES.map(
        ({ criterio, etiqueta }, i) => `
        <button class="similares-tab${i === 0 ? ' similares-tab--activa' : ''}" data-criterio="${criterio}">
          ${etiqueta}
        </button>
      `,
      ).join('')}
    </div>
    <div class="similares-carrusel-wrap">
      <button class="carrusel-flecha carrusel-flecha--prev" aria-label="Ver casos anteriores">‹</button>
      <div class="similares-carrusel"></div>
      <button class="carrusel-flecha carrusel-flecha--next" aria-label="Ver casos siguientes">›</button>
    </div>
  `;
  main.appendChild(section);

  const carrusel = section.querySelector<HTMLElement>('.similares-carrusel')!;
  const flechaPrev = section.querySelector<HTMLButtonElement>('.carrusel-flecha--prev')!;
  const flechaNext = section.querySelector<HTMLButtonElement>('.carrusel-flecha--next')!;

  function pintarCriterio(criterio: CriterioSimilar) {
    const similares = buscarCasosSimilares(criterio, caso, casesMap);

    carrusel.innerHTML = similares.length
      ? similares
          .map(
            (s) => `
        <article class="similar-card" data-caso="${s.id}" title="Ver expediente ${s.id}">
          <div class="similar-card-meta">
            <span>${s.año || 'Sin año'}</span>
            <span>${s.lugar || 'Sin lugar'}</span>
          </div>
          <p class="similar-card-desc">${s.descripcion || ''}</p>
          <div class="similar-card-crimen">${[...crimenesDeCaso(s)].join(', ')}</div>
        </article>
      `,
          )
          .join('')
      : `<p class="similares-vacio">No se encontraron casos similares para este criterio.</p>`;

    carrusel.querySelectorAll<HTMLElement>('[data-caso]').forEach((card) => {
      card.addEventListener('click', () => {
        window.location.href = `${base}base-de-datos/caso.html?caso=${encodeURIComponent(card.dataset.caso!)}`;
      });
    });
  }

  section.querySelectorAll<HTMLButtonElement>('.similares-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      section
        .querySelectorAll('.similares-tab')
        .forEach((t) => t.classList.remove('similares-tab--activa'));
      tab.classList.add('similares-tab--activa');
      carrusel.scrollTo({ left: 0 });
      pintarCriterio(tab.dataset.criterio as CriterioSimilar);
    });
  });

  flechaPrev.addEventListener('click', () => carrusel.scrollBy({ left: -300, behavior: 'smooth' }));
  flechaNext.addEventListener('click', () => carrusel.scrollBy({ left: 300, behavior: 'smooth' }));

  pintarCriterio(CRITERIOS_SIMILARES[0].criterio);
}
