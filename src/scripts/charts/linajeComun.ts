const ULTIMO_LINAJE_CRIMINAL = 27;
const LINAJE_SIN_CODIFICAR = 2;

export function esLinajeCriminal(codigo: string | undefined): boolean {
  if (!codigo) return false;

  const linaje = Number(codigo);
  if (Number.isNaN(linaje) || linaje === LINAJE_SIN_CODIFICAR) return false;

  return linaje <= ULTIMO_LINAJE_CRIMINAL;
}
