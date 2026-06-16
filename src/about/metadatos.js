import * as d3 from "d3";

export async function crearMetadatos() {

  // =========================
  // CARGAR CSV
  // =========================

  const data = await d3.csv(
    `${import.meta.env.BASE_URL}/data/metadatos.csv`
  );

  // =========================
  // ELEMENTO HTML
  // =========================

  const tablaContainer =
    document.getElementById("tablaMetadatos");

  // =========================
  // FUNCIÓN RENDER
  // =========================

  function renderTabla() {

    const filtrados = data;

    // =========================
    // TABLA HTML
    // =========================

    tablaContainer.innerHTML = `

      <table class="tabla-metadatos">

        <thead>
          <tr>
            <th>Metadato</th>
            <th>Descripción</th>
            <th>Tipo</th>
          </tr>
        </thead>

        <tbody>

          ${filtrados.map(d => `

            <tr>
              <td>${d.Metadato || ""}</td>
              <td>${d.Descripción || ""}</td>
              <td>${d.Tipo || ""}</td>
            </tr>

          `).join("")}

        </tbody>

      </table>
    `;
  }

  // =========================
  // INICIAL
  // =========================

  renderTabla();
}