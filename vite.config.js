import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: false,
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Vite may choose another port. Only normalize same-origin loopback development requests.
            const origin = req.headers.origin;
            if (origin === `http://${req.headers.host}` && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
              proxyReq.setHeader('Origin', 'http://127.0.0.1:5173');
            }
          });
        }
      },
      '/uploads': {
        target: 'http://127.0.0.1:8765',
        changeOrigin: true
      }
    }
  },
  build: {
    target: 'esnext'
  }
});
