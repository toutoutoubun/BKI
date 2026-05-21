import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/');
          if (!normalizedId.includes('node_modules')) return undefined;
          if (normalizedId.includes('/recharts/') || normalizedId.includes('/d3-')) return 'vendor-charts';
          if (normalizedId.includes('/lucide-react/')) return 'vendor-icons';
          if (normalizedId.includes('/react/') || normalizedId.includes('/react-dom/') || normalizedId.includes('/scheduler/')) return 'vendor-react';
          if (normalizedId.includes('/i18next/') || normalizedId.includes('/react-i18next/')) return 'vendor-i18n';
          return 'vendor';
        },
      },
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
