import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/dialled-in/',
  build: {
    // Recharts is 533 kB but lazy-loaded via React.lazy(FuelTab) — not on the critical path.
    // Raise the warning limit from the 500 kB default to silence the false-positive warning.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          charts: ['recharts'],
          icons: ['lucide-react'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'DIALLED IN',
        short_name: 'DIALLED IN',
        description: 'Personal fitness tracker',
        theme_color: '#0a0a0a',
        background_color: '#0a0a0a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/dialled-in/',
        scope: '/dialled-in/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/lib/**', 'src/utils.js'],
      exclude: ['node_modules', 'dist'],
      thresholds: {
        // Current actuals: lines≈37, functions≈48, statements≈36, branches≈36.
        // storage.js (561 lines) and nutrition.js are 0% — require IndexedDB/AI mocks to test.
        // These thresholds enforce no regression on currently-tested modules (scoring, coaching, utils).
        // TODO: raise to lines:75, functions:80, statements:75 once storage/nutrition have mocks.
        lines: 35,
        functions: 45,
        statements: 35,
        branches: 33,
      },
    },
  },
});
