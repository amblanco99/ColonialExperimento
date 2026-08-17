import * as d3 from "d3";

export async function crearConteoCrimenes() {

  const container = document.getElementById("conteoCrimenes");
  if (!container) return;

  const datos = await d3.csv(`${import.meta.env.BASE_URL}/data/Visualizaciones.csv`);

  const getSiglo = (year) => {
    const y = +year;
    if (y <= 1599) return "Siglo XVI";
    if (y >= 1600 && y <= 1699) return "Siglo XVII";
    if (y >= 1700 && y <= 1799) return "Siglo XVIII";
    if (y >= 1800) return "Siglo XIX";
    return "Siglo XVI";
  };

  function contarCrimenesUnicos(filas) {
    const set = new Set();
    filas.forEach(d => {
      if (d.ID_Documento && d.Código) {
        set.add(`${d.ID_Documento}|${d.Código}`);
      }
    });
    return set.size;
  }

  const siglosInteres = [
    "Siglo XVI",
    "Siglo XVII",
    "Siglo XVIII",
    "Siglo XIX"
  ];

  const estructuraCrimenes = {};
  siglosInteres.forEach(siglo => {
    const crimenesSiglo = datos.filter(d => getSiglo(d.Año) === siglo);
    estructuraCrimenes[siglo] = contarCrimenesUnicos(crimenesSiglo);
  });

  const totalCrimenes = contarCrimenesUnicos(datos);

  container.innerHTML = `
    <style>
      .col-root { font-family: serif; color: #1a2e2a; max-width: 800px; }
      .card { background: #f0ebe0; border-radius: 8px; padding: 25px; margin-bottom: 20px; border: 1px solid #dcd7ca; }
      .row { display: flex; justify-content: space-between; padding: 12px 10px; border-bottom: 1px solid rgba(26,46,42,0.1); }
      .total-header { display: flex; justify-content: space-between; align-items: center; font-size: 1.5rem; font-weight: bold; margin-bottom: 20px; }
      .val-bold { font-weight: bold; }
    </style>
    <div class="col-root">
      <div class="card">
        <div class="total-header">
          Crímenes
          <span style="float:right; font-size:1rem;">Total: ${totalCrimenes}</span>
        </div>
        ${siglosInteres.map(s => `
          <div class="row">
            <span>${s}</span>
            <span class="val-bold">${estructuraCrimenes[s]}</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}
