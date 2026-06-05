import { defineConfig } from 'vite';

// Rendering app entry is index.html -> src/render/main.ts
export default defineConfig({
  server: { port: 5173 },
  build: { outDir: 'dist', target: 'es2022' },
});
