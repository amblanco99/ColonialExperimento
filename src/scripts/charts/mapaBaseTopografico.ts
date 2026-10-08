import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import XYZ from 'ol/source/XYZ.js';
import { fromLonLat } from 'ol/proj.js';
import Attribution from 'ol/control/Attribution.js';
import 'ol/ol.css';
type ProyeccionD3 = any;
const RADIO_TIERRA_MERCATOR = 6378137;
interface ParametrosSincronizacion {
  projection: ProyeccionD3;
  transform: { x: number; y: number; k: number };
  width: number;
  height: number;
}
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
