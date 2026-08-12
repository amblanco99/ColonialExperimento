export function crearBotonVerCasos() {
  const boton = document.createElement("button");
  boton.type = "button";
  boton.className = "btn-ver-casos-generico";
  let handlerActivo = null;
  boton.addEventListener("click", () => {
    if (handlerActivo) handlerActivo();
  });

  function ocultar() {
    boton.classList.remove("btn-ver-casos-generico--visible");
    handlerActivo = null;
  }
  function mostrar(texto, handler) {
    boton.textContent = `Ver casos: ${texto}`;
    boton.classList.add("btn-ver-casos-generico--visible");
    handlerActivo = handler;
  }
  return { boton, mostrar, ocultar };
}

export function irATablasFiltradas(overrides = {}) {
  const params = new URLSearchParams();
  if (overrides.genero) params.set("genero", overrides.genero);
  if (overrides.atributo) params.set("atributo", overrides.atributo);
  if (overrides.agente) params.set("agente", overrides.agente);
  if (overrides.codigo) params.set("codigo", overrides.codigo);
  if (overrides.subcodigo) params.set("subcodigo", overrides.subcodigo);
  if (overrides.fecha != null) {
    params.set("fecha", overrides.fecha);
    params.set("escala", overrides.escala || "decada");
  }
  window.location.href = `../base-de-datos/index.html?${params.toString()}`;
}
