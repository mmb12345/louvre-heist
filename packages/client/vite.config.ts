import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@louvre-heist/shared': resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 3000,
  },
});
