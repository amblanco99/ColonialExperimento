import * as d3 from 'd3';
import type { Fila, Lado } from './ComposicionDatos.js';
import { fmt } from './ComposicionDatos.js';

const ANCHO = 740;
const COL_ETIQUETA = 176;
const MITAD = 236;
const HUECO = 28;
const FILA = 36;
const FILA_SUB = 28;
const ALTO_BARRA = 16;
const ALTO_BARRA_SUB = 12;
const SIN_SUBDELITO = 'Sin subdelito registrado';
const MARGEN_VALOR = 40;

interface Opciones {
  contenedor: HTMLElement;
  /** Filas del rango de años, sin filtrar por grupo ni por crimen. */
  filas: Fila[];
  /** Los dos lados que se comparan (los define el controlador según el filtro). */
  lados: [Lado, Lado];
  /** Todos los delitos, del más al menos registrado. */
  crimenes: string[];
  /** Cuántos se ven mientras la lista no esté expandida. */
  limite: number;
  expandido: boolean;
  alAlternarExpansion: () => void;
  /** Grupos elegidos en el filtro: los lados que no incluyan ninguno se atenúan. */
  gruposActivos: string[];
  crimenActivo: string | null;
  alSeleccionarCrimen: (crimen: string) => void;
}

export function dibujarBarras({
  contenedor,
  filas,
  lados,
  crimenes,
  limite,
  expandido,
  alAlternarExpansion,
  gruposActivos,
  crimenActivo,
  alSeleccionarCrimen,
}: Opciones) {
  contenedor.innerHTML = '';

  if (crimenes.length === 0) {
    contenedor.innerHTML = `<p class="cs-vacio">No hay delitos para esta selección.</p>`;
    return;
  }

  const [ladoIzq, ladoDer] = lados;
  const conteo = new Map<string, { izq: number; der: number }>(
    crimenes.map((nombre) => [nombre, { izq: 0, der: 0 }]),
  );
  filas.forEach((f) => {
    const c = conteo.get(f.crimen);
    if (!c) return;
    if (ladoIzq.claves.includes(f.grupo)) c.izq++;
    else if (ladoDer.claves.includes(f.grupo)) c.der++;
  });

  // Con la lista recogida se ven los primeros; si el delito filtrado queda
  // fuera (p. ej. elegido desde la red), se añade al final para que se vea.
  const visibles = crimenes.slice(0, expandido ? crimenes.length : limite);
  if (crimenActivo && crimenes.includes(crimenActivo) && !visibles.includes(crimenActivo)) {
    visibles.push(crimenActivo);
  }
  const datos = visibles.map((nombre) => ({ nombre, ...conteo.get(nombre)! }));

  // Subdelitos del delito elegido: se muestran bajo su fila, con las mismas
  // barras a la misma escala, para ver de qué se compone.
  const conteoSub = new Map<string, { izq: number; der: number }>();
  if (crimenActivo) {
    filas.forEach((f) => {
      if (f.crimen !== crimenActivo) return;
      const clave = f.subcrimen ?? SIN_SUBDELITO;
      const c = conteoSub.get(clave) ?? { izq: 0, der: 0 };
      if (ladoIzq.claves.includes(f.grupo)) c.izq++;
      else if (ladoDer.claves.includes(f.grupo)) c.der++;
      conteoSub.set(clave, c);
    });
  }
  const subdelitos = [...conteoSub]
    .map(([nombre, c]) => ({ nombre, ...c }))
    .filter((d) => d.izq + d.der > 0)
    .sort(
      (a, b) =>
        Number(a.nombre === SIN_SUBDELITO) - Number(b.nombre === SIN_SUBDELITO) ||
        b.izq + b.der - (a.izq + a.der),
    );

  // La escala sale de todos los delitos, así las barras no cambian de largo
  // al expandir, recoger o abrir los subdelitos.
  const maximo = d3.max([...conteo.values()], (d) => Math.max(d.izq, d.der)) || 1;
  const escala = d3
    .scaleLinear()
    .domain([0, maximo])
    .range([0, MITAD - MARGEN_VALOR]);

  const xIzq = COL_ETIQUETA + 12 + MITAD;
  const xDer = xIzq + HUECO;

  type Linea = { nombre: string; izq: number; der: number; y: number; sub: boolean };
  const lineas: Linea[] = [];
  let yActual = 0;
  datos.forEach((d) => {
    lineas.push({ ...d, y: yActual, sub: false });
    yActual += FILA;
    if (d.nombre === crimenActivo) {
      subdelitos.forEach((sd) => {
        lineas.push({ ...sd, y: yActual, sub: true });
        yActual += FILA_SUB;
      });
    }
  });
  const alto = yActual;

  const wrapper = document.createElement('div');
  wrapper.className = 'cs-barras-wrapper';
  contenedor.appendChild(wrapper);

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-grafico tooltip-grafico--neutro';
  wrapper.appendChild(tooltip);
  const moverTooltip = (event: MouseEvent) => {
    const rect = wrapper.getBoundingClientRect();
    tooltip.style.left = `${event.clientX - rect.left + 12}px`;
    tooltip.style.top = `${event.clientY - rect.top + 12}px`;
  };

  const svg = d3
    .create('svg')
    .attr('viewBox', `0 0 ${ANCHO} ${alto}`)
    .attr('class', 'cs-svg')
    .attr('role', 'img')
    .attr(
      'aria-label',
      `Delitos más registrados: ${ladoIzq.etiqueta} frente a ${ladoDer.etiqueta}`,
    );

  const ladoAtenuado = (lado: { claves: string[] }) =>
    gruposActivos.length > 0 && !lado.claves.some((c) => gruposActivos.includes(c));

  lineas.forEach((d) => {
    const alturaFila = d.sub ? FILA_SUB : FILA;
    const altoBarra = d.sub ? ALTO_BARRA_SUB : ALTO_BARRA;
    const y = d.y;
    const cy = y + alturaFila / 2;
    const seleccionada = !d.sub && crimenActivo === d.nombre;
    const atenuada = !d.sub && crimenActivo !== null && !seleccionada;

    const fila = svg
      .append('g')
      .attr('class', d.sub ? 'cs-barras-fila cs-barras-fila--sub' : 'cs-barras-fila')
      .style('opacity', atenuada ? 0.4 : 1);
    if (!d.sub) {
      fila
        .attr('role', 'button')
        .attr('tabindex', 0)
        .attr('aria-pressed', seleccionada)
        .attr('aria-label', `${d.nombre}: ${fmt(d.izq)} y ${fmt(d.der)}`);
    } else {
      fila.attr('aria-label', `Subdelito ${d.nombre}: ${fmt(d.izq)} y ${fmt(d.der)}`);
    }

    fila
      .append('rect')
      .attr('x', 0)
      .attr('y', y + 1)
      .attr('width', ANCHO)
      .attr('height', alturaFila - 2)
      .attr('rx', 6)
      .attr(
        'class',
        seleccionada
          ? 'cs-barras-banda cs-barras-banda--activa'
          : d.sub
            ? 'cs-barras-banda cs-barras-banda--sub'
            : 'cs-barras-banda',
      );

    const claseEtiqueta = seleccionada
      ? 'cs-barras-etiqueta cs-barras-etiqueta--activa'
      : d.sub
        ? 'cs-barras-etiqueta cs-barras-etiqueta--sub'
        : 'cs-barras-etiqueta';
    const maxChars = d.sub ? 26 : 24;
    fila
      .append('text')
      .attr('x', COL_ETIQUETA)
      .attr('y', cy)
      .attr('dy', '0.32em')
      .attr('text-anchor', 'end')
      .attr('class', claseEtiqueta)
      .text(
        (d.sub ? '↳ ' : '') +
          (d.nombre.length > maxChars ? `${d.nombre.slice(0, maxChars - 1).trimEnd()}…` : d.nombre),
      )
      .append('title')
      .text(d.nombre);

    const lados = [
      { lado: ladoIzq, valor: d.izq, derecha: false },
      { lado: ladoDer, valor: d.der, derecha: true },
    ];
    lados.forEach(({ lado, valor, derecha }) => {
      const grupo = fila.append('g').style('opacity', ladoAtenuado(lado) ? 0.3 : 1);
      const w = valor > 0 ? Math.max(2, escala(valor)) : 0;
      const x0 = derecha ? xDer : xIzq - w;
      if (w > 0) {
        grupo
          .append('rect')
          .attr('x', x0)
          .attr('y', cy - altoBarra / 2)
          .attr('width', w)
          .attr('height', altoBarra)
          .attr('rx', 3)
          .attr('fill', lado.color);
      }
      grupo
        .append('text')
        .attr('x', derecha ? xDer + w + 6 : xIzq - w - 6)
        .attr('y', cy)
        .attr('dy', '0.32em')
        .attr('text-anchor', derecha ? 'start' : 'end')
        .attr('class', 'cs-barras-valor')
        .text(fmt(valor));
    });

    const ayuda = d.sub
      ? ''
      : `<br/><em>${seleccionada ? 'Clic para quitar el filtro y ocultar los subdelitos' : 'Clic para filtrar y ver sus subdelitos'}</em>`;
    fila
      .on('mouseenter', (event: MouseEvent) => {
        tooltip.innerHTML = `<strong>${d.nombre}</strong><br/>${ladoIzq.etiqueta}: ${fmt(d.izq)} · ${ladoDer.etiqueta}: ${fmt(d.der)}${ayuda}`;
        tooltip.classList.add('tooltip-grafico--visible');
        moverTooltip(event);
      })
      .on('mousemove', moverTooltip)
      .on('mouseleave', () => tooltip.classList.remove('tooltip-grafico--visible'));

    if (!d.sub) {
      const activar = () => alSeleccionarCrimen(d.nombre);
      fila.on('click', activar).on('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activar();
        }
      });
    }
  });

  wrapper.appendChild(svg.node()!);

  const leyenda = document.createElement('div');
  leyenda.className = 'cs-leyenda-cuadros';
  [ladoIzq, ladoDer].forEach((lado) => {
    const item = document.createElement('span');
    item.innerHTML = `<i style="background:${lado.color}"></i>${lado.etiqueta}`;
    leyenda.appendChild(item);
  });
  contenedor.appendChild(leyenda);

  if (crimenes.length > limite) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'cs-boton-mas';
    boton.setAttribute('aria-expanded', String(expandido));
    boton.textContent = expandido
      ? 'Mostrar menos'
      : `Mostrar más (${fmt(crimenes.length - limite)} delitos más)`;
    boton.addEventListener('click', alAlternarExpansion);
    contenedor.appendChild(boton);
  }
}
