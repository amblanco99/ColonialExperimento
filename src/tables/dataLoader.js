export function parseCSV(text) {
  const lines = text.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      obj[h.trim()] = (values[i] ?? '').trim();
    });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * Agrupa crímenes por ID_Caso y cruza con fuentes.
 * @param {Array} crimenes - filas del CSV principal
 * @param {Array} fuentes  - filas del CSV de sources
 * @returns {Map<string, Object>} mapa ID_Caso → objeto de caso
 */
export function buildCasesMap(crimenes, fuentes) {
  // Indexar fuentes por ID_Documento para O(1) lookup
  const fuentesIdx = {};
  fuentes.forEach(f => {
    fuentesIdx[f.ID_Documento] = f;
  });

  const casesMap = new Map();

  crimenes.forEach(row => {
    const caseId = row.ID_Caso;

    if (!casesMap.has(caseId)) {
      casesMap.set(caseId, {
        id: caseId,
        descripcion: row['Descripción'],
        año: row['Año'],
        lugar: row['Lugar'],
        especificaciones: row['Especificaciones'],
        documentos: [],
      });
    }

    const caso = casesMap.get(caseId);

    caso.documentos.push({
      id_documento: row.ID_Documento,
      crimen: row.crimen,
      subcrimen: row.subcrimen,
      codigo: row['Código'],
      sub_codigo: row['Sub_Código'],
      source_id: row.Source,
      fuente: fuentesIdx[row.ID_Documento] ?? null,
    });
  });

  return casesMap;
}

export function buildTableRows(casesMap) {
  const rows = [];
  casesMap.forEach(caso => {
    caso.documentos.forEach(doc => {
      rows.push({
        ...doc,
        caso_id: caso.id,
        descripcion: caso.descripcion,
        año: caso.año,
        lugar: caso.lugar,
      });
    });
  });
  return rows;
}