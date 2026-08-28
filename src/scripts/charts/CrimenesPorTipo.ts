import * as d3 from 'd3';
import { esLinajeCriminal } from './linajeComun.js';

// TODO: type — genéricos de selección de d3. Ver MIGRATION.md (mismo patrón que Linaje.ts).
type SeleccionD3 = any;

interface ConteoCrimen {
  nombre: string;
  total: number;
}

interface FiltrosCrimenesPorTipo {
  decadaDesde: number;
  decadaHasta: number;
  codigo: string | null;
  subcodigo: string | null;
  lugar: string | null;
}

// TiempoCrimenesMapa.ts expone los filtros del panel compartido (década,
// crimen, subcrimen, lugar) por este hook y llama al segundo cada vez que
// cambian, para que este módulo — cargado aparte — se pueda re-renderizar
// sin acoplarse directamente a su estado interno.
declare global {
  interface Window {
    __obtenerFiltrosCrimenesPorTipo?: () => FiltrosCrimenesPorTipo | null;
    __actualizarCrimenesPorTipoDashboard?: () => void;
  }
}

// Traza el contorno de una barra horizontal que crece desde x=0: redondeada
// solo en la punta (derecha), cuadrada en la base que toca el eje (izquierda).
function rutaBarra(ancho: number, alto: number, radio: number): string {
  if (ancho <= 0) return '';

  const r = Math.min(radio, ancho, alto / 2);

  return `M0,0 H${ancho - r} A${r},${r} 0 0 1 ${ancho},${r} V${alto - r} A${r},${r} 0 0 1 ${ancho - r},${alto} H0 Z`;
}

