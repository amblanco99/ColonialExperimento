import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import { fromLonLat } from 'ol/proj.js';
import Attribution from 'ol/control/Attribution.js';
import 'ol/ol.css';

// TODO: type — proyección d3 (d3.geoMercator ya ajustada con fitExtent). Ver MIGRATION.md.
type ProyeccionD3 = any;

// Radio (m) de la esfera que usan tanto EPSG:3857/Web Mercator (la proyección
// de OpenLayers) como d3.geoMercator (que en vez de metros usa su propio
// "scale", un multiplicador arbitrario de píxeles por radián). Las dos son la
// misma proyección Mercator esférica — mismo desarrollo en longitud/latitud,
// solo cambia esa constante — así que la conversión de abajo es exacta, no
// una aproximación.
const RADIO_TIERRA_MERCATOR = 6378137;

interface ParametrosSincronizacion {
  /** Proyección d3 (d3.geoMercator ya ajustada con fitExtent) del mapa SVG. */
  projection: ProyeccionD3;
  /** Transform actual del zoom de d3 (event.transform: {x, y, k}). */
  transform: { x: number; y: number; k: number };
  /** Ancho/alto del viewBox del SVG — unidades virtuales, no píxeles reales
   *  (el SVG escala su viewBox al contenedor con max-width:100%). */
  width: number;
  height: number;
}

/**
 * Mapa de OpenLayers (tiles de OpenTopoMap: relieve, ríos y toponimia reales)
 * que sirve de fondo topográfico opcional detrás del SVG de D3. No maneja su
 * propio pan/zoom — sin interacciones propias — porque el SVG de encima ya
 * tiene todo ese comportamiento (zoom, hover, pines, cápsulas); en cambio,
 * `sincronizar()` traduce el projection + zoom transform de d3 a la vista de
 * OpenLayers, así que ambos siempre muestran exactamente el mismo recuadro.
 */
export function crearMapaBaseTopografico(contenedor: HTMLElement) {
  const mapaOL = new Map({
    target: contenedor,
    layers: [
      new TileLayer({
        source: new XYZ({
          url: 'https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png',
          maxZoom: 17,
          crossOrigin: 'anonymous',
          attributions: [
            'Mapa: © <a href="https://opentopomap.org/" target="_blank" rel="noopener">OpenTopoMap</a> (CC-BY-SA)',
            '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors',
          ],
        }),
      }),
    ],
    view: new View({ center: [0, 0], zoom: 2, constrainResolution: false }),
    interactions: [],
    controls: [new Attribution({ collapsible: false })],
  });

  let ultimosParametros: ParametrosSincronizacion | null = null;

  function sincronizar(parametros: ParametrosSincronizacion) {
    ultimosParametros = parametros;
    const { projection, transform, width, height } = parametros;
    const { x: tx, y: ty, k } = transform;

    // Punto geográfico que cae en el centro del recuadro actual del SVG:
    // se deshace el zoom transform (traslado + escala) sobre el centro del
    // viewBox y se invierte la proyección de d3 sobre ese punto.
    const centroViewBox: [number, number] = [(width / 2 - tx) / k, (height / 2 - ty) / k];
    const lonLat = projection.invert(centroViewBox);
    if (!lonLat) return;

    const anchoRenderPx = contenedor.getBoundingClientRect().width || width;
    const escalaD3 = projection.scale();
    const metrosPorUnidadViewBox = RADIO_TIERRA_MERCATOR / (escalaD3 * k);
    const unidadesViewBoxPorPixelReal = width / anchoRenderPx;
    const resolucion = metrosPorUnidadViewBox * unidadesViewBoxPorPixelReal;

    const vista = mapaOL.getView();
    vista.setCenter(fromLonLat(lonLat));
    vista.setResolution(resolucion);
  }

  // El SVG es responsive (max-width:100%): cuando el contenedor cambia de
  // tamaño hay que avisarle a OpenLayers (updateSize) y recalcular la
  // resolución, que depende del ancho renderizado real.
  const observadorTamano = new ResizeObserver(() => {
    mapaOL.updateSize();
    if (ultimosParametros) sincronizar(ultimosParametros);
  });
  observadorTamano.observe(contenedor);

  function mostrar() {
    contenedor.style.display = '';
    mapaOL.updateSize();
    if (ultimosParametros) sincronizar(ultimosParametros);
  }

  function ocultar() {
    contenedor.style.display = 'none';
  }

  return { mostrar, ocultar, sincronizar };
}
