export function initVistaToggle({ botones, vistas }) {
  const entradas = botones
    .map((btnId, i) => ({
      boton: document.getElementById(btnId),
      vista: document.getElementById(vistas[i]),
    }))
    .filter(({ boton, vista }) => boton && vista)

  if (entradas.length === 0) return

  function activar(indice) {
    entradas.forEach(({ boton, vista }, i) => {
      const activo = i === indice
      boton.classList.toggle('vista-toggle-btn--activo', activo)
      boton.setAttribute('aria-selected', activo ? 'true' : 'false')
      vista.hidden = !activo
    })
  }

  entradas.forEach(({ boton }, i) => {
    boton.addEventListener('click', () => activar(i))
  })

  activar(0)
}
