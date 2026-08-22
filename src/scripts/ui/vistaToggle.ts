interface OpcionesVistaToggle {
  botones: string[];
  vistas: string[];
}

interface EntradaVista {
  boton: HTMLElement;
  vista: HTMLElement;
}

export function initVistaToggle({ botones, vistas }: OpcionesVistaToggle) {
  // El filter de abajo descarta las entradas sin elemento, pero TypeScript no
  // sabe estrechar el tipo del array a partir de eso: cada boton/vista sigue
  // siendo HTMLElement | null para él. El cast recoge lo que el filter ya
  // garantiza en runtime, sin tocar el comportamiento.
  const entradas = botones
    .map((btnId, i) => ({
      boton: document.getElementById(btnId),
      vista: document.getElementById(vistas[i]),
    }))
    .filter(({ boton, vista }) => boton && vista) as EntradaVista[];

  if (entradas.length === 0) return;

  function activar(indice: number) {
    entradas.forEach(({ boton, vista }, i) => {
      const activo = i === indice;
      boton.classList.toggle('vista-toggle-btn--activo', activo);
      boton.setAttribute('aria-selected', activo ? 'true' : 'false');
      vista.hidden = !activo;
    });
  }

  entradas.forEach(({ boton }, i) => {
    boton.addEventListener('click', () => activar(i));
  });

  activar(0);
}
