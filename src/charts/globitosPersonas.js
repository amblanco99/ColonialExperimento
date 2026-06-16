import * as d3 from "d3";

export async function crearGlobitosPersonas() {

  const documentoCuenta = await d3.csv(
    "/data/Visualizaciones.csv"
  );

  const datosFiltrados = documentoCuenta.filter(d =>

    d.Agente === "Persona" 
  );

  const nestedData = d3.rollup(

    datosFiltrados,

    v => v.length,

    d => d.Género,

    d => d.Atributo,

    d => d.Nombre_Codigo,

    d => d.Nombre_Sub_Codigo
  );
  function createHierarchy(name, map) {

    if (typeof map === "number") {

      return {

        name,

        value: map
      };
    }

    return {

      name,

      children: Array.from(
        map,
        ([key, value]) =>

          createHierarchy(key, value)
      )
    };
  }

  const DatosGlobos = createHierarchy(

    "Crímenes",

    nestedData
  );
  const width = 700;

  const height = width;

  const colorAtributo =
    d3.scaleOrdinal(d3.schemeSet3);

  const colorGenero =
    d3.scaleOrdinal(d3.schemePaired);

  const colorCrimen1 =
    d3.scaleOrdinal(d3.schemePastel1);

  const colorCrimen2 =
    d3.scaleOrdinal(d3.schemePastel2);

  function getColor(d) {

    if (d.depth === 0)
      return "white";

    switch (d.depth) {

      case 1:
        return colorGenero(d.data.name);

      case 2:
        return colorAtributo(d.data.name);

      case 3:
        return colorCrimen1(d.data.name);

      case 4:
        return colorCrimen2(d.data.name);

      default:
        return "#eee";
    }
  }
  const pack = data =>

    d3.pack()

      .size([width, height])

      .padding(3)

      (

        d3.hierarchy(data)

          .sum(d => d.value)

          .sort((a, b) => b.value - a.value)
      );

  const root = pack(DatosGlobos);

  let focus = root;

  let view;
  
  const svg = d3.create("svg")

    .attr(
      "viewBox",
      `-${width / 2} -${height / 2} ${width} ${height}`
    )

    .attr("width", width)

    .attr("height", height)

    .style("max-width", "100%")

    .style("height", "auto")

    .style("display", "block")

    .style("margin", "auto")

    .style("background", "#f7f2e8")

    .style("cursor", "pointer")

    .style(
      "font-family",
      "EB Garamond, serif"
    );

  const node = svg.append("g")

    .selectAll("circle")

    .data(
      root.descendants().slice(1)
    )

    .join("circle")

    .attr("fill", d =>

      d.depth > 2

        ? "white"

        : getColor(d)
    )

    .attr(
      "fill-opacity",
      d =>

        d.depth > 2

          ? 0

          : 0.7
    )

    .attr(
      "stroke",
      d =>

        d.children

          ? "#999"

          : "none"
    )

    .attr("stroke-width", 0.5)

    .on("mouseover", function() {

      d3.select(this)

        .attr("stroke", "#000")

        .attr("stroke-width", 1.5);
    })

    .on("mouseout", function(event, d) {

      d3.select(this)

        .attr(
          "stroke",
          d.children
            ? "#999"
            : "none"
        )

        .attr("stroke-width", 0.5);
    })

  .on("click", (event, d) => {
  if (focus !== d) {
    zoom(event, d);
    event.stopPropagation();
  }

  // Solo navegar si es nodo hoja
  if (!d.children) {
    const ancestros = d.ancestors().map(a => a.data.name).reverse();
    // ["Crímenes", Género, Atributo, Nombre_Codigo, Nombre_Sub_Codigo]

    const params = new URLSearchParams();
    if (ancestros[1]) params.set("genero",    ancestros[1]);
    if (ancestros[2]) params.set("atributo",  ancestros[2]);
    if (ancestros[3]) params.set("codigo",    ancestros[3]);
    if (ancestros[4]) params.set("subcodigo", ancestros[4]);

    window.location.href = `tablas.html?${params.toString()}`;
  }
});

  node.append("title")

    .text(d =>

      `${d.ancestors()

        .map(d => d.data.name)

        .reverse()

        .join(" / ")}

${d.value}`
    );

  const label = svg.append("g")

    .style(
      "font",
      "bold 16px EB Garamond"
    )

    .attr("pointer-events", "none")

    .attr("text-anchor", "middle")

    .selectAll("text")

    .data(root.descendants())

    .join("text")

    .style("fill", "white")

    .style(
      "text-shadow",
      "2px 2px 4px rgba(0,0,0,1)"
    )

    .style(
      "fill-opacity",
      d =>

        d.parent === root
          ? 1
          : 0
    )

    .style(
      "display",
      d =>

        d.parent === root
          ? "inline"
          : "none"
    )

    .text(d =>

      !d.children

        ? `${d.data.name} (${d.value})`

        : d.data.name
    );

  svg.on("click", event =>

    zoom(event, root)
  );

  zoomTo([
    root.x,
    root.y,
    root.r * 2
  ]);

  function zoomTo(v) {

    const k = width / v[2];

    view = v;

    label.attr(
      "transform",
      d =>

        `translate(
          ${(d.x - v[0]) * k},
          ${(d.y - v[1]) * k}
        )`
    );

    node.attr(
      "transform",
      d =>

        `translate(
          ${(d.x - v[0]) * k},
          ${(d.y - v[1]) * k}
        )`
    );

    node.attr(
      "r",
      d => d.r * k
    );
  }

  function zoom(event, d) {

    focus = d;

    const transition = svg.transition()

      .duration(750)

      .tween("zoom", () => {

        const i = d3.interpolateZoom(

          view,

          [
            focus.x,
            focus.y,
            focus.r * 2
          ]
        );

        return t => zoomTo(i(t));
      });

    node.transition(transition)

      .attr("fill", d => {

        const isAncestor =
          d.descendants().includes(focus);

        const isChild =
          focus.children &&
          focus.children.includes(d);

        if (

          d.depth <= 2 ||

          d === focus ||

          isAncestor ||

          isChild

        ) {

          return getColor(d);
        }

        return "white";
      })

      .attr(
        "fill-opacity",
        d => {

          const isAncestor =
            d.descendants().includes(focus);

          const isChild =
            focus.children &&
            focus.children.includes(d);

          if (

            d.depth <= 2 ||

            d === focus ||

            isAncestor ||

            isChild

          ) {

            return d.children
              ? 0.7
              : 1;
          }

          return 0;
        }
      );
    label

      .filter(function(d) {

        return (

          d.parent === focus ||

          (
            d === focus &&
            !d.children
          ) ||

          this.style.display === "inline"
        );
      })

      .transition(transition)

      .style(
        "fill-opacity",
        d =>

          (

            d.parent === focus ||

            (
              d === focus &&
              !d.children
            )

          )

            ? 1

            : 0
      )

      .on("start", function(d) {

        if (

          d.parent === focus ||

          (
            d === focus &&
            !d.children
          )

        ) {

          this.style.display = "inline";
        }
      })

      .on("end", function(d) {

        if (

          d.parent !== focus &&

          !(
            d === focus &&
            !d.children
          )

        ) {

          this.style.display = "none";
        }
      });
  }
  document

    .getElementById("globitosPersonas")

    .append(svg.node());
}