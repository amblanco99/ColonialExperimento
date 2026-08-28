import * as d3 from 'd3';
import { irATablasFiltradas } from './verCasos.js';
import { esLinajeCriminal } from './linajeComun.js';

// TODO: type — nodo de jerarquía de d3 (d3.HierarchyPointNode). Ver MIGRATION.md.
type NodoMutable = any;

// TODO: type — genéricos de selección de d3. Ver MIGRATION.md.
type SeleccionD3 = any;

// Sinónimos usa "/" como separador cuando hay más de uno (mismo carácter que
// Path, pero en un campo de texto libre), y "null" literal cuando no hay
// ninguno.
function formatearSinonimos(crudo: string | undefined): string {
  if (!crudo || crudo.trim() === '' || crudo.trim().toLowerCase() === 'null') {
    return 'Sin sinónimos.';
  }

  return crudo
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ');
}

// Código/Sub_Código en crimenes.csv apuntan a ID_Código de Linaje.csv: el
// linaje (crimen, nivel 1) va en `codigo`, el subcrimen (nivel 2) en
// `subcodigo`. Ver irATablasFiltradas en verCasos.ts.
function overridesDeNodo(d: NodoMutable) {
  if (d.depth === 1) return { codigo: d.data.Nombre };

  return { codigo: d.parent.data.Nombre, subcodigo: d.data.Nombre };
}

export async function crearLinaje(containerId: string, esCriminal: boolean) {
  const datos = (await d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`)).filter((d: any) => {
    if (d.Path === '0') return true;

    return esLinajeCriminal(d.Path.split('/')[1]) === esCriminal;
  });

  const width = 928;
  const marginTop = 10;
  const marginRight = 10;
  const marginBottom = 10;
  const marginLeft = 80;

  const stratifier = d3
    .stratify()
    .id((d: any) => String(d.Path))
    .parentId((d: any) => {
      const path = String(d.Path);

      const lastSlash = path.lastIndexOf('/');

      return lastSlash >= 0 ? path.substring(0, lastSlash) : null;
    });

  const root: NodoMutable = stratifier(datos);

  const dx = 18;

  const dy = (width - marginRight - marginLeft) / (1 + root.height);

  const tree = d3.tree().nodeSize([dx, dy]);

  tree(root);

  let x0 = Infinity;
  let x1 = -Infinity;

  root.each((d: NodoMutable) => {
    if (d.x > x1) x1 = d.x;

    if (d.x < x0) x0 = d.x;
  });

  const height = x1 - x0 + marginTop + marginBottom;

  const diagonal = (d3.linkHorizontal() as SeleccionD3)
    .x((d: NodoMutable) => d.y)
    .y((d: NodoMutable) => d.x);

  const svg = d3
    .create('svg')
    .attr('width', width)
    .attr('height', height)
    .attr(
      // d3 convierte el array a "a,b,c,d" al asignarlo, que es un viewBox
      // válido. El cast lo deja igual; construir la cadena a mano sería
      // cambiar el runtime.
      'viewBox',
      [-marginLeft, x0 - marginTop, width, height] as unknown as string,
    )
    .style('max-width', '100%')
    .style('height', 'auto')
    .style('font', '12px sans-serif');

  svg
    .append('g')
    .attr('fill', 'none')
    .attr('stroke', '#bb4e99')
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', 1.5)
    .selectAll('path')
    .data(root.links())
    .join('path')
    .attr('d', diagonal);

  const node: SeleccionD3 = svg
    .append('g')
    .attr('stroke-linejoin', 'round')
    .attr('stroke-width', 3)
    .selectAll('g')
    .data(root.descendants())
    .join('g')
    .attr('transform', (d: NodoMutable) => `translate(${d.y},${d.x})`);

  node
    .append('circle')
    .attr('fill', (d: NodoMutable) => (d.children ? '#003f5c' : '#ebf0fa'))
    .attr('stroke', '#fff')
    .attr('r', 3.5);

  const etiquetas = node
    .append('text')
    .attr('dy', '0.31em')
    .attr('x', (d: NodoMutable) => (d.children ? -8 : 8))
    .attr('text-anchor', (d: NodoMutable) => (d.children ? 'end' : 'start'))
    .text((d: NodoMutable) => d.data.Nombre)
    .attr('stroke', 'white')
    .attr('paint-order', 'stroke');

  const wrapper = document.createElement('div');
  wrapper.className = 'linaje-wrapper';
  wrapper.append(svg.node()!);

  // Las definiciones y sinónimos solo tienen contenido útil en el árbol de
  // delitos criminales; en el de no-criminales casi todos los campos de
  // Explicación/Sinónimos están vacíos.
  if (esCriminal) {
    etiquetas
      .filter((d: NodoMutable) => d.depth > 0)
      .classed('linaje-etiqueta-clicable', true)
      .on('click', (event: MouseEvent, d: NodoMutable) => {
        event.stopPropagation();
        mostrarPopup(d);
      });

    const backdrop = document.createElement('div');
    backdrop.className = 'linaje-popup-backdrop';
    wrapper.append(backdrop);

    const popup = document.createElement('div');
    popup.className = 'linaje-popup';
    popup.innerHTML = `
      <button type="button" class="linaje-popup__cerrar" aria-label="Cerrar">×</button>
      <h3 class="linaje-popup__titulo"></h3>
      <p class="linaje-popup__definicion"></p>
      <p class="linaje-popup__sinonimos"></p>
      <button type="button" class="linaje-popup__boton">Ver casos</button>
    `;
    wrapper.append(popup);

    const titulo = popup.querySelector<HTMLElement>('.linaje-popup__titulo')!;
    const definicion = popup.querySelector<HTMLElement>('.linaje-popup__definicion')!;
    const sinonimos = popup.querySelector<HTMLElement>('.linaje-popup__sinonimos')!;
    const botonVerCasos = popup.querySelector<HTMLButtonElement>('.linaje-popup__boton')!;

    function ocultarPopup() {
      popup.classList.remove('linaje-popup--visible');
      backdrop.classList.remove('linaje-popup-backdrop--visible');
    }

    function mostrarPopup(d: NodoMutable) {
      titulo.textContent = d.data.Nombre;
      definicion.textContent = d.data['Explicación']?.trim() || 'Sin definición disponible.';
      sinonimos.textContent = `Sinónimos: ${formatearSinonimos(d.data['Sinónimos'])}`;
      botonVerCasos.onclick = () => irATablasFiltradas(overridesDeNodo(d));

      popup.classList.add('linaje-popup--visible');
      backdrop.classList.add('linaje-popup-backdrop--visible');
    }

    popup.querySelector('.linaje-popup__cerrar')!.addEventListener('click', ocultarPopup);
    backdrop.addEventListener('click', ocultarPopup);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') ocultarPopup();
    });
  }

  document.getElementById(containerId)!.append(wrapper);
}
