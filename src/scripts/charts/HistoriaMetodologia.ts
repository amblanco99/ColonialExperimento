import * as d3 from 'd3';
interface FilaHistoria {
  Orden: string;
  Texto: string;
}
const ILUSTRACIONES = [
  { archivo: 'Puerta.png', alt: 'Ilustración de una puerta colonial', tipo: 'fondo' as const },
  { archivo: 'Casas.png', alt: 'Ilustración de una fachada colonial', tipo: 'fondo' as const },
  { archivo: 'Mujer.png', alt: 'Retrato de época de una mujer', tipo: 'retrato' as const },
  { archivo: 'Hombre.png', alt: 'Retrato de época de un hombre', tipo: 'retrato' as const },
];
let promesaHistoria: Promise<FilaHistoria[]> | null = null;
function cargarHistoria(): Promise<FilaHistoria[]> {
  if (!promesaHistoria) {
    promesaHistoria = d3
      .csv(`${import.meta.env.BASE_URL}data/HistoriaMetodologia.csv`)
      .then((filas) => filas as unknown as FilaHistoria[]);
  }
  return promesaHistoria;
}
export async function crearHistoriaMetodologia(containerId: string) {
  const filas = await cargarHistoria();
  const contenedor = document.getElementById(containerId)!;
  const wrap = document.createElement('div');
  wrap.className = 'historia-wrap';
  const flechaPrev = document.createElement('button');
  flechaPrev.type = 'button';
  flechaPrev.className = 'historia-flecha historia-flecha--prev';
  flechaPrev.setAttribute('aria-label', 'Diapositiva anterior');
  flechaPrev.textContent = '‹';
  const pista = document.createElement('div');
  pista.className = 'historia-pista';
  const contenido = document.createElement('div');
  contenido.className = 'historia-contenido';
  pista.appendChild(contenido);
  const flechaNext = document.createElement('button');
  flechaNext.type = 'button';
  flechaNext.className = 'historia-flecha historia-flecha--next';
  flechaNext.setAttribute('aria-label', 'Diapositiva siguiente');
  flechaNext.textContent = '›';
  filas.forEach((fila, i) => {
    const slide = document.createElement('article');
    slide.className = 'historia-slide';
    const cuerpo = document.createElement('div');
    cuerpo.className = 'historia-slide-cuerpo';
    const texto = document.createElement('p');
    texto.className = 'historia-slide-texto';
    texto.textContent = fila.Texto;
    cuerpo.append(texto);
    const ilustracion = ILUSTRACIONES[i % ILUSTRACIONES.length];
    const url = `${import.meta.env.BASE_URL}${ilustracion.archivo}`;
    if (ilustracion.tipo === 'retrato') {
      const figura = document.createElement('div');
      figura.className = 'historia-slide-imagen';
      const imagen = document.createElement('img');
      imagen.src = url;
      imagen.alt = ilustracion.alt;
      imagen.loading = 'lazy';
      figura.appendChild(imagen);
      slide.append(figura, cuerpo);
    } else {
      slide.classList.add('historia-slide--fondo');
      slide.style.setProperty('--historia-fondo', `url("${url}")`);
      slide.append(cuerpo);
    }
    contenido.appendChild(slide);
  });
  const puntos = document.createElement('div');
  puntos.className = 'historia-puntos';
  const botonesPunto = filas.map((_, i) => {
    const punto = document.createElement('button');
    punto.type = 'button';
    punto.className = 'historia-punto';
    punto.setAttribute('aria-label', `Ir a la diapositiva ${i + 1}`);
    puntos.appendChild(punto);
    return punto;
  });
  wrap.append(flechaPrev, pista, flechaNext);
  contenedor.append(wrap, puntos);
  const slides = [...contenido.querySelectorAll<HTMLElement>('.historia-slide')];
  let indice = 0;
  function render() {
    contenido.style.transform = `translateX(-${indice * 100}%)`;
    pista.style.height = `${slides[indice].scrollHeight}px`;
    botonesPunto.forEach((punto, i) => punto.classList.toggle('historia-punto--activo', i === indice));
  }
  function irA(objetivo: number) {
    indice = Math.max(0, Math.min(slides.length - 1, objetivo));
    render();
  }
  flechaPrev.addEventListener('click', () => irA(indice - 1));
  flechaNext.addEventListener('click', () => irA(indice + 1));
  botonesPunto.forEach((punto, i) => punto.addEventListener('click', () => irA(i)));
  window.addEventListener('resize', render);
  render();
}
