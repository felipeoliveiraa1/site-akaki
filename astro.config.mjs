// @ts-check
import { defineConfig } from 'astro/config';
export default defineConfig({
  site: 'https://akaki.odo.br',
  compressHTML: true,
  build: { inlineStylesheets: 'always' },
});
