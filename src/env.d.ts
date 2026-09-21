/// <reference types="astro/client" />

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Perfil } from './lib/supabase';

declare global {
  namespace App {
    interface Locals {
      /** Cliente ligado à sessão de quem está logado (preenchido pelo middleware). */
      supabase?: SupabaseClient;
      /** Perfil de quem está logado, já validado e ativo. */
      perfil?: Perfil;
      usuarioId?: string;
    }
  }
}

interface ImportMetaEnv {
  readonly SUPABASE_URL: string;
  readonly SUPABASE_ANON_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly REVALIDATE_SECRET: string;
  readonly VERCEL_ISR_BYPASS_TOKEN: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }

export {};
