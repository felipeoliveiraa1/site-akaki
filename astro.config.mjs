// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import vercel from '@astrojs/vercel';

// `output` fica no padrão 'static': TODAS as rotas continuam pré-renderizadas.
// O adapter só habilita a capacidade de renderizar no servidor — quem entra
// nesse modo é cada arquivo que declara `export const prerender = false`
// (as rotas do blog e do admin). As 7 páginas institucionais não mudam.
/**
 * Empacota o sanitizador (e a árvore dele) dentro da função — só no build.
 *
 * Por que empacotar: `sanitize-html` é CommonJS e faz require('htmlparser2'),
 * que da v11 em diante é ESM puro. O Node aceita esse require; o runtime da
 * Vercel usa um carregador próprio que não aceita, e a função morria com
 * ERR_REQUIRE_ESM antes de executar a página — 500 sem corpo, só no editor de
 * posts, a única rota que importa o sanitizador. Travar o sanitize-html numa
 * versão anterior resolveria o carregamento e reabriria dois XSS, um deles de
 * bypass de allowedTags, no componente cuja função é impedir XSS.
 *
 * Por que só no build: em `astro dev` o Vite serve esses pacotes sem converter
 * o CommonJS, e o editor passou a quebrar com "require is not defined". No dev
 * eles seguem externos, resolvidos pelo Node — que aceita require de ESM.
 *
 * A lista traz as dependências do sanitize-html e as do postcss: ao deixar de
 * ser import externo, o rastreador da Vercel parou de enxergá-las e a função
 * subiu sem elas ("Cannot find module 'escape-string-regexp'").
 */
function empacotaSanitizador() {
  return {
    name: 'akaki:empacota-sanitizador',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        if (command !== 'build') return;
        updateConfig({
          vite: {
            ssr: {
              noExternal: [
                'sanitize-html',
                'htmlparser2', 'deepmerge', 'escape-string-regexp',
                'is-plain-object', 'parse-srcset', 'postcss', 'launder',
                'nanoid', 'picocolors', 'source-map-js', 'dayjs',
              ],
            },
          },
        });
      },
    },
  };
}

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
    empacotaSanitizador(),
    sitemap({
      // Admin e API jamais podem ser indexados.
      filter: (page) => !page.includes('/admin') && !page.includes('/api/'),
    }),
  ],

  adapter: vercel({
    isr: {
      // Páginas do blog ficam cacheadas na borda como se fossem estáticas.
      // O admin limpa o cache das páginas afetadas a cada publicação
      // (src/lib/blog/revalidar.ts), então isto é só rede de segurança — mas
      // ficava em 24h, e quando a limpeza ainda não existia um artigo recém
      // publicado passou horas fora da listagem. Uma hora é um teto tolerável
      // para o caso de a limpeza falhar.
      expiration: 60 * 60,
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
