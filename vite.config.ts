import { defineConfig } from 'vite'

export default defineConfig({
  // Use relative asset paths so dist works when hosted from any subpath.
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild',
  },
})
