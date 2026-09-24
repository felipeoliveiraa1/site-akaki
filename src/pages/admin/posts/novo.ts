export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * Criar post é um GET que já grava o rascunho e manda para o editor.
 *
 * Isso elimina uma categoria inteira de bug: não existe "formulário de
 * criação" para ser enviado duas vezes por clique duplo ou por F5. A partir
 * daqui tudo é edição de um registro que já tem id.
 */
export const GET: APIRoute = async ({ locals, redirect }) => {
  const supabase = locals.supabase;
  const perfil = locals.perfil;
  if (!supabase || !perfil) return redirect('/admin/entrar', 302);

  const sufixo = Math.random().toString(36).slice(2, 8);
  const { data, error } = await supabase
    .from('posts')
    .insert({ titulo: 'Novo post', slug: `rascunho-${sufixo}`, autor_id: perfil.id, status: 'rascunho' })
    .select('id')
    .single();

  if (error || !data) return redirect('/admin/posts?erro=criar', 302);
  return redirect(`/admin/posts/${data.id}`, 303);
};
