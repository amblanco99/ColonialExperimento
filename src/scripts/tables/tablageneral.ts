import * as d3 from 'd3';

export async function crearTabla() {
  const tablaContainerInicial = document.getElementById('tablaContainer');
  if (tablaContainerInicial) {
    tablaContainerInicial.innerHTML = `<p class="cargando">Cargando...</p>`;
  }

  const [dataCrimenesCrudo, dataViz, dataLinaje] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Visualizaciones.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);

  // crimenes.csv ya no trae el nombre del crimen/subcrimen: solo Código y
  // Sub_Código. Se resuelven aquí contra Linaje.csv (ID_Código → Nombre).
  const linajeMap = new Map(dataLinaje.map((d) => [d['ID_Código'], d.Nombre]));

  // Tipo_delito ("Criminal" / "No criminal" / "No aplica") vive en Linaje.csv
  // por ID_Código, tanto para el código raíz como para el sub-código. Cuando
  // difieren, el sub-código manda: es el nivel más específico y en la práctica
  // el código raíz casi nunca marca "Criminal" algo cuyo sub-código no lo sea.
  const tipoDelitoMap = new Map(dataLinaje.map((d) => [d['ID_Código'], d.Tipo_delito]));
  const dataCrimenes = dataCrimenesCrudo.map((d) => {
    const tipoDelito = tipoDelitoMap.get(d['Sub_Código']) ?? tipoDelitoMap.get(d['Código']);
    return Object.assign(d, {
      crimen: linajeMap.get(d['Código']) || '',
      subcrimen: linajeMap.get(d['Sub_Código']) || '',
      esCriminal: tipoDelito === 'Criminal',
    });
  });

  const params = new URLSearchParams(window.location.search);
  const genero = params.get('genero');
  const atributo = params.get('atributo');
  const agente = params.get('agente');
  const codigo = params.get('codigo');
  const subcodigo = params.get('subcodigo');
  const lugarParam = params.get('lugar');
  const fecha = params.get('fecha');
  const fechaDesde = params.get('fechaDesde');
  const fechaHasta = params.get('fechaHasta');
  const casosParam = params.get('casos');
  const vieneDeFiltro = params.toString() !== '';

  // Implementación local; hay otras tres en el proyecto con contratos distintos
  // (ver MIGRATION.md). Esta recibe el número que le pasa el llamante.
  const getDecada = (y: number) => Math.floor(y / 10) * 10;

  let idDocumentosPermitidos = null;
  const idCasosPermitidos = casosParam
    ? new Set(
        casosParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  if (!idCasosPermitidos && vieneDeFiltro) {
    const vizFiltrada = dataViz.filter((d) => {
      const cumpleGenero =
        !genero ||
        (genero === 'Sin información'
          ? !d.Género || d.Género.trim() === '' || d.Género === 'Sin información'
          : d.Género === genero);
      const cumpleAtributo = !atributo || d.Atributo === atributo;
      const cumpleAgente = !agente || d.Agente === agente;
      const cumpleCodigo = !codigo || d.Nombre_Codigo === codigo;
      const cumpleSubcodigo = !subcodigo || d.Nombre_Sub_Codigo === subcodigo;
      const cumpleLugar = !lugarParam || d.Lugar?.trim() === lugarParam;
      const cumpleFecha = fecha
        ? getDecada(+d.Año) === +fecha
        : fechaDesde && fechaHasta
          ? getDecada(+d.Año) >= +fechaDesde && getDecada(+d.Año) <= +fechaHasta
          : true;
      return (
        cumpleGenero &&
        cumpleAtributo &&
        cumpleAgente &&
        cumpleCodigo &&
        cumpleSubcodigo &&
        cumpleLugar &&
        cumpleFecha
      );
    });

    idDocumentosPermitidos = new Set(vizFiltrada.map((d) => d.ID_Documento));
  }

  // Los cuatro están en el marcado de base-de-datos/index.astro. El `!` y los
  // casts preservan el comportamiento: si alguno faltara, esto seguiría
  // reventando igual que antes en vez de saltárselo en silencio.
  const tablaContainer = document.getElementById('tablaContainer')!;
  const filtroLugar = document.getElementById('filtroLugar') as HTMLSelectElement;
  const filtroCrimen = document.getElementById('filtroCrimen') as HTMLSelectElement;
  const busqueda = document.getElementById('busqueda') as HTMLInputElement;
  const filtroCrimenesPenales = document.getElementById('filtroCrimenesPenales') as HTMLInputElement;
  const filtroAnioDesde = document.getElementById('filtroAnioDesde') as HTMLInputElement;
  const filtroAnioHasta = document.getElementById('filtroAnioHasta') as HTMLInputElement;

  const datosFiltradosPorViz = idCasosPermitidos
    ? dataCrimenes.filter((d) => idCasosPermitidos.has(d.ID_Caso))
    : idDocumentosPermitidos
      ? dataCrimenes.filter((d) => idDocumentosPermitidos.has(d['ID_Crímen']))
      : dataCrimenes;

  const lugares = [...new Set(datosFiltradosPorViz.map((d) => d.Lugar))].filter(Boolean).sort();

  lugares.forEach((l) => {
    const option = document.createElement('option');
    option.value = l;
    option.textContent = l;
    filtroLugar.append(option);
  });

  if (lugarParam) filtroLugar.value = lugarParam;

  const crimenes = [...new Set(datosFiltradosPorViz.map((d) => d.crimen))].filter(Boolean).sort();

  crimenes.forEach((c) => {
    const option = document.createElement('option');
    option.value = c;
    option.textContent = c;
    filtroCrimen.append(option);
  });

  const anios = datosFiltradosPorViz.map((d) => +d.Año).filter((a) => !isNaN(a));
  if (anios.length) {
    // El año mínimo real incluye datos sin fecha (0), así que el rango
    // seleccionable llega hasta ahí, pero el valor de inicio por defecto es
    // 1550: el arranque real de los casos coloniales documentados.
    const ANIO_INICIO_POR_DEFECTO = 1550;
    const anioMinimo = Math.min(...anios);
    const anioMaximo = Math.max(...anios);
    filtroAnioDesde.min = filtroAnioHasta.min = String(anioMinimo);
    filtroAnioDesde.max = filtroAnioHasta.max = String(anioMaximo);
    filtroAnioDesde.value = String(Math.max(ANIO_INICIO_POR_DEFECTO, anioMinimo));
    filtroAnioHasta.value = String(anioMaximo);
  }

  if (vieneDeFiltro) {
    const contenedor = document.getElementById('filtros-activos');
    if (contenedor) {
      const etiquetas = [
        idCasosPermitidos &&
          `Coincidencia de crímenes: <strong>${idCasosPermitidos.size} caso(s)</strong>`,
        genero && `Género: <strong>${genero}</strong>`,
        atributo && `Atributo: <strong>${atributo}</strong>`,
        agente && `Tipo de agente: <strong>${agente}</strong>`,
        codigo && `Crimen: <strong>${codigo}</strong>`,
        subcodigo && `Subcrimen: <strong>${subcodigo}</strong>`,
        lugarParam && `Lugar: <strong>${lugarParam}</strong>`,
        fecha
          ? `Fecha: <strong>${fecha}</strong>`
          : fechaDesde && fechaHasta
            ? `Fecha: <strong>${fechaDesde === fechaHasta ? fechaDesde : `${fechaDesde} – ${fechaHasta}`}</strong>`
            : null,
      ].filter(Boolean);

      contenedor.innerHTML = `
        <span class="origen-filtro">Filtrado desde visualización →</span>
        ${etiquetas.map((e) => `<span class="badge-filtro">${e}</span>`).join('')}
        <button onclick="window.location.href='${import.meta.env.BASE_URL}base-de-datos/index.html'">✕ Limpiar</button>
      `;
    }
  }

  function renderTabla() {
    const lugar = filtroLugar.value;
    const crimen = filtroCrimen.value;
    const texto = busqueda.value.toLowerCase();
    const anioDesde = filtroAnioDesde.value ? +filtroAnioDesde.value : null;
    const anioHasta = filtroAnioHasta.value ? +filtroAnioHasta.value : null;

    const filtrados = datosFiltradosPorViz.filter((d) => {
      const cumpleLugar = !lugar || d.Lugar === lugar;
      const cumpleCrimen = !crimen || d.crimen === crimen;
      const cumpleBusqueda = Object.values(d).join(' ').toLowerCase().includes(texto);
      const cumplePenal = !filtroCrimenesPenales.checked || d.esCriminal;
      const cumpleAnio =
        (anioDesde === null || +d.Año >= anioDesde) && (anioHasta === null || +d.Año <= anioHasta);
      return cumpleLugar && cumpleCrimen && cumpleBusqueda && cumplePenal && cumpleAnio;
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
          ${filtrados
            .map(
              (d) => `
            <tr data-caso="${d.ID_Caso}" class="fila-clickeable" title="Ver expediente ${d.ID_Caso}">
              <td>${d.Descripción || ''}</td>
              <td>${d.crimen || ''}</td>
              <td>${d.subcrimen || ''}</td>
              <td>${d.Año || ''}</td>
              <td>${d.Lugar || ''}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    `;

    tablaContainer.querySelectorAll<HTMLElement>('tr[data-caso]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const casoId = tr.dataset.caso;
        window.location.href = `${import.meta.env.BASE_URL}base-de-datos/caso.html?caso=${encodeURIComponent(casoId!)}`;
      });
    });
  }

  filtroLugar.addEventListener('change', renderTabla);
  filtroCrimen.addEventListener('change', renderTabla);
  busqueda.addEventListener('input', renderTabla);
  filtroCrimenesPenales.addEventListener('change', renderTabla);
  filtroAnioDesde.addEventListener('input', renderTabla);
  filtroAnioHasta.addEventListener('input', renderTabla);

  renderTabla();
}
