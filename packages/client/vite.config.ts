import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@louvre-heist/shared': resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 3000,
  },
});
