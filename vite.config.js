import { defineConfig } from 'vite';
import obfuscator from 'vite-plugin-javascript-obfuscator';

export default defineConfig({
  build: {
    // Apagamos los sourcemaps para que NO se genere la guía del código fuente original
    sourcemap: false,
    // Minificamos usando Terser/Esbuild para comprimir al máximo
    minify: 'esbuild',
    outDir: 'dist', // Carpeta donde se guardará el juego listo para publicar
    rollupOptions: {
      output: {
        // Todo en un solo archivo, sin chunks separados por import() dinámico.
        // Evita que el ofuscador rompa referencias entre archivos (causaba el error 404).
        inlineDynamicImports: true,
      },
    },
  },
  plugins: [
    obfuscator({
      options: {
        compact: true,
        controlFlowFlattening: false, // DESACTIVADO: rompía el timing del juego (festejos, toque de balón)
        deadCodeInjection: false, // Evita inflar demasiado el tamaño del archivo
        debugProtection: false, // DESACTIVADO: causaba micro-trabas en el juego en producción
        disableConsoleOutput: true, // Desactiva los console.log en producción
        identifierNamesGenerator: 'hexadecimal', // Renombra funciones a cosas como _0x4f2a
        log: false,
        renameGlobals: false,
        selfDefending: false, // DESACTIVADO: mismo motivo que debugProtection
        stringArray: true, // Encripta todos los textos e IDs dentro del JS
        stringArrayThreshold: 0.5,
      },
    }),
  ],
});
