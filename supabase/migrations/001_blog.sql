-- ════════════════════════════════════════════════════════════════════════
--  BLOG DA AKAKI ODONTOLOGIA — estrutura completa do banco
--
--  Como aplicar: painel do Supabase → SQL Editor → cole este arquivo inteiro
--  e execute. É idempotente: rodar de novo não quebra nada.
--
--  Princípio central: quem decide o que cada pessoa pode fazer é o BANCO
--  (Row Level Security), não a interface. Mesmo que alguém chame a API por
--  fora do painel, o Postgres recusa. A interface é a última camada, não a
--  primeira.
-- ════════════════════════════════════════════════════════════════════════

create extension if not exists unaccent;

-- ─────────────────────────────────────────────────────────────
--  1. PERFIS — estende os usuários de autenticação do Supabase
-- ─────────────────────────────────────────────────────────────
create table if not exists public.perfis (
  id            uuid primary key references auth.users(id) on delete cascade,
  nome          text not null check (length(trim(nome)) between 2 and 120),
  slug          text not null unique,               -- vira /blog/autor/<slug>/
  papel         text not null default 'autor'
                  check (papel in ('admin', 'editor', 'autor')),
  ativo         boolean not null default true,
  -- Credenciais: conteúdo de saúde precisa de autor identificável (E-E-A-T).
  cargo         text,                               -- "Cirurgiã-dentista · Implantodontia"
  cro           text,                               -- "45717"
  cro_uf        text check (cro_uf is null or cro_uf ~ '^[A-Z]{2}$'),
  bio           text,
  avatar_url    text,
  avatar_alt    text,
  instagram_url text,
  criado_em     timestamptz not null default now()
);

comment on table  public.perfis is 'Autores e usuários do admin. 1:1 com auth.users.';
comment on column public.perfis.papel is 'admin = tudo + usuários | editor = publica qualquer post | autor = só os próprios, sem publicar';

-- ─────────────────────────────────────────────────────────────
--  2. FUNÇÕES AUXILIARES DE PAPEL
--
--  ⚠️ Armadilha clássica do Supabase: consultar `perfis` dentro de uma policy
--  DE `perfis` causa recursão infinita (erro 42P17). Estas funções são
--  SECURITY DEFINER — rodam com privilégio do dono e ignoram RLS, quebrando
--  o ciclo. `search_path = ''` evita sequestro de esquema.
-- ─────────────────────────────────────────────────────────────
create or replace function public.meu_papel()
returns text language sql stable security definer set search_path = '' as $$
  select papel from public.perfis where id = auth.uid() and ativo;
$$;

create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis
                  where id = auth.uid() and ativo and papel = 'admin');
$$;

create or replace function public.pode_publicar()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis
                  where id = auth.uid() and ativo and papel in ('admin', 'editor'));
$$;

-- ─────────────────────────────────────────────────────────────
--  3. CATEGORIAS E TAGS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.categorias (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null unique,
  slug          text not null unique,
  descricao     text,
  -- Liga a categoria à landing page comercial correspondente, para o post
  -- sempre ter um caminho de volta para a página que converte.
  lp_slug       text,
  ordem         int  not null default 100,
  seo_titulo    text,
  seo_descricao text,
  criado_em     timestamptz not null default now()
);

