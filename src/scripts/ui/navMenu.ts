/**
 * Drawer menu for the site nav.
 *
 * The panel is collapsed at every width -- there is no breakpoint and no second
 * layout, so the button is always the way in and there is only one code path to
 * reason about.
 *
 * Closed means `visibility: hidden` on the panel, not an attribute. That is what
 * keeps its links out of the tab order and out of the accessibility tree; a
 * panel hidden only by opacity or transform would still be reachable by Tab and
 * still be read out. `display: none` would do the same job but cannot be
 * transitioned, and the panel slides.
 *
 * `aria-expanded`, `aria-label`, the open class and the body scroll lock are all
 * set in the same place, so they cannot drift apart.
 */
export function initNavMenu(): void {
  const nav = document.querySelector<HTMLElement>('.topnav');
  const boton = nav?.querySelector<HTMLButtonElement>('.nav-toggle');
  const panel = nav?.querySelector<HTMLElement>('.nav-links');
  const fondo = nav?.querySelector<HTMLElement>('.nav-fondo');
  if (!nav || !boton || !panel) return;

  const estaAbierto = () => nav.classList.contains('topnav--abierto');

  // The button is part of the cycle on purpose: it is the close control, and
  // leaving it out would make the drawer impossible to close from the keyboard
  // without Escape.
  const focos = (): HTMLElement[] => [
    boton,
    ...Array.from(panel.querySelectorAll<HTMLElement>('a[href]')),
  ];

  // Deliberately an arrow const and not a `function` declaration: TypeScript
  // keeps the narrowing of `nav`, `boton` and `panel` from the guard above
  // inside an arrow assigned after it, but not inside a hoisted function body,
  // where they go back to being possibly null.
  const fijar = (abierto: boolean): void => {
    nav.classList.toggle('topnav--abierto', abierto);
    document.body.classList.toggle('nav-abierto', abierto);
    boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  };

  const abrir = (): void => {
    fijar(true);
    panel.querySelector<HTMLElement>('a[href]')?.focus();
  };

  // Handing the focus back to the button matters: without the move it would be
  // left on a link that has just dropped out of the tab order, which strands
  // keyboard users at the top of the document.
  const cerrar = (): void => {
    if (!estaAbierto()) return;
    fijar(false);
    boton.focus();
  };

  boton.addEventListener('click', () => (estaAbierto() ? cerrar() : abrir()));

  fondo?.addEventListener('click', cerrar);

  panel.addEventListener('click', (evento) => {
    if ((evento.target as HTMLElement).closest('a[href]')) cerrar();
  });

  document.addEventListener('keydown', (evento) => {
    if (!estaAbierto()) return;

    if (evento.key === 'Escape') {
      cerrar();
      return;
    }

    if (evento.key !== 'Tab') return;

    const cicladores = focos();
    const primero = cicladores[0];
    const ultimo = cicladores[cicladores.length - 1];
    const activo = document.activeElement as HTMLElement | null;

    if (!activo || !cicladores.includes(activo)) {
      evento.preventDefault();
      primero.focus();
      return;
    }

    if (evento.shiftKey && activo === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && activo === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  });
}
