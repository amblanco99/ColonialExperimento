import '/src/style/style.css'
import '/src/style/caso.css'

import { crearTabla } from '../scripts/tables/tablageneral.js'
import { inicializarCaso } from '../scripts/tables/caso.js'

if (document.getElementById('tablaContainer')) {
  crearTabla()
} else if (document.getElementById('main-content')) {
  inicializarCaso()
}
