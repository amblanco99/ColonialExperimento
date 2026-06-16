import * as d3 from "d3";
import * as Plot from "@observablehq/plot";

export async function crearMujerMencion() { 

const MujeresMencionadas = await d3.csv(
  "/data/Casos.csv",
  d => ({
    FechaInicial: +d.FechaInicial,
    MujeresMencionadas: +d.MujeresMencionadas
  })
);

const mujerM = 
   Plot.plot({
  y: {label: "Total de Mujeres Mencionadas",grid: true,tickFormat: "d"},
  x: {label: "Año", tickFormat: "d"},
  marks: [
    Plot.areaY(
      MujeresMencionadas.filter(d => d.FechaInicial > 0), 
      Plot.binX(
        {y: "sum"}, 
        {
          x: "FechaInicial", 
          y: "MujeresMencionadas", 
          fillOpacity: 0.3, 
          fill: "#ffa600",
          thresholds: 20, 
          tip: true
        }
      )
    ),
   Plot.lineY(
  MujeresMencionadas.filter(d => d.FechaInicial > 0),
  Plot.binX(
    { y: "sum" },
    {
      x: "FechaInicial",
      y: "MujeresMencionadas",
      thresholds: 20,
      stroke: "#ffa600",
      strokeWidth: 2
    }
  )
),
    Plot.ruleY([0]) 
  ],
})

  document
    .getElementById("mujerM")
    .append(mujerM);
}