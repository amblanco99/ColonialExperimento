import * as d3 from 'd3';
import Lenis from 'lenis';
import { crearTiposCasos } from './TiposCasos.js';

interface FilaPreguntaTarjeta {
  Pregunta: string;
  Respuesta: string;
  Desglose?: string;
}

interface FilaDecision {
  Decision: string;
  Explicacion: string;
  Grafica?: string;
}

const cache = new Map<string, Promise<FilaPreguntaTarjeta[]>>();
function cargarPreguntas(rutaCsv: string): Promise<FilaPreguntaTarjeta[]> {
  let promesa = cache.get(rutaCsv);
  if (!promesa) {
    promesa = d3.csv(rutaCsv).then((filas) => filas as unknown as FilaPreguntaTarjeta[]);
    cache.set(rutaCsv, promesa);
  }

  return promesa;
}

const cacheDesglose = new Map<string, Promise<FilaDecision[]>>();
function cargarDesglose(rutaCsv: string): Promise<FilaDecision[]> {
  let promesa = cacheDesglose.get(rutaCsv);
  if (!promesa) {
    promesa = d3.csv(rutaCsv).then((filas) => filas as unknown as FilaDecision[]);
    cacheDesglose.set(rutaCsv, promesa);
  }

  return promesa;
}

export async function crearPreguntasTarjetas(
  containerId: string,
  rutaCsv: string = `${import.meta.env.BASE_URL}data/PreguntasMetodologicas.csv`,
  onNavegarVista?: (vista: string) => void,
) {
  const preguntas = await cargarPreguntas(rutaCsv);
  const contenedor = document.getElementById(containerId)!;

  const raiz = document.createElement('div');
  raiz.className = 'preguntas-tarjetas';

  const pista = document.createElement('div');
  pista.className = 'preguntas-tarjetas-pista';

  const listaPildoras = document.createElement('div');
  listaPildoras.className = 'preguntas-tarjetas-pildoras';
  pista.appendChild(listaPildoras);

  const panel = document.createElement('div');
  panel.className = 'preguntas-tarjetas-panel';

  const chip = document.createElement('span');
  chip.className = 'preguntas-tarjetas-chip';

  const respuesta = document.createElement('div');
  respuesta.className = 'preguntas-tarjetas-respuesta';

  panel.append(chip, respuesta);
  raiz.append(pista, panel);
  contenedor.appendChild(raiz);

  // Las respuestas propias (o las de un desglose, ver abajo) pueden traer
  // <a data-ir-vista="..."> para saltar a otra pestaña de esta misma página
  // (ver PreguntasMetodologicas.csv) — no son enlaces reales, así que su
  // navegación se resuelve con el callback que pasa about/index.astro en vez
  // de con el href.
  function enlazarNavegacion() {
    respuesta.querySelectorAll<HTMLAnchorElement>('[data-ir-vista]').forEach((enlace) => {
      enlace.addEventListener('click', (evento) => {
        evento.preventDefault();
        onNavegarVista?.(enlace.dataset.irVista!);
      });
    });
  }

  function pintarRespuesta(etiquetaChip: string, html: string) {
    chip.textContent = etiquetaChip;
    // innerHTML (no textContent): las respuestas traen <strong> para resaltar
    // términos y saltos de línea dobles entre puntos — contenido propio del
    // proyecto, no aporte externo.
    respuesta.innerHTML = html;
    enlazarNavegacion();
  }

  // Algunas decisiones (ver columna Grafica de DecisionesMetodologicas.csv)
  // no se explican solo con texto: la gráfica va incrustada dentro de la
  // tarjeta, no como enlace a otra sección. Cada clave mapea a la función
  // de gráfico correspondiente — hoy solo existe 'tipoCaso', pero el mapa
  // deja lugar para sumar otras sin tocar el resto del componente.
  let contadorGrafica = 0;
  const graficas: Record<string, (containerId: string) => void> = {
    tipoCaso: crearTiposCasos,
  };
  function pintarGrafica(clave: string) {
    const render = graficas[clave];
    if (!render) return;

    const contenedorGrafica = document.createElement('div');
    contenedorGrafica.className = 'preguntas-tarjetas-grafica';
    contenedorGrafica.id = `preguntas-tarjetas-grafica-${clave}-${contadorGrafica++}`;
    respuesta.appendChild(contenedorGrafica);
    render(contenedorGrafica.id);

    // Fuera de la tarjeta, "Tipos de Caso" trae esta misma leyenda en el
    // HTML de la sección (ver about/index.astro); acá adentro no hay nada
    // más que explique los colores, así que se repite.
    if (clave === 'tipoCaso') {
      const leyenda = document.createElement('div');
      leyenda.className = 'legend';
      leyenda.innerHTML = `
        <div class="legend-item">
          <div class="color-box azul"></div>
          <span>No es un proceso penal con delito identificable</span>
        </div>
        <div class="legend-item">
          <div class="color-box rosa"></div>
          <span>Proceso judicial criminal identificable</span>
        </div>
      `;
      respuesta.appendChild(leyenda);
    }
  }

  let indiceRaizActivo = 0;

  function pintarNivelRaiz() {
    listaPildoras.innerHTML = '';
    preguntas.forEach((fila, indice) => {
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'preguntas-tarjetas-pildora';
      boton.classList.toggle('preguntas-tarjetas-pildora--activa', indice === indiceRaizActivo);
      boton.textContent = fila.Pregunta;
      boton.addEventListener('click', () => {
        indiceRaizActivo = indice;
        if (fila.Desglose) {
          abrirDesglose(fila.Desglose);
        } else {
          pintarNivelRaiz();
          pintarRespuesta(fila.Pregunta, fila.Respuesta);
        }
      });
      listaPildoras.appendChild(boton);
    });
  }

  // La pregunta "¿Cuáles fueron las decisiones metodológicas?" no responde
  // con texto propio: al activarla, la columna de píldoras cambia de nivel
  // (breadcrumb) y muestra una por cada decisión de su CSV — clic en
  // cualquiera pinta su justificación en el panel. "‹ Volver" restaura el
  // nivel raíz sin recargar el CSV (cacheDesglose evita el fetch repetido).
  async function abrirDesglose(rutaDesglose: string) {
    const decisiones = await cargarDesglose(`${import.meta.env.BASE_URL}${rutaDesglose}`);
    let indiceDecisionActivo = 0;

    function activarDecision(indice: number) {
      indiceDecisionActivo = indice;
      pintarNivelDesglose();
      const decision = decisiones[indice];
      pintarRespuesta(decision.Decision, decision.Explicacion);
      if (decision.Grafica) pintarGrafica(decision.Grafica);
    }

    function pintarNivelDesglose() {
      listaPildoras.innerHTML = '';

      const volver = document.createElement('button');
      volver.type = 'button';
      volver.className = 'preguntas-tarjetas-pildora preguntas-tarjetas-pildora--volver';
      volver.textContent = '‹ Volver';
      volver.addEventListener('click', () => {
        pintarNivelRaiz();
        pintarRespuesta(preguntas[indiceRaizActivo].Pregunta, preguntas[indiceRaizActivo].Respuesta);
      });
      listaPildoras.appendChild(volver);

      decisiones.forEach((decision, indice) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'preguntas-tarjetas-pildora';
        boton.classList.toggle('preguntas-tarjetas-pildora--activa', indice === indiceDecisionActivo);
        boton.textContent = decision.Decision;
        boton.addEventListener('click', () => activarDecision(indice));
        listaPildoras.appendChild(boton);
      });
    }

    activarDecision(0);
  }

  pintarNivelRaiz();
  pintarRespuesta(preguntas[0].Pregunta, preguntas[0].Respuesta);

  const lenis = new Lenis({ wrapper: pista, content: listaPildoras, duration: 1 });

  function raf(time: number) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);
}
