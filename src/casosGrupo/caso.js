import { parseCSV, buildCasesMap } from '../tables/dataLoader.js';

// ── Configuración de rutas ────────────────────────────────
const CSV_CRIMENES = '/data/crimenes.csv';
const CSV_FUENTES  = '/data/Source.csv';

// ── Leer parámetro de URL ─────────────────────────────────
const params  = new URLSearchParams(window.location.search);
const casoId  = params.get('caso');

const main    = document.getElementById('main-content');
const loading = document.getElementById('loading-msg');
const bread   = document.getElementById('breadcrumb-case');

if (!casoId) {
  loading.textContent = 'No se especificó un caso. Vuelve a la tabla.';
} else {
  loadCase(casoId);
}

async function loadCase(id) {
  try {
    const [textCrimenes, textFuentes] = await Promise.all([
      fetch(CSV_CRIMENES).then(r => r.text()),
      fetch(CSV_FUENTES).then(r => r.text()),
    ]);

    const crimenes = parseCSV(textCrimenes);
    const fuentes  = parseCSV(textFuentes);
    const casesMap = buildCasesMap(crimenes, fuentes);
    const caso     = casesMap.get(id);

    if (!caso) {
      loading.textContent = `No se encontró el caso con ID "${id}".`;
      return;
    }

    loading.remove();
    bread.textContent = `Caso ${caso.id}`;
    renderCase(caso);

  } catch (err) {
    loading.textContent = 'Error al cargar los datos. Revisa la consola.';
    console.error(err);
  }
}

function renderCase(caso) {

  // ── Encabezado del caso ─────────────────────────────────
  const header = document.createElement('div');
  header.innerHTML = `
    <p class="case-eyebrow">Expediente · ID ${caso.id}</p>
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
      <div class="meta-pill">
        <span class="label">Estado</span>
        ${caso.especificaciones}
      </div>
      <div class="meta-pill">
        <span class="label">Documentos</span>
        ${caso.documentos.length}
      </div>
    </div>
  `;
  main.appendChild(header);

  // ── Título sección crímenes ─────────────────────────────
  const secTitle = document.createElement('h2');
  secTitle.className = 'section-title';
  secTitle.textContent = caso.documentos.length === 1
    ? 'Crimen registrado'
    : `Crímenes registrados (${caso.documentos.length})`;
  main.appendChild(secTitle);

  // ── Tarjetas de crímenes ────────────────────────────────
  const list = document.createElement('div');
  list.className = 'crimes-list';

  caso.documentos.forEach(doc => {
    const card = document.createElement('article');
    card.className = 'crime-card';

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
            <span class="sf-label">Legajo / Doc.</span>
            <span class="sf-value">${doc.fuente.Legajo ?? '—'} / ${doc.fuente.Documento ?? '—'}</span>
          </div>
          <div class="source-field">
            <span class="sf-label">Folios</span>
            <span class="sf-value">${doc.fuente.Folios ?? '—'} (${doc.fuente['Número_Folios'] ?? '?'} ff.)</span>
          </div>
          <div class="source-field source-ref">
            <span class="sf-label">Referencia completa</span>
            <span class="sf-value">${doc.fuente.Source ?? doc.source_id}</span>
          </div>
        </div>`
      : `<p class="no-source">Fuente documental no disponible para este documento.</p>`;

    card.innerHTML = `
      <div class="crime-info">
        <p class="crime-doc-id">Doc. ${doc.id_documento}</p>
        <p class="crime-name">${doc.crimen.trim()}</p>
        <p class="crime-sub">${doc.subcrimen.trim()}</p>
        ${fuenteHTML}
      </div>
      <div class="crime-badge">Cód. ${doc.codigo}.${doc.sub_codigo}</div>
    `;

    list.appendChild(card);
  });

  main.appendChild(list);
}