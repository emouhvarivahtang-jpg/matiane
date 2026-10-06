import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  // Icon modules are imported individually; PDF engines ship as lazy local assets.
  // Avoid expensive whole-program analysis of this editor in Rollup 4.64.
  build: { rollupOptions: { treeshake: false } },
  test: { include: ['src/**/*.test.js'] },
});
