import * as d3 from 'd3';
import * as Plot from '@observablehq/plot';

interface FilaCaso {
  FechaInicial: string;
  TipoProceso: string;
}

// Cacheado: crearTiposCasos() se llama tanto para la sección "Tipos de Caso"
// como, con otro containerId, para el desglose de decisiones metodológicas
// (ver PreguntasTarjetas.ts) — no tiene sentido pedir el CSV dos veces.
let promesaCasos: Promise<FilaCaso[]> | null = null;
function cargarCasos(): Promise<FilaCaso[]> {
  if (!promesaCasos) {
    promesaCasos = d3
      .csv(`${import.meta.env.BASE_URL}data/Casos.csv`)
      .then((filas) => filas as unknown as FilaCaso[]);
  }
  return promesaCasos;
}

export async function crearTiposCasos(containerId: string = 'tipoCaso') {
  const MujeresMencionadas = await cargarCasos();

  const tipoCaso = Plot.plot({
    width: 600,
    marginLeft: 60,
    style: { fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-2xs)' },
    x: { label: 'Siglo', type: 'band', domain: ['XVI', 'XVII', 'XVIII', 'XIX'] },
    y: { label: 'Cantidad de Casos', grid: true },
    color: {
      legend: false,
      domain: [
        'No es un proceso penal con delito identificable',
        'Proceso judicial criminal identificable',
      ],
      range: ['#003f5c', '#bb4e99'],
    },
    marks: [
      Plot.barY(
        // FechaInicial llega como string desde d3.csv y se compara con números;
        // funciona por la conversión que hace JS al comparar. Se castea para
        // dejarlo tal cual: meter Number() aquí sería cambiar el runtime.
        MujeresMencionadas.filter(
          (d) =>
            (d.FechaInicial as unknown as number) > 0 &&
            (d.FechaInicial as unknown as number) < 1901,
        ),
        Plot.groupX(
          { y: 'count' },
          {
            x: (d) => {
              const siglo = Math.floor(((d.FechaInicial as unknown as number) - 1) / 100) + 1;
              const romanos: Record<number, string> = {
                16: 'XVI',
                17: 'XVII',
                18: 'XVIII',
                19: 'XIX',
              };
              return romanos[siglo];
            },
            fill: 'TipoProceso',
            tip: {
              format: {
                x: (d) => `Siglo ${d}`,
                y: true,
                fill: true,
              },
            },
            sort: { x: 'x' },
          },
        ),
      ),
    ],
  });

  document.getElementById(containerId)!.append(tipoCaso);
}
