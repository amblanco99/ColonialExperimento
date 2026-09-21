import * as d3 from 'd3';
import { guardarResultados, leerResultados } from './resultadosGuardados.js';

const fmt = (n: number) => n.toLocaleString('de-DE');

/**
 * Filtros que llegan por la URL desde otras visualizaciones ("Ver casos").
 * Cada uno se muestra como una etiqueta que se puede quitar; ver
 * `origen` más abajo.
 */
interface FiltrosOrigen {
  genero: string | null;
  atributo: string | null;
  agente: string | null;
  codigo: string | null;
  subcodigo: string | null;
  lugar: string | null;
  fecha: string | null;
  fechaDesde: string | null;
  fechaHasta: string | null;
  casos: string | null;
}

interface EtiquetaActiva {
  texto: string;
  titulo: string;
  quitar: () => void;
}

export async function crearTabla() {
  const tablaContainerInicial = document.getElementById('tablaContainer');
  if (tablaContainerInicial) {
    tablaContainerInicial.innerHTML = `<p class="cargando">Cargando...</p>`;
  }

  const [dataCrimenesCrudo, dataAgentes, dataLinaje] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/ConteoAgentes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);

  const linajeMap = new Map(dataLinaje.map((d) => [d['ID_Código'], d.Nombre]));

  const tipoDelitoMap = new Map(dataLinaje.map((d) => [d['ID_Código'], d.Tipo_delito]));
  const dataCrimenes = dataCrimenesCrudo.map((d) => {
    const tipoDelito = tipoDelitoMap.get(d['Sub_Código']) ?? tipoDelitoMap.get(d['Código']);
    return Object.assign(d, {
      crimen: linajeMap.get(d['Código']) || '',
      subcrimen: linajeMap.get(d['Sub_Código']) || '',
      esCriminal: tipoDelito === 'Criminal',
    });
  });

  // ConteoAgentes.csv trae un renglón por agente (no por crimen): para
  // traducir un filtro de género/atributo/tipo de agente a los ID_Crímen que
  // debe mostrar la tabla, hay que resolver primero qué agentes cumplen esos
  // filtros y luego, para cada uno, cuáles de sus crímenes relacionados
  // (Relación_crímenes puede traer varios) cumplen además crimen/subcrimen/
  // lugar/fecha — mismo join que usa ComposicionDatos.ts.
  const crimenPorId = new Map(dataCrimenes.map((d) => [d['ID_Crímen'], d]));
  // Ver añoValido en ComposicionDatos.ts: crimenes.csv escribe algunos años
  // faltantes como " " (un espacio), que +valor deja pasar como 0 en vez de
  // NaN.
  function añoValido(valor: string | undefined): number | null {
    const n = +(valor || '').trim();
    return !isNaN(n) && n >= 1500 && n <= 1899 ? n : null;
  }

  const params = new URLSearchParams(window.location.search);
  // Los filtros que trae la URL. Se pueden quitar uno a uno desde su etiqueta
  // (ver etiquetasActivas), así que viven en un objeto que cambia; el conjunto
  // de datos de partida se recalcula cada vez (ver calcularBase).
  const origen: FiltrosOrigen = {
    genero: params.get('genero'),
    atributo: params.get('atributo'),
    agente: params.get('agente'),
    codigo: params.get('codigo'),
    subcodigo: params.get('subcodigo'),
    lugar: params.get('lugar'),
    fecha: params.get('fecha'),
    fechaDesde: params.get('fechaDesde'),
    fechaHasta: params.get('fechaHasta'),
    casos: params.get('casos'),
  };

  // Implementación local; hay otras tres en el proyecto con contratos distintos
  // (ver MIGRATION.md). Esta recibe el número que le pasa el llamante.
  const getDecada = (y: number) => Math.floor(y / 10) * 10;

  // El conjunto de partida según los filtros de la URL. Es la lógica de
  // siempre, sin cambios; solo está en una función para poder recalcularla al
  // quitar una etiqueta.
  function calcularBase() {
    const { genero, atributo, agente, codigo, subcodigo, fecha, fechaDesde, fechaHasta } = origen;
    const lugarParam = origen.lugar;
    const vieneDeFiltro = Object.values(origen).some(Boolean);

    let idDocumentosPermitidos: Set<string> | null = null;
    const idCasosPermitidos = origen.casos
      ? new Set(
          origen.casos
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      : null;

    const hayFiltroAgente = !!(genero || atributo || agente);

    if (!idCasosPermitidos && vieneDeFiltro && hayFiltroAgente) {
      const permitidos = new Set<string>();

      dataAgentes.forEach((a) => {
        const cumpleGenero =
          !genero ||
          (genero === 'Indeterminado'
            ? !a.Género || a.Género.trim() === '' || a.Género === 'Indeterminado' || a.Género === 'null'
            : a.Género === genero);
        const cumpleAtributo = !atributo || a.Atributo === atributo;
        const cumpleAgente = !agente || a.Agente === agente;
        if (!cumpleGenero || !cumpleAtributo || !cumpleAgente) return;

        // Un agente puede tener varios crímenes relacionados (p.ej.
        // "1A, 1B, 1C"): cada uno se evalúa por separado contra
        // crimen/subcrimen/lugar/fecha, y solo esos entran a la tabla — no
        // todos los crímenes del agente por el hecho de que uno califique.
        (a['Relación_crímenes'] || '')
          .split(',')
          .map((c: string) => c.trim())
          .filter(Boolean)
          .forEach((idCrimen: string) => {
            const crimenRow = crimenPorId.get(idCrimen);
            if (!crimenRow) return;

            const cumpleCodigo = !codigo || crimenRow.crimen === codigo;
            const cumpleSubcodigo = !subcodigo || crimenRow.subcrimen === subcodigo;
            const cumpleLugar = !lugarParam || crimenRow.Lugar?.trim() === lugarParam;
            const año = añoValido(crimenRow.Año);
            const cumpleFecha = fecha
              ? año !== null && getDecada(año) === +fecha
              : fechaDesde && fechaHasta
                ? año !== null && getDecada(año) >= +fechaDesde && getDecada(año) <= +fechaHasta
                : true;

            if (cumpleCodigo && cumpleSubcodigo && cumpleLugar && cumpleFecha) {
              permitidos.add(idCrimen);
            }
          });
      });

      idDocumentosPermitidos = permitidos;
    }

    return idCasosPermitidos
      ? dataCrimenes.filter((d) => idCasosPermitidos.has(d.ID_Caso))
      : idDocumentosPermitidos
        ? dataCrimenes.filter((d) => idDocumentosPermitidos.has(d['ID_Crímen']))
        : vieneDeFiltro && !hayFiltroAgente
          ? dataCrimenes.filter((d) => {
              const cumpleCodigo = !codigo || d.crimen === codigo;
              const cumpleSubcodigo = !subcodigo || d.subcrimen === subcodigo;
              const cumpleLugar = !lugarParam || d.Lugar?.trim() === lugarParam;
              const cumpleFecha = fecha
                ? getDecada(+d.Año) === +fecha
                : fechaDesde && fechaHasta
                  ? getDecada(+d.Año) >= +fechaDesde && getDecada(+d.Año) <= +fechaHasta
                  : true;
              return cumpleCodigo && cumpleSubcodigo && cumpleLugar && cumpleFecha;
            })
          : dataCrimenes;
  }

  let datosBase = calcularBase();

  // Todos los elementos están en el marcado de base-de-datos/index.astro. El
  // `!` y los casts preservan el comportamiento: si alguno faltara, esto
  // seguiría reventando igual que antes en vez de saltárselo en silencio.
  const tablaContainer = document.getElementById('tablaContainer')!;
  const filtroLugar = document.getElementById('filtroLugar') as HTMLSelectElement;
  const filtroCrimen = document.getElementById('filtroCrimen') as HTMLSelectElement;
  const busqueda = document.getElementById('busqueda') as HTMLInputElement;
  const filtroCrimenesPenales = document.getElementById(
    'filtroCrimenesPenales',
  ) as HTMLInputElement;
  const filtroAnioDesde = document.getElementById('filtroAnioDesde') as HTMLInputElement;
  const filtroAnioHasta = document.getElementById('filtroAnioHasta') as HTMLInputElement;
  const formulario = document.getElementById('tgFiltros') as HTMLFormElement;
  const slider = document.getElementById('tgSlider')!;
  const marcas = document.getElementById('tgMarcas')!;
  const periodoValor = document.getElementById('tgPeriodoValor')!;
  const contenedorActivos = document.getElementById('filtros-activos')!;
  const conteoNumero = document.getElementById('tgConteo')!;
  const conteoEtiqueta = document.getElementById('tgConteoEtiqueta')!;
  const subtitulo = document.getElementById('tgSubtitulo')!;

  // Lugares y crímenes que se pueden elegir salen del conjunto de partida; al
  // quitar una etiqueta de la URL hay que rehacerlos, conservando la elección
  // si sigue existiendo.
  function poblarSelector(select: HTMLSelectElement, valores: string[], textoTodos: string) {
    const elegido = select.value;
    select.innerHTML = '';
    const todos = document.createElement('option');
    todos.value = '';
    todos.textContent = textoTodos;
    select.append(todos);
    valores.forEach((v) => {
      const option = document.createElement('option');
      option.value = v;
      option.textContent = v;
      select.append(option);
    });
    select.value = valores.includes(elegido) ? elegido : '';
  }

  function poblarSelectores() {
    poblarSelector(
      filtroLugar,
      [...new Set(datosBase.map((d) => d.Lugar))].filter(Boolean).sort(),
      'Todos los lugares',
    );
    poblarSelector(
      filtroCrimen,
      [...new Set(datosBase.map((d) => d.crimen))].filter(Boolean).sort(),
      'Todos los crímenes',
    );
  }
  poblarSelectores();

  // El período cubre todo el archivo: 1550 (el arranque real de los casos
  // coloniales documentados) hasta el último año con datos. Los registros sin
  // fecha (año 0) quedan fuera, igual que antes con el valor inicial de 1550.
  const aniosValidos = dataCrimenes.map((d) => +d.Año).filter((a) => !isNaN(a) && a > 0);
  const ANIO_MIN = aniosValidos.length ? Math.min(...aniosValidos) : 1550;
  const ANIO_MAX = aniosValidos.length ? Math.max(...aniosValidos) : 1824;

  for (const input of [filtroAnioDesde, filtroAnioHasta]) {
    input.min = String(ANIO_MIN);
    input.max = String(ANIO_MAX);
    input.step = '1';
  }
  filtroAnioDesde.value = String(ANIO_MIN);
  filtroAnioHasta.value = String(ANIO_MAX);
  subtitulo.textContent = `Archivo general · ${ANIO_MIN} — ${ANIO_MAX}`;

  // Marcas bajo el control: los extremos y cada 50 años, sin apretar las de
  // los bordes.
  const posicionMarca = (anio: number) => ((anio - ANIO_MIN) / (ANIO_MAX - ANIO_MIN)) * 100;
  const anioMarcas = [
    ANIO_MIN,
    ...d3
      .range(Math.ceil(ANIO_MIN / 50) * 50, ANIO_MAX, 50)
      .filter((a) => a - ANIO_MIN >= 30 && ANIO_MAX - a >= 30),
    ANIO_MAX,
  ];
  anioMarcas.forEach((anio) => {
    const marca = document.createElement('span');
    marca.className = 'tg-marca';
    marca.textContent = String(anio);
    marca.style.left = `${posicionMarca(anio)}%`;
    marcas.append(marca);
  });

  function periodoCompleto() {
    return +filtroAnioDesde.value === ANIO_MIN && +filtroAnioHasta.value === ANIO_MAX;
  }

  function sincronizarSlider() {
    const desde = +filtroAnioDesde.value;
    const hasta = +filtroAnioHasta.value;
    slider.style.setProperty('--desde', `${posicionMarca(desde)}%`);
    slider.style.setProperty('--hasta', `${posicionMarca(hasta)}%`);
    // Si las dos bolitas están en la mitad derecha, la de "desde" va encima
    // para poder moverla hacia la izquierda.
    slider.classList.toggle('tg-slider--desde-encima', desde > (ANIO_MIN + ANIO_MAX) / 2);
    periodoValor.textContent = desde === hasta ? `${desde}` : `${desde} – ${hasta}`;
  }

  // Cambia la URL sin recargar, para que reflejar los filtros de origen que
  // quedan (o ninguno) y que recargar la página conserve lo que se ve.
  function sincronizarUrl() {
    const nuevos = new URLSearchParams();
    (Object.keys(origen) as (keyof FiltrosOrigen)[]).forEach((clave) => {
      const valor = origen[clave];
      if (valor) nuevos.set(clave, valor);
    });
    const consulta = nuevos.toString();
    const ruta = `${window.location.pathname}${consulta ? `?${consulta}` : ''}`;
    window.history.replaceState(null, '', ruta);
  }

  function quitarOrigen(claves: (keyof FiltrosOrigen)[]) {
    claves.forEach((clave) => {
      origen[clave] = null;
    });
    sincronizarUrl();
    datosBase = calcularBase();
    poblarSelectores();
    renderTodo();
  }

  // Todo lo que está filtrando ahora mismo: primero lo que trae la URL, luego
  // lo que se eligió en el panel. Cada uno se puede quitar desde su etiqueta.
  function etiquetasActivas(): EtiquetaActiva[] {
    const lista: EtiquetaActiva[] = [];
    const conOrigen = (claves: (keyof FiltrosOrigen)[], texto: string, titulo: string) =>
      lista.push({ texto, titulo, quitar: () => quitarOrigen(claves) });

    if (origen.casos) {
      const n = origen.casos.split(',').filter((s) => s.trim()).length;
      conOrigen(['casos'], `${fmt(n)} caso(s) en común`, 'Coincidencia de crímenes');
    }
    if (origen.genero) conOrigen(['genero'], `Género: ${origen.genero}`, 'Género');
    if (origen.atributo) conOrigen(['atributo'], `Atributo: ${origen.atributo}`, 'Atributo');
    if (origen.agente) conOrigen(['agente'], `Tipo de agente: ${origen.agente}`, 'Tipo de agente');
    if (origen.codigo) conOrigen(['codigo'], origen.codigo, 'Crimen');
    if (origen.subcodigo) conOrigen(['subcodigo'], `Subcrimen: ${origen.subcodigo}`, 'Subcrimen');
    if (origen.lugar) conOrigen(['lugar'], origen.lugar, 'Lugar');
    if (origen.fecha) {
      conOrigen(['fecha'], origen.fecha, 'Fecha');
    } else if (origen.fechaDesde && origen.fechaHasta) {
      const rango =
        origen.fechaDesde === origen.fechaHasta
          ? origen.fechaDesde
          : `${origen.fechaDesde} – ${origen.fechaHasta}`;
      conOrigen(['fechaDesde', 'fechaHasta'], rango, 'Fecha');
    }

    if (filtroLugar.value) {
      lista.push({
        texto: filtroLugar.value,
        titulo: 'Lugar',
        quitar: () => {
          filtroLugar.value = '';
          renderTodo();
        },
      });
    }
    if (filtroCrimen.value) {
      lista.push({
        texto: filtroCrimen.value,
        titulo: 'Crimen',
        quitar: () => {
          filtroCrimen.value = '';
          renderTodo();
        },
      });
    }
    if (busqueda.value.trim()) {
      lista.push({
        texto: `“${busqueda.value.trim()}”`,
        titulo: 'Búsqueda',
        quitar: () => {
          busqueda.value = '';
          renderTodo();
        },
      });
    }
    if (!periodoCompleto()) {
      lista.push({
        texto: periodoValor.textContent || '',
        titulo: 'Período',
        quitar: () => {
          filtroAnioDesde.value = String(ANIO_MIN);
          filtroAnioHasta.value = String(ANIO_MAX);
          renderTodo();
        },
      });
    }
    return lista;
  }

  function limpiarTodo() {
    (Object.keys(origen) as (keyof FiltrosOrigen)[]).forEach((clave) => {
      origen[clave] = null;
    });
    sincronizarUrl();
    datosBase = calcularBase();
    filtroLugar.value = '';
    filtroCrimen.value = '';
    busqueda.value = '';
    filtroAnioDesde.value = String(ANIO_MIN);
    filtroAnioHasta.value = String(ANIO_MAX);
    poblarSelectores();
    renderTodo();
  }

  function renderActivos() {
    const etiquetas = etiquetasActivas();
    contenedorActivos.hidden = etiquetas.length === 0;
    contenedorActivos.replaceChildren();
    if (etiquetas.length === 0) return;

    const titulo = document.createElement('span');
    titulo.className = 'tg-activos-titulo';
    titulo.textContent = 'Filtros activos:';
    contenedorActivos.append(titulo);

    etiquetas.forEach(({ texto, titulo: tituloEtiqueta, quitar }) => {
      const chip = document.createElement('span');
      chip.className = 'tg-chip';
      chip.title = tituloEtiqueta;

      const textoChip = document.createElement('span');
      textoChip.className = 'tg-chip-texto';
      textoChip.textContent = texto;

      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'tg-chip-quitar';
      boton.textContent = '×';
      boton.setAttribute('aria-label', `Quitar el filtro ${tituloEtiqueta}: ${texto}`);
      boton.addEventListener('click', quitar);

      chip.append(textoChip, boton);
      contenedorActivos.append(chip);
    });

    const limpiar = document.createElement('button');
    limpiar.type = 'button';
    limpiar.className = 'tg-limpiar';
    limpiar.textContent = 'Limpiar todo';
    limpiar.addEventListener('click', limpiarTodo);
    contenedorActivos.append(limpiar);
  }

  type SortKey = 'crimen' | 'subcrimen' | 'Año' | 'Lugar';
  // Por defecto, orden cronológico del caso más viejo al más reciente.
  let sortKey: SortKey = 'Año';
  let sortDir: 'asc' | 'desc' = 'asc';
  // Hasta que el usuario haga clic en un encabezado, ninguna columna se marca
  // como "activa": todas muestran el mismo ícono neutro para que se note que
  // cualquiera se puede ordenar, aunque Año ya esté ordenado por defecto.
  let sortTocado = false;
  let resultadosActuales: typeof dataCrimenes = [];

  function compararFilas(a: (typeof dataCrimenes)[number], b: (typeof dataCrimenes)[number]) {
    if (sortKey === 'Año') {
      const anioA = +a.Año;
      const anioB = +b.Año;
      const validaA = a.Año !== '' && !isNaN(anioA);
      const validaB = b.Año !== '' && !isNaN(anioB);
      // Los casos sin año conocido siempre van al final, sin importar la dirección.
      if (validaA !== validaB) return validaA ? -1 : 1;
      if (!validaA && !validaB) return 0;
      return sortDir === 'asc' ? anioA - anioB : anioB - anioA;
    }
    const valorA = String(a[sortKey] || '');
    const valorB = String(b[sortKey] || '');
    const resultado = valorA.localeCompare(valorB, 'es', { sensitivity: 'base' });
    return sortDir === 'asc' ? resultado : -resultado;
  }

  function renderTabla() {
    const lugar = filtroLugar.value;
    const crimen = filtroCrimen.value;
    const texto = busqueda.value.toLowerCase();
    const anioDesde = filtroAnioDesde.value ? +filtroAnioDesde.value : null;
    const anioHasta = filtroAnioHasta.value ? +filtroAnioHasta.value : null;

    const filtrados = datosBase.filter((d) => {
      const cumpleLugar = !lugar || d.Lugar === lugar;
      const cumpleCrimen = !crimen || d.crimen === crimen;
      const cumpleBusqueda = Object.values(d).join(' ').toLowerCase().includes(texto);
      const cumplePenal = !filtroCrimenesPenales.checked || d.esCriminal;
      const cumpleAnio =
        (anioDesde === null || +d.Año >= anioDesde) && (anioHasta === null || +d.Año <= anioHasta);
      return cumpleLugar && cumpleCrimen && cumpleBusqueda && cumplePenal && cumpleAnio;
    });

    filtrados.sort(compararFilas);
    resultadosActuales = filtrados;

    conteoNumero.textContent = fmt(filtrados.length);
    conteoEtiqueta.textContent =
      filtrados.length === 1 ? 'registro encontrado' : 'registros encontrados';

    const encabezados: { etiqueta: string; key: SortKey | null }[] = [
      { etiqueta: 'Descripción', key: null },
      { etiqueta: 'Crimen', key: 'crimen' },
      { etiqueta: 'Subcrimen', key: 'subcrimen' },
      { etiqueta: 'Año', key: 'Año' },
      { etiqueta: 'Lugar', key: 'Lugar' },
    ];

    tablaContainer.innerHTML = `
      <table class="tabla-datos">
        <thead>
          <tr>
            ${encabezados
              .map(({ etiqueta, key }) => {
                if (!key) return `<th>${etiqueta}</th>`;
                const activo = sortTocado && key === sortKey;
                const icono = activo ? (sortDir === 'asc' ? '▲' : '▼') : '⇅';
                return `<th data-key="${key}" class="th-ordenable${activo ? ' th-ordenable--activo' : ''}">${etiqueta}<span class="orden-icono">${icono}</span></th>`;
              })
              .join('')}
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
      ${filtrados.length === 0 ? '<p class="tg-vacio">Ningún registro coincide con los filtros actuales.</p>' : ''}
    `;

    tablaContainer.querySelectorAll<HTMLElement>('tr[data-caso]').forEach((tr) => {
      tr.addEventListener('click', () => {
        const casoId = tr.dataset.caso;
        guardarResultadosActuales();
        window.location.href = `${import.meta.env.BASE_URL}base-de-datos/caso.html?caso=${encodeURIComponent(casoId!)}`;
      });
    });

    tablaContainer.querySelectorAll<HTMLElement>('th[data-key]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.dataset.key as SortKey;
        if (sortTocado && sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'asc';
        }
        sortTocado = true;
        renderTabla();
      });
    });
  }

  // Deja a la vista del caso lo necesario para "Caso 14 de N", Anterior /
  // Siguiente y para volver a la tabla tal como estaba.
  function guardarResultadosActuales() {
    const conservados = new URLSearchParams(window.location.search);
    conservados.delete('volver');
    const consulta = conservados.toString();
    guardarResultados({
      ids: [...new Set(resultadosActuales.map((d) => d.ID_Caso))],
      urlTabla: `${window.location.pathname}${consulta ? `?${consulta}` : ''}`,
      estado: {
        lugar: filtroLugar.value,
        crimen: filtroCrimen.value,
        texto: busqueda.value,
        desde: filtroAnioDesde.value,
        hasta: filtroAnioHasta.value,
        penal: filtroCrimenesPenales.checked,
        sortKey,
        sortDir,
        sortTocado,
      },
      scrollY: window.scrollY,
    });
  }

  // Al volver desde un caso ("Volver a resultados") se restaura lo que había.
  function restaurarResultados() {
    const guardados = leerResultados();
    if (!guardados) return 0;
    const { estado } = guardados;
    if (estado.lugar && [...filtroLugar.options].some((o) => o.value === estado.lugar)) {
      filtroLugar.value = estado.lugar;
    }
    if (estado.crimen && [...filtroCrimen.options].some((o) => o.value === estado.crimen)) {
      filtroCrimen.value = estado.crimen;
    }
    busqueda.value = estado.texto;
    filtroAnioDesde.value = estado.desde;
    filtroAnioHasta.value = estado.hasta;
    filtroCrimenesPenales.checked = estado.penal;
    sortKey = estado.sortKey as SortKey;
    sortDir = estado.sortDir;
    sortTocado = estado.sortTocado;
    return guardados.scrollY;
  }

  function renderTodo() {
    sincronizarSlider();
    renderActivos();
    renderTabla();
  }

  filtroLugar.addEventListener('change', renderTodo);
  filtroCrimen.addEventListener('change', renderTodo);
  busqueda.addEventListener('input', renderTodo);
  filtroCrimenesPenales.addEventListener('change', renderTodo);

  // Las dos bolitas comparten carril: ninguna puede pasar a la otra.
  filtroAnioDesde.addEventListener('input', () => {
    if (+filtroAnioDesde.value > +filtroAnioHasta.value) {
      filtroAnioDesde.value = filtroAnioHasta.value;
    }
    renderTodo();
  });
  filtroAnioHasta.addEventListener('input', () => {
    if (+filtroAnioHasta.value < +filtroAnioDesde.value) {
      filtroAnioHasta.value = filtroAnioDesde.value;
    }
    renderTodo();
  });

  // Los filtros se aplican al momento; "Buscar" (o Enter) solo confirma y lleva
  // la vista a los resultados, útil cuando el panel ocupa toda la pantalla.
  formulario.addEventListener('submit', (event) => {
    event.preventDefault();
    renderTodo();
    tablaContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const volviendo = params.has('volver');
  const scrollGuardado = volviendo ? restaurarResultados() : 0;
  if (volviendo) sincronizarUrl();

  renderTodo();
  if (volviendo && scrollGuardado) window.scrollTo({ top: scrollGuardado });
}
