import * as d3 from "d3";
import rewind from "@turf/rewind";

// ── Paleta compartida (misma línea "archivo/pergamino" del mapa original) ────
const PALETA = {
  fondoPergamino: "#f4ecd8",
  panel: "#efe4c8",
  tierra: "#e8dcc0",
  borde: "#6b4f2a",
  tintaOscura: "#3a2d1a",
  acentoLinea: "#bb4e99",
  acentoSecundario: "#4e9bbb",
};

const COLORES_SERIE = [
  "#bb4e99", "#4e9bbb", "#e8a838", "#56b87e",
  "#e05a5a", "#7b5ea7", "#3ab8b0", "#d4784e",
  "#6a8fce", "#a05080",
];

export async function inicializarDashboard() {
  // ── 1. Carga única de datos ────────────────────────────────────────────
  const [NuevaGranadaRaw, rawViz, rawLugar, rawLinaje] = await Promise.all([
    d3.json(`${import.meta.env.BASE_URL}/data/NuevaGranada.json`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Lugar.csv`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Linaje.csv`),
  ]);

  const NuevaGranada = rewind(NuevaGranadaRaw, { reverse: true });

  // ── 2. Utilidades de tiempo ─────────────────────────────────────────────
  const SIGLOS = ["Siglo XVI", "Siglo XVII", "Siglo XVIII", "Siglo XIX"];

  const getSiglo = y => {
    if (y >= 1500 && y <= 1599) return "Siglo XVI";
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800 && y <= 1899) return "Siglo XIX";
    return null;
  };

  const getDecada = y => Math.floor(y / 10) * 10;

  // ── 3. Diccionario de coordenadas ───────────────────────────────────────
  const coordPorLugar = {};
  rawLugar.forEach(d => {
    const nombre = d.Lugar?.trim();
    const lon = +d.Longitud;
    const lat = +d.Latitud;
    if (nombre && !isNaN(lon) && !isNaN(lat)) {
      coordPorLugar[nombre] = [lon, lat];
    }
  });

  // ── 4. Limpieza y enriquecimiento de filas ──────────────────────────────
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

  const datosParaMapa = datosLimpios.filter(
    d => d.coords && !isNaN(d.coords[0]) && !isNaN(d.coords[1])
  );

  const DECADAS = [...new Set(datosLimpios.map(d => d.decada))].sort((a, b) => a - b);

  // ── 4b. Jerarquía de delitos (Linaje.csv) ───────────────────────────────
  // "Delitos" es el nivel 0 (la raíz general): cuando un caso no tiene un
  // subcrimen específico, Nombre_Sub_Codigo queda literalmente en "Delitos".
  // Eso no es un subcrimen real y nunca debe listarse ni graficarse como tal.
  // El orden correcto de los subcrímenes tampoco es alfabético: es el orden
  // jerárquico en el que ya vienen las filas de Linaje.csv.
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

  // ── 5. Resolver provincias ───────────────────────────────────────────────
  function getProvincia(coords) {
    const features = NuevaGranada.features ? NuevaGranada.features : [NuevaGranada];
    const feature = features.find(f => d3.geoContains(f, coords));
    return feature ? (feature.properties?.Nombre || "Desconocida") : "Desconocida";
  }

  // ── 6. Listas para filtros (lugar y subcrimen) ──────────────────────────
  const lugaresLista = [...new Set(datosLimpios.map(d => d.lugar))].sort();
  const subcrimenesLista = [...new Set(
    datosLimpios.filter(d => !nombresGenerales.has(d.Nombre_Sub_Codigo)).map(d => d.Nombre_Sub_Codigo)
  )].sort(compararPorLinaje);
  const crimenesLista = [...new Set(datosLimpios.map(d => d.Nombre_Codigo))].sort();

  // ── 7. Estado global compartido ─────────────────────────────────────────
  const estado = {
    modoTiempo: "siglo",       // "siglo" | "decada" — "siglo" es el default
    tiempoIdx: SIGLOS.indexOf("Siglo XVII"),
    crimen: "Todos",
    subcrimen: "Todos",
    lugar: "Todos",
    lugaresFijados: new Set(), // pines de comparación (clic en el mapa)
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

  // ── 7b. Navegación a tablas.html con los filtros de la selección ────────
  // Igual que en globitosPersonas.js: clic en una visualización pasa a la
  // tabla de documentos ya filtrada. "overrides" es lo específico que se
  // clicó (una fila de la cápsula, un nodo del grafo, un punto de la línea);
  // lo que no se especifica cae en los filtros generales ya activos en el
  // dashboard (lugar/crimen/subcrimen) y en la fecha (siglo/década) actual.
  function irATablasFiltradas(overrides = {}) {
    // Con "in" (no "??"): pasar explícitamente null/"" fuerza que ese filtro
    // quede AUSENTE aunque el dashboard tenga uno activo (p. ej. una fila
    // "general" sin subcrimen real); omitir la clave sí hereda el default.
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
    window.location.href = `tablas.html?${params.toString()}`;
  }

  // Botón "Ver casos" reutilizable: en mapa, línea y grafo, un clic sobre un
  // elemento de la visualización solo selecciona/resalta (sin navegar); este
  // botón es la ÚNICA forma de pasar de ahí a tablas.html con esos filtros.
  function crearBotonVerCasos() {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.style.cssText = `
      align-self:flex-start; padding:6px 14px; font-size:12px; border-radius:4px;
      border:1px solid ${PALETA.acentoLinea}; background:${PALETA.acentoLinea};
      color:#fff; cursor:pointer; font-family: Georgia, serif; font-weight:600;
      display:none;
    `;
    let handlerActivo = null;
    boton.addEventListener("click", () => {
      if (handlerActivo) handlerActivo();
    });

    function ocultar() {
      boton.style.display = "none";
      handlerActivo = null;
    }
    function mostrar(texto, handler) {
      boton.textContent = `Ver casos: ${texto}`;
      boton.style.display = "inline-block";
      handlerActivo = handler;
    }
    return { boton, mostrar, ocultar };
  }

  // ── 8. Filtro base compartido por crimen / subcrimen / lugar (dropdown) ──
  function datosFiltradosBase() {
    return datosLimpios.filter(d => {
      const okCrimen = estado.crimen === "Todos" || d.Nombre_Codigo === estado.crimen;
      const okSub = estado.subcrimen === "Todos" || d.Nombre_Sub_Codigo === estado.subcrimen;
      const okLugar = estado.lugar === "Todos" || d.lugar === estado.lugar;
      return okCrimen && okSub && okLugar;
    });
  }

  // ── 9. Referencia de crímenes en un lugar, para la cápsula del mapa ─────
  function datosReferenciaLugar(lugar) {
    const campo = campoTiempoActual();
    const valor = valorTiempoActual();
    const filas = datosFiltradosBase().filter(d => d.lugar === lugar && d[campo] === valor);

    // Si el crimen elegido no tiene un subcrimen real para esa fila (Nombre_Sub_Codigo
    // cae en el nivel general "Delitos"), se agrupa bajo el propio nombre del crimen
    // en vez de mostrar "Delitos" como si fuera un subcrimen.
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

  // ── 10. Agrupamiento del mapa para el instante de tiempo seleccionado ───
  function agruparMapaInstante() {
    const campo = campoTiempoActual();
    const valor = valorTiempoActual();
    const filas = datosFiltradosBase().filter(
      d => d[campo] === valor && d.coords && !isNaN(d.coords[0]) && !isNaN(d.coords[1])
    );

    const map = {};
    filas.forEach(d => {
      const key = `${d.lugar}||${d.Nombre_Codigo}||${d["Sub_Código"]}`;
      if (!map[key]) {
        map[key] = {
          lugar: d.lugar,
          coords: d.coords,
          Nombre_Codigo: d.Nombre_Codigo,
          año: d.año,
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

  // ══════════════════════════════════════════════════════════════════════
  // LAYOUT GENERAL DEL DASHBOARD
  // ══════════════════════════════════════════════════════════════════════
  const mapaContenedor = document.getElementById("mapa-contenedor");
  if (!mapaContenedor) return;
  const contenedorLineasEl = document.getElementById("crimenesChart");
  const dashboardWrap = mapaContenedor.parentElement;

  // Contenedor del grafo de relación entre crímenes (no existe en el HTML,
  // se crea aquí igual que el resto de piezas dinámicas del dashboard).
  const contenedorGrafoEl = document.createElement("div");
  contenedorGrafoEl.id = "grafoRelacionContenedor";

  // Este dashboard necesita mucho más ancho que el resto del sitio (editorial,
  // centrado y angosto). Rompemos esa centralidad solo para esta página, para
  // que ambas tarjetas (línea + mapa) quepan lado a lado con buen tamaño.
  const mainContenedor = document.querySelector("main.container");
  if (mainContenedor) {
    mainContenedor.style.maxWidth = "1700px";
    mainContenedor.style.width = "96%";
    mainContenedor.style.alignItems = "stretch";
  }

  // Estilo de "tarjeta" reutilizable para envolver cada visualización
  function envolverEnTarjeta(el, titulo, subtitulo) {
    const tarjeta = document.createElement("div");
    tarjeta.style.cssText = `
      display:flex; flex-direction:column; gap:10px;
      background:#fdf8ec; border:1px solid ${PALETA.borde};
      border-radius:10px; padding:16px 18px;
      box-shadow: 0 2px 6px rgba(58,45,26,0.10);
      flex:1 1 460px; min-width:400px; box-sizing:border-box;
    `;
    const encabezado = document.createElement("div");
    encabezado.style.cssText = "display:flex; flex-direction:column; gap:2px;";
    const h = document.createElement("div");
    h.textContent = titulo;
    h.style.cssText = `
      font-family: Georgia, serif; font-size:15px; font-weight:700;
      color:${PALETA.tintaOscura}; letter-spacing:0.01em;
    `;
    encabezado.appendChild(h);
    if (subtitulo) {
      const sub = document.createElement("div");
      sub.textContent = subtitulo;
      sub.style.cssText = `font-family: Georgia, serif; font-size:11.5px; color:${PALETA.borde}; opacity:0.85;`;
      encabezado.appendChild(sub);
    }
    tarjeta.appendChild(encabezado);
    const divisor = document.createElement("div");
    divisor.style.cssText = `height:1px; background:${PALETA.borde}; opacity:0.25;`;
    tarjeta.appendChild(divisor);
    tarjeta.appendChild(el);
    return tarjeta;
  }

  // Panel de filtros: ahora es una barra HORIZONTAL arriba (sticky para seguir
  // visible), en vez de una columna lateral, para liberar el ancho a las tarjetas.
  let panelFiltros = document.getElementById("panel-filtros");
  if (!panelFiltros) {
    panelFiltros = document.createElement("div");
    panelFiltros.id = "panel-filtros";
  }

  // Fila de tarjetas: columna izquierda (línea de tiempo + grafo de relación,
  // apiladas) junto al mapa. Se apilan todas verticalmente solo si no caben.
  let columnaViz = document.getElementById("columna-visualizaciones");
  if (!columnaViz) {
    columnaViz = document.createElement("div");
    columnaViz.id = "columna-visualizaciones";
  }
  columnaViz.style.cssText = "display:flex; flex-direction:row; flex-wrap:wrap; gap:18px; width:100%; align-items:flex-start;";

  const columnaIzquierda = document.createElement("div");
  columnaIzquierda.id = "columna-izquierda";
  columnaIzquierda.style.cssText = "display:flex; flex-direction:column; gap:18px; flex:1 1 460px; min-width:400px;";

  // Dentro de una columna en vertical, las tarjetas deben ocupar su alto
  // natural (no repartirse el espacio como en la fila), así que se anula el
  // flex-basis/min-width pensado para la fila horizontal.
  function paraColumnaVertical(tarjeta) {
    tarjeta.style.flex = "0 0 auto";
    tarjeta.style.width = "100%";
    tarjeta.style.minWidth = "0";
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
    dashboardWrap.style.display = "flex";
    dashboardWrap.style.flexDirection = "column";
    dashboardWrap.style.alignItems = "stretch";
    dashboardWrap.style.flexWrap = "nowrap";
    dashboardWrap.style.gap = "18px";
    dashboardWrap.style.width = "100%";
    // Orden: primero la barra de filtros (arriba), luego las tarjetas lado a lado (abajo)
    dashboardWrap.appendChild(panelFiltros);
    dashboardWrap.appendChild(columnaViz);
  }

  // Barra superior: selector de escala temporal (año / década / siglo).
  // Modifica la lógica del resto del dashboard (mapa + gráfico de líneas).
  let barraModoTiempo = document.getElementById("barra-modo-tiempo");
  if (!barraModoTiempo) {
    barraModoTiempo = document.createElement("div");
    barraModoTiempo.id = "barra-modo-tiempo";
  }
  barraModoTiempo.style.cssText = `
    display:flex; gap:8px; justify-content:center;
    margin-bottom:14px; font-family: Georgia, serif;
  `;

  const MODOS_TIEMPO = [
    { modo: "decada", etiqueta: "Década" },
    { modo: "siglo", etiqueta: "Siglo" },
  ];
  const botonesModoTiempo = {};
  MODOS_TIEMPO.forEach(({ modo, etiqueta }) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = etiqueta;
    btn.style.cssText = `
      padding:8px 22px; font-size:13px; border-radius:6px;
      border:1px solid ${PALETA.borde}; background:${PALETA.fondoPergamino};
      color:${PALETA.tintaOscura}; cursor:pointer; font-family: Georgia, serif;
      font-weight:600; letter-spacing:0.02em;
    `;
    btn.addEventListener("click", () => cambiarModoTiempo(modo));
    botonesModoTiempo[modo] = btn;
    barraModoTiempo.appendChild(btn);
  });

  if (dashboardWrap && dashboardWrap.parentElement) {
    dashboardWrap.parentElement.insertBefore(barraModoTiempo, dashboardWrap);
  }

  mapaContenedor.style.flex = "0 0 auto";
  mapaContenedor.style.width = "100%";
  mapaContenedor.style.minWidth = "0";
  if (contenedorLineasEl) {
    contenedorLineasEl.style.flex = "0 0 auto";
    contenedorLineasEl.style.width = "100%";
    contenedorLineasEl.style.minWidth = "0";
  }

  panelFiltros.style.cssText = `
    display:flex; flex-direction:row; flex-wrap:wrap; gap:14px 22px; align-items:flex-end;
    width:100%; box-sizing:border-box;
    background:${PALETA.panel}; border:1px solid ${PALETA.borde};
    border-radius:10px; padding:14px 20px;
    box-shadow: 0 2px 6px rgba(58,45,26,0.10);
    font-family: Georgia, serif;
    position: sticky; top: 75px; z-index: 40;
  `;

  // Título del panel de filtros (etiqueta a la izquierda de la barra horizontal)
  const tituloPanel = document.createElement("div");
  tituloPanel.textContent = "Filtros";
  tituloPanel.style.cssText = `
    font-size:14px; font-weight:700; color:${PALETA.tintaOscura};
    align-self:center; flex:0 0 auto;
    padding-right:16px; border-right:1px solid ${PALETA.borde};
    border-right-color: rgba(107,79,42,0.3);
  `;
  panelFiltros.appendChild(tituloPanel);

  // -- combo buscable reutilizable (lugar / subcrimen) --
  function crearComboBuscable({ etiqueta, opciones, valorInicial, onChange, notaVacia }) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "position:relative; display:flex; flex-direction:column; gap:4px; flex:1 1 190px; width:auto; max-width:240px;";

    const label = document.createElement("label");
    label.textContent = etiqueta;
    label.style.cssText = `font-size:11px; color:${PALETA.borde}; letter-spacing:0.03em; text-transform:uppercase;`;

    const input = document.createElement("input");
    input.type = "text";
    input.value = valorInicial;
    input.readOnly = true;
    input.style.cssText = `
      padding:6px 10px; border:1px solid ${PALETA.borde}; border-radius:4px;
      background:${PALETA.fondoPergamino}; color:${PALETA.tintaOscura};
      font-size:13px; cursor:pointer; font-family: Georgia, serif;
    `;

    const lista = document.createElement("ul");
    lista.style.cssText = `
      position:absolute; top:100%; left:0; right:0; z-index:50;
      max-height:220px; overflow-y:auto; margin:2px 0 0; padding:0;
      list-style:none; background:#fdf8ec; border:1px solid ${PALETA.borde};
      border-radius:4px; display:none; box-shadow:0 4px 10px rgba(0,0,0,0.25);
    `;

    const nota = document.createElement("div");
    nota.style.cssText = `font-size:11.5px; font-style:italic; color:${PALETA.borde}; opacity:0.85; display:none;`;

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
        li.style.cssText = "padding:6px 10px; font-size:13px; cursor:pointer;";
        li.addEventListener("mouseenter", () => (li.style.background = PALETA.tierra));
        li.addEventListener("mouseleave", () => (li.style.background = "transparent"));
        li.addEventListener("mousedown", e => e.preventDefault());
        li.addEventListener("click", () => {
          input.value = op;
          lista.style.display = "none";
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
      lista.style.display = "block";
      input.dataset.valorPrevio = valorActual;
    });

    input.addEventListener("input", () => pintarLista(input.value));

    input.addEventListener("blur", () => {
      setTimeout(() => {
        lista.style.display = "none";
        input.readOnly = true;
        if (!opcionesCompletas.includes(input.value)) {
          input.value = input.dataset.valorPrevio || valorInicial;
        }
      }, 100);
    });

    wrap.append(label, input, lista, nota);
    panelFiltros.appendChild(wrap);

    // Permite refrescar las opciones disponibles (p. ej. subcrímenes según el crimen elegido).
    function actualizarOpciones(nuevasOpciones) {
      opcionesCompletas = ["Todos", ...nuevasOpciones];
      input.value = "Todos";
      if (nuevasOpciones.length === 0) {
        input.style.display = "none";
        nota.textContent = notaVacia || "Sin opciones disponibles para la selección actual.";
        nota.style.display = "block";
      } else {
        input.style.display = "";
        nota.style.display = "none";
      }
    }

    return { wrap, actualizarOpciones };
  }

  // -- control de tiempo: slider para el instante dentro de la escala activa --
  // (la escala en sí —año/década/siglo— se elige en la barra superior)
  // Va primero en el panel: la fecha es el filtro principal del dashboard.
  const wrapTiempo = document.createElement("div");
  wrapTiempo.style.cssText = "display:flex; flex-direction:column; gap:6px; flex:1 1 240px; width:auto; max-width:300px;";

  const labelTiempo = document.createElement("label");
  labelTiempo.textContent = "Fecha";
  labelTiempo.style.cssText = `font-size:11px; color:${PALETA.borde}; letter-spacing:0.03em; text-transform:uppercase;`;

  const slider = document.createElement("input");
  slider.type = "range";
  slider.style.cssText = `width:100%; accent-color:${PALETA.acentoLinea};`;

  // En modo "siglo" no hay slider: son solo 4 valores, así que se eligen con
  // un botón por siglo en vez de arrastrar una barra espaciadora.
  const filaSiglos = document.createElement("div");
  filaSiglos.style.cssText = "display:flex; gap:4px; width:100%;";
  const botonesSiglo = {};
  SIGLOS.forEach(siglo => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = siglo.replace("Siglo ", "");
    btn.style.cssText = `
      flex:1; padding:5px 4px; font-size:11px; border-radius:4px;
      border:1px solid ${PALETA.borde}; background:${PALETA.fondoPergamino};
      color:${PALETA.tintaOscura}; cursor:pointer; font-family: Georgia, serif;
    `;
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
  etiquetaTiempo.style.cssText = `text-align:center; font-size:13px; font-weight:700; color:${PALETA.tintaOscura};`;

  function sincronizarSlider() {
    const lista = tiempoListaActual();
    const esSiglo = estado.modoTiempo === "siglo";
    slider.min = 0;
    slider.max = lista.length - 1;
    slider.step = 1;
    slider.value = estado.tiempoIdx;
    slider.style.display = esSiglo ? "none" : "";
    filaSiglos.style.display = esSiglo ? "flex" : "none";
    etiquetaTiempo.textContent = valorTiempoActual();
    Object.entries(botonesModoTiempo).forEach(([modo, btn]) => {
      const activo = estado.modoTiempo === modo;
      btn.style.background = activo ? PALETA.acentoLinea : PALETA.fondoPergamino;
      btn.style.color = activo ? "#fff" : PALETA.tintaOscura;
    });
    Object.entries(botonesSiglo).forEach(([siglo, btn]) => {
      const activo = esSiglo && valorTiempoActual() === siglo;
      btn.style.background = activo ? PALETA.acentoLinea : PALETA.fondoPergamino;
      btn.style.color = activo ? "#fff" : PALETA.tintaOscura;
    });
  }

  // Convierte el instante actual (en cualquier escala) a un año representativo,
  // para ubicar el instante equivalente más cercano al cambiar de escala.
  function añoRepresentativoActual() {
    const valor = valorTiempoActual();
    if (estado.modoTiempo === "siglo") {
      const base = { "Siglo XVI": 1550, "Siglo XVII": 1650, "Siglo XVIII": 1750, "Siglo XIX": 1850 };
      return base[valor] ?? 1650;
    }
    return valor; // la década ya es numérica
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

  // -- select simple de crimen general (pocas opciones) --
  function subcrimenesParaCrimen(crimen) {
    if (crimen === "Todos") return subcrimenesLista;
    return [...new Set(
      datosLimpios
        .filter(d => d.Nombre_Codigo === crimen && !nombresGenerales.has(d.Nombre_Sub_Codigo))
        .map(d => d.Nombre_Sub_Codigo)
    )].sort(compararPorLinaje);
  }

  const wrapCrimen = document.createElement("div");
  wrapCrimen.style.cssText = "display:flex; flex-direction:column; gap:4px; flex:1 1 190px; width:auto; max-width:240px;";
  const labelCrimen = document.createElement("label");
  labelCrimen.textContent = "Crimen";
  labelCrimen.style.cssText = `font-size:11px; color:${PALETA.borde}; letter-spacing:0.03em; text-transform:uppercase;`;
  const selectCrimen = document.createElement("select");
  selectCrimen.style.cssText = `
    padding:6px 10px; border:1px solid ${PALETA.borde}; border-radius:4px;
    background:${PALETA.fondoPergamino}; color:${PALETA.tintaOscura};
    font-size:13px; font-family: Georgia, serif;
  `;
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

  // -- subcrímenes: solo se listan los que pertenecen al crimen elegido arriba --
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

  // -- botón para limpiar comparaciones fijadas --
  const btnLimpiarPines = document.createElement("button");
  btnLimpiarPines.type = "button";
  btnLimpiarPines.textContent = "Quitar comparaciones";
  btnLimpiarPines.style.cssText = `
    padding:8px 14px; font-size:12px; border-radius:4px;
    border:1px solid ${PALETA.borde}; background:transparent;
    color:${PALETA.borde}; cursor:pointer; font-family: Georgia, serif;
    align-self:center; white-space:nowrap; display:none;
  `;
  btnLimpiarPines.addEventListener("click", () => {
    estado.lugaresFijados.clear();
    btnLimpiarPines.style.display = "none";
    actualizarMapa();
    actualizarPanelSecundario(true);
  });
  panelFiltros.appendChild(btnLimpiarPines);

  // -- aviso: el lugar seleccionado no tiene casos en la fecha actual --
  const avisoSinDatos = document.createElement("div");
  avisoSinDatos.style.cssText = `
    display:none; flex-basis:100%; width:100%; padding:8px 12px;
    border:1px solid #a33; border-radius:4px; background:#f7dede;
    color:#7a1f1f; font-family: Georgia, serif; font-size:12px;
  `;
  panelFiltros.appendChild(avisoSinDatos);

  function actualizarAvisoLugar() {
    if (estado.lugar === "Todos") {
      avisoSinDatos.style.display = "none";
      return;
    }
    const campo = campoTiempoActual();
    const valor = valorTiempoActual();
    const hayDatos = datosFiltradosBase().some(d => d.lugar === estado.lugar && d[campo] === valor);
    if (hayDatos) {
      avisoSinDatos.style.display = "none";
    } else {
      avisoSinDatos.textContent = `No hay datos para "${estado.lugar}" en ${valor}.`;
      avisoSinDatos.style.display = "block";
    }
  }

  sincronizarSlider();

  // ══════════════════════════════════════════════════════════════════════
  // COMPONENTE 1: MAPA (visual principal, con cápsulas de tiempo)
  // ══════════════════════════════════════════════════════════════════════
  const width = 760;
  const height = 820;

  // Botón "Ver casos": aparece al seleccionar (clic) una fila de una cápsula
  // (crimen/subcrimen de un lugar en la fecha activa); es la única forma de
  // pasar de ahí a la tabla de documentos filtrada — el clic en sí solo
  // selecciona/resalta esa fila dentro del mapa.
  const botonVerCasosMapa = crearBotonVerCasos();
  botonVerCasosMapa.boton.style.marginBottom = "8px";
  mapaContenedor.appendChild(botonVerCasosMapa.boton);

  const svgMapa = d3.select(mapaContenedor)
    .append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height])
    .attr("style", `max-width: 100%; height: auto; background-color: ${PALETA.fondoPergamino}; border-radius:6px;`);

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

  const rScale = d3.scaleSqrt().range([0, 20]);
  const colorScaleMap = d3.scaleSequential().interpolator(d3.interpolateReds);

  // Lugar actualmente en hover (si hay uno), para poder redibujar su cápsula
  // cuando cambia el zoom (su contraescala 1/k quedaría desactualizada si no).
  let lugarHoverActivo = null;

  const zoom = d3.zoom()
    .scaleExtent([1, 12])
    .on("zoom", event => {
      gZoom.attr("transform", event.transform);
      const k = event.transform.k;
      gMapaBase.selectAll("path").attr("stroke-width", 0.5 / k);
      gPuntos.selectAll("circle").attr("stroke-width", 0.5 / k);
      // Las cápsulas se contrarrestan con scale(1/k) para no cambiar de tamaño
      // con el zoom: hay que recalcularlas en cada paso del zoom, si no,
      // quedan con la escala del frame anterior.
      dibujarCapsulasFijadas();
      if (lugarHoverActivo) {
        gCapsulas.selectAll("g.capsula-hover").remove();
        const gTemp = gCapsulas.append("g").attr("class", "capsula-hover").style("pointer-events", "none");
        construirCapsula(gTemp, lugarHoverActivo.lugar, lugarHoverActivo.coords);
      }
    });

  svgMapa.call(zoom);

  // Clic en una fila de la cápsula (un crimen o subcrimen del lugar/fecha
  // activos): solo selecciona/resalta esa fila y muestra el botón "Ver casos"
  // — el botón es la única forma de pasar de ahí a la tabla filtrada.
  let seleccionFilaMapa = null; // { lugar, nombre }

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
        // Fila "general": el lugar no tiene subcrímenes propios para este crimen.
        irATablasFiltradas({ lugar, codigo: estado.crimen, subcodigo: null });
      } else {
        irATablasFiltradas({ lugar, codigo: estado.crimen, subcodigo: nombreFila });
      }
    });
  }

  // Tamaño de la cápsula según cuántas filas de crímenes va a mostrar, para
  // poder calcular colisiones antes de dibujar (ver dibujarCapsulasFijadas).
  function medirCapsula(lugar) {
    const referencia = datosReferenciaLugar(lugar);
    const filasVisibles = referencia.slice(0, 5);
    const totalCasos = referencia.reduce((a, r) => a + r.casos, 0);
    const anchoC = 175;
    const altoC = totalCasos === 0 ? 46 : 30 + filasVisibles.length * 16;
    return { referencia, filasVisibles, totalCasos, anchoC, altoC };
  }

  // Cápsula única del mapa: reemplaza el antiguo tooltip de texto plano.
  // Reúne en un solo lugar la gráfica de crímenes más comunes, la provincia,
  // el lugar y la fecha (siglo/década activa), tanto al pasar el mouse como
  // al fijar (clic) un lugar para comparar.
  function construirCapsula(g, lugar, coords, posOverride) {
    const { filasVisibles, totalCasos, anchoC, altoC } = medirCapsula(lugar);
    const provincia = getProvincia(coords);

    // La cápsula vive dentro de gZoom, así que hereda su zoom (translate+scale).
    // Para que el tamaño en pantalla se mantenga constante y legible sin
    // importar el nivel de zoom, se contrarresta con scale(1/k): la posición
    // (en unidades "modelo", pre-zoom) sigue moviéndose/escalando con el mapa,
    // pero el contenido interno de la cápsula ya no.
    const k = d3.zoomTransform(svgMapa.node()).k;
    const px = projection(coords)[0];
    const py = projection(coords)[1];
    const destino = posOverride || { x: px - (anchoC / 2) / k, y: py - (altoC + 16) / k };
    g.attr("transform", `translate(${destino.x}, ${destino.y}) scale(${1 / k})`);
    g.selectAll("*").remove();

    // Si la cápsula se desplazó de su punto natural (para no superponerse con
    // otra fijada), se dibuja una línea guía hasta el punto real en el mapa.
    // OJO: "g" ya tiene translate(destino.x, destino.y) scale(1/k) aplicado, así
    // que estas coordenadas deben ser LOCALES a esa cápsula (revirtiendo el
    // translate y multiplicando por k), no absolutas del mapa — de lo contrario
    // el desplazamiento no coincide y la línea no llega al punto real.
    const puntaLocalX = anchoC / 2;
    const puntaLocalY = altoC;
    const puntoLocalX = (px - destino.x) * k;
    const puntoLocalY = (py - destino.y) * k;
    if (Math.abs(puntoLocalX - puntaLocalX) > 1 || Math.abs(puntoLocalY - (puntaLocalY + 8)) > 1) {
      g.append("line")
        .attr("x1", puntaLocalX).attr("y1", puntaLocalY + 4)
        .attr("x2", puntoLocalX).attr("y2", puntoLocalY)
        .attr("stroke", PALETA.acentoLinea)
        .attr("stroke-width", 1.2)
        .attr("stroke-dasharray", "3,2");
      g.append("circle")
        .attr("cx", puntoLocalX).attr("cy", puntoLocalY).attr("r", 3)
        .attr("fill", PALETA.acentoLinea);
    }

    g.append("rect")
      .attr("width", anchoC)
      .attr("height", altoC)
      .attr("rx", 5)
      .attr("fill", PALETA.tintaOscura)
      .attr("fill-opacity", 0.94)
      // Habilita hit-testing en toda la cápsula (el grupo "g" tiene
      // pointer-events:none) para que la cápsula-hover no se cierre justo
      // cuando el mouse se mueve del punto hacia ella (ver manejarHoverPunto).
      .style("pointer-events", "all");

    g.append("text")
      .attr("x", 8).attr("y", 13)
      .attr("fill", PALETA.fondoPergamino)
      .style("font-size", "9px").style("font-weight", "700").style("font-family", "Georgia, serif")
      .text(lugar.length > 22 ? lugar.slice(0, 20) + "…" : lugar);

    g.append("text")
      .attr("x", 8).attr("y", 24)
      .attr("fill", PALETA.acentoSecundario)
      .style("font-size", "8px").style("font-family", "Georgia, serif")
      .text(`${provincia} · ${valorTiempoActual()}`);

    if (totalCasos === 0) {
      g.append("text")
        .attr("x", anchoC / 2).attr("y", altoC - 12)
        .attr("text-anchor", "middle")
        .attr("fill", PALETA.fondoPergamino)
        .style("font-size", "11px").style("font-style", "italic").style("font-family", "Georgia, serif")
        .text("Sin casos");
    } else {
      const maxCasos = d3.max(filasVisibles, d => d.casos) || 1;
      const xBarra = d3.scaleLinear().domain([0, maxCasos]).range([0, 55]);
      filasVisibles.forEach((r, i) => {
        const yRow = 30 + i * 16;
        const filaSeleccionada = !!(seleccionFilaMapa && seleccionFilaMapa.lugar === lugar && seleccionFilaMapa.nombre === r.nombre);
        g.append("text")
          .attr("x", 8).attr("y", yRow + 8)
          .attr("fill", PALETA.fondoPergamino)
          .style("font-size", "9px").style("font-family", "Georgia, serif")
          .style("font-weight", filaSeleccionada ? "700" : "400")
          .text(r.nombre.length > 15 ? r.nombre.slice(0, 13) + "…" : r.nombre);
        g.append("rect")
          .attr("x", 100).attr("y", yRow + 1)
          .attr("width", xBarra(r.casos)).attr("height", 7).attr("rx", 2)
          .attr("fill", PALETA.acentoLinea)
          .attr("stroke", filaSeleccionada ? "#fff" : "none")
          .attr("stroke-width", filaSeleccionada ? 1 : 0);
        g.append("text")
          .attr("x", anchoC - 8).attr("y", yRow + 8)
          .attr("text-anchor", "end")
          .attr("fill", PALETA.fondoPergamino)
          .style("font-size", "8px").style("font-family", "Georgia, serif")
          .text(r.casos);

        // Fila clicable: solo selecciona/resalta esta fila (lugar + crimen o
        // subcrimen). El botón "Ver casos" es lo que realmente navega.
        g.append("rect")
          .attr("x", 0).attr("y", yRow - 2)
          .attr("width", anchoC).attr("height", 16)
          .attr("fill", filaSeleccionada ? "rgba(255,255,255,0.16)" : "transparent")
          .style("pointer-events", "all")
          .style("cursor", "pointer")
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
      .attr("fill", PALETA.tintaOscura)
      .attr("fill-opacity", 0.94);
  }

  function actualizarMapa() {
    const datos = agruparMapaInstante();
    rScale.domain([0, d3.max(datos, d => d.count) || 1]);
    colorScaleMap.domain(d3.extent(datos, d => d.año));

    const puntos = gPuntos.selectAll("circle")
      .data(datos, d => `${d.lugar}||${d.Nombre_Codigo}`);

    puntos.join(
      enter => enter.append("circle")
        .attr("cx", d => projection(d.coords)[0])
        .attr("cy", d => projection(d.coords)[1])
        .attr("r", 0)
        .attr("fill", d => colorScaleMap(d.año))
        .attr("fill-opacity", 0.65)
        .attr("stroke", PALETA.fondoPergamino)
        .attr("stroke-width", 0.5)
        .style("cursor", "pointer")
        .call(enter => enter.transition().duration(220).attr("r", d => rScale(d.count)))
        .on("mouseenter", (event, d) => manejarHoverPunto(event, d, true))
        .on("mouseleave", (event, d) => manejarHoverPunto(event, d, false))
        .on("click", (event, d) => alternarPin(d.lugar)),
      update => update
        .call(update => update.transition().duration(180)
          .attr("cx", d => projection(d.coords)[0])
          .attr("cy", d => projection(d.coords)[1])
          .attr("r", d => rScale(d.count))
          .attr("fill", d => colorScaleMap(d.año))),
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
        // mouseenter/mouseleave propios: si el cursor se mueve del punto hacia
        // la cápsula (para hacer clic en una fila), no debe cerrarse a mitad
        // de camino — solo se oculta con un pequeño margen si de verdad la deja.
        const gTemp = gCapsulas.append("g").attr("class", "capsula-hover")
          .style("pointer-events", "none")
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
    btnLimpiarPines.style.display = estado.lugaresFijados.size > 0 ? "inline-block" : "none";
    dibujarCapsulasFijadas();
    actualizarPanelSecundario(true);
  }

  // ¿Se superponen dos rectángulos de cápsula (con un pequeño margen de aire)?
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
    const cajasOcupadas = []; // en píxeles reales de pantalla, no en unidades "modelo"

    // El tamaño de cápsula (anchoC/altoC) es fijo EN PANTALLA (ver construirCapsula,
    // que la contrarresta con scale(1/k)). Por eso la detección de colisiones y
    // la cascada de desplazamiento se calculan aquí en píxeles reales de pantalla
    // (aplicando la transformación de zoom actual), y solo al final se convierte
    // la posición elegida de vuelta a unidades "modelo" para ubicar la cápsula
    // dentro de gZoom.
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

      // Posición natural: justo arriba del punto. Si ya hay otra cápsula fijada
      // ahí, se va desplazando en cascada (alternando lados, y subiendo más)
      // hasta encontrar un hueco de pantalla libre, para que no se superpongan.
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

      // Volver a unidades "modelo" (coordenadas pre-zoom dentro de gZoom).
      const destino = { x: (caja.x - t.x) / k, y: (caja.y - t.y) / k };

      const g = gCapsulas.append("g").attr("class", "capsula-fija").style("pointer-events", "none");
      construirCapsula(g, lugar, coords, destino);
      g.select("rect").attr("stroke", PALETA.acentoLinea).attr("stroke-width", 1.5);
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // COMPONENTE 2: PANEL SECUNDARIO (detalle sincronizado con el mapa)
  // ══════════════════════════════════════════════════════════════════════
  const contenedorLineas = document.getElementById("crimenesChart");
  let timerRef = null;

  if (contenedorLineas) {
    contenedorLineas.style.position = "relative";

    // Botón "Ver casos": aparece al seleccionar (clic) un punto de la línea;
    // es la única forma de pasar de ahí a la tabla de documentos filtrada.
    // Se coloca FUERA de contenedorLineas (que se vacía en cada render).
    const botonVerCasosLinea = crearBotonVerCasos();
    if (contenedorLineas.parentElement) {
      contenedorLineas.parentElement.insertBefore(botonVerCasosLinea.boton, contenedorLineas);
    }
    let seleccionPuntoLinea = null; // "serieNombre||tiempo"
    let lineGroupsPorSerie = new Map(); // nombre de serie -> selección d3 de su grupo

    const tooltipLineas = document.createElement("div");
    tooltipLineas.style.cssText = `
      position:absolute; pointer-events:none; background:${PALETA.tintaOscura};
      color:#fff; padding:6px 10px; border-radius:4px; font-size:12px;
      font-family: system-ui, sans-serif; opacity:0; transition:opacity 0.1s;
      z-index:10; max-width:220px;
    `;

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
      // "Delitos" (nivel general, sin subcrimen específico) nunca se grafica como subcrimen.
      const filtradosConSubcrimen = filtrados.filter(d => !nombresGenerales.has(d.Nombre_Sub_Codigo));
      const subNombres = [...new Set(filtradosConSubcrimen.map(d => d.Nombre_Sub_Codigo))].sort(compararPorLinaje);

      if (subNombres.length === 0) {
        // Este crimen no tiene subcrímenes propios: una sola serie con el
        // nombre del crimen (no "Delitos", no "Todos los crímenes").
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

      // Cada render reconstruye el SVG desde cero: la selección/resaltado
      // anterior queda referida a elementos que ya no existen.
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

      // Acción final del botón "Ver casos": tabla de documentos filtrada por
      // esa fecha y por lo que representa la serie del punto seleccionado.
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

      // Clic en un punto: solo resalta su serie (atenúa las demás) y muestra
      // el botón "Ver casos" — el clic en sí no navega.
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
        aviso.style.cssText = `
          display:flex; align-items:center; justify-content:center;
          height:300px; color:${PALETA.borde}; font-family: Georgia, serif;
          font-style:italic; font-size:15px; border:1px dashed ${PALETA.borde};
          border-radius:6px; background:${PALETA.fondoPergamino};
        `;
        aviso.textContent = "Sin casos con los filtros actuales";
        contenedorLineas.appendChild(aviso);
        return;
      }

      const colorScaleLine = d3.scaleOrdinal().domain(series.map(s => s.nombre)).range(COLORES_SERIE);

      const svgLine = d3.create("svg")
        .attr("viewBox", `0 0 ${WIDTH} ${HEIGHT}`)
        .attr("style", "max-width: 100%; height: auto; overflow: visible; display:block;")
        .style("font-family", "system-ui, sans-serif")
        .on("click", () => limpiarSeleccionLinea());

      const g = svgLine.append("g").attr("transform", `translate(${MARGIN.left},${MARGIN.top})`);
      const x = d3.scalePoint().domain(lista).range([0, IW]).padding(0.2);
      // Solo números enteros (frecuencias/conteos de casos), nunca porcentajes.
      const valores = series.flatMap(s => s.puntos.map(p => p.cantidad));
      const yMax = d3.max(valores) || 1;
      const yTope = Math.ceil(yMax * 1.15) || 1;
      const y = d3.scaleLinear().domain([0, yTope]).range([IH, 0]);

      g.append("g")
        .call(d3.axisLeft(y).ticks(5).tickSize(-IW).tickFormat(""))
        .call(gg => { gg.select(".domain").remove(); gg.selectAll("line").attr("stroke", "#e8e8e8"); });

      // En año/década se muestran solo el primer y último valor del eje para
      // evitar acumulación de etiquetas; en siglo (pocas categorías) se ven todas.
      const ejeXTiempo = d3.axisBottom(x).tickSize(0);
      if (estado.modoTiempo !== "siglo" && lista.length > 2) {
        ejeXTiempo.tickValues([lista[0], lista[lista.length - 1]]);
      }
      g.append("g")
        .attr("transform", `translate(0,${IH})`)
        .call(ejeXTiempo)
        .call(gg => {
          gg.select(".domain").attr("stroke", "#ccc");
          gg.selectAll("text").style("font-size", lista.length > 6 ? "9px" : "12px").style("fill", "#555").attr("dy", "1.4em");
        });

      g.append("g")
        .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format("d")))
        .call(gg => { gg.select(".domain").remove(); gg.selectAll("text").style("font-size", "11px").style("fill", "#666"); });

      const tituloTexto = enModoComparacion
        ? `Comparando ${series.length} lugar(es) fijado(s)`
        : (estado.crimen === "Todos" ? "Todos los crímenes" : estado.crimen);

      svgLine.append("text")
        .attr("x", MARGIN.left + IW / 2).attr("y", 22)
        .attr("text-anchor", "middle").style("font-size", "14px").style("font-weight", "700").style("fill", "#222")
        .text(tituloTexto);

      svgLine.append("text")
        .attr("x", MARGIN.left + IW / 2).attr("y", 40)
        .attr("text-anchor", "middle").style("font-size", "11px").style("fill", "#999")
        .text(`${totalGeneral} registros únicos · ${estado.modoTiempo === "siglo" ? "por siglo" : "por década"}`);

      const lineGen = d3.line().x(d => x(d.tiempo)).y(d => y(d.cantidad)).curve(d3.curveLinear);

      function dibujarSerieInstante(idx) {
        const serie = series[idx];
        const color = colorScaleLine(serie.nombre);
        const lineGroup = g.append("g");
        lineGroupsPorSerie.set(serie.nombre, lineGroup);
        // Si ya había una selección activa (p. ej. al redibujar solo esta serie
        // tras el resaltado inicial), respeta la opacidad correspondiente.
        if (seleccionPuntoLinea) {
          const nombreSerieActiva = seleccionPuntoLinea.split("||")[0];
          lineGroup.style("opacity", serie.nombre === nombreSerieActiva ? 1 : 0.2);
        }

        lineGroup.append("path")
          .datum(serie.puntos).attr("fill", "none").attr("stroke", color)
          .attr("stroke-width", 2.2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
          .attr("d", lineGen);

        serie.puntos.forEach(p => {
          lineGroup.append("circle")
            .attr("cx", x(p.tiempo)).attr("cy", y(p.cantidad)).attr("r", 4)
            .attr("fill", "white").attr("stroke", color).attr("stroke-width", 2);
          lineGroup.append("circle")
            .attr("cx", x(p.tiempo)).attr("cy", y(p.cantidad)).attr("r", 10)
            .attr("fill", "transparent").style("pointer-events", "all")
            .style("cursor", "pointer")
            .on("mouseenter", () => { tooltipLineas.innerHTML = p.etiqueta.replace(/\n/g, "<br/>"); tooltipLineas.style.opacity = 1; })
            .on("mousemove", event => {
              const rect = contenedorLineas.getBoundingClientRect();
              tooltipLineas.style.left = (event.clientX - rect.left + 12) + "px";
              tooltipLineas.style.top = (event.clientY - rect.top + 12) + "px";
            })
            .on("mouseleave", () => (tooltipLineas.style.opacity = 0))
            .on("click", event => {
              event.stopPropagation();
              seleccionarPuntoLinea(serie, p.tiempo);
            });
        });

        const ultimoPunto = [...serie.puntos].reverse().find(p => p.cantidad > 0) || serie.puntos[serie.puntos.length - 1];
        lineGroup.append("text")
          .attr("x", x(ultimoPunto.tiempo) + 8).attr("y", y(ultimoPunto.cantidad) + 4)
          .style("font-size", "11px").style("fill", color).style("font-weight", "600")
          .text(serie.nombre.length > 22 ? serie.nombre.slice(0, 20) + "…" : serie.nombre);
      }

      function revelarSecuencial(idx) {
        if (idx >= series.length) return;
        const color = colorScaleLine(series[idx].nombre);
        const lineGroup = g.append("g");
        const pathLine = lineGroup.append("path")
          .datum(series[idx].puntos).attr("fill", "none").attr("stroke", color)
          .attr("stroke-width", 2.2).attr("stroke-linejoin", "round").attr("stroke-linecap", "round")
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

  // ══════════════════════════════════════════════════════════════════════
  // COMPONENTE 3: GRAFO DE RELACIÓN ENTRE CRÍMENES
  // Coocurrencia de crímenes cometidos por un mismo agente (adaptado de
  // charts/grafoRelacioncrimenes.js). Del filtro general del dashboard solo
  // le afecta la fecha (siglo/década activa arriba) — Crimen/Subcrimen/Lugar
  // no aplican aquí. Tiene sus propios filtros exclusivos (Agente, Atributo,
  // Género), separados del panel de filtros principal.
  // ══════════════════════════════════════════════════════════════════════
  const estadoGrafo = { agente: "Todos", atributo: "Todos", genero: "Todos" };

  const agentesLista = [...new Set(datosLimpios.map(d => d.Agente))].filter(Boolean).sort();
  const atributosLista = [...new Set(datosLimpios.map(d => d.Atributo))].filter(Boolean).sort();
  const generosLista = [...new Set(datosLimpios.map(d => d.Género))].filter(Boolean).sort();

  function crearSelectGrafo(etiqueta, opciones, onChange) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex; flex-direction:column; gap:3px; flex:1 1 130px; min-width:110px;";
    const label = document.createElement("label");
    label.textContent = etiqueta;
    label.style.cssText = `font-size:10px; color:${PALETA.borde}; letter-spacing:0.03em; text-transform:uppercase;`;
    const select = document.createElement("select");
    select.style.cssText = `
      padding:5px 8px; border:1px solid ${PALETA.borde}; border-radius:4px;
      background:${PALETA.fondoPergamino}; color:${PALETA.tintaOscura};
      font-size:12px; font-family: Georgia, serif;
    `;
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
  filaFiltrosGrafo.style.cssText = "display:flex; flex-wrap:wrap; gap:10px 14px; margin-bottom:4px;";
  filaFiltrosGrafo.append(
    crearSelectGrafo("Agente", agentesLista, valor => { estadoGrafo.agente = valor; dibujarGrafo(); }),
    crearSelectGrafo("Atributo", atributosLista, valor => { estadoGrafo.atributo = valor; dibujarGrafo(); }),
    crearSelectGrafo("Género", generosLista, valor => { estadoGrafo.genero = valor; dibujarGrafo(); })
  );

  // Botón "Ver casos": aparece cuando se selecciona (clic) un nodo o un
  // vínculo del grafo, para ir a la tabla de documentos filtrada por esa
  // selección — sin perder la posibilidad de aislar/resaltar la conexión
  // dentro del propio grafo antes de decidir navegar.
  const botonVerCasosGrafo = crearBotonVerCasos();

  const areaGrafo = document.createElement("div");
  areaGrafo.style.cssText = "position:relative; width:100%;";

  contenedorGrafoEl.append(filaFiltrosGrafo, botonVerCasosGrafo.boton, areaGrafo);

  const GRAFO_WIDTH = 700;
  const GRAFO_HEIGHT = 380;
  const GRAFO_PADDING = 40;

  const tooltipGrafo = document.createElement("div");
  tooltipGrafo.style.cssText = `
    position:absolute; pointer-events:none; background:${PALETA.tintaOscura};
    color:#fff; padding:6px 10px; border-radius:4px; font-size:12px;
    font-family: Georgia, serif; opacity:0; transition:opacity 0.1s;
    z-index:10; max-width:220px;
  `;

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
      if (!agenteCrimenes.has(idAgente)) agenteCrimenes.set(idAgente, new Set());
      agenteCrimenes.get(idAgente).add(codigo);
      if (!crimenInfo.has(codigo)) crimenInfo.set(codigo, { nombre, count: 0 });
      crimenInfo.get(codigo).count += 1;
    });

    const nodes = Array.from(crimenInfo, ([codigo, info]) => ({ id: codigo, nombre: info.nombre, count: info.count }));

    const edgeMap = new Map();
    agenteCrimenes.forEach(codigosSet => {
      const codigos = Array.from(codigosSet);
      if (codigos.length < 2) return;
      for (let i = 0; i < codigos.length; i++) {
        for (let j = i + 1; j < codigos.length; j++) {
          const [a, b] = [codigos[i], codigos[j]].sort();
          const key = `${a}|${b}`;
          edgeMap.set(key, (edgeMap.get(key) || 0) + 1);
        }
      }
    });
    const links = Array.from(edgeMap, ([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight };
    });

    const adyacencia = new Map();
    nodes.forEach(n => adyacencia.set(n.id, new Set()));
    links.forEach(l => { adyacencia.get(l.source)?.add(l.target); adyacencia.get(l.target)?.add(l.source); });

    const vinculadosPorCodigo = new Map();
    nodes.forEach(n => vinculadosPorCodigo.set(n.id, new Set()));
    agenteCrimenes.forEach((codigosSet, idAgente) => {
      if (codigosSet.size < 2) return;
      codigosSet.forEach(codigo => vinculadosPorCodigo.get(codigo)?.add(idAgente));
    });

    areaGrafo.innerHTML = "";
    areaGrafo.appendChild(tooltipGrafo);

    if (nodes.length === 0) {
      const aviso = document.createElement("div");
      aviso.style.cssText = `
        display:flex; align-items:center; justify-content:center;
        height:220px; color:${PALETA.borde}; font-family: Georgia, serif;
        font-style:italic; font-size:14px; border:1px dashed ${PALETA.borde};
        border-radius:6px; background:${PALETA.fondoPergamino};
      `;
      aviso.textContent = "Sin casos con los filtros actuales";
      areaGrafo.appendChild(aviso);
      return;
    }

    const svg = d3.create("svg")
      .attr("viewBox", `0 0 ${GRAFO_WIDTH} ${GRAFO_HEIGHT}`)
      .attr("style", "max-width:100%; height:auto; display:block;")
      .style("font-family", "Georgia, serif");

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
      .attr("stroke", PALETA.borde).attr("stroke-opacity", 0.35)
      .attr("stroke-width", d => linkScale(d.weight));

    const node = svg.append("g").selectAll("circle").data(nodes).join("circle")
      .attr("r", d => radiusScale(d.count))
      .attr("fill", d => color(d.id))
      .attr("stroke", PALETA.fondoPergamino).attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .call(dragGrafo(simulation));

    const label = svg.append("g").selectAll("text").data(nodes).join("text")
      .text(d => d.nombre)
      .attr("font-size", 10).attr("text-anchor", "middle")
      .attr("dy", d => -radiusScale(d.count) - 6)
      .attr("fill", PALETA.tintaOscura)
      .style("pointer-events", "none");

    // Clic en un nodo o vínculo: resalta/aísla esa conexión dentro del propio
    // grafo (como antes) y muestra un botón "Ver casos" para recién ahí
    // navegar a la tabla de documentos filtrada.
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
      botonVerCasosGrafo.mostrar(`${nombreOrigen} ↔ ${nombreDestino}`, () => irATablasFiltradas({ codigo: nombreOrigen }));
    });

    svg.on("click", () => limpiarSeleccionGrafo());

    node
      .on("mouseenter", (event, d) => {
        const vinculados = vinculadosPorCodigo.get(d.id)?.size || 0;
        tooltipGrafo.innerHTML = `<strong>${d.nombre}</strong><br/>Casos: ${d.count}<br/>Vínculos con otros crímenes: ${vinculados}`;
        tooltipGrafo.style.opacity = 1;
      })
      .on("mousemove", event => {
        const rect = areaGrafo.getBoundingClientRect();
        tooltipGrafo.style.left = (event.clientX - rect.left + 12) + "px";
        tooltipGrafo.style.top = (event.clientY - rect.top + 12) + "px";
      })
      .on("mouseleave", () => (tooltipGrafo.style.opacity = 0));

    link
      .style("pointer-events", "stroke")
      .on("mouseenter", (event, d) => {
        tooltipGrafo.innerHTML = `${d.source.nombre || d.source} ↔ ${d.target.nombre || d.target}<br/>Agentes en común: <strong>${d.weight}</strong>`;
        tooltipGrafo.style.opacity = 1;
      })
      .on("mousemove", event => {
        const rect = areaGrafo.getBoundingClientRect();
        tooltipGrafo.style.left = (event.clientX - rect.left + 12) + "px";
        tooltipGrafo.style.top = (event.clientY - rect.top + 12) + "px";
      })
      .on("mouseleave", () => (tooltipGrafo.style.opacity = 0));

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

  // ── Render inicial ───────────────────────────────────────────────────
  actualizarMapa();
  actualizarPanelSecundario(true);
  actualizarGrafoRelacion();
}