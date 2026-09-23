export const prerender = false;

import type { APIRoute } from 'astro';
import { clienteDeSessao } from '../../lib/supabase';

/**
 * Sair só por POST. Um link GET de logout é disparado sozinho por
 * pré-carregamento do navegador, extensão ou antivírus corporativo — e a
 * pessoa é deslogada "do nada" no meio do trabalho.
 *
 * Usa signOut() em vez de apagar cookie na mão: quando o token passa de 4 KB
 * o Supabase o divide em vários cookies, e apagar só um deixa a sessão pela
 * metade.
 */
export const POST: APIRoute = async ({ cookies, request, redirect }) => {
  const supabase = clienteDeSessao(cookies, request);
  if (supabase) await supabase.auth.signOut();
  return redirect('/admin/entrar', 302);
};

export const GET: APIRoute = ({ redirect }) => redirect('/admin/posts', 302);
