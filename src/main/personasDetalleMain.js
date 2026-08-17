import '/src/style/style.css'
import '/src/style/tooltips.css'
import '/src/style/botones.css'
import '/src/style/graficos.css'
import '/src/style/filtros-chip.css'
import '/src/style/mariposa.css'
import '/src/style/apilado.css'
import '/src/style/lineas.css'
import '/src/style/sunburst.css'
import '/src/style/dashboard.css'

import { crearPersonasDashboard } from '../scripts/charts/PersonasDashboard.js'
import { initVistaToggle } from '../scripts/ui/vistaToggle.js'

crearPersonasDashboard()

initVistaToggle({
  botones: ['vistaBtnDashboard', 'vistaBtnHistoria'],
  vistas: ['vistaDashboard', 'vistaHistoria'],
})
