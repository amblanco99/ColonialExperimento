import '/src/style/style.css'
import '/src/style/tooltips.css'
import '/src/style/botones.css'
import '/src/style/graficos.css'
import '/src/style/filtros-chip.css'
import '/src/style/mariposa.css'

import { crearWaffleGenero } from '../charts/WaffleGenero.js'
import { crearBeeswarmGenero } from '../charts/BeeswarmGenero.js'
import { crearButterflyGenero } from '../charts/ButterflyGenero.js'
import { crearParticipacionTiempo } from '../charts/ParticipacionTiempo.js'
import { initCarruselPreguntas } from '../ui/carruselPreguntas.js'

const renderizadoresSlides = [
  crearBeeswarmGenero,
  crearButterflyGenero,
  crearParticipacionTiempo,
  crearWaffleGenero,
]

initCarruselPreguntas({
  wheelId: 'pwWheel',
  stageId: 'pwStage',
  prevId: 'pwPrev',
  nextId: 'pwNext',
  onActivate: (indice) => renderizadoresSlides[indice]?.(),
})