create table if not exists public.tags (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  slug      text not null unique,
  criado_em timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
--  4. POSTS
-- ─────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique
                    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
                       and slug not in ('pagina','categoria','tag','autor','busca','preview','rss','feed','sitemap')),
  titulo          text not null check (length(trim(titulo)) between 3 and 200),
  resumo          text check (resumo is null or length(resumo) <= 400),

  -- Guardamos o conteúdo em dois formatos, de propósito:
  --   conteudo_json = fonte para reabrir no editor
  --   conteudo_html = já sanitizado no servidor, pronto para a página pública
  -- Assim a página pública não roda JS nem corre risco de XSS.
  conteudo_json   jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  conteudo_html   text  not null default '',
  conteudo_texto  text  not null default '',        -- só para a busca

  -- Dimensões da capa são obrigatórias ao publicar: sem elas a imagem
  -- empurra o layout ao carregar e destrói o CLS (hoje é zero).
  capa_url        text,
  capa_alt        text,
  capa_largura    int,
  capa_altura     int,

  categoria_id    uuid references public.categorias(id) on delete restrict,
  autor_id        uuid not null references public.perfis(id) on delete restrict,
  revisado_por    uuid references public.perfis(id) on delete set null,
  revisado_em     timestamptz,

  status          text not null default 'rascunho'
                    check (status in ('rascunho', 'revisao', 'publicado')),
  destaque        boolean not null default false,

  seo_titulo      text check (seo_titulo is null or length(seo_titulo) <= 70),
  seo_descricao   text check (seo_descricao is null or length(seo_descricao) <= 200),
  lp_slug         text,                              -- LP relacionada (sobrepõe a da categoria)

  tempo_leitura   int not null default 1,
  publicado_em    timestamptz,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  versao          int not null default 1,            -- detecta edição simultânea

  -- Um post publicado precisa estar completo. Esta trava existe para que
  -- nada entre no ar sem capa, sem texto alternativo e sem data.
  constraint post_publicado_completo check (
    status <> 'publicado' or (
      publicado_em is not null
      and categoria_id is not null
      and capa_url    is not null
      and capa_alt    is not null and length(trim(capa_alt)) > 0
      and capa_largura is not null and capa_altura is not null
      and length(trim(conteudo_html)) > 0
    )
  )
);

create table if not exists public.post_tags (
  post_id uuid not null references public.posts(id) on delete cascade,
  tag_id  uuid not null references public.tags(id)  on delete cascade,
  primary key (post_id, tag_id)
);

-- Só um post em destaque por vez.
create unique index if not exists posts_um_destaque
  on public.posts ((true)) where destaque;

create index if not exists posts_listagem
  on public.posts (status, publicado_em desc);
create index if not exists posts_por_categoria
  on public.posts (categoria_id, publicado_em desc);
create index if not exists posts_por_autor
  on public.posts (autor_id, publicado_em desc);

-- ─────────────────────────────────────────────────────────────
--  5. BUSCA EM PORTUGUÊS
--  Dicionário 'portuguese' trata radicais ("implantes" acha "implante");
--  unaccent faz "sedacao" achar "sedação".
-- ─────────────────────────────────────────────────────────────
create or replace function public.sem_acento(t text)
returns text language sql immutable set search_path = '' as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''));
$$;

alter table public.posts
  add column if not exists busca tsvector
  generated always as (
    setweight(to_tsvector('portuguese', public.sem_acento(coalesce(titulo, ''))), 'A') ||
    setweight(to_tsvector('portuguese', public.sem_acento(coalesce(resumo, ''))), 'B') ||
    setweight(to_tsvector('portuguese', public.sem_acento(coalesce(conteudo_texto, ''))), 'C')
  ) stored;

create index if not exists posts_busca_idx on public.posts using gin (busca);

-- ─────────────────────────────────────────────────────────────
--  6. GATILHOS — regras que a interface não pode driblar
-- ─────────────────────────────────────────────────────────────

-- Cria o perfil junto com o usuário. O PRIMEIRO usuário vira admin
-- automaticamente (não existe tela de cadastro público).
create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_nome text := coalesce(nullif(trim(new.raw_user_meta_data->>'nome'), ''), split_part(new.email, '@', 1));
  v_base text := regexp_replace(lower(public.sem_acento(v_nome)), '[^a-z0-9]+', '-', 'g');
  v_slug text;
  i int := 0;
begin
  v_base := trim(both '-' from v_base);
  if v_base = '' then v_base := 'autor'; end if;
  v_slug := v_base;
  while exists (select 1 from public.perfis where slug = v_slug) loop
    i := i + 1; v_slug := v_base || '-' || i;
  end loop;

  insert into public.perfis (id, nome, slug, papel)
  values (new.id, v_nome, v_slug,
          case when (select count(*) from public.perfis) = 0 then 'admin' else 'autor' end);
  return new;
end $$;

drop trigger if exists trg_ao_criar_usuario on auth.users;
create trigger trg_ao_criar_usuario
  after insert on auth.users
  for each row execute function public.ao_criar_usuario();

