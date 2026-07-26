import '/src/style/style.css'
import '/src/style/caso.css'

import { crearTabla } from '../tables/tablageneral.js'
import { inicializarCaso } from '../tables/caso.js'

if (document.getElementById('tablaContainer')) {
  crearTabla()
} else if (document.getElementById('main-content')) {
  inicializarCaso()
}
