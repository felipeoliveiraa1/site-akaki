import { clientePublico, type Perfil } from '../supabase';

export const POSTS_POR_PAGINA = 9;

export type Categoria = {
  id: string; nome: string; slug: string;
  descricao: string | null; lp_slug: string | null;
};

export type Tag = { id: string; nome: string; slug: string };

export type Post = {
  id: string;
  slug: string;
  titulo: string;
  resumo: string | null;
  conteudo_html: string;
  capa_url: string | null;
  capa_alt: string | null;
  capa_largura: number | null;
  capa_altura: number | null;
  seo_titulo: string | null;
  seo_descricao: string | null;
  lp_slug: string | null;
  destaque: boolean;
  tempo_leitura: number;
  publicado_em: string;
  atualizado_em: string;
  categoria: Categoria | null;
  autor: Perfil | null;
  revisor: Pick<Perfil, 'nome' | 'slug' | 'cro' | 'cro_uf'> | null;
  tags: Tag[];
};

// Uma única projeção reutilizada em todas as consultas: garante que toda
// listagem traga exatamente os campos que os cartões e o SEO precisam.
const CAMPOS = `
  id, slug, titulo, resumo, conteudo_html, capa_url, capa_alt,
  capa_largura, capa_altura, seo_titulo, seo_descricao, lp_slug,
  destaque, tempo_leitura, publicado_em, atualizado_em,
  categoria:categorias(id, nome, slug, descricao, lp_slug),
  autor:perfis!posts_autor_id_fkey(id, nome, slug, papel, ativo, cargo, cro, cro_uf, bio, avatar_url, avatar_alt, instagram_url),
  revisor:perfis!posts_revisado_por_fkey(nome, slug, cro, cro_uf),
  post_tags(tags(id, nome, slug))
`;

type LinhaCrua = Record<string, any>;

function normalizar(linha: LinhaCrua): Post {
  // O PostgREST devolve relações como array ou objeto conforme a cardinalidade;
  // normalizamos aqui para o resto do código não precisar saber disso.
  const um = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  return {
    ...(linha as any),
    categoria: um<Categoria>(linha.categoria),
    autor: um<Perfil>(linha.autor),
    revisor: um<any>(linha.revisor),
    tags: (linha.post_tags ?? [])
      .map((pt: any) => um<Tag>(pt.tags))
      .filter(Boolean) as Tag[],
  };
}

/** Consulta base: só o que está publicado e cuja data já chegou. */
function base() {
  const sb = clientePublico();
  if (!sb) return null;
  return sb
    .from('posts')
    .select(CAMPOS)
    .eq('status', 'publicado')
    .lte('publicado_em', new Date().toISOString());
}

export type Pagina = { posts: Post[]; total: number; paginas: number };

async function paginar(
  construir: (q: any) => any,
  pagina: number,
): Promise<Pagina> {
  const sb = clientePublico();
  if (!sb) return { posts: [], total: 0, paginas: 0 };

  const de = (pagina - 1) * POSTS_POR_PAGINA;
  let q = sb
    .from('posts')
    .select(CAMPOS, { count: 'exact' })
    .eq('status', 'publicado')
    .lte('publicado_em', new Date().toISOString());
  q = construir(q);

  const { data, count, error } = await q
    .order('publicado_em', { ascending: false })
    .range(de, de + POSTS_POR_PAGINA - 1);

  if (error) {
    console.error('[blog] falha ao listar posts:', error.message);
    return { posts: [], total: 0, paginas: 0 };
  }
  const total = count ?? 0;
  return {
    posts: (data ?? []).map(normalizar),
    total,
    paginas: Math.max(1, Math.ceil(total / POSTS_POR_PAGINA)),
  };
}

export const listarPosts = (pagina = 1) => paginar((q) => q, pagina);

export const listarPorCategoria = (slug: string, pagina = 1) =>
  paginar((q) => q.eq('categorias.slug', slug).not('categoria_id', 'is', null), pagina);