-- Impede que alguém altere o próprio papel (escalada de privilégio) e que o
-- último admin do sistema seja removido ou rebaixado (ficaria sem dono).
create or replace function public.protege_papel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.papel is distinct from old.papel or new.ativo is distinct from old.ativo then
    if not public.eh_admin() then
      raise exception 'Apenas um administrador pode alterar papel ou status de acesso.'
        using errcode = '42501';
    end if;
    if old.id = auth.uid() then
      raise exception 'Você não pode alterar o próprio papel ou desativar a si mesmo.'
        using errcode = '42501';
    end if;
    if old.papel = 'admin' and (new.papel <> 'admin' or not new.ativo)
       and (select count(*) from public.perfis where papel = 'admin' and ativo) <= 1 then
      raise exception 'Este é o último administrador ativo. Promova outra pessoa antes.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_protege_papel on public.perfis;
create trigger trg_protege_papel
  before update on public.perfis
  for each row execute function public.protege_papel();

-- Só editor/admin publicam ou despublicam. Preenche a data e o revisor.
create or replace function public.controla_publicacao()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.atualizado_em := now();

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    if (new.status = 'publicado' or old.status = 'publicado')
       and not public.pode_publicar() then
      raise exception 'Seu acesso permite criar e editar, mas não publicar. Envie para revisão.'
        using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' and new.status = 'publicado' and not public.pode_publicar() then
    raise exception 'Seu acesso não permite publicar.' using errcode = '42501';
  end if;

  if new.status = 'publicado' then
    if new.publicado_em is null then new.publicado_em := now(); end if;
    if new.revisado_por is null then
      new.revisado_por := auth.uid();
      new.revisado_em  := now();
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.conteudo_json is distinct from old.conteudo_json) then
    new.versao := old.versao + 1;
  end if;

  return new;
end $$;

drop trigger if exists trg_controla_publicacao on public.posts;
create trigger trg_controla_publicacao
  before insert or update on public.posts
  for each row execute function public.controla_publicacao();

-- ─────────────────────────────────────────────────────────────
--  7. ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────
alter table public.perfis     enable row level security;
alter table public.categorias enable row level security;
alter table public.tags       enable row level security;
alter table public.posts      enable row level security;
alter table public.post_tags  enable row level security;

-- PERFIS ------------------------------------------------------
drop policy if exists perfis_leitura on public.perfis;
create policy perfis_leitura on public.perfis
  for select using (true);   -- bio de autor é conteúdo público do blog

drop policy if exists perfis_edita_proprio on public.perfis;
create policy perfis_edita_proprio on public.perfis
  for update to authenticated
  using (id = auth.uid() or public.eh_admin())
  with check (id = auth.uid() or public.eh_admin());
  -- (mudança de papel ainda passa pelo gatilho acima)

drop policy if exists perfis_admin_insere on public.perfis;
create policy perfis_admin_insere on public.perfis
  for insert to authenticated with check (public.eh_admin());

drop policy if exists perfis_admin_remove on public.perfis;
create policy perfis_admin_remove on public.perfis
  for delete to authenticated using (public.eh_admin());

-- CATEGORIAS E TAGS ------------------------------------------
drop policy if exists categorias_leitura on public.categorias;
create policy categorias_leitura on public.categorias for select using (true);

drop policy if exists categorias_escrita on public.categorias;
create policy categorias_escrita on public.categorias
  for all to authenticated
  using (public.pode_publicar()) with check (public.pode_publicar());

drop policy if exists tags_leitura on public.tags;
create policy tags_leitura on public.tags for select using (true);

drop policy if exists tags_escrita on public.tags;
create policy tags_escrita on public.tags
  for all to authenticated
  using (public.pode_publicar()) with check (public.pode_publicar());

-- POSTS -------------------------------------------------------
-- O público enxerga APENAS o que já está publicado e cuja data já chegou.
-- Isso também faz o agendamento funcionar sem nenhum código extra.
drop policy if exists posts_leitura_publica on public.posts;
create policy posts_leitura_publica on public.posts
  for select using (status = 'publicado' and publicado_em <= now());

drop policy if exists posts_leitura_interna on public.posts;
create policy posts_leitura_interna on public.posts
  for select to authenticated
  using (autor_id = auth.uid() or public.pode_publicar());

drop policy if exists posts_cria on public.posts;
create policy posts_cria on public.posts
  for insert to authenticated
  with check (autor_id = auth.uid() or public.pode_publicar());

