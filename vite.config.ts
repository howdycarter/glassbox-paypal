import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: the PayPal credential-holding server runs separately on :8787
// (npm run server). The browser never sees the PayPal client secret.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
