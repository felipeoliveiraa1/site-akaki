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

  vite: {
    ssr: {
      /**
       * `sanitize-html` é CommonJS e faz require('htmlparser2'), que da v11 em
       * diante é ESM puro. O Node 24 aceita esse require; o runtime da Vercel
       * usa um carregador próprio que não aceita, e a função morria com
       * ERR_REQUIRE_ESM antes mesmo de executar a página — 500 sem corpo, só
       * no editor de posts, que é a única rota que importa o sanitizador.
       *
       * Empacotar em vez de deixar para o require do runtime resolve na raiz:
       * o Rollup converte o CommonJS na hora do build e o htmlparser2 entra
       * como ESM. Fica a versão corrigida do sanitize-html — travar numa
       * anterior reabriria dois XSS, um deles justamente de bypass de
       * allowedTags, no componente cuja função é impedir XSS.
       */
      noExternal: [
        'sanitize-html',
        // A arvore inteira do sanitize-html precisa entrar junto. Empacotar so
        // ele fez o rastreador da Vercel parar de enxergar o que ele carrega
        // por require, e a funcao subiu sem esses pacotes:
        // "Cannot find module 'escape-string-regexp'".
        'htmlparser2', 'deepmerge', 'escape-string-regexp',
        'is-plain-object', 'parse-srcset', 'postcss', 'launder',
        // ...e o que o postcss carrega:
        'nanoid', 'picocolors', 'source-map-js', 'dayjs',
      ],
    },
  },

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
