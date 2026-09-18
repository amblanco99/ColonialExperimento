import * as d3 from 'd3';
import { leerResultados } from './resultadosGuardados.js';

type Fila = d3.DSVRowString<string>;

const CSV_CRIMENES = `${import.meta.env.BASE_URL}data/crimenes.csv`;
const CSV_FUENTES = `${import.meta.env.BASE_URL}data/Source.csv`;
const CSV_Personas = `${import.meta.env.BASE_URL}data/Visualizaciones.csv`;
const CSV_LINAJE = `${import.meta.env.BASE_URL}data/Linaje.csv`;
// Trae el rango real del proceso (FechaInicial/Fecha_Final por ID_Caso), que
// crimenes.csv no tiene: ahí "Año" es un único valor por documento. Se usa
// solo para el encabezado del caso.
const CSV_CASOS = `${import.meta.env.BASE_URL}data/Casos.csv`;
// Archivo aparte (ver tools/generar-negrilla-csv.mjs): trae la misma
// Descripción que crimenes.csv pero con la negrilla del Excel marcada entre
// **doble asterisco**. crimenes.csv no se toca — de ahí lo sigue leyendo tal
// cual la tabla general y el resto de gráficos. Ambos archivos se cruzan por
// ID_Caso + ID_Crímen, y solo la tarjeta de cada crimen usa la versión con
// negrilla.
const CSV_NEGRILLA = `${import.meta.env.BASE_URL}data/DescripcionesNegrilla.csv`;

function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatearDescripcion(texto: string, conNegrilla: boolean): string {
  const escapado = escaparHtml((texto || '').trim());
  return conNegrilla
    ? escapado.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    : escapado.replace(/\*\*(.+?)\*\*/g, '$1');
}

const fmt = (n: number) => n.toLocaleString('de-DE');

// Color del círculo de cada agente: el de su género (personas) o el de su tipo
// (instituciones y poblaciones), los mismos de la página de Composición social.
function variableColorAgente(p: Fila): string {
  if (p.Agente === 'Persona') {
    if (p.Género === 'Mujer') return '--genero-mujer';
    if (p.Género === 'Hombre') return '--genero-hombre';
    return '--genero-sin-info';
  }
  if (p.Agente === 'Institución') return '--tipo-institucion';
  if (p.Agente === 'Población Indígena Completa') return '--tipo-poblacion-indigena';
  return '--tipo-poblacion-completa';
}

// Referencia archivística en una línea, lista para pegar en una cita.
function referenciaArchivistica(fuente: Fila | null): string {
  if (!fuente) return '';
  const partes = [fuente.Archivo, fuente['Sección'], fuente.Fondo].filter(Boolean) as string[];
  if (fuente.Legajo) partes.push(`leg. ${fuente.Legajo}`);
  if (fuente.Documento) partes.push(`doc. ${fuente.Documento}`);
  if (fuente.Folios) partes.push(`ff. ${fuente.Folios}`);
  return partes.length ? `${partes.join(', ')}.` : '';
}

async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Contextos sin la API del portapapeles: se copia con un campo temporal.
    const campo = document.createElement('textarea');
    campo.value = texto;
    campo.style.position = 'fixed';
    campo.style.opacity = '0';
    document.body.appendChild(campo);
    campo.select();
    const copiado = document.execCommand('copy');
    campo.remove();
    return copiado;
  }
}

// Todos los casos, del más antiguo al más reciente (los sin año, al final):
// el orden por defecto de la tabla. Sirve de lista cuando no se llegó desde una
// búsqueda.
function idsDeTodosLosCasos(casesMap: Map<string, any>): string[] {
  const anio = (caso: any) => {
    const n = parseInt(caso.año, 10);
    return Number.isNaN(n) || n <= 0 ? Infinity : n;
  };
  return [...casesMap.values()].sort((a, b) => anio(a) - anio(b)).map((caso) => caso.id);
}

// Barra superior: "Volver a resultados", "Caso N de M" y Anterior / Siguiente.
// Si se llegó desde la tabla se usa la lista que se estaba viendo y el enlace
// deja la tabla como estaba; si no (entrada directa, o un caso que no está en
// esa lista) se recorren todos los casos y el enlace lleva a la tabla completa.
function renderNavegacion(id: string, casesMap: Map<string, any>) {
  const base = import.meta.env.BASE_URL;
  const volver = document.getElementById('casoVolver') as HTMLAnchorElement | null;
  const etiquetaPosicion = document.getElementById('casoPosicion');
  const nav = document.getElementById('casoNav');
  const anterior = document.getElementById('casoAnterior') as HTMLAnchorElement | null;
  const siguiente = document.getElementById('casoSiguiente') as HTMLAnchorElement | null;
  if (!volver || !etiquetaPosicion || !nav || !anterior || !siguiente) return;

  const guardados = leerResultados();
  const desdeLaTabla = !!guardados && guardados.ids.includes(id);
  const ids = desdeLaTabla ? guardados!.ids : idsDeTodosLosCasos(casesMap);
  const posicion = ids.indexOf(id);
  if (posicion < 0) return;

  if (desdeLaTabla) {
    const separador = guardados!.urlTabla.includes('?') ? '&' : '?';
    volver.href = `${guardados!.urlTabla}${separador}volver=1`;
  } else {
    volver.href = `${base}base-de-datos/index.html`;
  }
  volver.textContent = 'Volver a resultados';
  etiquetaPosicion.textContent = `Caso ${fmt(posicion + 1)} de ${fmt(ids.length)}`;

  const enlazar = (a: HTMLAnchorElement, destino: string | undefined) => {
    const activo = destino !== undefined;
    if (activo) a.href = `${base}base-de-datos/caso.html?caso=${encodeURIComponent(destino)}`;
    else a.removeAttribute('href');
    a.setAttribute('aria-disabled', String(!activo));
    a.classList.toggle('caso-nav-boton--inactivo', !activo);
  };
  enlazar(anterior, ids[posicion - 1]);
  enlazar(siguiente, ids[posicion + 1]);
  nav.hidden = false;
}

