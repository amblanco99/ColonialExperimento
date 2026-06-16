import '/src/style/style.css'

import { crearConteoInteractivo } from '../charts/TablasConteo.js'
import { crearTiposCasos } from '../charts/TiposCasos.js'
import { crearMujerMencion } from '../charts/MujerMencion.js'
import { crearCrimenesTiempo } from '../charts/CrimenesTiempo.js'
import { crearLinaje } from '../charts/Linaje.js'
import { crearPoblaInstiSunburst } from '../charts/InstitucionesAtributo.js'
import { crearGlobitosPersonas } from '../charts/globitosPersonas.js'
import { crearWaffleGenero } from '../charts/WaffleGenero.js'
import { crearMapaDelitos } from '../charts/mapaDelitos.js'
import { crearRelacionCrimenes } from '../charts/grafoRelacioncrimenes.js'

crearConteoInteractivo()
crearTiposCasos()
crearMujerMencion()
crearCrimenesTiempo()
crearLinaje()
crearPoblaInstiSunburst()
crearGlobitosPersonas()
crearWaffleGenero()
crearMapaDelitos()
crearRelacionCrimenes()
