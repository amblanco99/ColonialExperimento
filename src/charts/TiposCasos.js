import * as d3 from "d3";
import * as Plot from "@observablehq/plot";

export async function crearTiposCasos() {

const MujeresMencionadas = await d3.csv("/data/Casos.csv");

const tipoCaso = 
    Plot.plot({
  width: 600,
  marginLeft: 60,
  x: {label: "Siglo",type: "band",domain: ["XVI", "XVII", "XVIII", "XIX"]},
  y: {label: "Cantidad de Casos", grid: true},
  color: {legend: false,domain: ["No es un proceso penal con delito identificable", "Proceso judicial criminal identificable"],range: ["#003f5c","#bb4e99"]
  },
  marks: [
    Plot.barY(
      MujeresMencionadas.filter(d => d.FechaInicial > 0 && d.FechaInicial < 1901), 
      Plot.groupX(
        { y: "count" }, 
        {
          x: d => {
            const siglo = Math.floor((d.FechaInicial - 1) / 100) + 1;
            const romanos = {16: "XVI", 17: "XVII", 18: "XVIII", 19: "XIX"};
            return romanos[siglo];
          },
          fill: "TipoProceso",
          tip: {
            format: {
              x: (d) => `Siglo ${d}`, 
              y: true,
              fill: true
            }
          },
          sort: {x: "x"}
        }
      )
    ),
  ]
});

  document
    .getElementById("tipoCaso")
    .append(tipoCaso);
}