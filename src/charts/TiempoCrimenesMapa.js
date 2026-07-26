import * as d3 from "d3";
import rewind from "@turf/rewind";

const SERIE_FALLBACK = [
  "#bb4e99", "#4e9bbb", "#e8a838", "#56b87e",
  "#e05a5a", "#7b5ea7", "#3ab8b0", "#d4784e",
  "#6a8fce", "#a05080",
];

function leerVariableCss(nombre, fallback) {
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  return valor || fallback;
}

export async function inicializarDashboard() {
  const PALETA = {
    fondoPergamino: leerVariableCss("--mapa-fondo-pergamino", "#f4ecd8"),
    panel: leerVariableCss("--mapa-panel", "#efe4c8"),
    tierra: leerVariableCss("--mapa-tierra", "#e8dcc0"),
    borde: leerVariableCss("--mapa-borde", "#6b4f2a"),
    tintaOscura: leerVariableCss("--mapa-tinta-oscura", "#3a2d1a"),
    acentoLinea: leerVariableCss("--mapa-acento-linea", "#bb4e99"),
    acentoSecundario: leerVariableCss("--mapa-acento-secundario", "#4e9bbb"),
    tarjetaFondo: leerVariableCss("--mapa-tarjeta-fondo", "#fdf8ec"),
  };

  const COLORES_SERIE = SERIE_FALLBACK.map((valor, i) => leerVariableCss(`--mapa-serie-${i + 1}`, valor));

  const [NuevaGranadaRaw, rawViz, rawLugar, rawLinaje] = await Promise.all([
    d3.json(`${import.meta.env.BASE_URL}/data/NuevaGranada.json`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Lugar.csv`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Linaje.csv`),
  ]);

  const NuevaGranada = rewind(NuevaGranadaRaw, { reverse: true });

  const SIGLOS = ["Siglo XVI", "Siglo XVII", "Siglo XVIII", "Siglo XIX"];

  const getSiglo = y => {
    if (y >= 1500 && y <= 1599) return "Siglo XVI";
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800 && y <= 1899) return "Siglo XIX";
    return null;
  };

  const getDecada = y => Math.floor(y / 10) * 10;

  const coordPorLugar = {};
  rawLugar.forEach(d => {
    const nombre = d.Lugar?.trim();
    const lon = +d.Longitud;
    const lat = +d.Latitud;
    if (nombre && !isNaN(lon) && !isNaN(lat)) {
      coordPorLugar[nombre] = [lon, lat];
    }
  });

  const datosLimpios = rawViz
    .filter(d => d.Año && d.Nombre_Codigo && d.ID_Documento && d.Lugar && d.Nombre_Sub_Codigo)
    .map(d => ({
      ...d,
      año: +d.Año,
      siglo: getSiglo(+d.Año),
      decada: getDecada(+d.Año),
      lugar: d.Lugar.trim(),
      coords: coordPorLugar[d.Lugar.trim()] || null,
    }))
    .filter(d => d.siglo);

  const DECADAS = [...new Set(datosLimpios.map(d => d.decada))].sort((a, b) => a - b);

  const linajeFilas = rawLinaje.map(d => ({
    idCodigo: (d["ID_Código"] || "").trim(),
    nombre: (d.Nombre || "").trim(),
    nivel: (d.Nivel || "").trim(),
  }));
  const nombresGenerales = new Set(
    linajeFilas.filter(f => f.nivel === "Nivel 0").map(f => f.nombre)
  );
  const ordenPorCodigo = new Map(linajeFilas.map((f, i) => [f.idCodigo, i]));

  const codigoPorNombreSub = new Map();
  datosLimpios.forEach(d => {
    if (d.Nombre_Sub_Codigo && !codigoPorNombreSub.has(d.Nombre_Sub_Codigo)) {
      codigoPorNombreSub.set(d.Nombre_Sub_Codigo, (d["Sub_Código"] || "").trim());
    }
  });

  function compararPorLinaje(a, b) {
    const oa = ordenPorCodigo.get(codigoPorNombreSub.get(a)) ?? Number.MAX_SAFE_INTEGER;
    const ob = ordenPorCodigo.get(codigoPorNombreSub.get(b)) ?? Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return a.localeCompare(b);
  }

  function getProvincia(coords) {
    const features = NuevaGranada.features ? NuevaGranada.features : [NuevaGranada];
    const feature = features.find(f => d3.geoContains(f, coords));
    return feature ? (feature.properties?.Nombre || "Desconocida") : "Desconocida";
  }

  const lugaresLista = [...new Set(datosLimpios.map(d => d.lugar))].sort();
  const subcrimenesLista = [...new Set(
    datosLimpios.filter(d => !nombresGenerales.has(d.Nombre_Sub_Codigo)).map(d => d.Nombre_Sub_Codigo)
  )].sort(compararPorLinaje);
  const crimenesLista = [...new Set(datosLimpios.map(d => d.Nombre_Codigo))].sort();

  const estado = {
    modoTiempo: "siglo",
    tiempoIdx: SIGLOS.indexOf("Siglo XVII"),
    crimen: "Todos",
    subcrimen: "Todos",
    lugar: "Todos",
    lugaresFijados: new Set(),
  };

  function tiempoListaActual() {
    return estado.modoTiempo === "siglo" ? SIGLOS : DECADAS;
  }
  function valorTiempoActual() {
    return tiempoListaActual()[estado.tiempoIdx];
  }
  function campoTiempoActual() {
    return estado.modoTiempo === "siglo" ? "siglo" : "decada";
  }

  function irATablasFiltradas(overrides = {}) {
    if (overrides.casos) {
      const params = new URLSearchParams();
      params.set("casos", overrides.casos.join(","));
      window.location.href = `../base-de-datos/index.html?${params.toString()}`;
      return;
    }

    const lugar = "lugar" in overrides ? overrides.lugar : (estado.lugar !== "Todos" ? estado.lugar : null);
    const codigo = "codigo" in overrides ? overrides.codigo : (estado.crimen !== "Todos" ? estado.crimen : null);
    const subcodigo = "subcodigo" in overrides ? overrides.subcodigo : (estado.subcrimen !== "Todos" ? estado.subcrimen : null);
    const fecha = "fecha" in overrides ? overrides.fecha : valorTiempoActual();
    const escala = "escala" in overrides ? overrides.escala : campoTiempoActual();

    const params = new URLSearchParams();
    if (lugar) params.set("lugar", lugar);
    if (codigo) params.set("codigo", codigo);
    if (subcodigo) params.set("subcodigo", subcodigo);
    if (fecha != null) {
      params.set("fecha", fecha);
      params.set("escala", escala);
    }
    window.location.href = `../base-de-datos/index.html?${params.toString()}`;
  }

  function crearBotonVerCasos() {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "btn-mapa-ver-casos";
    let handlerActivo = null;
    boton.addEventListener("click", () => {
      if (handlerActivo) handlerActivo();
    });

    function ocultar() {
      boton.classList.remove("btn-mapa--visible");
      handlerActivo = null;
    }
    function mostrar(texto, handler) {
      boton.textContent = `Ver casos: ${texto}`;
      boton.classList.add("btn-mapa--visible");
      handlerActivo = handler;
    }
    return { boton, mostrar, ocultar };
  }

  function datosFiltradosBase() {
    return datosLimpios.filter(d => {
      const okCrimen = estado.crimen === "Todos" || d.Nombre_Codigo === estado.crimen;
      const okSub = estado.subcrimen === "Todos" || d.Nombre_Sub_Codigo === estado.subcrimen;
      const okLugar = estado.lugar === "Todos" || d.lugar === estado.lugar;
      return okCrimen && okSub && okLugar;
    });
  }

  function datosReferenciaLugar(lugar) {
    const campo = campoTiempoActual();
    const valor = valorTiempoActual();
    const filas = datosFiltradosBase().filter(d => d.lugar === lugar && d[campo] === valor);

    const map = {};
    filas.forEach(d => {
      const key = estado.crimen === "Todos"
        ? d.Nombre_Codigo
        : (nombresGenerales.has(d.Nombre_Sub_Codigo) ? d.Nombre_Codigo : d.Nombre_Sub_Codigo);
      if (!map[key]) map[key] = new Set();
      map[key].add(`${d.ID_Documento}|${d.Sub_Código}`);
    });

    return Object.entries(map)
      .map(([nombre, set]) => ({ nombre, casos: set.size }))
      .sort((a, b) => b.casos - a.casos);
  }

  function agruparMapaInstante() {
    const campo = campoTiempoActual();
    const valor = valorTiempoActual();
    const filas = datosFiltradosBase().filter(
      d => d[campo] === valor && d.coords && !isNaN(d.coords[0]) && !isNaN(d.coords[1])
    );

    const map = {};
    filas.forEach(d => {
      const key = d.lugar;
      if (!map[key]) {
        map[key] = {
          lugar: d.lugar,
          coords: d.coords,
          docs: new Set(),
        };
      }
      map[key].docs.add(d.ID_Documento);
    });

    return Object.values(map).map(r => ({
      ...r,
      count: r.docs.size,
    }));
  }

  const mapaContenedor = document.getElementById("mapa-contenedor");
  if (!mapaContenedor) return;
  const contenedorLineasEl = document.getElementById("crimenesChart");
  const dashboardWrap = mapaContenedor.parentElement;

  const contenedorGrafoEl = document.createElement("div");
  contenedorGrafoEl.id = "grafoRelacionContenedor";

  const mainContenedor = document.querySelector("main.container");
  if (mainContenedor) {
    mainContenedor.classList.add("mapa-main-ancho");
  }

  function envolverEnTarjeta(el, titulo, subtitulo) {
    const tarjeta = document.createElement("div");
    tarjeta.className = "mapa-tarjeta";
    const encabezado = document.createElement("div");
    encabezado.className = "mapa-tarjeta-encabezado";
    const h = document.createElement("div");
    h.textContent = titulo;
    h.className = "mapa-tarjeta-titulo";
    encabezado.appendChild(h);
    if (subtitulo) {
      const sub = document.createElement("div");
      sub.textContent = subtitulo;
      sub.className = "mapa-tarjeta-subtitulo";
      encabezado.appendChild(sub);
    }
    tarjeta.appendChild(encabezado);
    const divisor = document.createElement("div");
    divisor.className = "mapa-tarjeta-divisor";
    tarjeta.appendChild(divisor);
    tarjeta.appendChild(el);
    return tarjeta;
  }

  let panelFiltros = document.getElementById("panel-filtros");
  if (!panelFiltros) {
    panelFiltros = document.createElement("div");
    panelFiltros.id = "panel-filtros";
  }

  let columnaViz = document.getElementById("columna-visualizaciones");
  if (!columnaViz) {
    columnaViz = document.createElement("div");
    columnaViz.id = "columna-visualizaciones";
  }
  columnaViz.classList.add("mapa-columna-viz");

  const columnaIzquierda = document.createElement("div");
  columnaIzquierda.id = "columna-izquierda";
  columnaIzquierda.className = "mapa-columna-izquierda";

  function paraColumnaVertical(tarjeta) {
    tarjeta.classList.add("mapa-tarjeta--vertical");
    return tarjeta;
  }

  if (contenedorLineasEl) {
    columnaIzquierda.appendChild(
      paraColumnaVertical(
        envolverEnTarjeta(contenedorLineasEl, "Evolución en el tiempo", "Casos por siglo o década según las selecciones")
      )
    );
  }
  columnaIzquierda.appendChild(
    paraColumnaVertical(
      envolverEnTarjeta(
        contenedorGrafoEl,
        "Relación entre crímenes",
        "Crímenes cometidos en un mismo caso · Selecciona los filtros para una visión granular"
      )
    )
  );

  columnaViz.appendChild(columnaIzquierda);
  columnaViz.appendChild(
    envolverEnTarjeta(mapaContenedor, "Distribución geográfica", "Haz clic en un punto para fijarlo y compararlo")
  );

  if (dashboardWrap) {
    dashboardWrap.classList.add("mapa-dashboard-wrap");
    dashboardWrap.appendChild(panelFiltros);
    dashboardWrap.appendChild(columnaViz);
  }

  let barraModoTiempo = document.getElementById("barra-modo-tiempo");
  if (!barraModoTiempo) {
    barraModoTiempo = document.createElement("div");
    barraModoTiempo.id = "barra-modo-tiempo";
  }
  barraModoTiempo.className = "mapa-barra-modo-tiempo";

  const MODOS_TIEMPO = [
    { modo: "decada", etiqueta: "Década" },
    { modo: "siglo", etiqueta: "Siglo" },
  ];
  const botonesModoTiempo = {};
  MODOS_TIEMPO.forEach(({ modo, etiqueta }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = etiqueta;
    btn.className = "btn-mapa-modo";
    btn.addEventListener("click", () => cambiarModoTiempo(modo));
    botonesModoTiempo[modo] = btn;
    barraModoTiempo.appendChild(btn);
  });

  if (dashboardWrap && dashboardWrap.parentElement) {
    dashboardWrap.parentElement.insertBefore(barraModoTiempo, dashboardWrap);
  }

  mapaContenedor.classList.add("mapa-panel-ancho-completo");
  if (contenedorLineasEl) {
    contenedorLineasEl.classList.add("mapa-panel-ancho-completo");
  }

  panelFiltros.classList.add("panel-filtros-mapa");

  const tituloPanel = document.createElement("div");
  tituloPanel.textContent = "Filtros";
  tituloPanel.className = "panel-filtros-titulo";
  panelFiltros.appendChild(tituloPanel);

  function crearComboBuscable({ etiqueta, opciones, valorInicial, onChange, notaVacia }) {
    const wrap = document.createElement("div");
    wrap.className = "filtro-combo";

    const label = document.createElement("label");
    label.textContent = etiqueta;
    label.className = "filtro-label";

    const input = document.createElement("input");
    input.type = "text";
    input.value = valorInicial;
    input.readOnly = true;
    input.className = "filtro-combo-input";

    const lista = document.createElement("ul");
    lista.className = "filtro-combo-lista";

    const nota = document.createElement("div");
    nota.className = "filtro-combo-nota";

    let opcionesCompletas = ["Todos", ...opciones];

    function pintarLista(filtro) {
      lista.innerHTML = "";
      const f = filtro.trim().toLowerCase();
      const filtradas = f
        ? opcionesCompletas.filter(o => o.toLowerCase().includes(f))
        : opcionesCompletas;
      filtradas.slice(0, 200).forEach(op => {
        const li = document.createElement("li");
        li.textContent = op;
        li.className = "filtro-combo-item";
        li.addEventListener("mousedown", e => e.preventDefault());
        li.addEventListener("click", () => {
          input.value = op;
          lista.classList.remove("filtro-combo-lista--abierta");
          input.blur();
          onChange(op);
        });
        lista.appendChild(li);
      });
    }

    input.addEventListener("click", () => {
      input.readOnly = false;
      const valorActual = input.value;
      input.value = "";
      pintarLista("");
      lista.classList.add("filtro-combo-lista--abierta");
      input.dataset.valorPrevio = valorActual;
    });

    input.addEventListener("input", () => pintarLista(input.value));

    input.addEventListener("blur", () => {
      setTimeout(() => {
        lista.classList.remove("filtro-combo-lista--abierta");
        input.readOnly = true;
        if (!opcionesCompletas.includes(input.value)) {
          input.value = input.dataset.valorPrevio || valorInicial;
        }
      }, 100);
    });

    wrap.append(label, input, lista, nota);
    panelFiltros.appendChild(wrap);

    function actualizarOpciones(nuevasOpciones) {
      opcionesCompletas = ["Todos", ...nuevasOpciones];
      input.value = "Todos";
      if (nuevasOpciones.length === 0) {
        input.classList.add("filtro-combo-input--oculto");
        nota.textContent = notaVacia || "Sin opciones disponibles para la selección actual.";
        nota.classList.add("filtro-combo-nota--visible");
      } else {
        input.classList.remove("filtro-combo-input--oculto");
        nota.classList.remove("filtro-combo-nota--visible");
      }
    }

    return { wrap, actualizarOpciones };
  }

  const wrapTiempo = document.createElement("div");
  wrapTiempo.className = "mapa-wrap-tiempo";

  const labelTiempo = document.createElement("label");
  labelTiempo.textContent = "Fecha";
  labelTiempo.className = "filtro-label";

  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "mapa-slider";

  const filaSiglos = document.createElement("div");
  filaSiglos.className = "mapa-fila-siglos";
  const botonesSiglo = {};
  SIGLOS.forEach(siglo => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = siglo.replace("Siglo ", "");
    btn.className = "btn-mapa-siglo";
    btn.addEventListener("click", () => {
      estado.tiempoIdx = SIGLOS.indexOf(siglo);
      sincronizarSlider();
      actualizarMapa();
      actualizarGrafoRelacion();
    });
    botonesSiglo[siglo] = btn;
    filaSiglos.appendChild(btn);
  });

  const etiquetaTiempo = document.createElement("div");
  etiquetaTiempo.className = "mapa-etiqueta-tiempo";

  function sincronizarSlider() {
    const lista = tiempoListaActual();
    const esSiglo = estado.modoTiempo === "siglo";
    slider.min = 0;
    slider.max = lista.length - 1;
    slider.step = 1;
    slider.value = estado.tiempoIdx;
    slider.classList.toggle("mapa-slider--oculto", esSiglo);
    filaSiglos.classList.toggle("mapa-fila-siglos--oculta", !esSiglo);
    etiquetaTiempo.textContent = valorTiempoActual();
    Object.entries(botonesModoTiempo).forEach(([modo, btn]) => {
      btn.classList.toggle("btn-mapa--activo", estado.modoTiempo === modo);
    });
    Object.entries(botonesSiglo).forEach(([siglo, btn]) => {
      btn.classList.toggle("btn-mapa--activo", esSiglo && valorTiempoActual() === siglo);
    });
  }

  function añoRepresentativoActual() {
    const valor = valorTiempoActual();
    if (estado.modoTiempo === "siglo") {
      const base = { "Siglo XVI": 1550, "Siglo XVII": 1650, "Siglo XVIII": 1750, "Siglo XIX": 1850 };
      return base[valor] ?? 1650;
    }
    return valor;
  }

  function indiceMasCercano(lista, valor) {
    let mejorIdx = 0;
    let mejorDist = Infinity;
    lista.forEach((v, i) => {
      const dist = Math.abs(v - valor);
      if (dist < mejorDist) { mejorDist = dist; mejorIdx = i; }
    });
    return mejorIdx;
  }

  function cambiarModoTiempo(modo) {
    if (estado.modoTiempo === modo) return;
    const añoRef = añoRepresentativoActual();
    estado.modoTiempo = modo;
    if (modo === "siglo") {
      const siglo = getSiglo(añoRef) || SIGLOS[0];
      estado.tiempoIdx = Math.max(0, SIGLOS.indexOf(siglo));
    } else {
      estado.tiempoIdx = indiceMasCercano(DECADAS, getDecada(añoRef));
    }
    sincronizarSlider();
    actualizarMapa();
    actualizarPanelSecundario(true);
    actualizarGrafoRelacion();
  }

  slider.addEventListener("input", () => {
    estado.tiempoIdx = +slider.value;
    etiquetaTiempo.textContent = valorTiempoActual();
    actualizarMapa();
    actualizarGrafoRelacion();
  });

  wrapTiempo.append(labelTiempo, slider, filaSiglos, etiquetaTiempo);
  panelFiltros.appendChild(wrapTiempo);

  function subcrimenesParaCrimen(crimen) {
    if (crimen === "Todos") return subcrimenesLista;
    return [...new Set(
      datosLimpios
        .filter(d => d.Nombre_Codigo === crimen && !nombresGenerales.has(d.Nombre_Sub_Codigo))
        .map(d => d.Nombre_Sub_Codigo)
    )].sort(compararPorLinaje);
  }

  const wrapCrimen = document.createElement("div");
  wrapCrimen.className = "mapa-wrap-crimen";
  const labelCrimen = document.createElement("label");
  labelCrimen.textContent = "Crimen";
  labelCrimen.className = "filtro-label";
  const selectCrimen = document.createElement("select");
  selectCrimen.className = "filtro-select";
  ["Todos", ...crimenesLista].forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    selectCrimen.appendChild(opt);
  });
  selectCrimen.value = estado.crimen;
  selectCrimen.addEventListener("change", e => {
    estado.crimen = e.target.value;
    estado.subcrimen = "Todos";
    comboSubcrimen.actualizarOpciones(subcrimenesParaCrimen(estado.crimen));
    actualizarMapa();
    actualizarPanelSecundario(true);
  });
  wrapCrimen.append(labelCrimen, selectCrimen);
  panelFiltros.appendChild(wrapCrimen);

  const comboSubcrimen = crearComboBuscable({
    etiqueta: "Subcrimen",
    opciones: subcrimenesParaCrimen(estado.crimen),
    valorInicial: estado.subcrimen,
    notaVacia: "Este crimen no tiene subcrímenes registrados.",
    onChange: valor => {
      estado.subcrimen = valor;
      actualizarMapa();
      actualizarPanelSecundario(true);
    },
  });

  crearComboBuscable({
    etiqueta: "Lugar",
    opciones: lugaresLista,
    valorInicial: estado.lugar,
    onChange: valor => {
      estado.lugar = valor;
      actualizarMapa();
    },
  });

  const btnLimpiarPines = document.createElement("button");
  btnLimpiarPines.type = "button";
  btnLimpiarPines.textContent = "Quitar comparaciones";
  btnLimpiarPines.className = "btn-mapa-limpiar";
  btnLimpiarPines.addEventListener("click", () => {
    estado.lugaresFijados.clear();
    btnLimpiarPines.classList.remove("btn-mapa--visible");
    actualizarMapa();
    actualizarPanelSecundario(true);
  });
  panelFiltros.appendChild(btnLimpiarPines);

  const avisoSinDatos = document.createElement("div");
  avisoSinDatos.className = "filtro-aviso-sin-datos";
  panelFiltros.appendChild(avisoSinDatos);

  function actualizarAvisoLugar() {
    if (estado.lugar === "Todos") {
      avisoSinDatos.classList.remove("filtro-aviso-sin-datos--visible");
      return;
    }
    const campo = campoTiempoActual();
    const valor = valorTiempoActual();
    const hayDatos = datosFiltradosBase().some(d => d.lugar === estado.lugar && d[campo] === valor);
    if (hayDatos) {
      avisoSinDatos.classList.remove("filtro-aviso-sin-datos--visible");
    } else {
      avisoSinDatos.textContent = `No hay datos para "${estado.lugar}" en ${valor}.`;
      avisoSinDatos.classList.add("filtro-aviso-sin-datos--visible");
    }
  }

  sincronizarSlider();

  const width = 760;
  const height = 820;

  const RADIO_PUNTO = 2;
  const PUNTO_COLOR = leerVariableCss("--mapa-punto-color", "#7b5ea7");
  const rScale = d3.scaleLog().range([RADIO_PUNTO, 18]);
  const colorScaleMap = d3.scaleSequentialLog(
    d3.interpolateHcl(PALETA.acentoSecundario, PALETA.acentoLinea)
  );
  let escalarPorCantidad = false;

  const botonVerCasosMapa = crearBotonVerCasos();
  botonVerCasosMapa.boton.classList.add("btn-mapa-ver-casos--separado");
  mapaContenedor.appendChild(botonVerCasosMapa.boton);

  const btnEscalarTamanio = document.createElement("button");
  btnEscalarTamanio.type = "button";
  btnEscalarTamanio.textContent = "Tamaño según cantidad de crímenes";
  btnEscalarTamanio.className = "btn-mapa-escalar";
  function actualizarEstiloBotonEscalar() {
    btnEscalarTamanio.classList.toggle("btn-mapa--activo", escalarPorCantidad);
  }
  btnEscalarTamanio.addEventListener("click", () => {
    escalarPorCantidad = !escalarPorCantidad;
    actualizarEstiloBotonEscalar();
    actualizarMapa();
  });
  actualizarEstiloBotonEscalar();
  mapaContenedor.appendChild(btnEscalarTamanio);

  const svgMapa = d3.select(mapaContenedor)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("class", "mapa-svg");

  const domainFeature = {
    type: "Feature",
    geometry: { type: "MultiPoint", coordinates: [[-83, -5], [-60, 12]] },
  };

  const projection = d3.geoMercator().fitExtent([[0, 0], [width, height]], domainFeature);
  const path = d3.geoPath(projection);
  const gZoom = svgMapa.append("g").attr("class", "capa-zoom");
  const gMapaBase = gZoom.append("g").attr("class", "capa-mapa");

  gMapaBase.selectAll("path")
    .data(NuevaGranada.features ? NuevaGranada.features : [NuevaGranada])
    .join("path")
    .attr("d", path)
    .attr("fill", PALETA.tierra)
    .attr("stroke", PALETA.borde)
    .attr("stroke-opacity", 0.7);

  const gPuntos = gZoom.append("g").attr("class", "capa-puntos");
  const gCapsulas = gZoom.append("g").attr("class", "capa-capsulas");

  let lugarHoverActivo = null;

  const zoom = d3.zoom()
    .scaleExtent([1, 12])
    .on("zoom", event => {
      gZoom.attr("transform", event.transform);
      const k = event.transform.k;
      gMapaBase.selectAll("path").attr("stroke-width", 0.5 / k);
      gPuntos.selectAll("circle").attr("stroke-width", 0.5 / k);
      dibujarCapsulasFijadas();
      if (lugarHoverActivo) {
        gCapsulas.selectAll("g.capsula-hover").remove();
        const gTemp = gCapsulas.append("g").attr("class", "capsula-hover");
        construirCapsula(gTemp, lugarHoverActivo.lugar, lugarHoverActivo.coords);
      }
    });

  svgMapa.call(zoom);

  let seleccionFilaMapa = null;

  function redibujarCapsulasVisibles() {
    dibujarCapsulasFijadas();
    const gHover = gCapsulas.select("g.capsula-hover");
    if (!gHover.empty() && lugarHoverActivo) {
      construirCapsula(gHover, lugarHoverActivo.lugar, lugarHoverActivo.coords);
    }
  }

  function limpiarSeleccionFilaMapa() {
    seleccionFilaMapa = null;
    botonVerCasosMapa.ocultar();
    redibujarCapsulasVisibles();
  }

  function seleccionarFilaCapsula(lugar, nombreFila) {
    if (seleccionFilaMapa && seleccionFilaMapa.lugar === lugar && seleccionFilaMapa.nombre === nombreFila) {
      limpiarSeleccionFilaMapa();
      return;
    }
    seleccionFilaMapa = { lugar, nombre: nombreFila };
    redibujarCapsulasVisibles();
    botonVerCasosMapa.mostrar(`${nombreFila} · ${lugar}`, () => {
      if (estado.crimen === "Todos") {
        irATablasFiltradas({ lugar, codigo: nombreFila });
      } else if (nombreFila === estado.crimen) {
        irATablasFiltradas({ lugar, codigo: estado.crimen, subcodigo: null });
      } else {
        irATablasFiltradas({ lugar, codigo: estado.crimen, subcodigo: nombreFila });
      }
    });
  }

  function medirCapsula(lugar) {
    const referencia = datosReferenciaLugar(lugar);
    const filasVisibles = referencia.slice(0, 5);
    const totalCasos = referencia.reduce((a, r) => a + r.casos, 0);
    const anchoC = 215;
    const altoC = totalCasos === 0 ? 56 : 38 + filasVisibles.length * 20;
    return { referencia, filasVisibles, totalCasos, anchoC, altoC };
  }

  function construirCapsula(g, lugar, coords, posOverride) {
    const { filasVisibles, totalCasos, anchoC, altoC } = medirCapsula(lugar);
    const provincia = getProvincia(coords);

    const k = d3.zoomTransform(svgMapa.node()).k;
    const px = projection(coords)[0];
    const py = projection(coords)[1];
    const destino = posOverride || { x: px - (anchoC / 2) / k, y: py - (altoC + 16) / k };
    g.attr("transform", `translate(${destino.x}, ${destino.y}) scale(${1 / k})`);
    g.selectAll("*").remove();

    const puntaLocalX = anchoC / 2;
    const puntaLocalY = altoC;
    const puntoLocalX = (px - destino.x) * k;
    const puntoLocalY = (py - destino.y) * k;
    if (Math.abs(puntoLocalX - puntaLocalX) > 1 || Math.abs(puntoLocalY - (puntaLocalY + 8)) > 1) {
      g.append("line")
        .attr("x1", puntaLocalX).attr("y1", puntaLocalY + 4)
        .attr("x2", puntoLocalX).attr("y2", puntoLocalY)
        .attr("class", "mapa-capsula-linea-guia");
      g.append("circle")
        .attr("cx", puntoLocalX).attr("cy", puntoLocalY).attr("r", 3)
        .attr("class", "mapa-capsula-punto-guia");
    }

    g.append("rect")
      .attr("width", anchoC)
      .attr("height", altoC)
      .attr("rx", 5)
      .attr("class", "mapa-capsula-fondo mapa-capsula-fondo--interactivo");

    g.append("text")
      .attr("x", 10).attr("y", 16)
      .attr("class", "mapa-capsula-titulo")
      .text(lugar.length > 26 ? lugar.slice(0, 24) + "…" : lugar);

    g.append("text")
      .attr("x", 10).attr("y", 30)
      .attr("class", "mapa-capsula-subtitulo")
      .text(`${provincia} · ${valorTiempoActual()}`);

    if (totalCasos === 0) {
      g.append("text")
        .attr("x", anchoC / 2).attr("y", altoC - 16)
        .attr("text-anchor", "middle")
        .attr("class", "mapa-capsula-sin-casos")
        .text("Sin casos");
    } else {
      const maxCasos = d3.max(filasVisibles, d => d.casos) || 1;
      const xBarra = d3.scaleLinear().domain([0, maxCasos]).range([0, 60]);
      filasVisibles.forEach((r, i) => {
        const yRow = 38 + i * 20;
        const filaSeleccionada = !!(seleccionFilaMapa && seleccionFilaMapa.lugar === lugar && seleccionFilaMapa.nombre === r.nombre);
        g.append("text")
          .attr("x", 10).attr("y", yRow + 10)
          .attr("class", `mapa-capsula-fila-texto${filaSeleccionada ? " mapa-capsula-fila-texto--activa" : ""}`)
          .text(r.nombre.length > 18 ? r.nombre.slice(0, 16) + "…" : r.nombre);
        g.append("rect")
          .attr("x", 122).attr("y", yRow + 2)
          .attr("width", xBarra(r.casos)).attr("height", 9).attr("rx", 2)
          .attr("class", "mapa-capsula-barra")
          .attr("stroke", filaSeleccionada ? "#fff" : "none")
          .attr("stroke-width", filaSeleccionada ? 1 : 0);
        g.append("text")
          .attr("x", anchoC - 10).attr("y", yRow + 10)
          .attr("text-anchor", "end")
          .attr("class", "mapa-capsula-fila-conteo")
          .text(r.casos);

        g.append("rect")
          .attr("x", 0).attr("y", yRow - 3)
          .attr("width", anchoC).attr("height", 20)
          .attr("class", "mapa-capsula-fila-clic")
          .attr("fill", filaSeleccionada ? "rgba(255,255,255,0.16)" : "transparent")
          .on("mouseenter", function () { if (!filaSeleccionada) d3.select(this).attr("fill", "rgba(255,255,255,0.08)"); })
          .on("mouseleave", function () { if (!filaSeleccionada) d3.select(this).attr("fill", "transparent"); })
          .on("click", event => {
            event.stopPropagation();
            seleccionarFilaCapsula(lugar, r.nombre);
          });
      });
    }

    g.append("path")
      .attr("d", `M${anchoC / 2 - 5},${altoC} L${anchoC / 2 + 5},${altoC} L${anchoC / 2},${altoC + 8} Z`)
      .attr("class", "mapa-capsula-fondo");
  }

  function actualizarMapa() {
    const datos = agruparMapaInstante();
    const minCasos = d3.min(datos, d => d.count) || 1;
    const maxCasosCrudo = d3.max(datos, d => d.count) || 1;
    const maxCasos = maxCasosCrudo > minCasos ? maxCasosCrudo : minCasos + 1;
    rScale.domain([minCasos, maxCasos]);
    colorScaleMap.domain([minCasos, maxCasos]);
    const radioDe = d => (escalarPorCantidad ? rScale(d.count) : RADIO_PUNTO);
    const colorDe = d => (escalarPorCantidad ? colorScaleMap(d.count) : PUNTO_COLOR);

    const puntos = gPuntos.selectAll("circle")
      .data(datos, d => d.lugar);

    puntos.join(
      enter => enter.append("circle")
        .attr("class", "mapa-punto")
        .attr("cx", d => projection(d.coords)[0])
        .attr("cy", d => projection(d.coords)[1])
        .attr("r", 0)
        .attr("fill", colorDe)
        .call(enter => enter.transition().duration(220).attr("r", radioDe))
        .on("mouseenter", (event, d) => manejarHoverPunto(event, d, true))
        .on("mouseleave", (event, d) => manejarHoverPunto(event, d, false))
        .on("click", (event, d) => alternarPin(d.lugar)),
      update => update
        .call(update => update.transition().duration(180)
          .attr("cx", d => projection(d.coords)[0])
          .attr("cy", d => projection(d.coords)[1])
          .attr("r", radioDe)
          .attr("fill", colorDe)),
      exit => exit.transition().duration(150).attr("r", 0).remove()
    );

    dibujarCapsulasFijadas();
    actualizarAvisoLugar();
  }

  function manejarHoverPunto(event, d, entrando) {
    if (entrando) {
      cancelarOcultarCapsulaHover();
      if (!estado.lugaresFijados.has(d.lugar)) {
        lugarHoverActivo = { lugar: d.lugar, coords: d.coords };
        gCapsulas.selectAll("g.capsula-hover").remove();
        const gTemp = gCapsulas.append("g").attr("class", "capsula-hover")
          .on("mouseenter", cancelarOcultarCapsulaHover)
          .on("mouseleave", programarOcultarCapsulaHover);
        construirCapsula(gTemp, d.lugar, d.coords);
      }
    } else {
      programarOcultarCapsulaHover();
    }
  }

  let hideCapsulaHoverTimer = null;

  function cancelarOcultarCapsulaHover() {
    if (hideCapsulaHoverTimer) {
      clearTimeout(hideCapsulaHoverTimer);
      hideCapsulaHoverTimer = null;
    }
  }

  function programarOcultarCapsulaHover() {
    cancelarOcultarCapsulaHover();
    hideCapsulaHoverTimer = setTimeout(() => {
      lugarHoverActivo = null;
      gCapsulas.selectAll("g.capsula-hover").remove();
    }, 220);
  }

  function alternarPin(lugar) {
    if (estado.lugaresFijados.has(lugar)) {
      estado.lugaresFijados.delete(lugar);
    } else {
      estado.lugaresFijados.add(lugar);
    }
    btnLimpiarPines.classList.toggle("btn-mapa--visible", estado.lugaresFijados.size > 0);
    dibujarCapsulasFijadas();
    actualizarPanelSecundario(true);
  }

  function seSuperponen(a, b, margen = 4) {
    return !(
      a.x + a.w + margen < b.x ||
      b.x + b.w + margen < a.x ||
      a.y + a.h + margen < b.y ||
      b.y + b.h + margen < a.y
    );
  }

  function dibujarCapsulasFijadas() {
    gCapsulas.selectAll("g.capsula-fija").remove();
    const datosActuales = agruparMapaInstante();
    const GAP = 10;
    const cajasOcupadas = [];

    const t = d3.zoomTransform(svgMapa.node());
    const k = t.k;

    estado.lugaresFijados.forEach(lugar => {
      const punto = datosActuales.find(d => d.lugar === lugar);
      const coords = punto ? punto.coords : coordPorLugar[lugar];
      if (!coords) return;

      const { anchoC, altoC } = medirCapsula(lugar);
      const px = projection(coords)[0];
      const py = projection(coords)[1];
      const [sx, sy] = t.apply([px, py]);

      let caja = { x: sx - anchoC / 2, y: sy - altoC - 16, w: anchoC, h: altoC };
      let intento = 0;
      while (cajasOcupadas.some(c => seSuperponen(c, caja)) && intento < 24) {
        intento++;
        const lado = intento % 2 === 0 ? 1 : -1;
        const paso = Math.ceil(intento / 2);
        caja = {
          x: sx - anchoC / 2 + lado * paso * (anchoC + GAP),
          y: sy - altoC - 16 - Math.floor(paso / 3) * (altoC + GAP),
          w: anchoC, h: altoC,
        };
      }
      cajasOcupadas.push(caja);

      const destino = { x: (caja.x - t.x) / k, y: (caja.y - t.y) / k };

      const g = gCapsulas.append("g").attr("class", "capsula-fija");
      construirCapsula(g, lugar, coords, destino);
      g.select("rect").attr("stroke", PALETA.acentoLinea).attr("stroke-width", 1.5);
    });
  }

  const contenedorLineas = document.getElementById("crimenesChart");
  let timerRef = null;

  if (contenedorLineas) {
    contenedorLineas.classList.add("mapa-contenedor-lineas");

    const botonVerCasosLinea = crearBotonVerCasos();
    if (contenedorLineas.parentElement) {
      contenedorLineas.parentElement.insertBefore(botonVerCasosLinea.boton, contenedorLineas);
    }
    let seleccionPuntoLinea = null;
    let lineGroupsPorSerie = new Map();

    const tooltipLineas = document.createElement("div");
    tooltipLineas.className = "tooltip-grafico tooltip-grafico--sans";

    const MARGIN = { top: 60, right: 170, bottom: 50, left: 55 };
    const WIDTH = 700, HEIGHT = 300;
    const IW = WIDTH - MARGIN.left - MARGIN.right;
    const IH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const DURACION_LINEA = 700;
    const PAUSA = 130;

    function buildSerieTotal() {
      const lista = tiempoListaActual();
      const campo = campoTiempoActual();
      const filtrados = datosFiltradosBase();
      const puntos = lista.map(t => {
        const set = new Set(filtrados.filter(d => d[campo] === t).map(d => `${d.ID_Documento}|${d.Sub_Código}`));
        const cantidad = set.size;
        return { tiempo: t, cantidad, etiqueta: `Todos los crímenes\n${t}: ${cantidad} casos` };
      });
      const total = puntos.reduce((a, p) => a + p.cantidad, 0);
      return [{ nombre: "Todos los crímenes", total, puntos }];
    }

    function buildSeriesSubcrimen() {
      const lista = tiempoListaActual();
      const campo = campoTiempoActual();
      const filtrados = datosFiltradosBase();
      const filtradosConSubcrimen = filtrados.filter(d => !nombresGenerales.has(d.Nombre_Sub_Codigo));
      const subNombres = [...new Set(filtradosConSubcrimen.map(d => d.Nombre_Sub_Codigo))].sort(compararPorLinaje);

      if (subNombres.length === 0) {
        const puntos = lista.map(t => {
          const set = new Set(filtrados.filter(d => d[campo] === t).map(d => `${d.ID_Documento}|${d.Sub_Código}`));
          const cantidad = set.size;
          return { tiempo: t, cantidad, etiqueta: `${estado.crimen}\n${t}: ${cantidad} casos` };
        });
        const total = puntos.reduce((a, p) => a + p.cantidad, 0);
        return [{ nombre: estado.crimen, total, puntos }];
      }

      return subNombres.map(sub => {
        const filas = filtradosConSubcrimen.filter(d => d.Nombre_Sub_Codigo === sub);
        const puntos = lista.map(t => {
          const set = new Set(filas.filter(d => d[campo] === t).map(d => `${d.ID_Documento}|${d.Sub_Código}`));
          const cantidad = set.size;
          return { tiempo: t, cantidad, etiqueta: `${sub}\n${t}: ${cantidad} casos` };
        });
        const total = puntos.reduce((a, p) => a + p.cantidad, 0);
        return { nombre: sub, total, puntos };
      });
    }

    function buildSeriesLugaresFijados() {
      const lista = tiempoListaActual();
      const campo = campoTiempoActual();
      const filtrados = datosFiltradosBase();

      return [...estado.lugaresFijados].map(lugar => {
        const filas = filtrados.filter(d => d.lugar === lugar);
        const puntos = lista.map(t => {
          const set = new Set(filas.filter(d => d[campo] === t).map(d => `${d.ID_Documento}|${d.Sub_Código}`));
          const cantidad = set.size;
          return { tiempo: t, cantidad, etiqueta: `${lugar}\n${t}: ${cantidad} casos` };
        });
        const total = puntos.reduce((a, p) => a + p.cantidad, 0);
        return { nombre: lugar, total, puntos };
      });
    }

    function renderPanelSecundario(conAnimacion) {
      if (timerRef) { timerRef.stop(); timerRef = null; }
      contenedorLineas.innerHTML = "";
      contenedorLineas.appendChild(tooltipLineas);

      seleccionPuntoLinea = null;
      lineGroupsPorSerie = new Map();
      botonVerCasosLinea.ocultar();

      const enModoComparacion = estado.lugaresFijados.size > 0;
      const series = enModoComparacion
        ? buildSeriesLugaresFijados()
        : estado.crimen === "Todos"
          ? buildSerieTotal()
          : buildSeriesSubcrimen();
      const lista = tiempoListaActual();
      const totalGeneral = series.reduce((a, s) => a + s.total, 0);

      function irDesdeLineaSerie(serie, tiempo) {
        if (enModoComparacion) {
          irATablasFiltradas({ lugar: serie.nombre, fecha: tiempo, escala: campoTiempoActual() });
        } else if (estado.crimen === "Todos") {
          irATablasFiltradas({ fecha: tiempo, escala: campoTiempoActual() });
        } else if (serie.nombre === estado.crimen) {
          irATablasFiltradas({ codigo: estado.crimen, subcodigo: null, fecha: tiempo, escala: campoTiempoActual() });
        } else {
          irATablasFiltradas({ codigo: estado.crimen, subcodigo: serie.nombre, fecha: tiempo, escala: campoTiempoActual() });
        }
      }

      function aplicarResaltadoLinea() {
        if (!seleccionPuntoLinea) {
          lineGroupsPorSerie.forEach(grp => grp.style("opacity", 1));
          return;
        }
        const nombreSerieActiva = seleccionPuntoLinea.split("||")[0];
        lineGroupsPorSerie.forEach((grp, nombre) => {
          grp.style("opacity", nombre === nombreSerieActiva ? 1 : 0.2);
        });
      }

      function limpiarSeleccionLinea() {
        seleccionPuntoLinea = null;
        botonVerCasosLinea.ocultar();
        aplicarResaltadoLinea();
      }

      function seleccionarPuntoLinea(serie, tiempo) {
        const clave = `${serie.nombre}||${tiempo}`;
        if (seleccionPuntoLinea === clave) { limpiarSeleccionLinea(); return; }
        seleccionPuntoLinea = clave;
        aplicarResaltadoLinea();
        botonVerCasosLinea.mostrar(`${serie.nombre} · ${tiempo}`, () => irDesdeLineaSerie(serie, tiempo));
      }

      if (totalGeneral === 0) {
        const aviso = document.createElement("div");
        aviso.className = "mapa-aviso-vacio";
        aviso.textContent = "Sin casos con los filtros actuales";
        contenedorLineas.appendChild(aviso);
        return;
      }

      const colorScaleLine = d3.scaleOrdinal().domain(series.map(s => s.nombre)).range(COLORES_SERIE);

      const svgLine = d3.create("svg")
        .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
        .attr("class", "mapa-linea-svg")
        .on("click", () => limpiarSeleccionLinea());

      const g = svgLine.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
      const x = d3.scalePoint().domain(lista).range([0, IW]).padding(0.2);
      const valores = series.flatMap(s => s.puntos.map(p => p.cantidad));
      const yMax = d3.max(valores) || 1;
      const yTope = Math.ceil(yMax * 1.15) || 1;
      const y = d3.scaleLinear().domain([0, yTope]).range([IH, 0]);

      g.append("g")
        .call(d3.axisLeft(y).ticks(5).tickSize(-IW).tickFormat(""))
        .call(gg => { gg.select(".domain").remove(); gg.selectAll("line").attr("class", "mapa-linea-grid-linea"); });

      const ejeXTiempo = d3.axisBottom(x).tickSize(0);
      if (estado.modoTiempo !== "siglo" && lista.length > 2) {
        ejeXTiempo.tickValues([lista[0], lista[lista.length - 1]]);
      }
      const haySigloXIXTruncado = estado.modoTiempo === "siglo" && lista.includes("Siglo XIX");
      ejeXTiempo.tickFormat(d => (d === "Siglo XIX" ? `${d} *` : d));
      g.append("g")
        .attr("transform", `translate(0,${IH})`)
        .call(ejeXTiempo)
        .call(gg => {
          gg.select(".domain").attr("class", "mapa-linea-eje-dominio");
          gg.selectAll("text").attr("class", "mapa-linea-eje-x-texto").style("font-size", lista.length > 6 ? "9px" : "12px").attr("dy", "1.4em");
        });

      g.append("g")
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")))
        .call(gg => { gg.select(".domain").remove(); gg.selectAll("text").attr("class", "mapa-linea-eje-y-texto"); });

      const tituloTexto = enModoComparacion
        ? `Comparando ${series.length} lugar(es) fijado(s)`
        : (estado.crimen === "Todos" ? "Todos los crímenes" : estado.crimen);

      svgLine.append("text")
        .attr("x", MARGIN.left + IW / 2).attr("y", 22)
        .attr("text-anchor", "middle").attr("class", "mapa-linea-titulo")
        .text(tituloTexto);

      svgLine.append("text")
        .attr("x", MARGIN.left + IW / 2).attr("y", 40)
        .attr("text-anchor", "middle").attr("class", "mapa-linea-subtitulo")
        .text(`${totalGeneral} registros únicos · ${estado.modoTiempo === "siglo" ? "por siglo" : "por década"}`);

      if (haySigloXIXTruncado) {
        svgLine.append("text")
          .attr("x", MARGIN.left + IW).attr("y", HEIGHT - 8)
          .attr("text-anchor", "end").attr("class", "mapa-linea-nota")
          .text("* Siglo XIX: solo hasta 1824");
      }

      const lineGen = d3.line().x(d => x(d.tiempo)).y(d => y(d.cantidad)).curve(d3.curveLinear);

      function dibujarSerieInstante(idx) {
        const serie = series[idx];
        const color = colorScaleLine(serie.nombre);
        const lineGroup = g.append("g");
        lineGroupsPorSerie.set(serie.nombre, lineGroup);
        if (seleccionPuntoLinea) {
          const nombreSerieActiva = seleccionPuntoLinea.split("||")[0];
          lineGroup.style("opacity", serie.nombre === nombreSerieActiva ? 1 : 0.2);
        }

        lineGroup.append("path")
          .datum(serie.puntos).attr("class", "mapa-linea-trazo").attr("stroke", color)
          .attr("d", lineGen);

        serie.puntos.forEach(p => {
          lineGroup.append("circle")
            .attr("cx", x(p.tiempo)).attr("cy", y(p.cantidad)).attr("r", 4)
            .attr("class", "mapa-linea-punto").attr("stroke", color);
          lineGroup.append("circle")
            .attr("cx", x(p.tiempo)).attr("cy", y(p.cantidad)).attr("r", 10)
            .attr("class", "mapa-linea-punto-hit")
            .on("mouseenter", () => { tooltipLineas.innerHTML = p.etiqueta.replace(/\n/g, "<br/>"); tooltipLineas.classList.add("tooltip-grafico--visible"); })
            .on("mousemove", event => {
              const rect = contenedorLineas.getBoundingClientRect();
              tooltipLineas.style.left = (event.clientX - rect.left + 12) + "px";
              tooltipLineas.style.top = (event.clientY - rect.top + 12) + "px";
            })
            .on("mouseleave", () => tooltipLineas.classList.remove("tooltip-grafico--visible"))
            .on("click", event => {
              event.stopPropagation();
              seleccionarPuntoLinea(serie, p.tiempo);
            });
        });

        const ultimoPunto = [...serie.puntos].reverse().find(p => p.cantidad > 0) || serie.puntos[serie.puntos.length - 1];
        lineGroup.append("text")
          .attr("x", x(ultimoPunto.tiempo) + 8).attr("y", y(ultimoPunto.cantidad) + 4)
          .attr("class", "mapa-linea-etiqueta-serie").style("fill", color)
          .text(serie.nombre.length > 22 ? serie.nombre.slice(0, 20) + "…" : serie.nombre);
      }

      function revelarSecuencial(idx) {
        if (idx >= series.length) return;
        const color = colorScaleLine(series[idx].nombre);
        const lineGroup = g.append("g");
        const pathLine = lineGroup.append("path")
          .datum(series[idx].puntos).attr("class", "mapa-linea-trazo").attr("stroke", color)
          .attr("d", lineGen);
        const totalLength = pathLine.node().getTotalLength();
        pathLine.attr("stroke-dasharray", `${totalLength} ${totalLength}`).attr("stroke-dashoffset", totalLength)
          .transition().duration(DURACION_LINEA).ease(d3.easeLinear).attr("stroke-dashoffset", 0)
          .on("end", () => {
            lineGroup.remove();
            dibujarSerieInstante(idx);
            timerRef = d3.timeout(() => revelarSecuencial(idx + 1), PAUSA);
          });
      }

      if (conAnimacion) {
        timerRef = d3.timeout(() => revelarSecuencial(0), 100);
      } else {
        series.forEach((_, idx) => dibujarSerieInstante(idx));
      }

      contenedorLineas.append(svgLine.node());
    }

    window.__actualizarPanelSecundarioDashboard = renderPanelSecundario;
  }

  function actualizarPanelSecundario(conAnimacion) {
    if (window.__actualizarPanelSecundarioDashboard) {
      window.__actualizarPanelSecundarioDashboard(conAnimacion);
    }
  }

  const estadoGrafo = { agente: "Todos", atributo: "Todos", genero: "Todos" };

  const agentesLista = [...new Set(datosLimpios.map(d => d.Agente))].filter(Boolean).sort();
  const atributosLista = [...new Set(datosLimpios.map(d => d.Atributo))].filter(Boolean).sort();
  const generosLista = [...new Set(datosLimpios.map(d => d.Género))].filter(Boolean).sort();

  function crearSelectGrafo(etiqueta, opciones, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "mapa-wrap-select-grafo";
    const label = document.createElement("label");
    label.textContent = etiqueta;
    label.className = "filtro-label filtro-label--chico";
    const select = document.createElement("select");
    select.className = "filtro-select filtro-select--compacto";
    ["Todos", ...opciones].forEach(op => {
      const opt = document.createElement("option");
      opt.value = op;
      opt.textContent = op;
      select.appendChild(opt);
    });
    select.value = "Todos";
    select.addEventListener("change", () => onChange(select.value));
    wrap.append(label, select);
    return wrap;
  }

  const filaFiltrosGrafo = document.createElement("div");
  filaFiltrosGrafo.className = "mapa-fila-filtros-grafo";
  filaFiltrosGrafo.append(
    crearSelectGrafo("Agente", agentesLista, valor => { estadoGrafo.agente = valor; dibujarGrafo(); }),
    crearSelectGrafo("Atributo", atributosLista, valor => { estadoGrafo.atributo = valor; dibujarGrafo(); }),
    crearSelectGrafo("Género", generosLista, valor => { estadoGrafo.genero = valor; dibujarGrafo(); })
  );

  const botonVerCasosGrafo = crearBotonVerCasos();

  const areaGrafo = document.createElement("div");
  areaGrafo.className = "mapa-area-grafo";

  contenedorGrafoEl.append(filaFiltrosGrafo, botonVerCasosGrafo.boton, areaGrafo);

  const GRAFO_WIDTH = 700;
  const GRAFO_HEIGHT = 380;
  const GRAFO_PADDING = 40;

  const tooltipGrafo = document.createElement("div");
  tooltipGrafo.className = "tooltip-grafico";

  let simulationGrafoRef = null;

  function dragGrafo(simulation) {
    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x; d.fy = d.y;
    }
    function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null; d.fy = null;
    }
    return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
  }

  function dibujarGrafo() {
    if (simulationGrafoRef) simulationGrafoRef.stop();
    botonVerCasosGrafo.ocultar();

    const campo = campoTiempoActual();
    const valor = valorTiempoActual();
    const filtrados = datosLimpios.filter(d =>
      d[campo] === valor &&
      (estadoGrafo.agente === "Todos" || d.Agente === estadoGrafo.agente) &&
      (estadoGrafo.atributo === "Todos" || d.Atributo === estadoGrafo.atributo) &&
      (estadoGrafo.genero === "Todos" || d.Género === estadoGrafo.genero)
    );

    const agenteCrimenes = new Map();
    const crimenInfo = new Map();
    filtrados.forEach(d => {
      const idAgente = d.ID_Agente;
      const codigo = d.Código;
      const nombre = d.Nombre_Codigo;
      if (!idAgente || !codigo) return;
      if (!agenteCrimenes.has(idAgente)) agenteCrimenes.set(idAgente, { codigos: new Set(), idCaso: d.ID_Caso });
      agenteCrimenes.get(idAgente).codigos.add(codigo);
      if (!crimenInfo.has(codigo)) crimenInfo.set(codigo, { nombre, count: 0 });
      crimenInfo.get(codigo).count += 1;
    });

    const nodes = Array.from(crimenInfo, ([codigo, info]) => ({ id: codigo, nombre: info.nombre, count: info.count }));

    const edgeMap = new Map();
    const casosPorEdge = new Map();
    agenteCrimenes.forEach(({ codigos: codigosSet, idCaso }) => {
      const codigos = Array.from(codigosSet);
      if (codigos.length < 2) return;
      for (let i = 0; i < codigos.length; i++) {
        for (let j = i + 1; j < codigos.length; j++) {
          const [a, b] = [codigos[i], codigos[j]].sort();
          const key = `${a}|${b}`;
          edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
          if (!casosPorEdge.has(key)) casosPorEdge.set(key, new Set());
          if (idCaso) casosPorEdge.get(key).add(idCaso);
        }
      }
    });
    const links = Array.from(edgeMap, ([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight, casos: [...(casosPorEdge.get(key) || [])] };
    });

    const adyacencia = new Map();
    nodes.forEach(n => adyacencia.set(n.id, new Set()));
    links.forEach(l => { adyacencia.get(l.source)?.add(l.target); adyacencia.get(l.target)?.add(l.source); });

    const vinculadosPorCodigo = new Map();
    nodes.forEach(n => vinculadosPorCodigo.set(n.id, new Set()));
    agenteCrimenes.forEach(({ codigos: codigosSet }, idAgente) => {
      if (codigosSet.size < 2) return;
      codigosSet.forEach(codigo => vinculadosPorCodigo.get(codigo)?.add(idAgente));
    });

    areaGrafo.innerHTML = "";
    areaGrafo.appendChild(tooltipGrafo);

    if (nodes.length === 0) {
      const aviso = document.createElement("div");
      aviso.className = "mapa-aviso-vacio mapa-aviso-vacio--compacto";
      aviso.textContent = "Sin casos con los filtros actuales";
      areaGrafo.appendChild(aviso);
      return;
    }

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${GRAFO_WIDTH} ${GRAFO_HEIGHT}`)
      .attr("class", "mapa-grafo-svg");

    const radiusScale = d3.scaleSqrt().domain([0, d3.max(nodes, d => d.count) || 1]).range([7, 32]);
    const linkScale = d3.scaleLinear().domain([1, d3.max(links, d => d.weight) || 1]).range([1, 7]);
    const color = d3.scaleOrdinal(COLORES_SERIE).domain(nodes.map(d => d.id));

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id)
        .distance(d => 120 - linkScale(d.weight) * 4)
        .strength(d => 0.1 + linkScale(d.weight) * 0.02))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("center", d3.forceCenter(GRAFO_WIDTH / 2, GRAFO_HEIGHT / 2))
      .force("collide", d3.forceCollide(d => radiusScale(d.count) + 5))
      .force("x", d3.forceX(GRAFO_WIDTH / 2).strength(0.05))
      .force("y", d3.forceY(GRAFO_HEIGHT / 2).strength(0.05));

    simulationGrafoRef = simulation;

    const link = svg.append("g").selectAll("line").data(links).join("line")
      .attr("class", "mapa-grafo-link")
      .attr("stroke", PALETA.borde).attr("stroke-opacity", 0.35)
      .attr("stroke-width", d => linkScale(d.weight));

    const node = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("class", "mapa-grafo-nodo")
      .attr("r", d => radiusScale(d.count))
      .attr("fill", d => color(d.id))
      .attr("stroke", PALETA.fondoPergamino).attr("stroke-width", 1.5)
      .call(dragGrafo(simulation));

    const label = svg.append("g").selectAll("text").data(nodes).join("text")
      .text(d => d.nombre)
      .attr("class", "mapa-grafo-etiqueta")
      .attr("dy", d => -radiusScale(d.count) - 6);

    let seleccionNodo = null;
    let seleccionLink = null;

    function limpiarSeleccionGrafo() {
      seleccionNodo = null;
      seleccionLink = null;
      botonVerCasosGrafo.ocultar();
      aplicarResaltado();
    }

    function aplicarResaltado() {
      if (seleccionNodo === null && seleccionLink === null) {
        node.attr("opacity", 1).attr("stroke", PALETA.fondoPergamino).attr("stroke-width", 1.5);
        link.attr("stroke", PALETA.borde).attr("stroke-opacity", 0.35).attr("stroke-width", d => linkScale(d.weight));
        label.attr("opacity", 1);
        return;
      }

      const nodosActivos = new Set();
      const linksActivos = new Set();

      if (seleccionNodo !== null) {
        nodosActivos.add(seleccionNodo);
        (adyacencia.get(seleccionNodo) || new Set()).forEach(id => nodosActivos.add(id));
        links.forEach(l => {
          if (l.source.id === seleccionNodo || l.target.id === seleccionNodo) linksActivos.add(l);
        });
      } else if (seleccionLink !== null) {
        nodosActivos.add(seleccionLink.source.id);
        nodosActivos.add(seleccionLink.target.id);
        linksActivos.add(seleccionLink);
      }

      node.attr("opacity", d => nodosActivos.has(d.id) ? 1 : 0.15)
        .attr("stroke", d => (seleccionNodo !== null && d.id === seleccionNodo) ? PALETA.tintaOscura : PALETA.fondoPergamino)
        .attr("stroke-width", d => (seleccionNodo !== null && d.id === seleccionNodo) ? 3 : 1.5);
      label.attr("opacity", d => nodosActivos.has(d.id) ? 1 : 0.15);
      link.attr("stroke", d => linksActivos.has(d) ? PALETA.acentoLinea : "#ccc")
        .attr("stroke-opacity", d => linksActivos.has(d) ? 0.9 : 0.1)
        .attr("stroke-width", d => linksActivos.has(d) ? linkScale(d.weight) + 2 : linkScale(d.weight));
    }

    node.on("click", (event, d) => {
      event.stopPropagation();
      if (seleccionNodo === d.id) { limpiarSeleccionGrafo(); return; }
      seleccionNodo = d.id;
      seleccionLink = null;
      aplicarResaltado();
      botonVerCasosGrafo.mostrar(d.nombre, () => irATablasFiltradas({ codigo: d.nombre }));
    });

    link.on("click", (event, d) => {
      event.stopPropagation();
      if (seleccionLink === d) { limpiarSeleccionGrafo(); return; }
      seleccionLink = d;
      seleccionNodo = null;
      aplicarResaltado();
      const nombreOrigen = d.source.nombre || d.source;
      const nombreDestino = d.target.nombre || d.target;
      botonVerCasosGrafo.mostrar(`${nombreOrigen} ↔ ${nombreDestino}`, () => irATablasFiltradas({ casos: d.casos }));
    });

    svg.on("click", () => limpiarSeleccionGrafo());

    node
      .on("mouseenter", (event, d) => {
        const vinculados = vinculadosPorCodigo.get(d.id)?.size || 0;
        tooltipGrafo.innerHTML = `<strong>${d.nombre}</strong><br/>Casos: ${d.count}<br/>Vínculos con otros crímenes: ${vinculados}`;
        tooltipGrafo.classList.add("tooltip-grafico--visible");
      })
      .on("mousemove", event => {
        const rect = areaGrafo.getBoundingClientRect();
        tooltipGrafo.style.left = (event.clientX - rect.left + 12) + "px";
        tooltipGrafo.style.top = (event.clientY - rect.top + 12) + "px";
      })
      .on("mouseleave", () => tooltipGrafo.classList.remove("tooltip-grafico--visible"));

    link
      .on("mouseenter", (event, d) => {
        tooltipGrafo.innerHTML = `${d.source.nombre || d.source} ↔ ${d.target.nombre || d.target}<br/>Agentes en común: <strong>${d.weight}</strong>`;
        tooltipGrafo.classList.add("tooltip-grafico--visible");
      })
      .on("mousemove", event => {
        const rect = areaGrafo.getBoundingClientRect();
        tooltipGrafo.style.left = (event.clientX - rect.left + 12) + "px";
        tooltipGrafo.style.top = (event.clientY - rect.top + 12) + "px";
      })
      .on("mouseleave", () => tooltipGrafo.classList.remove("tooltip-grafico--visible"));

    simulation.on("tick", () => {
      nodes.forEach(d => {
        const r = radiusScale(d.count);
        d.x = Math.max(r + GRAFO_PADDING, Math.min(GRAFO_WIDTH - r - GRAFO_PADDING, d.x));
        d.y = Math.max(r + GRAFO_PADDING, Math.min(GRAFO_HEIGHT - r - GRAFO_PADDING, d.y));
      });
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y).attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("cx", d => d.x).attr("cy", d => d.y);
      label.attr("x", d => d.x).attr("y", d => d.y);
    });

    areaGrafo.appendChild(svg.node());
  }

  function actualizarGrafoRelacion() {
    dibujarGrafo();
  }

  actualizarMapa();
  actualizarPanelSecundario(true);
  actualizarGrafoRelacion();
}