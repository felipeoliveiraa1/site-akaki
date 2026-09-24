import { defineMiddleware } from 'astro:middleware';
import { clienteDeSessao, supabaseConfigurado, type Perfil } from './lib/supabase';

/**
 * Guarda de acesso do admin.
 *
 * Detalhe que importa: usamos `getUser()`, nunca `getSession()`. O getSession
 * apenas lê o cookie e acredita nele — e cookie pode ser forjado. O getUser
 * valida a assinatura do token no servidor de autenticação. Confundir os dois
 * é uma falha de autenticação real, não um detalhe de estilo.
 */
export const onRequest = defineMiddleware(async (contexto, proxima) => {
  const { url, cookies, locals, request, redirect } = contexto;
  const caminho = url.pathname;

  const ehAdmin = caminho === '/admin' || caminho.startsWith('/admin/');
  const ehApiAdmin = caminho.startsWith('/api/admin');
  if (!ehAdmin && !ehApiAdmin) return proxima();

  /**
   * Nenhuma resposta sob /admin pode ser indexada ou guardada em cache
   * compartilhado — nem as de sucesso, nem os redirecionamentos de quem não
   * está logado, nem a tela de login. Antes só o caminho autenticado recebia
   * estes cabeçalhos, e o redirect do admin saía com `Cache-Control: public`,
   * passível de ficar retido numa CDN.
   */
  const selar = (r: Response) => {
    r.headers.set('X-Robots-Tag', 'noindex, nofollow');
    r.headers.set('Cache-Control', 'private, no-store');
    return r;
  };

  // Sem credenciais configuradas, a tela de login ainda é exibida — mas com
  // um aviso explicando o que falta. É a tela que a pessoa encarregada da
  // configuração vai abrir primeiro; um texto de erro cru não diz o que fazer.
  if (!supabaseConfigurado) {
    if (caminho === '/admin/entrar') return selar(await proxima());
    if (ehApiAdmin) {
      return selar(new Response(JSON.stringify({ erro: 'Blog ainda não configurado.' }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return selar(redirect('/admin/entrar?motivo=sem-configuracao', 302));
  }

  const supabase = clienteDeSessao(cookies, request)!;

  // Banco fora do ar não pode virar erro 500 sem explicação: quem está
  // escrevendo precisa entender o que houve para não achar que perdeu o texto.
  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    const msg = 'Não foi possível falar com o banco de dados. Tente novamente em instantes.';
    if (ehApiAdmin) {
      return selar(new Response(JSON.stringify({ erro: msg }), {
        status: 503, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return selar(new Response(msg, { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  }

  const telaDeLogin = caminho === '/admin/entrar' || caminho === '/admin/sair';

  if (!user) {
    if (telaDeLogin) { (locals as any).supabase = supabase; return selar(await proxima()); }
    if (ehApiAdmin) {
      // JSON, não HTML: um endpoint que devolve a página de login faz o
      // salvamento automático falhar em silêncio, engolindo um documento HTML.
      return selar(new Response(JSON.stringify({ erro: 'Sessão expirada.' }), {
        status: 401, headers: { 'Content-Type': 'application/json' },
      }));
    }
    const destino = encodeURIComponent(caminho + url.search);
    return selar(redirect(`/admin/entrar?proximo=${destino}`, 302));
  }

  const { data: perfil } = await supabase
    .from('perfis')
    .select('id, nome, slug, papel, ativo, cargo, cro, cro_uf, bio, avatar_url, avatar_alt, instagram_url')
    .eq('id', user.id)
    .maybeSingle();

  // Acesso revogado derruba mesmo com token ainda válido.
  if (!perfil || !(perfil as Perfil).ativo) {
    await supabase.auth.signOut();
    if (ehApiAdmin) {
      return selar(new Response(JSON.stringify({ erro: 'Acesso desativado.' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      }));
    }
    return selar(redirect('/admin/entrar?motivo=inativo', 302));
  }

  if (telaDeLogin && caminho === '/admin/entrar') return selar(redirect('/admin/posts', 302));

  (locals as any).supabase = supabase;
  (locals as any).perfil = perfil as Perfil;
  (locals as any).usuarioId = user.id;

  return selar(await proxima());
});
