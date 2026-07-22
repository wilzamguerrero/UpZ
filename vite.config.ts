import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // Ignore runtime-written data files so a submission (which writes
      // submissions.json on the server) does NOT trigger a full page reload
      // that would reset the "Archivos Enviados" success screen.
      watch: process.env.DISABLE_HMR === 'true'
        ? null
        : {
            ignored: [
              '**/submissions.json',
              '**/notion-config.json',
              '**/project-meta.json',
              '**/appearance.json',
              '**/db_store.json',
              '**/uploads/**',
            ],
          },
    },
  };
});
