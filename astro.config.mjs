// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// `output` fica no padrão 'static': TODAS as rotas continuam pré-renderizadas.
// O adapter só habilita a capacidade de renderizar no servidor — quem entra
// nesse modo é cada arquivo que declara `export const prerender = false`
// (as rotas do blog e do admin). As 7 páginas institucionais não mudam.
export default defineConfig({
  site: 'https://www.akaki.odo.br',
  compressHTML: true,

  // Todo CSS é embutido no HTML (zero request bloqueando a renderização).
  // Cuidado: CSS importado no Layout global é embutido em TODA página —
  // por isso o CSS do blog mora em layouts próprios do blog.
  build: { inlineStylesheets: 'always' },

  // Redirects 301 declarados AQUI (e não só no vercel.json) para garantir que
  // entrem no build output do adapter. A documentação da Vercel não é explícita
  // sobre o vercel.json ser mesclado ao config.json gerado, e são 12 redirects
  // de SEO já indexados — não dá para apostar na ambiguidade.
  // Uma entrada por slug: o Astro trata `/x` e `/x/` como a MESMA rota e
  // declarar as duas gera colisão (que vira erro fatal em versões futuras).
  // As variantes com barra final continuam cobertas pelo vercel.json.
  redirects: {
    '/sedacao-odontologica': '/dentista-com-sedacao-odontologica/',
    '/implantes': '/implante-dentario/',
    '/estetica': '/estetica-3/',
    '/especialistas': '/',
    '/obg-forms': '/',
    '/sitemap_index.xml': '/sitemap-index.xml',
    '/page-sitemap.xml': '/sitemap-0.xml',
  },

  integrations: [
    sitemap({
      // Admin e API jamais podem ser indexados.
      filter: (page) => !page.includes('/admin') && !page.includes('/api/'),
    }),
  ],

  adapter: vercel({
    isr: {
      // Páginas do blog ficam cacheadas na borda como se fossem estáticas.
      // O cache é invalidado na hora ao publicar (via /api/revalidate), então
      // esta expiração é só uma rede de segurança.
      expiration: 60 * 60 * 24,
      bypassToken: process.env.VERCEL_ISR_BYPASS_TOKEN,
      exclude: [
        // ⚠️ O ISR da Vercel DESCARTA query params. A busca depende de ?q=,
        // então precisa ficar de fora ou retornaria sempre o mesmo resultado.
        '/blog/busca',
        // Conteúdo por usuário: cachear seria falha de segurança.
        /^\/admin/,
        /^\/api\//,
      ],
    },
  }),
});
