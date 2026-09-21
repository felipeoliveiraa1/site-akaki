export const prerender = false;

import type { APIRoute } from 'astro';
import rss from '@astrojs/rss';
import { listarPosts } from '../../lib/blog/consultas';
import { SITE } from '../../lib/blog/formato';

export const GET: APIRoute = async (contexto) => {
  const { posts } = await listarPosts(1);

  return rss({
    title: 'Blog · Akaki Odontologia',
    description:
      'Odontologia explicada sem susto: sedação, implantes, ortodontia, estética e odontopediatria.',
    site: contexto.site ?? SITE,
    trailingSlash: true,
    customData: '<language>pt-br</language>',
    // De propósito só o resumo, não o artigo inteiro: feed com texto completo
    // é convite para sites republicarem o conteúdo e competirem com a gente.
    items: posts.map((p) => ({
      title: p.titulo,
      description: p.resumo ?? '',
      link: `/blog/${p.slug}/`,
      pubDate: new Date(p.publicado_em),
      author: p.autor?.nome,
      categories: [
        ...(p.categoria ? [p.categoria.nome] : []),
        ...p.tags.map((t) => t.nome),
      ],
    })),
  });
};
