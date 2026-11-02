import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Percorsi relativi: la build statica funziona da qualsiasi cartella o hosting (le rotte usano HashRouter)
  build: {
    outDir: 'dist', // Genera la cartella dist direttamente nella root del progetto
    emptyOutDir: true,
  },
});