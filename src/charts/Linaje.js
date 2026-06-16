import * as d3 from "d3";

export async function crearLinaje() {

  const datos = await d3.csv("/data/Linaje.csv");

  const width = 928;
  const marginTop = 10;
  const marginRight = 10;
  const marginBottom = 10;
  const marginLeft = 80;

  const stratifier = d3.stratify()
    .id(d => String(d.Path))
    .parentId(d => {

      const path = String(d.Path);

      const lastSlash = path.lastIndexOf("/");

      return lastSlash >= 0
        ? path.substring(0, lastSlash)
        : null;
    });

  const root = stratifier(datos);

  const dx = 18;

  const dy =
    (width - marginRight - marginLeft) /
    (1 + root.height);

  const tree = d3.tree().nodeSize([dx, dy]);

  const diagonal = d3.linkHorizontal()
    .x(d => d.y)
    .y(d => d.x);

  const svg = d3.create("svg")
    .attr("width", width)
    .attr("viewBox", [-marginLeft, -marginTop, width, dx])
    .style("max-width", "100%")
    .style("height", "auto")
    .style("font", "12px sans-serif");

  const gLink = svg.append("g")
    .attr("fill", "none")
    .attr("stroke", "#bb4e99")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.5);

  const gNode = svg.append("g")
    .attr("cursor", "pointer")
    .attr("pointer-events", "all");

  function update(event, source) {

    const duration = event?.altKey
      ? 2500
      : 250;

    const nodes = root.descendants().reverse();

    const links = root.links();

    tree(root);

    let left = root;
    let right = root;

    root.eachBefore(node => {

      if (node.x < left.x) left = node;

      if (node.x > right.x) right = node;
    });

    const height =
      right.x - left.x +
      marginTop +
      marginBottom;

    const transition = svg.transition()
      .duration(duration)
      .attr("height", height)
      .attr(
        "viewBox",
        [-marginLeft, left.x - marginTop, width, height]
      );

    // NODOS

    const node = gNode
      .selectAll("g")
      .data(nodes, d => d.id);

    const nodeEnter = node.enter()
      .append("g")
      .attr(
        "transform",
        `translate(${source.y0},${source.x0})`
      )
      .attr("fill-opacity", 0)
      .attr("stroke-opacity", 0)
      .on("click", (event, d) => {

        d.children =
          d.children
            ? null
            : d._children;

        update(event, d);
      });

    nodeEnter.append("circle")
      .attr("r", 3.5)
      .attr(
        "fill",
        d => d._children
          ? "#003f5c"
          : "#ebf0fa"
      )
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    nodeEnter.append("text")
      .attr("dy", "0.31em")
      .attr(
        "x",
        d => d._children ? -8 : 8
      )
      .attr(
        "text-anchor",
        d => d._children ? "end" : "start"
      )
      .text(d => d.data.Nombre)
      .attr("stroke-linejoin", "round")
      .attr("stroke-width", 3)
      .attr("stroke", "white")
      .attr("paint-order", "stroke");

    node.merge(nodeEnter)
      .transition(transition)
      .attr(
        "transform",
        d => `translate(${d.y},${d.x})`
      )
      .attr("fill-opacity", 1)
      .attr("stroke-opacity", 1);

    node.exit()
      .transition(transition)
      .remove()
      .attr(
        "transform",
        `translate(${source.y},${source.x})`
      )
      .attr("fill-opacity", 0)
      .attr("stroke-opacity", 0);

    // LINKS

    const link = gLink
      .selectAll("path")
      .data(links, d => d.target.id);

    const linkEnter = link.enter()
      .append("path")
      .attr("d", d => {

        const o = {
          x: source.x0,
          y: source.y0
        };

        return diagonal({
          source: o,
          target: o
        });
      });

    link.merge(linkEnter)
      .transition(transition)
      .attr("d", diagonal);

    link.exit()
      .transition(transition)
      .remove();

    root.eachBefore(d => {

      d.x0 = d.x;
      d.y0 = d.y;
    });
  }

  root.x0 = dy / 2;
  root.y0 = 0;

  root.descendants().forEach((d, i) => {

    d.id = i;

    d._children = d.children;

    if (d.depth > 0)
      d.children = null;
  });

  update(null, root);

  document
    .getElementById("chartLinaje")
    .append(svg.node());
}