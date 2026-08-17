import * as d3 from "d3";
import { PALETA_GENERO, PALETA_TIPO, PALETA_ATRIBUTO, SIGLOS, getSiglo } from "./agentesComun.js";

const GENEROS = ["Mujer", "Hombre", "Sin información"];
const TIPOS_OTROS_AGENTES = [
  { label: "Institución", nombre: "Instituciones" },
  { label: "Población Indígena Completa", nombre: "Población Indígena" },
  { label: "Población Completa", nombre: "Población General" },
];

const coincideGenero = (valor, genero) => {
  if (genero === "Sin información") {
    return !valor || valor.trim() === "" || valor === "Sin información" || valor === "null";
  }
  return valor === genero;
};

function irATabla(filtros) {
  const params = new URLSearchParams();
  Object.entries(filtros).forEach(([clave, valor]) => {
    if (valor) params.set(clave, valor);
  });
  window.location.href = `../base-de-datos/index.html?${params.toString()}`;
}

function resumirGrupo(filas) {
  const idCasos = new Set(filas.map(d => d.ID_Caso));
  const idAgentes = new Set(filas.map(d => d.ID_Agente));
  const victimas = filas.filter(d => d.Atributo === "Víctima").length;
  const perpetradores = filas.filter(d => d.Atributo === "Perpetrador").length;
  const complices = filas.filter(d => d.Atributo === "Cómplice").length;
  const total = filas.length;

  const conteoDelitos = new Map();
  filas.forEach(d => {
    const nombre = d.Nombre_Codigo && d.Nombre_Codigo.trim();
    if (!nombre) return;
    conteoDelitos.set(nombre, (conteoDelitos.get(nombre) || 0) + 1);
  });
  const delitoTop = [...conteoDelitos.entries()].sort((a, b) => b[1] - a[1])[0] || null;

  const siglos = {};
  SIGLOS.forEach(siglo => {
    siglos[siglo] = filas.filter(d => getSiglo(+d.Año) === siglo).length;
  });

  return {
    total,
    personas: idAgentes.size,
    casos: idCasos.size,
    victimas,
    perpetradores,
    complices,
    acusadas: perpetradores + complices,
    delitoTop,
    siglos,
  };
}

