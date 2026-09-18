import * as d3 from 'd3';
import {
  ATRIBUTOS,
  cargarFilas,
  crearConfig,
  crimenesPorFrecuencia,
  fmt,
  formatoPct,
} from './ComposicionDatos.js';
import type { Fila, Grupo, Lado, Modo } from './ComposicionDatos.js';
import { PALETA_ATRIBUTO } from './agentesComun.js';
import { irATablasFiltradas } from './verCasos.js';
import { dibujarLineaEvolucion } from './ComposicionLinea.js';
import { dibujarBarras } from './ComposicionBarras.js';
import { dibujarRed } from './ComposicionRed.js';
import { dibujarDelitosSunburstGenero } from './DelitosSunburstGenero.js';
import { dibujarSunburst } from './InstitucionesAtributo.js';

const TOP_BARRAS = 5;
const TODOS_LOS_CRIMENES = 'Todos los crímenes';

interface Estado {
  /** Grupos elegidos (género o tipo). Vacío: todos, sin filtrar. */
  grupos: string[];
  crimen: string | null;
  desde: number;
  hasta: number;
  /** Si la barra doble muestra todos los delitos o solo los principales. */
  expandido: boolean;
  /** Si la red muestra todas las relaciones o solo las más comunes. */
  redCompleta: boolean;
  /** Gráfico circular: un solo anillo por vez, en lugar de los tres niveles. */
  donaUnNivel: boolean;
  /** Gráfico circular a todo el ancho. */
  donaGrande: boolean;
}

const porId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

function crearOpcion(valor: string, texto: string) {
  const opt = document.createElement('option');
  opt.value = valor;
  opt.textContent = texto;
  return opt;
}

