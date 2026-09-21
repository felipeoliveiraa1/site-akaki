// Sitemap próprio do blog.
//
// Por que existe: o @astrojs/sitemap só enxerga rotas geradas no build. Os
// posts vêm do banco, então nenhum deles entraria no sitemap estático — e o
// cliente tem SEO como prioridade. Este endpoint monta a lista na hora.
//
// Só entram URLs canônicas e indexáveis: sem tags (noindex), sem paginação,
// sem busca.
export const prerender = false;

import type { APIRoute } from 'astro';
import { entradasSitemap } from '../lib/blog/consultas';
import { SITE } from '../lib/blog/formato';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = async () => {
  const { posts, categorias, autores } = await entradasSitemap();

  const urls = [
    { loc: `${SITE}/blog/`, mod: posts[0]?.atualizado_em ?? posts[0]?.publicado_em },
    ...posts.map((p: any) => ({
      loc: `${SITE}/blog/${p.slug}/`,
      mod: p.atualizado_em ?? p.publicado_em,
    })),
    ...categorias.map((c: any) => ({ loc: `${SITE}/blog/categoria/${c.slug}/` })),
    ...autores.map((a: any) => ({ loc: `${SITE}/blog/autor/${a.slug}/` })),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${
    u.mod ? `<lastmod>${new Date(u.mod).toISOString()}</lastmod>` : ''
  }</url>`).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600',
    },
  });
};