drop policy if exists posts_edita on public.posts;
create policy posts_edita on public.posts
  for update to authenticated
  using (autor_id = auth.uid() or public.pode_publicar())
  with check (autor_id = auth.uid() or public.pode_publicar());

drop policy if exists posts_remove on public.posts;
create policy posts_remove on public.posts
  for delete to authenticated
  using (public.pode_publicar()
         or (autor_id = auth.uid() and status <> 'publicado'));

-- POST_TAGS ---------------------------------------------------
drop policy if exists post_tags_leitura on public.post_tags;
create policy post_tags_leitura on public.post_tags for select using (true);

drop policy if exists post_tags_escrita on public.post_tags;
create policy post_tags_escrita on public.post_tags
  for all to authenticated
  using (exists (select 1 from public.posts p where p.id = post_id
                  and (p.autor_id = auth.uid() or public.pode_publicar())))
  with check (exists (select 1 from public.posts p where p.id = post_id
                  and (p.autor_id = auth.uid() or public.pode_publicar())));

-- O conteúdo HTML é gerado e sanitizado no servidor. Tirar o privilégio de
-- escrita destas colunas torna impossível injetar HTML pela API.
revoke update (conteudo_html, conteudo_texto) on public.posts from authenticated;

-- ─────────────────────────────────────────────────────────────
--  8. ARMAZENAMENTO DE IMAGENS
-- ─────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog', 'blog', true, 3145728,
        array['image/webp','image/jpeg','image/png','image/avif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists blog_img_leitura on storage.objects;
create policy blog_img_leitura on storage.objects
  for select using (bucket_id = 'blog');

drop policy if exists blog_img_envio on storage.objects;
create policy blog_img_envio on storage.objects
  for insert to authenticated with check (bucket_id = 'blog');

drop policy if exists blog_img_remove on storage.objects;
create policy blog_img_remove on storage.objects
  for delete to authenticated
  using (bucket_id = 'blog' and (owner = auth.uid() or public.pode_publicar()));

-- ─────────────────────────────────────────────────────────────
--  9. DADOS INICIAIS
-- ─────────────────────────────────────────────────────────────
insert into public.categorias (nome, slug, descricao, lp_slug, ordem) values
  ('Odontofobia',          'odontofobia',     'Medo de dentista: por que acontece e como tratar.',                 null,                                 5),
  ('Sedação Odontológica', 'sedacao',         'Tratamento dormindo, com segurança e acompanhamento.',              'dentista-com-sedacao-odontologica', 10),
  ('Implantes',            'implantes',       'Implante dentário, cirurgia guiada e carga imediata.',              'implante-dentario',                 20),
  ('Ortodontia',           'ortodontia',      'Aparelhos, alinhadores invisíveis e correção da mordida.',          'ortodontia',                        30),
  ('Estética',             'estetica',        'Lentes de contato dental, clareamento e harmonização.',             'estetica-3',                        40),
  ('Odontopediatria',      'odontopediatria', 'Saúde bucal de crianças e adolescentes, sem trauma.',               'odontopediatria',                   50)
on conflict (slug) do nothing;

insert into public.tags (nome, slug) values
  ('Sedação consciente', 'sedacao-consciente'), ('Cirurgia guiada', 'cirurgia-guiada'),
  ('Carga imediata', 'carga-imediata'),         ('Day Clinic', 'day-clinic'),
  ('Lentes de contato', 'lentes-de-contato'),   ('Clareamento', 'clareamento'),
  ('Alinhadores', 'alinhadores'),               ('Aparelho fixo', 'aparelho-fixo'),
  ('Medo de dentista', 'medo-de-dentista'),     ('Primeira consulta', 'primeira-consulta'),
  ('Pós-operatório', 'pos-operatorio'),         ('Crianças', 'criancas')
on conflict (slug) do nothing;

-- ════════════════════════════════════════════════════════════════════════
--  PRÓXIMO PASSO (manual, no painel do Supabase):
--
--  1. Authentication → Providers → Email → DESATIVE "Allow new users to
--     sign up". Sem isso, qualquer pessoa cria conta no admin.
--  2. Authentication → Users → "Add user" com o e-mail de quem vai
--     administrar. Esse primeiro usuário vira admin automaticamente.
--  3. Confira:  select nome, papel from public.perfis;
-- ════════════════════════════════════════════════════════════════════════