export async function crearConteoInteractivo() {

  const container = document.getElementById("conteoInteractivo");
  if (!container) return;

  const [datos, casos] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`),
    d3.csv(`${import.meta.env.BASE_URL}/data/Casos.csv`),
  ]);

  const personas = datos.filter(d => d.Agente === "Persona" && d.ID_Agente);

  const statsPorGenero = new Map(
    GENEROS.map(g => [g, resumirGrupo(personas.filter(d => coincideGenero(d.Género, g)))])
  );

  const statsPorTipo = new Map(
    TIPOS_OTROS_AGENTES.map(({ label }) => [label, resumirGrupo(datos.filter(d => d.Agente === label))])
  );

  const totalCasos = casos.length;
  const casosConMencion = casos.filter(c => (c.MujeresMencionadas || "").trim() === "1").length;

  container.innerHTML = "";
  const root = document.createElement("div");
  root.className = "conteo-root";
  container.appendChild(root);

  const vistaPersonas = document.createElement("div");
  vistaPersonas.className = "conteo-vista";
  const vistaAgentes = document.createElement("div");
  vistaAgentes.className = "conteo-vista";

  const encabezado = document.createElement("div");
  encabezado.className = "conteo-encabezado";
  root.appendChild(encabezado);

  const botonExpandir = document.createElement("a");
  botonExpandir.className = "conteo-expandir-btn";
  botonExpandir.textContent = "Expandir";

  dibujarToggle(encabezado, [
    { label: "Personas", color: "var(--genero-mujer)", texto: "var(--ink)", destino: "personas.html", vista: vistaPersonas },
    { label: "Otros agentes", color: "var(--tipo-institucion)", texto: "#fff", destino: "otrosAgentes.html", vista: vistaAgentes },
  ], opcion => {
    botonExpandir.href = opcion.destino;
    botonExpandir.style.setProperty("--cta-color", opcion.color);
    botonExpandir.style.setProperty("--cta-texto", opcion.texto);
  });

  encabezado.appendChild(botonExpandir);

  root.appendChild(vistaPersonas);
  root.appendChild(vistaAgentes);

  dibujarCuadrosConDetalle(vistaPersonas, GENEROS.map(genero => ({
    clave: genero,
    etiqueta: genero,
    color: PALETA_GENERO[genero],
    stats: statsPorGenero.get(genero),
    filtroBase: { agente: "Persona", genero },
    extra: genero === "Mujer" ? { valor: casosConMencion, total: totalCasos } : null,
  })));

  dibujarCuadrosConDetalle(vistaAgentes, TIPOS_OTROS_AGENTES.map(({ label, nombre }) => ({
    clave: label,
    etiqueta: nombre,
    color: PALETA_TIPO[label],
    stats: statsPorTipo.get(label),
    filtroBase: { agente: label },
  })));
}

// Barra de pestañas de color sólido (una por opción) que muestra una sola
// "vista" a la vez, igual que el bloque superior de la imagen de
// referencia pero con "Personas" / "Otros agentes" en vez de
// "Experiment" / "Data". `onActivar` se llama con la opción activa cada
// vez que cambia la pestaña (incluida la activación inicial), para que
// quien llama pueda sincronizar otros elementos (el botón "Expandir").
function dibujarToggle(padre, opciones, onActivar) {
  const barra = document.createElement("div");
  barra.className = "conteo-toggle";
  padre.appendChild(barra);

  const botones = opciones.map((opcion, indice) => {
    const boton = document.createElement("button");
    boton.type = "button";
    boton.className = "conteo-toggle-btn";
    boton.style.setProperty("--toggle-color", opcion.color);
    boton.textContent = opcion.label;
    boton.addEventListener("click", () => activar(indice));
    barra.appendChild(boton);
    return boton;
  });

  function activar(indice) {
    opciones.forEach((opcion, i) => {
      const activo = i === indice;
      botones[i].classList.toggle("conteo-toggle-btn--activo", activo);
      opcion.vista.hidden = !activo;
    });
    if (onActivar) onActivar(opciones[indice]);
  }

  activar(0);
}

function formatoPct(parte, total) {
  return total > 0 ? `${((parte / total) * 100).toFixed(1)}%` : "—";
}

// Blanco o tinta oscura según qué tan clara sea la tela de fondo, para que
// el número grande siempre se lea (--genero-sin-info es muy oscuro y
// necesita texto blanco; --genero-mujer/--genero-hombre son claros y
// funcionan mejor con la tinta oscura del sitio).
function colorTextoParaFondo(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminancia = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminancia > 0.55 ? "var(--ink)" : "#fff";
}

const DIAM_BURBUJA_MIN = 44;
const DIAM_BURBUJA_MAX = 130;

// Línea de tiempo por siglo, en burbujas: el diámetro de cada círculo
// representa la cantidad de personas de ese siglo (proporcional a la raíz
// cuadrada, para que sea el ÁREA la que refleje la cantidad), todas
// apoyadas sobre un mismo tallo que llega a una línea base común, como en
// la imagen de referencia. El número va dentro de la burbuja; el siglo
// queda debajo, en la base.
function crearTimeline(s, filtroBase, color) {
  const timeline = document.createElement("div");
  timeline.className = "conteo-detalle-timeline";

  const linea = document.createElement("div");
  linea.className = "conteo-detalle-timeline-linea";
  timeline.appendChild(linea);

  const valores = SIGLOS.map(siglo => s.siglos[siglo]);
  const maxValor = Math.max(...valores, 1);
  const texto = colorTextoParaFondo(color);

  SIGLOS.forEach((siglo, i) => {
    const valor = valores[i];
    const diametro = valor > 0
      ? DIAM_BURBUJA_MIN + (DIAM_BURBUJA_MAX - DIAM_BURBUJA_MIN) * Math.sqrt(valor / maxValor)
      : DIAM_BURBUJA_MIN * 0.55;

    const item = document.createElement("button");
    item.type = "button";
    item.className = "conteo-detalle-timeline-item";

    const burbuja = document.createElement("span");
    burbuja.className = "conteo-detalle-timeline-burbuja";
    burbuja.style.width = `${diametro}px`;
    burbuja.style.height = `${diametro}px`;
    burbuja.style.background = color;
    burbuja.style.color = texto;
    if (valor === 0) burbuja.style.opacity = "0.35";
    burbuja.textContent = valor.toLocaleString("es");
    item.appendChild(burbuja);

    const tallo = document.createElement("span");
    tallo.className = "conteo-detalle-timeline-tallo";
    item.appendChild(tallo);

    const etiquetaSiglo = document.createElement("span");
    etiquetaSiglo.className = "conteo-detalle-timeline-siglo";
    etiquetaSiglo.textContent = siglo.replace("Siglo ", "");
    item.appendChild(etiquetaSiglo);

    item.disabled = valor === 0;
    if (valor > 0) {
      item.addEventListener("click", () => irATabla({ ...filtroBase, fecha: siglo, escala: "siglo" }));
    }
    timeline.appendChild(item);
  });

  return timeline;
}

// Dos pestañas de folder: "Delito más frecuente" siempre a la izquierda
// (abierta por default), "Mujeres mencionadas" (solo cuando `mencion`
// viene con datos, es decir, para género "Mujer") en el extremo opuesto,
// a la derecha. Clic en una pestaña abre su panel debajo con más
// información; clic de nuevo lo cierra. Solo una pestaña puede estar
// abierta a la vez.
function crearFolderTabs({ delitoTop, filtroBase, mencion }) {
  const contenedor = document.createElement("div");
  contenedor.className = "conteo-detalle-folder";

  const tabs = document.createElement("div");
  tabs.className = "conteo-detalle-tabs";
  contenedor.appendChild(tabs);

  const panel = document.createElement("div");
  panel.className = "conteo-detalle-tab-panel";
  contenedor.appendChild(panel);

  let tabActiva = null;

  function pintarTabs() {
    tabs.querySelectorAll(".conteo-detalle-tab").forEach(t => {
      t.classList.toggle("conteo-detalle-tab--activa", t.dataset.tab === tabActiva);
    });
  }

  function abrir(clave, construirContenido) {
    tabActiva = clave;
    panel.innerHTML = "";
    panel.appendChild(construirContenido());
    panel.hidden = false;
    pintarTabs();
  }

  function alternar(clave, construirContenido) {
    if (tabActiva === clave) {
      tabActiva = null;
      panel.hidden = true;
      pintarTabs();
    } else {
      abrir(clave, construirContenido);
    }
  }

  function contenidoDelito() {
    const contenido = document.createElement("div");
    contenido.className = "conteo-detalle-tab-contenido";
    if (delitoTop) {
      const [nombreDelito, cantidad] = delitoTop;
      contenido.innerHTML = `
        <p class="conteo-detalle-tab-titulo">${nombreDelito}</p>
        <p class="conteo-detalle-tab-texto">${cantidad.toLocaleString("es")} caso(s) registrados: es el delito más frecuente de este grupo.</p>
      `;
      const link = document.createElement("button");
      link.type = "button";
      link.className = "conteo-detalle-tab-link";
      link.textContent = "Ver casos en la tabla →";
      link.addEventListener("click", () => irATabla({ ...filtroBase, codigo: nombreDelito }));
      contenido.appendChild(link);
    } else {
      contenido.innerHTML = `<p class="conteo-detalle-tab-texto">Sin delito registrado para esta selección.</p>`;
    }
    return contenido;
  }

  const tabDelito = document.createElement("button");
  tabDelito.type = "button";
  tabDelito.className = "conteo-detalle-tab conteo-detalle-tab--izquierda";
  tabDelito.dataset.tab = "delito";
  tabDelito.textContent = "Delito más frecuente";
  tabDelito.addEventListener("click", () => alternar("delito", contenidoDelito));
  tabs.appendChild(tabDelito);

  if (mencion) {
    const tabMencion = document.createElement("button");
    tabMencion.type = "button";
    tabMencion.className = "conteo-detalle-tab conteo-detalle-tab--derecha";
    tabMencion.dataset.tab = "mencion";
    tabMencion.textContent = "Mujeres mencionadas";
    tabMencion.addEventListener("click", () => alternar("mencion", () => {
      const contenido = document.createElement("div");
      contenido.className = "conteo-detalle-tab-contenido";
      contenido.innerHTML = `
        <p class="conteo-detalle-tab-titulo">${mencion.valor.toLocaleString("es")} caso(s)</p>
        <p class="conteo-detalle-tab-texto">${formatoPct(mencion.valor, mencion.total)} de ${mencion.total.toLocaleString("es")} casos totales mencionan a una mujer que no llegó a registrarse como agente.</p>
      `;
      return contenido;
    }));
    tabs.appendChild(tabMencion);
  }

  abrir("delito", contenidoDelito);

  return contenedor;
}

function dibujarCuadrosConDetalle(padre, items) {
  const cuadros = document.createElement("div");
  cuadros.className = "conteo-stat-cuadros";
  padre.appendChild(cuadros);

  const detalle = document.createElement("div");
  detalle.className = "conteo-detalle";
  detalle.hidden = true;
  padre.appendChild(detalle);

  let claveAbierta = null;

  function pintarActivo() {
    cuadros.querySelectorAll(".conteo-stat-cuadro").forEach(btn => {
      const activo = btn.dataset.clave === claveAbierta;
      btn.classList.toggle("conteo-stat-cuadro--activo", activo);
      btn.querySelector(".conteo-stat-cuadro-flecha").textContent = activo ? "▾" : "▸";
    });
  }

  function renderDetalle(item) {
    const { etiqueta, color, stats: s, filtroBase, extra } = item;
    detalle.innerHTML = "";
    detalle.style.setProperty("--detalle-color", color);

    const header = document.createElement("div");
    header.className = "conteo-detalle-header";
    header.innerHTML = `<span class="conteo-detalle-swatch" style="background:${color}"></span><h3>${etiqueta}</h3>`;
    detalle.appendChild(header);

    const ATRIBUTOS_DETALLE = [
      { nombre: "Víctima", etiqueta: "Víctimas", valor: s.victimas },
      { nombre: "Perpetrador", etiqueta: "Perpetradores", valor: s.perpetradores },
      { nombre: "Cómplice", etiqueta: "Cómplices", valor: s.complices },
    ];
    const totalAtributos = ATRIBUTOS_DETALLE.reduce((a, d) => a + d.valor, 0);
    const CELDAS_WAFFLE = 100;

    const atributos = document.createElement("div");
    atributos.className = "conteo-detalle-atributos";
    ATRIBUTOS_DETALLE.forEach(({ nombre, etiqueta: etiquetaAtributo, valor }) => {
      const colorAtributo = PALETA_ATRIBUTO[nombre];
      const pct = totalAtributos > 0 ? Math.round((valor / totalAtributos) * CELDAS_WAFFLE) : 0;

      const panel = document.createElement("button");
      panel.type = "button";
      panel.className = "conteo-detalle-atributo-panel";
      panel.style.setProperty("--panel-color", colorAtributo);
      panel.disabled = valor === 0;

      const pctEl = document.createElement("div");
      pctEl.className = "conteo-detalle-atributo-panel-pct";
      pctEl.textContent = formatoPct(valor, totalAtributos);
      panel.appendChild(pctEl);

      const waffle = document.createElement("div");
      waffle.className = "conteo-detalle-atributo-panel-waffle";
      for (let c = 0; c < CELDAS_WAFFLE; c++) {
        const celda = document.createElement("span");
        celda.className = "conteo-detalle-atributo-panel-celda";
        if (c >= CELDAS_WAFFLE - pct) celda.classList.add("conteo-detalle-atributo-panel-celda--llena");
        waffle.appendChild(celda);
      }
      panel.appendChild(waffle);

      const labelEl = document.createElement("div");
      labelEl.className = "conteo-detalle-atributo-panel-label";
      labelEl.textContent = etiquetaAtributo;
      panel.appendChild(labelEl);

      const numeroEl = document.createElement("div");
      numeroEl.className = "conteo-detalle-atributo-panel-numero";
      numeroEl.textContent = `${valor.toLocaleString("es")} caso(s)`;
      panel.appendChild(numeroEl);

      if (valor > 0) {
        panel.addEventListener("click", () => irATabla({ ...filtroBase, atributo: nombre }));
      }
      atributos.appendChild(panel);
    });

    detalle.appendChild(atributos);

    detalle.appendChild(crearFolderTabs({ delitoTop: s.delitoTop, filtroBase, mencion: extra }));

    detalle.appendChild(crearTimeline(s, filtroBase, color));

    detalle.hidden = false;
  }

  items.forEach(item => {
    const { clave, etiqueta, color, stats: s } = item;
    const cuadro = document.createElement("button");
    cuadro.type = "button";
    cuadro.className = "conteo-stat-cuadro";
    cuadro.dataset.clave = clave;
    cuadro.style.setProperty("--cuadro-color", color);
    cuadro.style.setProperty("--cuadro-texto", colorTextoParaFondo(color));
    cuadro.style.flexGrow = Math.sqrt(Math.max(s.personas, 1));
    cuadro.innerHTML = `
      <span class="conteo-stat-cuadro-flecha">▸</span>
      <div class="conteo-stat-cuadro-valor">${s.personas.toLocaleString("es")}</div>
      <div class="conteo-stat-cuadro-label">${etiqueta}</div>
      <div class="conteo-stat-cuadro-sub">${s.casos.toLocaleString("es")} caso(s)</div>
    `;
    cuadro.addEventListener("click", () => {
      if (claveAbierta === clave) {
        claveAbierta = null;
        detalle.hidden = true;
      } else {
        claveAbierta = clave;
        renderDetalle(item);
      }
      pintarActivo();
    });
    cuadros.appendChild(cuadro);
  });
}
