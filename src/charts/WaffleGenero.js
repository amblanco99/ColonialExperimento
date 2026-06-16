import * as d3 from "d3";

export async function crearWaffleGenero() {

  const casosyear = await d3.csv(
    "/data/Visualizaciones.csv"
  );
  
  const colorEscala = d3.scaleOrdinal()
    .domain([
      "Mujer",
      "Hombre",
      "Sin información"
    ])
    .range([
      "#ffa600",
      "#bb4e99",
      "#003f5c"
    ]);


  const getSiglo = (year) => {
    const y = +year;
    if (y <= 1599) return "Siglo XVI"; 
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800) return "Siglo XIX"; 
    return "Siglo XVI"; 
  };

  // Filtrado inicial por Agente === "Persona"
  const personasFiltradas = casosyear.filter(d => d.Agente === "Persona");

  // ========================================================
  // NUEVA LÓGICA: OBTENER EL PRIMER REGISTRO HISTÓRICO DE CADA AGENTE
  // ========================================================
  const primerRegistroPorAgente = new Map();

  personasFiltradas.forEach(d => {
    const id = d.ID_Agente;
    if (!id) return; 

    const añoActual = +d.Año;

    if (!primerRegistroPorAgente.has(id)) {
      primerRegistroPorAgente.set(id, d);
    } else {
      const añoRegistrado = +primerRegistroPorAgente.get(id).Año;

      if (añoActual < añoRegistrado) {
        primerRegistroPorAgente.set(id, d);
      }
    }
  });


  const dataWithCentury = Array.from(primerRegistroPorAgente.values()).map(d => ({
    ...d,
    siglo: getSiglo(d.Año),
    genero:
      d.Género &&
      d.Género.trim() !== "" &&
      d.Género !== "null"
        ? d.Género.trim()
        : "Sin información"
  }));

  console.log(
    "Total personas únicas waffle (deduplicadas):",
    dataWithCentury.length
  );  

  const selectSiglo = document.getElementById("sigloSeleccionado");
  const selectAtributo = document.getElementById("atributoSeleccionado");
  
  selectSiglo.innerHTML = "";
  selectAtributo.innerHTML = "";


  const siglos = [...new Set(dataWithCentury.map(d => d.siglo))].sort();

  siglos.forEach(s => {
    const option = document.createElement("option");
    option.value = s;
    option.textContent = s;
    selectSiglo.append(option);
  });

  const atributos = [...new Set(dataWithCentury.map(d => d.Atributo))];

  atributos.forEach(a => {
    const option = document.createElement("option");
    option.value = a;
    option.textContent = a;
    selectAtributo.append(option);
  });

  selectSiglo.value = siglos[0];

  if (atributos.includes("Víctima")) {
    selectAtributo.value = "Víctima";
  } else {
    selectAtributo.value = atributos[0];
  }

  function dibujarGrafico() {
    const sigloSeleccionado = selectSiglo.value;
    const atributoSeleccionado = selectAtributo.value;

    const filtered = dataWithCentury.filter(d =>
      d.siglo === sigloSeleccionado &&
      d.Atributo === atributoSeleccionado
    );

    const counts = d3.rollup(
      filtered,
      v => new Set(v.map(d => d.ID_Agente)).size,
      d => d.genero
    );

    const datosWaffle = Array.from(
      counts,
      ([name, value]) => ({ name, value })
    );

    const total = d3.sum(datosWaffle, d => d.value);
    if (total === 0) return;

    const targetSquares = 100; 
    
    let initialChartData = datosWaffle.map(d => {
      const percentage = (d.value / total) * 100;
      const squaresRaw = (d.value / total) * targetSquares;
      return {
        name: d.name,
        value: d.value,
        percentage: percentage,
        squaresFloor: Math.floor(squaresRaw),
        residual: squaresRaw - Math.floor(squaresRaw)
      };
    });

    const currentTotalSquares = d3.sum(initialChartData, d => d.squaresFloor);
    let squaresToAssign = targetSquares - currentTotalSquares;

    initialChartData.sort((a, b) => b.residual - a.residual);

    let i = 0;
    while (squaresToAssign > 0) {
      initialChartData[i % initialChartData.length].squaresFloor++;
      squaresToAssign--;
      i++;
    }

    const ordenEstricto = {
      "Mujer": 1,
      "Sin información": 2,
      "Hombre": 3
    };

    initialChartData.sort((a, b) => {
      const ordenA = ordenEstricto[a.name] || 99;
      const ordenB = ordenEstricto[b.name] || 99;
      return ordenA - ordenB;
    });

    const chartData = initialChartData.map(d => ({
        name: d.name,
        value: d.value,
        count: d.squaresFloor, 
        porcentaje: d.percentage.toFixed(1) 
    }));

    const sequence = [];

    chartData.forEach(d => {
      for (let i = 0; i < d.count; i++) {
        sequence.push({
          name: d.name,
          porcentaje: d.porcentaje
        });
      }
    });

    const cols = 10;
    const rows = 10;
    const cellSize = 35;
    const padding = 8;

    const waffleWidth = cols * (cellSize + padding);
    const waffleHeight = rows * (cellSize + padding);
    const legendWidth = 500;

    const width = waffleWidth + legendWidth;
    const height = waffleHeight + 120;

    const svg = d3.create("svg")
      .attr("viewBox", [0, 0, width, height])
      .attr("width", width)
      .attr("height", height)
      .style("display", "block")
      .style("margin", "0 auto")
      .style("font-family", "sans-serif");

    svg.append("g")
      .selectAll("rect")
      .data(sequence)
      .join("rect")
      .attr("x", (d, i) => (i % cols) * (cellSize + padding))
      .attr("y", (d, i) => Math.floor(i / cols) * (cellSize + padding))
      .attr("width", cellSize)
      .attr("height", cellSize)
      .attr("rx", 6)
      .attr("fill", d => colorEscala(d.name))
      .append("title")
      .text(d => `${d.name}: ${d.porcentaje}%`);

    const legend = svg.append("g")
      .attr("transform", `translate(${waffleWidth + 80}, 50)`);

    chartData.forEach((d, i) => {
      const g = legend.append("g")
        .attr("transform", `translate(0, ${i * 90})`);

      g.append("rect")
        .attr("width", 40)
        .attr("height", 40)
        .attr("rx", 8)
        .attr("fill", colorEscala(d.name));

      g.append("text")
        .attr("x", 60)
        .attr("y", 26)
        .text(`${d.name}: ${d.porcentaje}% (${d.value.toLocaleString()} personas)`)
        .style("font-size", "16px")
        .style("dominant-baseline", "middle");
    });

    svg.append("text")
      .attr("x", 0)
      .attr("y", waffleHeight + 80)
      .style("font-size", "16px")
      .style("fill", "#666")
      .text(`Cada cuadro representa 1% | Total: ${total.toLocaleString()} personas`);

    const container = document.getElementById("waffleGenero");
    container.innerHTML = "";
    container.append(svg.node());
  }

  selectSiglo.addEventListener("change", dibujarGrafico);
  selectAtributo.addEventListener("change", dibujarGrafico);

  dibujarGrafico();
}