export const listarPorAutor = (slug: string, pagina = 1) =>
  paginar((q) => q.eq('perfis.slug', slug), pagina);

export async function buscarPost(slug: string): Promise<Post | null> {
  const q = base();
  if (!q) return null;
  const { data, error } = await q.eq('slug', slug).maybeSingle();
  if (error) {
    console.error('[blog] falha ao buscar post:', error.message);
    return null;
  }
  return data ? normalizar(data) : null;
}

export async function postEmDestaque(): Promise<Post | null> {
  const q = base();
  if (!q) return null;
  const { data } = await q.eq('destaque', true).limit(1).maybeSingle();
  return data ? normalizar(data) : null;
}

/** Relacionados: mesma categoria primeiro; completa com os mais recentes. */
export async function postsRelacionados(post: Post, quantos = 3): Promise<Post[]> {
  const q = base();
  if (!q) return [];
  const escolhidos: Post[] = [];

  if (post.categoria) {
    const { data } = await q
      .eq('categoria_id', (post.categoria as any).id)
      .neq('id', post.id)
      .order('publicado_em', { ascending: false })
      .limit(quantos);
    escolhidos.push(...(data ?? []).map(normalizar));
  }

  if (escolhidos.length < quantos) {
    const q2 = base();
    if (q2) {
      const ids = [post.id, ...escolhidos.map((p) => p.id)];
      const { data } = await q2
        .not('id', 'in', `(${ids.join(',')})`)
        .order('publicado_em', { ascending: false })
        .limit(quantos - escolhidos.length);
      escolhidos.push(...(data ?? []).map(normalizar));
    }
  }
  return escolhidos.slice(0, quantos);
}

export async function buscar(termo: string, pagina = 1): Promise<Pagina> {
  const limpo = termo.trim().slice(0, 80);
  if (limpo.length < 2) return { posts: [], total: 0, paginas: 0 };
  // websearch_to_tsquery entende aspas e "-palavra" como um buscador comum.
  return paginar((q) => q.textSearch('busca', limpo, {
    type: 'websearch', config: 'portuguese',
  }), pagina);
}

export async function listarCategorias(): Promise<Categoria[]> {
  const sb = clientePublico();
  if (!sb) return [];
  const { data } = await sb
    .from('categorias')
    .select('id, nome, slug, descricao, lp_slug')
    .order('ordem');
  return data ?? [];
}

export async function buscarCategoria(slug: string): Promise<Categoria | null> {
  const sb = clientePublico();
  if (!sb) return null;
  const { data } = await sb
    .from('categorias')
    .select('id, nome, slug, descricao, lp_slug')
    .eq('slug', slug)
    .maybeSingle();
  return data ?? null;
}

export async function buscarAutor(slug: string): Promise<Perfil | null> {
  const sb = clientePublico();
  if (!sb) return null;
  const { data } = await sb
    .from('perfis')
    .select('id, nome, slug, papel, ativo, cargo, cro, cro_uf, bio, avatar_url, avatar_alt, instagram_url')
    .eq('slug', slug)
    .maybeSingle();
  return data ?? null;
}

/** Entradas do sitemap: só URLs canônicas e indexáveis. */
export async function entradasSitemap() {
  const sb = clientePublico();
  if (!sb) return { posts: [], categorias: [], autores: [] };
  const [posts, categorias, autores] = await Promise.all([
    sb.from('posts').select('slug, publicado_em, atualizado_em')
      .eq('status', 'publicado').lte('publicado_em', new Date().toISOString())
      .order('publicado_em', { ascending: false }),
    sb.from('categorias').select('slug').order('ordem'),
    sb.from('perfis').select('slug').eq('ativo', true).not('bio', 'is', null),
  ]);
  return {
    posts: posts.data ?? [],
    categorias: categorias.data ?? [],
    autores: autores.data ?? [],
  };
}
