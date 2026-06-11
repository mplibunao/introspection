import { defineConfig } from 'tsdown';

export default defineConfig({
  banner: {
    js: '#!/usr/bin/env node\n',
  },
  clean: true,
  entry: ['src/bin.ts'],
  outDir: 'dist',
  sourcemap: true,
});
