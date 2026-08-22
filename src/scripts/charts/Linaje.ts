import * as d3 from 'd3';

// TODO: type — nodo de jerarquía de d3 mutado por el patrón del árbol
// colapsable: se le cuelgan _children, x0 e y0 y se le reasigna id, que no
// están en HierarchyNode. Ver MIGRATION.md.
type NodoMutable = any;

// TODO: type — genéricos de selección/transición de d3. Ver MIGRATION.md.
type SeleccionD3 = any;

export async function crearLinaje() {
  const datos = await d3.csv(`${import.meta.env.BASE_URL}data/Linaje.csv`);

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

  const diagonal = (d3.linkHorizontal() as SeleccionD3)
    .x((d: NodoMutable) => d.y)
    .y((d: NodoMutable) => d.x);

  const svg = d3
    .create('svg')
    .attr('width', width)
    .attr('viewBox', [-marginLeft, -marginTop, width, dx])
    .style('max-width', '100%')
    .style('height', 'auto')
    .style('font', '12px sans-serif');

  const gLink = svg
    .append('g')
    .attr('fill', 'none')
    .attr('stroke', '#bb4e99')
    .attr('stroke-opacity', 0.4)
    .attr('stroke-width', 1.5);

  const gNode = svg.append('g').attr('cursor', 'pointer').attr('pointer-events', 'all');

  function update(event: MouseEvent | null, source: NodoMutable) {
    const duration = event?.altKey ? 2500 : 250;

    const nodes = root.descendants().reverse();

    const links = root.links();

    tree(root);

    let left: NodoMutable = root;
    let right: NodoMutable = root;

    root.eachBefore((node: NodoMutable) => {
      if (node.x < left.x) left = node;

      if (node.x > right.x) right = node;
    });

    const height = right.x - left.x + marginTop + marginBottom;

    const transition = svg
      .transition()
      .duration(duration)
      .attr('height', height)
      .attr(
        // d3 convierte el array a "a,b,c,d" al asignarlo, que es un viewBox
        // válido. El cast lo deja igual; construir la cadena a mano sería
        // cambiar el runtime.
        'viewBox',
        [-marginLeft, left.x - marginTop, width, height] as unknown as string,
      );

    const node: SeleccionD3 = gNode.selectAll('g').data(nodes, (d: NodoMutable) => d.id);

    const nodeEnter: SeleccionD3 = node
      .enter()
      .append('g')
      .attr('transform', `translate(${source.y0},${source.x0})`)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0)
      .on('click', (event: MouseEvent, d: NodoMutable) => {
        d.children = d.children ? null : d._children;

        update(event, d);
      });

    nodeEnter
      .append('circle')
      .attr('r', 3.5)
      .attr('fill', (d: NodoMutable) => (d._children ? '#003f5c' : '#ebf0fa'))
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5);

    nodeEnter
      .append('text')
      .attr('dy', '0.31em')
      .attr('x', (d: NodoMutable) => (d._children ? -8 : 8))
      .attr('text-anchor', (d: NodoMutable) => (d._children ? 'end' : 'start'))
      .text((d: NodoMutable) => d.data.Nombre)
      .attr('stroke-linejoin', 'round')
      .attr('stroke-width', 3)
      .attr('stroke', 'white')
      .attr('paint-order', 'stroke');

    node
      .merge(nodeEnter)
      .transition(transition)
      .attr('transform', (d: NodoMutable) => `translate(${d.y},${d.x})`)
      .attr('fill-opacity', 1)
      .attr('stroke-opacity', 1);

    node
      .exit()
      .transition(transition)
      .remove()
      .attr('transform', `translate(${source.y},${source.x})`)
      .attr('fill-opacity', 0)
      .attr('stroke-opacity', 0);

    const link: SeleccionD3 = gLink.selectAll('path').data(links, (d: NodoMutable) => d.target.id);

    const linkEnter: SeleccionD3 = link
      .enter()
      .append('path')
      .attr('d', () => {
        const o = {
          x: source.x0,
          y: source.y0,
        };

        return diagonal({
          source: o,
          target: o,
        });
      });

    link.merge(linkEnter).transition(transition).attr('d', diagonal);

    link.exit().transition(transition).remove();

    root.eachBefore((d: NodoMutable) => {
      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  root.x0 = dy / 2;
  root.y0 = 0;

  root.descendants().forEach((d: NodoMutable, i: number) => {
    d.id = i;

    d._children = d.children;

    if (d.depth > 0) d.children = null;
  });

  update(null, root);

  document.getElementById('chartLinaje')!.append(svg.node()!);
}
