// Genera public/data/DescripcionesNegrilla.csv a partir de data-fuente/Negrilla.xlsx.
// Se corre solo (predev/prebuild, ver package.json), así que la negrilla que se
// marca en la hoja "Crímenes" del Excel llega al sitio sin tocar ningún CSV a
// mano. No toca crimenes.csv: ese archivo lo siguen leyendo tal cual la tabla
// general y los demás gráficos (src/scripts/tables/tablageneral.ts y las
// cartas en src/scripts/charts/), sin negrilla.
//
// El archivo que genera este script solo lo lee la página de un caso
// (src/scripts/tables/caso.ts), que cruza sus filas contra las de
// crimenes.csv por ID_Caso + ID_Crímen para saber qué documento va con cada
// descripción marcada.
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raizProyecto = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const RUTA_XLSX = path.join(raizProyecto, 'data-fuente', 'Negrilla.xlsx');
const RUTA_CSV = path.join(raizProyecto, 'public', 'data', 'DescripcionesNegrilla.csv');
const HOJA = 'Crímenes';

function celdaCsv(valor) {
  const texto = valor == null ? '' : String(valor);
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function textoPlano(valor) {
  if (valor && typeof valor === 'object' && Array.isArray(valor.richText)) {
    return valor.richText.map((run) => run.text).join('');
  }
  return valor == null ? '' : String(valor);
}

// La Descripción conserva la negrilla, marcada como **texto**.
function descripcionConNegrilla(valor) {
  if (valor && typeof valor === 'object' && Array.isArray(valor.richText)) {
    return valor.richText
      .map((run) => (run.font?.bold ? `**${run.text}**` : run.text))
      .join('');
  }
  return valor == null ? '' : String(valor);
}

async function main() {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.readFile(RUTA_XLSX);

  const hoja = libro.getWorksheet(HOJA);
  if (!hoja) {
    throw new Error(`No se encontró la hoja "${HOJA}" en ${RUTA_XLSX}`);
  }

  const lineas = [['ID_Caso', 'ID_Crímen', 'Descripción'].join(',')];

  for (let numFila = 2; numFila <= hoja.rowCount; numFila++) {
    const fila = hoja.getRow(numFila);
    const idCaso = fila.getCell(1).value;
    if (idCaso == null || idCaso === '') continue;

    const valores = [
      textoPlano(idCaso),
      textoPlano(fila.getCell(2).value),
      descripcionConNegrilla(fila.getCell(3).value),
    ];
    lineas.push(valores.map(celdaCsv).join(','));
  }

  writeFileSync(RUTA_CSV, lineas.join('\r\n') + '\r\n', 'utf-8');
  console.log(`DescripcionesNegrilla.csv regenerado desde Negrilla.xlsx (${lineas.length - 1} filas).`);
}

main().catch((err) => {
  console.error('No se pudo regenerar DescripcionesNegrilla.csv:', err);
  process.exit(1);
});