export async function crearComposicionSocial(modo: Modo) {
  const el = {
    filtros: porId('csFiltros'),
    tarjetas: porId('csTarjetas'),
    rol: porId('csRol'),
    linea: porId('csLinea'),
    lineaSubtitulo: porId('csLineaSubtitulo'),
    barras: porId('csBarras'),
    donaSubtitulo: porId('csDonaSubtitulo'),
    rejilla: porId('csRejilla'),
    botonNivel: porId('csDonaNivel'),
    botonAmpliar: porId('csDonaAmpliar'),
    red: porId('csRed'),
    redSubtitulo: porId('csRedSubtitulo'),
  };
  if (Object.values(el).some((nodo) => !nodo)) return;
  const {
    filtros,
    tarjetas,
    rol,
    linea,
    lineaSubtitulo,
    barras,
    donaSubtitulo,
    rejilla,
    botonNivel,
    botonAmpliar,
    red,
    redSubtitulo,
  } = el as {
    [K in keyof typeof el]: HTMLElement;
  };

  const config = crearConfig(modo);
  const todas = await cargarFilas(modo);

  if (todas.length === 0) {
    tarjetas.innerHTML = `<p class="cs-vacio">No hay datos disponibles.</p>`;
    return;
  }

  const años = [...new Set(todas.map((f) => f.año))].sort((a, b) => a - b);
  const estado: Estado = {
    grupos: [],
    crimen: null,
    desde: años[0],
    hasta: años[años.length - 1],
    expandido: false,
    redCompleta: false,
    donaUnNivel: false,
    donaGrande: false,
  };
  const inicial = { ...estado };
  const crimenesOrdenados = crimenesPorFrecuencia(todas).map(([nombre]) => nombre);

  // ── Filtros ──────────────────────────────────────────────
  const selCrimen = document.createElement('select');
  selCrimen.className = 'cs-select';
  selCrimen.appendChild(crearOpcion('', TODOS_LOS_CRIMENES));
  crimenesOrdenados.forEach((c) => selCrimen.appendChild(crearOpcion(c, c)));

  const crearSelectorAño = (campo: 'desde' | 'hasta') => {
    const sel = document.createElement('select');
    sel.className = 'cs-select';
    años.forEach((a) => sel.appendChild(crearOpcion(String(a), String(a))));
    sel.addEventListener('change', () => {
      const valor = +sel.value;
      if (campo === 'desde') {
        estado.desde = valor;
        estado.hasta = Math.max(estado.hasta, valor);
      } else {
        estado.hasta = valor;
        estado.desde = Math.min(estado.desde, valor);
      }
      actualizar();
    });
    return sel;
  };
  const selDesde = crearSelectorAño('desde');
  const selHasta = crearSelectorAño('hasta');

  selCrimen.addEventListener('change', () => {
    estado.crimen = selCrimen.value || null;
    actualizar();
  });

  const campo = (titulo: string, control: HTMLElement) => {
    const wrap = document.createElement('label');
    wrap.className = 'cs-campo';
    const t = document.createElement('span');
    t.className = 'cs-campo-titulo';
    t.textContent = titulo;
    wrap.append(t, control);
    return wrap;
  };

  const bloqueGrupo = document.createElement('div');
  bloqueGrupo.className = 'cs-campo cs-campo--grupo';
  const tituloGrupo = document.createElement('span');
  tituloGrupo.className = 'cs-campo-titulo';
  tituloGrupo.textContent = `${config.etiquetaFiltro} · elige uno o varios para compararlos`;
  const chips = document.createElement('div');
  chips.className = 'cs-chips';
  bloqueGrupo.append(tituloGrupo, chips);

  const chipsPorClave = new Map<string | null, HTMLButtonElement>();
  const alternarGrupo = (clave: string) => {
    estado.grupos = estado.grupos.includes(clave)
      ? estado.grupos.filter((c) => c !== clave)
      : [...estado.grupos, clave];
  };
  const crearChip = (clave: string | null, grupo?: Grupo) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cs-chip';
    if (grupo) {
      chip.style.setProperty('--cs-color', grupo.color);
      chip.innerHTML = `<i></i>${grupo.etiqueta}`;
    } else {
      chip.textContent = 'Todos';
    }
    chip.addEventListener('click', () => {
      if (clave === null) estado.grupos = [];
      else alternarGrupo(clave);
      actualizar();
    });
    chipsPorClave.set(clave, chip);
    chips.appendChild(chip);
  };
  crearChip(null);
  config.grupos.forEach((g) => crearChip(g.clave, g));

  const separador = document.createElement('div');
  separador.className = 'cs-filtros-separador';
  const botonRestablecer = document.createElement('button');
  botonRestablecer.type = 'button';
  botonRestablecer.className = 'cs-restablecer';
  botonRestablecer.textContent = 'Restablecer filtros';
  botonRestablecer.addEventListener('click', () => {
    Object.assign(estado, inicial);
    actualizar();
  });

  filtros.replaceChildren(
    campo('Crimen', selCrimen),
    campo('Desde', selDesde),
    campo('Hasta', selHasta),
    separador,
    bloqueGrupo,
    botonRestablecer,
  );

  // ── Cálculos compartidos ─────────────────────────────────
  const enRango = (f: Fila) => f.año >= estado.desde && f.año <= estado.hasta;
  // Grupos elegidos, siempre en el orden de la configuración.
  const gruposElegidos = () => config.grupos.filter((g) => estado.grupos.includes(g.clave));

  // Lados de la barra doble. Sin filtro (o con todos los grupos) se usan los
  // lados por defecto. Con filtro se comparan los grupos elegidos; si hay uno
  // solo, se completa con el primer otro grupo y el completado se atenúa.
  function ladosDeBarras(): [Lado, Lado] {
    const elegidos = gruposElegidos();
    if (elegidos.length === 0 || elegidos.length === config.grupos.length) return config.lados;
    const pareja = [...elegidos];
    for (const g of config.grupos) {
      if (pareja.length >= 2) break;
      if (!pareja.includes(g)) pareja.push(g);
    }
    const [a, b] = pareja
      .slice(0, 2)
      .sort((x, y) => config.grupos.indexOf(x) - config.grupos.indexOf(y));
    const comoLado = (g: Grupo): Lado => ({
      etiqueta: g.etiqueta,
      color: g.color,
      claves: [g.clave],
    });
    return [comoLado(a), comoLado(b)];
  }

  // ── Tarjetas + panel de rol ──────────────────────────────
  function dibujarTarjetas(filasRango: Fila[]) {
    tarjetas.replaceChildren();
    config.grupos.forEach((g) => {
      const propias = filasRango.filter((f) => f.grupo === g.clave);
      const agentes = new Set(propias.map((f) => f.idAgente)).size;
      const casos = new Set(propias.map((f) => f.idCaso)).size;
      const activa = estado.grupos.includes(g.clave);

      const tarjeta = document.createElement('button');
      tarjeta.type = 'button';
      tarjeta.className = `cs-tarjeta${activa ? ' cs-tarjeta--activa' : ''}`;
      tarjeta.setAttribute('aria-pressed', String(activa));
      tarjeta.style.setProperty('--cs-color', g.color);
      tarjeta.innerHTML = `
        <span class="cs-tarjeta-cabecera">
          <span class="cs-tarjeta-nombre"><i></i>${g.etiqueta}</span>
          <span class="cs-tarjeta-accion">${activa ? 'Ocultar rol' : 'Ver rol'}</span>
        </span>
        <span class="cs-tarjeta-valor">${fmt(agentes)}</span>
        <span class="cs-tarjeta-sub">${fmt(casos)} caso(s) asociados</span>
      `;
      tarjeta.addEventListener('click', () => {
        alternarGrupo(g.clave);
        actualizar();
      });
      tarjetas.appendChild(tarjeta);
    });
  }

  function dibujarRol(filasBase: Fila[]) {
    rol.replaceChildren();
    const elegidos = gruposElegidos();
    rol.hidden = elegidos.length === 0;
    elegidos.forEach((g) => rol.append(...crearBloqueRol(g, filasBase)));
  }

  // Un bloque de rol (medidores + delito más frecuente) por cada grupo elegido.
  function crearBloqueRol(g: Grupo, filasBase: Fila[]): HTMLElement[] {
    const propias = filasBase.filter((f) => f.grupo === g.clave);

    const cuenta = new Map<string, number>(ATRIBUTOS.map((a) => [a, 0] as [string, number]));
    propias.forEach((f) => {
      if (cuenta.has(f.atributo)) cuenta.set(f.atributo, cuenta.get(f.atributo)! + 1);
    });
    const totalAtributos = d3.sum(cuenta.values());

    const panel = document.createElement('div');
    panel.className = 'cs-rol';
    panel.style.setProperty('--cs-color', g.color);

    const cabecera = document.createElement('div');
    cabecera.className = 'cs-rol-cabecera';
    cabecera.innerHTML = `
      <h3 class="cs-rol-titulo"><i></i>${config.tituloRol(g)}</h3>
      <div class="cs-leyenda-cuadros">
        ${ATRIBUTOS.map((a) => `<span><i style="background:${(PALETA_ATRIBUTO as Record<string, string>)[a]}"></i>${a}</span>`).join('')}
      </div>
    `;
    panel.appendChild(cabecera);

    const medidores = document.createElement('div');
    medidores.className = 'cs-medidores';
    ATRIBUTOS.forEach((a) =>
      medidores.appendChild(crearMedidor(a, cuenta.get(a)!, totalAtributos)),
    );
    panel.appendChild(medidores);

    const top = crimenesPorFrecuencia(propias)[0];
    const pie = document.createElement('div');
    pie.className = 'cs-rol-delito';
    if (top) {
      const [nombre, cantidad] = top;
      pie.innerHTML = `
        <span class="cs-rol-delito-titulo">Delito más frecuente</span>
        <strong class="cs-rol-delito-nombre">${nombre}</strong>
        <span class="cs-rol-delito-texto">${fmt(cantidad)} caso(s) registrados en este grupo</span>
      `;
      const enlace = document.createElement('button');
      enlace.type = 'button';
      enlace.className = 'cs-enlace';
      enlace.textContent = 'Ver casos en la tabla →';
      enlace.addEventListener('click', () =>
        irATablasFiltradas({ ...config.paramsTabla(g.clave), codigo: nombre }),
      );
      pie.appendChild(enlace);
    } else {
      pie.innerHTML = `<span class="cs-rol-delito-texto">Sin delitos registrados para esta selección.</span>`;
    }
    return [panel, pie];
  }

  function crearMedidor(atributo: string, valor: number, total: number) {
    const color = (PALETA_ATRIBUTO as Record<string, string>)[atributo];
    const fraccion = total > 0 ? valor / total : 0;
    const R = 46;
    const arco = d3.arc().cornerRadius(5);
    const inicio = -Math.PI / 2;
    const fin = Math.PI / 2;
    const dibujar = (a0: number, a1: number) =>
      arco({ startAngle: a0, endAngle: a1, innerRadius: R - 9, outerRadius: R }) ?? '';

    const fig = document.createElement('figure');
    fig.className = 'cs-medidor';
    fig.innerHTML = `
      <svg viewBox="-56 -56 112 62" role="img" aria-label="${atributo}: ${formatoPct(valor, total)}">
        <path d="${dibujar(inicio, fin)}" class="cs-medidor-pista"/>
        ${fraccion > 0 ? `<path d="${dibujar(inicio, inicio + Math.max(fraccion, 0.02) * Math.PI)}" fill="${color}"/>` : ''}
      </svg>
      <figcaption>
        <strong>${formatoPct(valor, total)}</strong>
        <span>${atributo}</span>
      </figcaption>
    `;
    fig.title = `${fmt(valor)} caso(s)`;
    return fig;
  }

  // ── Panel general ────────────────────────────────────────
  function actualizar() {
    selCrimen.value = estado.crimen ?? '';
    selDesde.value = String(estado.desde);
    selHasta.value = String(estado.hasta);
    botonRestablecer.disabled =
      estado.grupos.length === 0 &&
      estado.crimen === inicial.crimen &&
      estado.desde === inicial.desde &&
      estado.hasta === inicial.hasta &&
      estado.expandido === inicial.expandido &&
      estado.redCompleta === inicial.redCompleta &&
      estado.donaUnNivel === inicial.donaUnNivel &&
      estado.donaGrande === inicial.donaGrande;
    chipsPorClave.forEach((chip, clave) => {
      const activo = clave === null ? estado.grupos.length === 0 : estado.grupos.includes(clave);
      chip.classList.toggle('cs-chip--activo', activo);
      chip.setAttribute('aria-pressed', String(activo));
    });

    const filasRango = todas.filter(enRango);
    const filasCrimen = estado.crimen
      ? filasRango.filter((f) => f.crimen === estado.crimen)
      : filasRango;
    const hayGrupos = estado.grupos.length > 0;
    const enGrupos = (f: Fila) => estado.grupos.includes(f.grupo);
    const filasGrupo = hayGrupos ? filasRango.filter(enGrupos) : filasRango;
    const filasFiltradas = hayGrupos ? filasCrimen.filter(enGrupos) : filasCrimen;
    const elegidos = gruposElegidos();
    const etiquetaCrimen = estado.crimen ?? TODOS_LOS_CRIMENES;

    dibujarTarjetas(filasCrimen);
    dibujarRol(filasCrimen);

    lineaSubtitulo.textContent = `${estado.desde} – ${estado.hasta} · ${etiquetaCrimen.toLowerCase()}, ${config.unidadTarjeta} por década, sin repetir dentro de una misma década`;
    dibujarLineaEvolucion({
      contenedor: linea,
      filas: filasFiltradas,
      grupos: hayGrupos ? elegidos : config.grupos,
      desde: estado.desde,
      hasta: estado.hasta,
      etiquetaCrimen,
      unidad: config.unidadLinea,
    });

    // La barra doble y la red ignoran el filtro de crimen a propósito: sirven
    // para elegirlo, así que necesitan seguir mostrando los demás delitos.
    const todosLosCrimenes = crimenesPorFrecuencia(filasRango).map(([nombre]) => nombre);
    // Los nodos en color de la red son siempre los delitos principales de la barra.
    const destacados = todosLosCrimenes.slice(0, TOP_BARRAS);
    const alSeleccionarCrimen = (crimen: string) => {
      estado.crimen = estado.crimen === crimen ? null : crimen;
      actualizar();
    };
    dibujarBarras({
      contenedor: barras,
      filas: filasRango,
      lados: ladosDeBarras(),
      crimenes: todosLosCrimenes,
      limite: TOP_BARRAS,
      expandido: estado.expandido,
      alAlternarExpansion: () => {
        estado.expandido = !estado.expandido;
        actualizar();
      },
      gruposActivos: estado.grupos,
      crimenActivo: estado.crimen,
      alSeleccionarCrimen,
    });

    donaSubtitulo.textContent = `${fmt(filasFiltradas.length)} participaciones registradas · ${
      estado.crimen ? `subdelitos de ${estado.crimen}` : 'todos los delitos'
    }`;
    const opcionesDona = { unNivel: estado.donaUnNivel };
    rejilla.classList.toggle('cs-rejilla--dona-grande', estado.donaGrande);
    botonNivel.setAttribute('aria-pressed', String(estado.donaUnNivel));
    botonAmpliar.setAttribute('aria-pressed', String(estado.donaGrande));
    botonAmpliar.textContent = estado.donaGrande ? 'Reducir' : 'Ampliar';
    if (modo === 'personas') {
      dibujarDelitosSunburstGenero('csDonaGrafico', filasFiltradas, estado.crimen, opcionesDona);
    } else {
      dibujarSunburst('csDonaGrafico', filasFiltradas, estado.crimen, opcionesDona);
    }
    const subtituloRedBase =
      'Los nodos en color son los 5 delitos principales de la barra de arriba — haz clic para vincular ambos paneles y arrastra para mover';
    redSubtitulo.textContent = !hayGrupos
      ? subtituloRedBase
      : `Con ${elegidos.map((g) => g.etiqueta).join(' y ')} elegido${elegidos.length > 1 ? 's' : ''}, el tamaño de cada nodo muestra en cuántos de sus casos aparece el delito — haz clic para filtrar y arrastra para mover`;
    dibujarRed({
      contenedor: red,
      filas: filasGrupo,
      destacados,
      // Con un solo grupo los nodos toman su color; con varios no hay un color único.
      grupoActivo: elegidos.length === 1 ? elegidos[0] : null,
      crimenActivo: estado.crimen,
      verTodas: estado.redCompleta,
      alAlternarVerTodas: () => {
        estado.redCompleta = !estado.redCompleta;
        actualizar();
      },
      alSeleccionarCrimen,
    });
  }

  botonNivel.addEventListener('click', () => {
    estado.donaUnNivel = !estado.donaUnNivel;
    actualizar();
  });
  botonAmpliar.addEventListener('click', () => {
    estado.donaGrande = !estado.donaGrande;
    actualizar();
  });

  actualizar();
}
