import * as d3 from 'd3';

interface FilaPregunta {
  Pregunta: string;
  Respuesta: string;
}

interface Pregunta {
  pregunta: string;
  respuestas: string[];
}

// Algunas preguntas se repiten en varias filas del CSV, cada una con un
// párrafo de respuesta distinto (ver CrimenesPreguntas.csv). Se agrupan acá
// preservando el orden de aparición — un Map, no un objeto plano, para que
// el orden de las claves quede garantizado.
function agruparPorPregunta(filas: FilaPregunta[]): Pregunta[] {
  const mapa = new Map<string, string[]>();

  filas.forEach((fila) => {
    const respuestas = mapa.get(fila.Pregunta);
    if (respuestas) {
      respuestas.push(fila.Respuesta);
    } else {
      mapa.set(fila.Pregunta, [fila.Respuesta]);
    }
  });

  return Array.from(mapa, ([pregunta, respuestas]) => ({ pregunta, respuestas }));
}

// Contenido genérico de metodología, no ligado a ningún nodo del árbol de
// Linaje. Cache por ruta (no un único Promise) porque esta misma función
// también arma el acordeón de documentación técnica con otro CSV — cada
// ruta se carga una sola vez aunque su página lo pida varias veces.
const preguntasCache = new Map<string, Promise<Pregunta[]>>();
function cargarPreguntasFrecuentes(rutaCsv: string): Promise<Pregunta[]> {
  let promesa = preguntasCache.get(rutaCsv);
  if (!promesa) {
    promesa = d3.csv(rutaCsv).then((filas) => agruparPorPregunta(filas as unknown as FilaPregunta[]));
    preguntasCache.set(rutaCsv, promesa);
  }

  return promesa;
}

export async function crearPreguntasFrecuentes(
  containerId: string,
  rutaCsv: string = `${import.meta.env.BASE_URL}data/CrimenesPreguntas.csv`,
) {
  const preguntas = await cargarPreguntasFrecuentes(rutaCsv);

  const lista = document.createElement('div');
  lista.className = 'linaje-faq';

  preguntas.forEach(({ pregunta, respuestas }, indice) => {
    const item = document.createElement('div');
    item.className = 'linaje-faq-item';

    const idPanel = `linaje-faq-panel-${indice}`;

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'linaje-faq-pregunta';
    boton.textContent = pregunta;
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-controls', idPanel);

    const panel = document.createElement('div');
    panel.className = 'linaje-faq-panel';
    panel.id = idPanel;

    const interior = document.createElement('div');
    interior.className = 'linaje-faq-panel-inner';

    respuestas.forEach((respuesta) => {
      const parrafo = document.createElement('p');
      parrafo.className = 'linaje-faq-respuesta';
      // innerHTML (no textContent) para poder tener enlaces embebidos, como
      // el de la licencia Creative Commons en la sección de citación — el
      // contenido de estos CSV es propio del proyecto, no aporte externo,
      // así que no hay riesgo de inyección. white-space: pre-line (ver
      // faq.scss) sigue mostrando los saltos de línea internos del CSV sin
      // lógica extra acá.
      parrafo.innerHTML = respuesta;
      interior.append(parrafo);
    });

    panel.append(interior);

    boton.addEventListener('click', () => {
      const abierto = item.classList.toggle('linaje-faq-item--abierto');
      boton.setAttribute('aria-expanded', String(abierto));
    });

    item.append(boton, panel);
    lista.append(item);
  });

  document.getElementById(containerId)!.append(lista);
}
