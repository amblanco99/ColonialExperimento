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
  ids: string[];
  urlTabla: string;
  estado: EstadoTabla;
  scrollY: number;
}
export function guardarResultados(datos: ResultadosGuardados) {
  try {
    sessionStorage.setItem(CLAVE, JSON.stringify(datos));
  } catch {
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
