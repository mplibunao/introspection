import { defineConfig } from 'tsdown';

export default defineConfig({
  banner: {
    js: '#!/usr/bin/env bun\n',
  },
  clean: true,
  entry: ['src/bin.ts'],
  outDir: 'dist',
  sourcemap: true,
});
