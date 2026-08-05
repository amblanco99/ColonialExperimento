// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  // GitHub Pages sirve el sitio en una subruta. OJO: BASE_URL termina en '/',
  // así que las rutas se construyen como `${BASE_URL}data/x.csv`, sin barra inicial.
  base: '/ColonialExperimento/',

  // 'preserve' genera los HTML tal como están en src/pages/, lo que conserva las
  // rutas actuales (base-de-datos/caso.html, about/fuentes.html, personas/personas.html).
  // El default 'directory' las reescribiría a /caso/ y rompería los enlaces que
  // genera el código de la tabla.
  build: {
    format: 'preserve',
  },

  // Temporal. Vite también compila a dist/ y se pisarían, lo que impediría comparar
  // ambas versiones lado a lado. Vuelve a 'dist' en la fase 7, cuando se borre Vite
  // (deploy.yml sube `path: dist`).
  outDir: './dist-astro',

  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          // loadPaths permite escribir @use "abstracts/variables" desde cualquier
          // archivo, sin rutas relativas frágiles.
          //
          // OJO: esta ruta es relativa al cwd, no a este archivo. Da por hecho
          // que Astro se ejecuta desde la raíz del proyecto, que es lo normal
          // (npm run ... siempre lo hace). Antes se resolvía de forma absoluta
          // con fileURLToPath(new URL(..., import.meta.url)), lo que no dependía
          // del cwd, pero eso obligaba a importar 'node:url' y por tanto a
          // instalar @types/node solo para que `astro check` no fallara. Si
          // algún día el build se lanza desde otro directorio, esto se rompe y
          // hay que volver a la forma absoluta.
          loadPaths: ['src/styles'],

          // Inyecta los tokens en cada .scss para no repetir el @use en todos.
          // Se salta abstracts/ porque inyectarlo dentro del propio _variables.scss
          // crearía un @use circular.
          additionalData: (fuente, ruta) => {
            if (ruta.replace(/\\/g, '/').includes('/src/styles/abstracts/')) {
              return fuente;
            }
            return `@use "abstracts/variables" as *;\n${fuente}`;
          },
        },
      },
    },
  },
});
