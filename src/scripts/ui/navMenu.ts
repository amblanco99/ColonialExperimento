/**
 * Hamburger menu for the site nav.
 *
 * The panel is collapsed at every width -- there is no breakpoint and no second
 * layout, so the button is always the way in and there is only one code path to
 * reason about.
 *
 * Closed means `display: none` on the panel, not an attribute. That is what
 * keeps its links out of the tab order and out of the accessibility tree; a
 * panel hidden only by opacity or height would still be reachable by Tab and
 * still be read out.
 *
 * `aria-expanded` and the open class are always set in the same place, so they
 * cannot drift apart.
 */
export function initNavMenu(): void {
  const nav = document.querySelector<HTMLElement>('.topnav');
  const boton = nav?.querySelector<HTMLButtonElement>('.nav-toggle');
  if (!nav || !boton) return;

  const estaAbierto = () => nav.classList.contains('topnav--abierto');

  // Deliberately an arrow const and not a `function` declaration: TypeScript
  // keeps the narrowing of `nav` and `boton` from the guard above inside an
  // arrow assigned after it, but not inside a hoisted function body, where both
  // go back to being possibly null.
  const fijar = (abierto: boolean): void => {
    nav.classList.toggle('topnav--abierto', abierto);
    boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  };

  boton.addEventListener('click', () => fijar(!estaAbierto()));

  // Escape closes and hands the focus back to the button. Without that move the
  // focus would be left on a link that has just dropped out of the tab order,
  // which strands keyboard users at the top of the document.
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || !estaAbierto()) return;
    fijar(false);
    boton.focus();
  });

  // The panel overlays the page at every width, so a click outside it closes it.
  document.addEventListener('click', (evento) => {
    if (estaAbierto() && !nav.contains(evento.target as Node)) fijar(false);
  });
}
