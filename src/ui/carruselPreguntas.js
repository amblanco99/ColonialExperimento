export function initCarruselPreguntas({ wheelId, stageId, prevId, nextId, onActivate }) {
  const wheel = document.getElementById(wheelId)
  const stage = document.getElementById(stageId)
  if (!wheel || !stage) return

  const prevBtn = prevId ? document.getElementById(prevId) : null
  const nextBtn = nextId ? document.getElementById(nextId) : null

  const cards = Array.from(wheel.querySelectorAll('.pw-card'))
  const slides = Array.from(stage.querySelectorAll('.pw-slide'))
  const total = cards.length
  if (total === 0) return

  const ESPACIADO = 170
  const yaRenderizado = new Set()
  let activo = 0

  function distanciaCircular(i) {
    let diff = i - activo
    if (diff > total / 2) diff -= total
    else if (diff < -total / 2) diff += total
    return diff
  }

  function layout() {
    cards.forEach((card, i) => {
      const diff = distanciaCircular(i)
      const distancia = Math.abs(diff)
      const x = diff * ESPACIADO
      const escala = Math.max(0.72, 1 - distancia * 0.16)
      const opacidad = Math.max(0.35, 1 - distancia * 0.32)

      card.style.transform = `translate(-50%, -50%) translate(${x}px, 0) scale(${escala})`
      card.style.opacity = String(opacidad)
      card.style.zIndex = String(100 - Math.round(distancia))

      const esActivo = i === activo
      card.classList.toggle('is-active', esActivo)
      card.setAttribute('aria-selected', esActivo ? 'true' : 'false')
      card.tabIndex = esActivo ? 0 : -1
    })

    slides.forEach((slide, i) => {
      slide.classList.toggle('is-active', i === activo)
    })
  }

  function activar(indice) {
    activo = ((indice % total) + total) % total
    layout()
    if (!yaRenderizado.has(activo)) {
      yaRenderizado.add(activo)
      onActivate?.(activo)
    }
  }

  cards.forEach((card, i) => {
    card.addEventListener('click', () => activar(i))
  })

  prevBtn?.addEventListener('click', () => activar(activo - 1))
  nextBtn?.addEventListener('click', () => activar(activo + 1))

  wheel.addEventListener('keydown', (evento) => {
    if (evento.key === 'ArrowRight') {
      activar(activo + 1)
      evento.preventDefault()
    } else if (evento.key === 'ArrowLeft') {
      activar(activo - 1)
      evento.preventDefault()
    }
  })

  activar(0)
}
