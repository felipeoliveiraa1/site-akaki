import { SITE } from './formato';

/**
 * Limpa o cache de borda das páginas do blog logo após uma mudança.
 *
 * Por que existe: as páginas do blog são servidas por ISR, ou seja, ficam
 * guardadas na borda da Vercel e só se renovam quando a validade expira. Sem
 * isto, um artigo publicado só aparecia na listagem quando aquele cache
 * vencia — o Alan publicou e `/blog/` continuou servindo uma cópia de 18 horas
 * antes, sem o artigo. Para quem escreve, isso se parece com "o post sumiu".
 *
 * Como funciona: uma requisição com o cabeçalho `x-prerender-revalidate` e o
 * token do projeto faz a Vercel regerar aquela URL na hora. É o mecanismo
 * oficial; o token vem de `VERCEL_ISR_BYPASS_TOKEN`, o mesmo declarado no
 * adapter em astro.config.mjs.
 *
 * Nunca lança: falhar em limpar cache não pode derrubar o salvamento de um
 * texto. No pior caso o artigo aparece quando a validade vencer sozinha.
 */

function token(): string | undefined {
  return (typeof process !== 'undefined' ? process.env?.VERCEL_ISR_BYPASS_TOKEN : undefined)
    || (import.meta.env as any).VERCEL_ISR_BYPASS_TOKEN;
}

/**
 * Caminhos afetados ao publicar, editar ou apagar um artigo.
 *
 * Aceita os valores antigos e os novos: trocar o slug ou a categoria deixa a
 * página anterior em cache mostrando um artigo que não está mais ali.
 */
export function caminhosDoPost(p: {
  slug?: string | null;
  slugAnterior?: string | null;
  categoriaSlug?: string | null;
  categoriaAnterior?: string | null;
  autorSlug?: string | null;
}): string[] {
  const lista = ['/blog/', '/blog/rss.xml', '/sitemap-blog.xml'];
  for (const s of [p.slug, p.slugAnterior]) if (s) lista.push(`/blog/${s}/`);
  for (const c of [p.categoriaSlug, p.categoriaAnterior]) if (c) lista.push(`/blog/categoria/${c}/`);
  if (p.autorSlug) lista.push(`/blog/autor/${p.autorSlug}/`);
  return lista;
}

export async function revalidar(caminhos: string[]): Promise<void> {
  const t = token();
  if (!t) return; // em desenvolvimento não há cache de borda para limpar

  const unicos = [...new Set(caminhos)];
  await Promise.allSettled(
    unicos.map(async (caminho) => {
      try {
        await fetch(new URL(caminho, SITE).href, {
          method: 'HEAD',
          headers: { 'x-prerender-revalidate': t },
        });
      } catch (e) {
        console.error('[blog] falha ao limpar o cache de', caminho, e);
      }
    }),
  );
}
