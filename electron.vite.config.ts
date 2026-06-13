import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // node-pty 是原生模块,必须 external——打进 bundle 会丢失 .node 二进制
  main: { build: { rollupOptions: { input: 'src/main/index.ts', external: ['node-pty'] } } },
  preload: {
    build: {
      rollupOptions: {
        input: 'src/preload/index.ts',
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: 'src/renderer/index.html' } },
    plugins: [react()],
  },
});
