import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/ColonialExperimento/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tablas: resolve(__dirname, 'base-de-datos/index.html'),
        about: resolve(__dirname, 'about/index.html'),
        casos: resolve(__dirname, 'base-de-datos/caso.html'),
        tiempo: resolve(__dirname, 'tiempo/index.html'),
        composicionSocial: resolve(__dirname, 'personas/index.html'),
        aboutFuentes: resolve(__dirname, 'about/fuentes.html'),
        aboutDelitos: resolve(__dirname, 'about/delitos.html'),
        aboutDocumentacionTecnica: resolve(__dirname, 'about/documentacion-tecnica.html'),
        personas: resolve(__dirname, 'personas/personas.html'),
        otrosAgentes: resolve(__dirname, 'personas/otrosAgentes.html'),
      }
    }
  }
})