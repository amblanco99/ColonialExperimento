/** Filtros que acepta la tabla de base-de-datos por query string. */
interface FiltrosTabla {
  genero?: string;
  atributo?: string;
  agente?: string;
  codigo?: string;
  subcodigo?: string;
  fecha?: string | number;
  escala?: string;
}

export function crearBotonVerCasos() {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-ver-casos-generico';
  let handlerActivo: (() => void) | null = null;
  boton.addEventListener('click', () => {
    if (handlerActivo) handlerActivo();
  });

  function ocultar() {
    boton.classList.remove('btn-ver-casos-generico--visible');
    handlerActivo = null;
  }
  function mostrar(texto: string, handler: () => void) {
    boton.textContent = `Ver casos: ${texto}`;
    boton.classList.add('btn-ver-casos-generico--visible');
    handlerActivo = handler;
  }
  return { boton, mostrar, ocultar };
}

export function irATablasFiltradas(overrides: FiltrosTabla = {}) {
  const params = new URLSearchParams();
  if (overrides.genero) params.set('genero', overrides.genero);
  if (overrides.atributo) params.set('atributo', overrides.atributo);
  if (overrides.agente) params.set('agente', overrides.agente);
  if (overrides.codigo) params.set('codigo', overrides.codigo);
  if (overrides.subcodigo) params.set('subcodigo', overrides.subcodigo);
  if (overrides.fecha != null) {
    params.set('fecha', overrides.fecha as string);
    params.set('escala', overrides.escala || 'decada');
  }
  window.location.href = `${import.meta.env.BASE_URL}base-de-datos/index.html?${params.toString()}`;
}
