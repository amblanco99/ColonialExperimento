import * as d3 from "d3";

let contadorClip = 0;

export function agregarZoomBeeswarm({ svg, contenido, ejeX, x, IW, mitadAlto, wrapper }) {
  const clipId = `beeswarm-clip-${++contadorClip}`;
  svg.insert("clipPath", ":first-child")
    .attr("id", clipId)
    .append("rect")
    .attr("x", -4).attr("y", -mitadAlto - 4)
    .attr("width", IW + 8).attr("height", mitadAlto * 2 + 8);
  contenido.attr("clip-path", `url(#${clipId})`);

  function pasoTicks(dominioAncho) {
    if (dominioAncho > 400) return 50;
    if (dominioAncho > 150) return 25;
    if (dominioAncho > 60) return 10;
    if (dominioAncho > 25) return 5;
    if (dominioAncho > 10) return 2;
    return 1;
  }

  function dibujarEje(escala) {
    const [d0, d1] = escala.domain();
    const paso = pasoTicks(d1 - d0);
    const primero = Math.ceil(d0 / paso) * paso;
    const ticks = d3.range(primero, d1 + 1, paso);
    ejeX.call(d3.axisBottom(escala).tickValues(ticks).tickSize(0).tickFormat(d3.format("d")))
      .call(gg => {
        gg.select(".domain").remove();
        gg.selectAll("text").style("font-size", "11px").style("fill", "#555");
      });
  }
  dibujarEje(x);

  const zoom = d3.zoom()
    .scaleExtent([1, 14])
    .extent([[0, -mitadAlto], [IW, mitadAlto]])
    .translateExtent([[-IW * 0.15, -mitadAlto], [IW * 1.15, mitadAlto]])
    .on("zoom", (event) => {
      contenido.attr("transform", event.transform);
      dibujarEje(event.transform.rescaleX(x));
    });

  svg.call(zoom).style("cursor", "grab");
  svg.on("mousedown.cursor", () => svg.style("cursor", "grabbing"));
  svg.on("mouseup.cursor mouseleave.cursor", () => svg.style("cursor", "grab"));

  const controles = document.createElement("div");
  controles.className = "beeswarm-zoom-controles";
  controles.innerHTML = `
    <button type="button" data-zoom="in" aria-label="Acercar">+</button>
    <button type="button" data-zoom="out" aria-label="Alejar">−</button>
    <button type="button" data-zoom="reset" aria-label="Restablecer zoom">⟲</button>
  `;
  wrapper.appendChild(controles);
  controles.querySelector('[data-zoom="in"]').addEventListener("click", () => {
    svg.transition().duration(200).call(zoom.scaleBy, 1.6);
  });
  controles.querySelector('[data-zoom="out"]').addEventListener("click", () => {
    svg.transition().duration(200).call(zoom.scaleBy, 1 / 1.6);
  });
  controles.querySelector('[data-zoom="reset"]').addEventListener("click", () => {
    svg.transition().duration(250).call(zoom.transform, d3.zoomIdentity);
  });
}