export async function crearCrimenesPorTipo(containerId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const [crimenes, linaje] = await Promise.all([
    d3.csv(`${import.meta.env.BASE_URL}data/crimenes.csv`),
    d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`),
  ]);

  // Código en crimenes.csv apunta a ID_Código en Linaje.csv (mismo join que
  // usa tablageneral.ts), y solo se cuentan los delitos criminales (se
  // excluyen documentos, traslados, juicios civiles y demás linajes "No
  // criminal"; ver linajeComun.ts), más los linajes "No aplica" (p.ej. "Sin
  // codificar": no es un delito específico, es el cajón de crímenes sin
  // clasificar). Los filtros del panel compartido (década, crimen, subcrimen,
  // lugar) se aplican encima de ese filtro base; ver __obtenerFiltrosCrimenesPorTipo.
  const linajeMap = new Map(linaje.map((d) => [d['ID_Código'], d.Nombre]));
  const tipoDelitoMap = new Map(linaje.map((d) => [d['ID_Código'], d.Tipo_delito]));

  const crimenesAplicables = crimenes.filter(
    (d) => esLinajeCriminal(d['Código']) && tipoDelitoMap.get(d['Código']) !== 'No aplica',
  );

  function contar(): ConteoCrimen[] {
    const filtros = window.__obtenerFiltrosCrimenesPorTipo?.() ?? null;

    const filtrados = crimenesAplicables.filter((d) => {
      const decada = Math.floor(+d.Año / 10) * 10;
      const okDecada = !filtros || (decada >= filtros.decadaDesde && decada <= filtros.decadaHasta);
      const okCodigo = !filtros?.codigo || d['Código'] === filtros.codigo;
      const okSubcodigo = !filtros?.subcodigo || d['Sub_Código'] === filtros.subcodigo;
      const okLugar = !filtros?.lugar || d.Lugar?.trim() === filtros.lugar;
      return okDecada && okCodigo && okSubcodigo && okLugar;
    });

    const conteos = new Map<string, number>();
    filtrados.forEach((d) => {
      const nombre = linajeMap.get(d['Código']) || 'Sin código';
      conteos.set(nombre, (conteos.get(nombre) || 0) + 1);
    });

    return [...conteos.entries()]
      .map(([nombre, total]) => ({ nombre, total }))
      .sort((a, b) => b.total - a.total);
  }

  function dibujar(datos: ConteoCrimen[]) {
    const marginTop = 20;
    const marginRight = 50;
    const marginBottom = 10;
    const marginLeft = 300;
    const anchoBarra = 18;
    const espacioBarra = 8;
    const filaAlto = anchoBarra + espacioBarra;
    const width = 900;
    const height = Math.max(datos.length, 1) * filaAlto + marginTop + marginBottom;
    const innerWidth = width - marginLeft - marginRight;

    const x = d3
      .scaleLinear()
      .domain([0, d3.max(datos, (d) => d.total) || 0])
      .range([0, innerWidth]);

    const y = d3
      .scaleBand()
      .domain(datos.map((d) => d.nombre))
      .range([marginTop, height - marginBottom])
      .paddingInner(espacioBarra / filaAlto);

    const svg = d3
      .create('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height] as unknown as string)
      .style('max-width', '100%')
      .style('height', 'auto')
      .style('font', '12px sans-serif');

    // Cuadrícula vertical: hairline recesivo, ticks arriba del todo.
    svg
      .append('g')
      .attr('transform', `translate(${marginLeft},${marginTop})`)
      .call(
        d3
          .axisTop(x)
          .ticks(5)
          .tickSize(-(height - marginTop - marginBottom))
          .tickFormat((v) => (v as number).toLocaleString('es')) as SeleccionD3,
      )
      .call((g: SeleccionD3) => g.select('.domain').remove())
      .call((g: SeleccionD3) => g.selectAll('.tick line').attr('stroke', '#d8d0c0'))
      .call((g: SeleccionD3) => g.selectAll('.tick text').attr('fill', '#8a7f6d'));

    const fila: SeleccionD3 = svg
      .append('g')
      .selectAll('g')
      .data(datos)
      .join('g')
      .attr('transform', (d: ConteoCrimen) => `translate(${marginLeft},${y(d.nombre)})`);

    fila
      .append('text')
      .attr('x', -10)
      .attr('y', y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'end')
      .attr('fill', '#1a1410')
      .text((d: ConteoCrimen) => d.nombre);

    fila
      .append('path')
      .attr('class', 'barra-crimenes-tipo__barra')
      .attr('d', (d: ConteoCrimen) => rutaBarra(x(d.total), y.bandwidth(), 4))
      .on('pointerenter', function (this: SVGPathElement, event: PointerEvent, d: ConteoCrimen) {
        d3.select(this).classed('barra-crimenes-tipo__barra--hover', true);
        mostrarTooltip(event, d);
      })
      .on('pointermove', mostrarTooltip)
      .on('pointerleave', function (this: SVGPathElement) {
        d3.select(this).classed('barra-crimenes-tipo__barra--hover', false);
        tooltip.classList.remove('tooltip-grafico--visible');
      });

    fila
      .append('text')
      .attr('x', (d: ConteoCrimen) => x(d.total) + 6)
      .attr('y', y.bandwidth() / 2)
      .attr('dy', '0.35em')
      .attr('fill', '#1a1410')
      .text((d: ConteoCrimen) => d.total.toLocaleString('es'));

    const wrapper = document.createElement('div');
    wrapper.className = 'barra-crimenes-tipo-wrapper';
    wrapper.append(svg.node()!);

    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip-grafico tooltip-grafico--neutro';
    wrapper.append(tooltip);

    function mostrarTooltip(event: PointerEvent, d: ConteoCrimen) {
      const rect = wrapper.getBoundingClientRect();
      tooltip.innerHTML = '';
      const fuerte = document.createElement('strong');
      fuerte.textContent = d.total.toLocaleString('es');
      tooltip.append(fuerte, document.createTextNode(` — ${d.nombre}`));
      tooltip.style.left = `${event.clientX - rect.left + 12}px`;
      tooltip.style.top = `${event.clientY - rect.top + 12}px`;
      tooltip.classList.add('tooltip-grafico--visible');
    }

    container!.innerHTML = '';
    container!.append(wrapper);
  }

  function renderizar() {
    dibujar(contar());
  }

  window.__actualizarCrimenesPorTipoDashboard = renderizar;

  renderizar();
}
