import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    // Security hardening: local development must not be exposed to the LAN.
    host: '127.0.0.1',
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    strictPort: true
  }
});
