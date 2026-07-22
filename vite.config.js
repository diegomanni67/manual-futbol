import { defineConfig } from 'vite';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig({
  build: {
    // Apagamos los sourcemaps para que NO se genere la guía del código fuente original
    sourcemap: false,
    // Minificamos usando Terser/Esbuild para comprimir al máximo
    minify: 'esbuild',
    outDir: 'dist', // Carpeta donde se guardará el juego listo para publicar
  },
  plugins: [
    obfuscator({
      options: {
        compact: true,
        controlFlowFlattening: true, // Destruye la estructura de los bucles e IFs
        deadCodeInjection: false, // Evita inflar demasiado el tamaño del archivo
        debugProtection: true, // Si alguien abre las DevTools, les traba la pestaña
        debugProtectionInterval: 2000,
        disableConsoleOutput: true, // Desactiva los console.log en producción
        identifierNamesGenerator: 'hexadecimal', // Renombra funciones a cosas como _0x4f2a
        log: false,
        renameGlobals: false,
        selfDefending: true, // Si intentan formatear el JS, deja de funcionar
        stringArray: true, // Encripta todos los textos e IDs dentro del JS
        stringArrayThreshold: 0.75,
      },
    }),
  ],
});