import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  base: '/ColonialExperimento/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        tablas: resolve(__dirname, 'tablas.html'),
        about: resolve(__dirname, 'about.html'),
        casos: resolve(__dirname, 'casos.html'),
      }
    }
  }
})