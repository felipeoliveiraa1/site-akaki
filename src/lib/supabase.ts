import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

const URL = import.meta.env.SUPABASE_URL as string | undefined;
const ANON = import.meta.env.SUPABASE_ANON_KEY as string | undefined;
const SECRETA = import.meta.env.SUPABASE_SERVICE_ROLE_KEY as string | undefined;

/**
 * O blog só funciona com as credenciais configuradas, mas o site institucional
 * não pode depender delas: sem isso, um `.env` ausente derrubaria o build das
 * 7 páginas que já estão no ar. Por isso tudo aqui degrada em vez de explodir.
 */
export const supabaseConfigurado = Boolean(URL && ANON);

/** Cliente público (só enxerga post publicado — quem garante isso é o RLS). */
export function clientePublico(): SupabaseClient | null {
  if (!supabaseConfigurado) return null;
  return createClient(URL!, ANON!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Cliente ligado à sessão do usuário logado, com os cookies da requisição.
 * Usa a chave pública: as permissões continuam sendo impostas pelo banco.
 *
 * A LEITURA vem do cabeçalho da requisição, não de `cookies.getAll()`:
 * o AstroCookies não tem esse método (só get/has/set/delete/merge/headers),
 * e chamá-lo lançava um erro que virava "banco indisponível" na tela.
 * A ESCRITA continua pelo AstroCookies, que é quem sabe anexar os cookies
 * à resposta.
 */
export function clienteDeSessao(cookies: AstroCookies, request?: Request): SupabaseClient | null {
  if (!supabaseConfigurado) return null;
  return createServerClient(URL!, ANON!, {
    cookies: {
      getAll: () => {
        const cabecalho = request?.headers.get('Cookie') ?? '';
        return parseCookieHeader(cabecalho)
          .filter((c): c is { name: string; value: string } => typeof c.value === 'string');
      },
      setAll: (lista) => {
        for (const { name, value, options } of lista) {
          cookies.set(name, value, {
            ...options,
            path: '/',
            httpOnly: true,
            secure: import.meta.env.PROD,
            sameSite: 'lax',
          });
        }
      },
    },
  });
}

/**
 * ⚠️ Cliente administrativo: IGNORA todas as regras de segurança do banco.
 *
 * Só pode ser usado em código de servidor, em operações que já verificaram
 * quem é o usuário. Nunca importar em componente que roda no navegador —
 * vazar esta chave dá acesso total ao banco para qualquer visitante.
 */
export function clienteAdministrativo(): SupabaseClient | null {
  if (!URL || !SECRETA) return null;
  return createClient(URL, SECRETA, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Papel = 'admin' | 'editor' | 'autor';

export type Perfil = {
  id: string;
  nome: string;
  slug: string;
  papel: Papel;
  ativo: boolean;
  cargo: string | null;
  cro: string | null;
  cro_uf: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_alt: string | null;
  instagram_url: string | null;
};

/** Pode publicar / despublicar e mexer em post de terceiros. */
export const podePublicar = (p?: Papel | null) => p === 'admin' || p === 'editor';
/** Pode gerenciar usuários e papéis. */
export const ehAdmin = (p?: Papel | null) => p === 'admin';
