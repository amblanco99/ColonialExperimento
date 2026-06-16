import * as d3 from "d3";

export async function crearTabla() {

  // =========================
  // CARGAR AMBOS CSV
  // =========================

  const [dataCrimenes, dataViz] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}/data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`)
  ]);

  // =========================
  // LEER FILTROS DE URL
  // =========================

  const params     = new URLSearchParams(window.location.search);
  const genero     = params.get("genero");
  const atributo   = params.get("atributo");
  const codigo     = params.get("codigo");
  const subcodigo  = params.get("subcodigo");
  const vieneDeFiltro = params.toString() !== "";

  // =========================
  // CRUCE POR ID_Documento
  // =========================

  let idDocumentosPermitidos = null;

  if (vieneDeFiltro) {
    const vizFiltrada = dataViz.filter(d => {
      const cumpleGenero    = !genero    || d.Género           === genero;
      const cumpleAtributo  = !atributo  || d.Atributo         === atributo;
      const cumpleCodigo    = !codigo    || d.Nombre_Codigo    === codigo;
      const cumpleSubcodigo = !subcodigo || d.Nombre_Sub_Codigo === subcodigo;
      return cumpleGenero && cumpleAtributo && cumpleCodigo && cumpleSubcodigo;
    });

    idDocumentosPermitidos = new Set(vizFiltrada.map(d => d.ID_Documento));
  }

  // =========================
  // ELEMENTOS HTML
  // =========================

  const tablaContainer = document.getElementById("tablaContainer");
  const filtroLugar    = document.getElementById("filtroLugar");
  const filtroCrimen   = document.getElementById("filtroCrimen");
  const busqueda       = document.getElementById("busqueda");

  // =========================
  // DATOS BASE (ya cruzados)
  // =========================

  const datosFiltradosPorViz = idDocumentosPermitidos
    ? dataCrimenes.filter(d => idDocumentosPermitidos.has(d.ID_Documento))
    : dataCrimenes;

  // =========================
  // OPCIONES LUGAR
  // =========================

  const lugares = [...new Set(datosFiltradosPorViz.map(d => d.Lugar))]
    .filter(Boolean).sort();

  lugares.forEach(l => {
    const option = document.createElement("option");
    option.value = l;
    option.textContent = l;
    filtroLugar.append(option);
  });

  // =========================
  // OPCIONES CRIMEN
  // =========================

  const crimenes = [...new Set(datosFiltradosPorViz.map(d => d.crimen))]
    .filter(Boolean).sort();

  crimenes.forEach(c => {
    const option = document.createElement("option");
    option.value = c;
    option.textContent = c;
    filtroCrimen.append(option);
  });

  // =========================
  // BADGE ORIGEN FILTRO
  // =========================

  if (vieneDeFiltro) {
    const contenedor = document.getElementById("filtros-activos");
    if (contenedor) {
      const etiquetas = [
        genero    && `Género: <strong>${genero}</strong>`,
        atributo  && `Atributo: <strong>${atributo}</strong>`,
        codigo    && `Crimen: <strong>${codigo}</strong>`,
        subcodigo && `Subcrimen: <strong>${subcodigo}</strong>`,
      ].filter(Boolean);

      contenedor.innerHTML = `
        <span class="origen-filtro">Filtrado desde visualización →</span>
        ${etiquetas.map(e => `<span class="badge-filtro">${e}</span>`).join("")}
        <button onclick="window.location.href='tablas.html'">✕ Limpiar</button>
      `;
    }
  }

  // =========================
  // RENDER TABLA
  // =========================

  function renderTabla() {
    const lugar  = filtroLugar.value;
    const crimen = filtroCrimen.value;
    const texto  = busqueda.value.toLowerCase();

    const filtrados = datosFiltradosPorViz.filter(d => {
      const cumpleLugar    = !lugar  || d.Lugar  === lugar;
      const cumpleCrimen   = !crimen || d.crimen === crimen;
      const cumpleBusqueda = Object.values(d).join(" ").toLowerCase().includes(texto);
      return cumpleLugar && cumpleCrimen && cumpleBusqueda;
    });

    tablaContainer.innerHTML = `
      <table class="tabla-datos">
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Crímen</th>
            <th>Subcrímen</th>
            <th>Año</th>
            <th>Lugar</th>
          </tr>
        </thead>
        <tbody>
          ${filtrados.map(d => `
            <tr data-caso="${d.ID_Caso}" class="fila-clickeable" title="Ver expediente ${d.ID_Caso}">
              <td>${d.Descripción || ""}</td>
              <td>${d.crimen     || ""}</td>
              <td>${d.subcrimen  || ""}</td>
              <td>${d.Año        || ""}</td>
              <td>${d.Lugar      || ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    tablaContainer.querySelectorAll("tr[data-caso]").forEach(tr => {
      tr.addEventListener("click", () => {
        const casoId = tr.dataset.caso;
        window.location.href = `./casos.html?caso=${encodeURIComponent(casoId)}`;
      });
    });
  }

  // =========================
  // EVENTOS
  // =========================

  filtroLugar.addEventListener("change", renderTabla);
  filtroCrimen.addEventListener("change", renderTabla);
  busqueda.addEventListener("input", renderTabla);

  // =========================
  // INICIAL
  // =========================

  renderTabla();
}