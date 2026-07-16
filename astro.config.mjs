// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
export default defineConfig({
  site: 'https://www.akaki.odo.br',
  compressHTML: true,
  integrations: [sitemap()],
  build: { inlineStylesheets: 'always' },
});
