// La tabla general guarda aquí la lista de casos que se estaba viendo cuando el
// usuario abre un caso. La página del caso la lee para mostrar "Caso 14 de N",
// los botones Anterior / Siguiente y un "Volver a resultados" que deja la tabla
// como estaba. Vive en sessionStorage: dura lo que dure la pestaña.

const CLAVE = 'crimenescoloniales:resultados-tabla';

export interface EstadoTabla {
  lugar: string;
  crimen: string;
  texto: string;
  desde: string;
  hasta: string;
  penal: boolean;
  sortKey: string;
  sortDir: 'asc' | 'desc';
  sortTocado: boolean;
}

export interface ResultadosGuardados {
  /** ID_Caso de cada resultado, sin repetir y en el orden de la tabla. */
  ids: string[];
  /** Ruta de la tabla con los filtros de la URL que tenía. */
  urlTabla: string;
  estado: EstadoTabla;
  scrollY: number;
}

export function guardarResultados(datos: ResultadosGuardados) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
    // Sin almacenamiento (modo privado, cuota): el caso funciona igual, solo
    // que sin navegación entre resultados.
  }
}

export function leerResultados(): ResultadosGuardados | null {
  try {
    const bruto = sessionStorage.getItem(CLAVE);
    if (!bruto) return null;
    const datos = JSON.parse(bruto) as ResultadosGuardados;
    return Array.isArray(datos.ids) && datos.estado ? datos : null;
  } catch {
    return null;
  }
}