function claveDocumento(idCaso?: string, idCrimen?: string): string {
  return `${idCaso}|${idCrimen}`;
}

// FechaInicial/Fecha_Final del proceso, como rango si difieren o como año
// único si coinciden; si Casos.csv no tiene el caso, cae al Año de crimenes.csv.
function formatearRangoAnios(
  fechaInicial?: string,
  fechaFinal?: string,
  fallback?: string,
): string {
  const inicial = (fechaInicial || '').trim();
  const final = (fechaFinal || '').trim();
  if (inicial && final) return inicial === final ? inicial : `${inicial} – ${final}`;
  return inicial || final || fallback || '';
}

function buildCasesMap(
  crimenes: Fila[],
  fuentes: Fila[],
  linaje: Fila[],
  negrilla: Fila[],
  casos: Fila[],
) {
  const fuentesIdx: Record<string, Fila> = {};
  fuentes.forEach((f: Fila) => {
    fuentesIdx[f['ID_Crímen']!] = f;
  });
  const linajeMap: Record<string, string> = {};
  linaje.forEach((l: Fila) => {
    linajeMap[l['ID_Código']!] = l.Nombre!;
  });
  const casosIdx: Record<string, Fila> = {};
  casos.forEach((c: Fila) => {
    casosIdx[c.ID_Caso!] = c;
  });
  // Descripción con negrilla, indexada por ID_Caso + ID_Crímen (solo para
  // las tarjetas; ver CSV_NEGRILLA arriba).
  const negrillaIdx: Record<string, string> = {};
  negrilla.forEach((n: Fila) => {
    negrillaIdx[claveDocumento(n.ID_Caso, n['ID_Crímen'])] = n['Descripción']!;
  });

  const casesMap = new Map();
  crimenes.forEach((row: Fila) => {
    const caseId = row.ID_Caso;
    const idCrimen = row['ID_Crímen'];

    if (!casesMap.has(caseId)) {
      const casoInfo = casosIdx[caseId!];
      casesMap.set(caseId, {
        id: caseId,
        descripcion: row['Descripción'],
        año: row['Año'],
        rangoAnios: formatearRangoAnios(
          casoInfo?.FechaInicial,
          casoInfo?.['Fecha_Final'],
          row['Año'],
        ),
        lugar: row['Lugar'],
        especificaciones: row['Especificaciones'],
        documentos: [],
      });
    }
    const caso = casesMap.get(caseId);
    const descripcionNegrilla = negrillaIdx[claveDocumento(caseId, idCrimen)];
    caso.documentos.push({
      id_documento: idCrimen,
      descripcion: descripcionNegrilla ?? row['Descripción'],
      año: row['Año'],
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
    const [crimenes, fuentes, personas, linaje, negrilla, casos] = await Promise.all([
      d3.csv(CSV_CRIMENES),
      d3.csv(CSV_FUENTES),
      d3.csv(CSV_Personas),
      d3.csv(CSV_LINAJE),
      d3.csv(CSV_NEGRILLA),
      d3.csv(CSV_CASOS),
    ]);

    const casesMap = buildCasesMap(crimenes, fuentes, linaje, negrilla, casos);
    const caso = casesMap.get(id);

    if (!caso) {
      loading!.textContent = `No se encontró el caso con ID "${id}".`;
      return;
    }

    loading!.remove();

    renderCase(caso, personas, main!, casesMap);
    renderNavegacion(id, casesMap);
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
    <p class="case-eyebrow">Caso ID ${escaparHtml(String(caso.id))}</p>
    <h1 class="case-title">${formatearDescripcion(caso.descripcion, false)}</h1>
    <div class="meta-row">
      <div class="meta-pill">
        <span class="label">Año</span>
        ${caso.rangoAnios}
      </div>
      <div class="meta-pill">
        <span class="label">Lugar</span>
        ${caso.lugar}
      </div>
    </div>
  `;
  main.appendChild(header);

  if (caso.documentos.length > 1) {
    const secTitle = document.createElement('h2');
    secTitle.className = 'section-title';
    secTitle.textContent = `Crímenes registrados (${caso.documentos.length})`;
    main.appendChild(secTitle);
  }

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

      const entradas = Object.entries(grupos);
      // Con un solo rol, va a la derecha del título; con varios, cada grupo
      // lleva el suyo encima.
      const unSoloRol = entradas.length === 1;

      agentesHTML = `
        <div class="agents-block">
          <div class="agents-cabecera">
            <h4>Agentes involucrados</h4>
            ${unSoloRol ? `<span class="agent-role">${entradas[0][0]}</span>` : ''}
          </div>

          ${entradas
            .map(
              ([atributo, personasGrupo]) => `
              <div class="agent-group">
                ${unSoloRol ? '' : `<div class="agent-role">${atributo}</div>`}

                <div class="agents-list">
                  ${personasGrupo
                    .map(
                      (p: Fila) => `
                        <div class="agent-person">
                          <span class="agent-avatar" style="--avatar: var(${variableColorAgente(p)})" aria-hidden="true"></span>

                          <div>
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

    const camposFicha = doc.fuente
      ? [
          ['Archivo', doc.fuente.Archivo],
          ['Sección', doc.fuente['Sección']],
          ['Fondo', doc.fuente.Fondo],
          ['Legajo', doc.fuente.Legajo],
          ['Documento', doc.fuente.Documento],
          ['Folios', doc.fuente.Folios],
        ]
      : [];
    const referencia = referenciaArchivistica(doc.fuente);

    const fuenteHTML = `
      <div class="ficha">
        <h4 class="ficha-titulo">Referencia</h4>
        ${
          doc.fuente
            ? `<div class="ficha-grid">
                ${camposFicha
                  .map(
                    ([etiqueta, valor]) => `
                  <div class="source-field">
                    <span class="sf-label">${etiqueta}</span>
                    <span class="sf-value">${valor ?? '—'}</span>
                  </div>`,
                  )
                  .join('')}
              </div>`
            : `<p class="no-source">Fuente documental no disponible para este documento.</p>`
        }
        <div class="ficha-pie">
          <div class="ficha-chips">
            ${doc.año ? `<span class="doc-chip">Año ${doc.año}</span>` : ''}
          </div>
          ${
            referencia
              ? `<button type="button" class="copiar-ref">
                  <svg viewBox="0 0 16 16" aria-hidden="true">
                    <rect x="5.25" y="5.25" width="8" height="8" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3"></rect>
                    <path d="M10.75 5.25V3.5a1.2 1.2 0 0 0-1.2-1.2H3.5a1.2 1.2 0 0 0-1.2 1.2v6.05a1.2 1.2 0 0 0 1.2 1.2h1.75" fill="none" stroke="currentColor" stroke-width="1.3"></path>
                  </svg>
                  <span class="copiar-ref-texto">Copiar referencia archivística</span>
                </button>`
              : ''
          }
        </div>
      </div>`;

    const subcrimen = doc.subcrimen.trim();
    const crimeFieldsHTML = `
      <div class="crime-fields">
        <div class="crime-field">
          <p class="crime-name">${doc.crimen.trim()}</p>
          <span class="crime-field-label">Crimen</span>
        </div>
        ${
          subcrimen
            ? `
        <div class="crime-field">
          <p class="crime-sub">${subcrimen}</p>
          <span class="crime-field-label">Subcrimen</span>
        </div>
        `
            : ''
        }
      </div>
    `;

    const crimeHeaderHTML = `
      <div class="crime-header">
        <p class="crime-descripcion">${formatearDescripcion(doc.descripcion, true)}</p>
        ${crimeFieldsHTML}
      </div>
    `;

    const idDocumentoHTML = `
      <div class="crime-id">
        <span class="doc-chip doc-chip--id">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 1.75h5.2L12.5 5v9.25H4V1.75Z M9 1.75V5.25h3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"></path>
          </svg>
          ID Crimen: ${doc.id_documento}
        </span>
      </div>
    `;

    card.innerHTML = `
      <div class="crime-info">
        ${idDocumentoHTML}

        ${crimeHeaderHTML}

        ${agentesHTML}

        ${fuenteHTML}
      </div>
    `;

    const botonCopiar = card.querySelector<HTMLButtonElement>('.copiar-ref');
    if (botonCopiar) {
      const textoBoton = botonCopiar.querySelector('.copiar-ref-texto')!;
      const textoInicial = textoBoton.textContent;
      let temporizador: number | undefined;
      botonCopiar.addEventListener('click', async () => {
        const copiado = await copiarTexto(referenciaArchivistica(doc.fuente));
        textoBoton.textContent = copiado ? 'Referencia copiada' : 'No se pudo copiar';
        botonCopiar.classList.toggle('copiar-ref--copiado', copiado);
        window.clearTimeout(temporizador);
        temporizador = window.setTimeout(() => {
          textoBoton.textContent = textoInicial;
          botonCopiar.classList.remove('copiar-ref--copiado');
        }, 2000);
      });
    }

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
          <p class="similar-card-desc">${formatearDescripcion(s.descripcion, false)}</p>
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
