import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// En développement, /api est relayé vers le backend (BACKEND_URL, défaut http://127.0.0.1:3320).
// En production, l'URL du backend est injectée au build via VITE_API_URL — jamais en dur dans les composants.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: { port: 3321, strictPort: true, proxy: { '/api': { target: env.BACKEND_URL || 'http://127.0.0.1:3320', changeOrigin: true } } },
  };
});
