# Blog da Akaki — como colocar no ar

O código está pronto. Faltam três coisas que dependem de acesso ao Supabase e à
Vercel. Leva uns 20 minutos.

---

## 1. Criar o banco de dados

1. Acesse **supabase.com** → **New project**
   - Nome: `Akaki Blog`
   - Região: **South America (São Paulo)** — menor latência para o público brasileiro
   - Guarde a senha do banco que ele gerar

2. Com o projeto criado, vá em **SQL Editor** → **New query**, cole o conteúdo
   inteiro de `supabase/migrations/001_blog.sql` e execute.
   Isso cria as tabelas, as regras de permissão, a busca em português e já
   deixa as categorias e tags iniciais prontas.

3. **Authentication → Providers → Email**: desative **"Allow new users to sign up"**.
   ⚠️ Sem isso, qualquer pessoa da internet cria conta no painel.

4. **Authentication → Users → Add user**: crie o usuário de quem vai administrar
   o blog (e-mail + senha). **O primeiro usuário vira administrador automaticamente.**

5. Confira no SQL Editor:
   ```sql
   select nome, papel from public.perfis;
   ```
   Deve aparecer uma linha com `papel = admin`.

---

## 2. Conectar o site ao banco

Em **Project Settings → API** do Supabase, copie os três valores e preencha:

**Local** — crie o arquivo `.env` (use `.env.example` como modelo):

```
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
VERCEL_ISR_BYPASS_TOKEN=<gere com: openssl rand -hex 16>
```

**Produção** — as mesmas quatro variáveis em
**Vercel → Settings → Environment Variables** (Production e Preview).

> A chave `SERVICE_ROLE` ignora todas as regras de segurança do banco.
> Ela nunca vai para o navegador e nunca pode ser commitada. O `.gitignore`
> já bloqueia o `.env`.

---

## 3. Publicar

```bash
git checkout feat/blog
git push origin feat/blog
```

A Vercel gera uma **URL de preview**. Antes de promover para produção, confira:

- [ ] As 7 páginas institucionais renderizam idênticas
- [ ] PageSpeed mobile da home continua ≥ 90
- [ ] Os redirects antigos funcionam (`/implantes` → `/implante-dentario/`)
- [ ] `/blog` abre e `/admin/entrar` pede login
- [ ] Um lead enviado pelo site ainda chega na planilha

Se algo regredir, **não promova** — a Vercel mantém o deploy anterior
promovível com um clique.

---

## Depois que estiver no ar

- **Search Console**: envie `https://www.akaki.odo.br/sitemap-blog.xml` como
  segundo sitemap (o `sitemap-index.xml` continua valendo para as páginas fixas).
- **Autores**: cada profissional entra em `/admin/perfil` e preenche cargo, CRO
  e mini biografia. Em conteúdo de saúde o Google dá peso a quem assina — sem
  bio, a página do autor nem é indexada.

---

## Como funciona, em resumo

| | |
|---|---|
| **Páginas institucionais** | Continuam 100% estáticas. Nada mudou nelas. |
| **Páginas do blog** | Geradas sob demanda e guardadas na borda da rede: rápidas como estáticas, mas atualizam sozinhas. |
| **Painel** | Nunca é cacheado nem indexado. |
| **Quem pode o quê** | Imposto pelo banco de dados, não pela tela. Esconder um botão não é segurança — aqui o Postgres recusa a operação. |

### Os três níveis de acesso

- **Administrador** — tudo, inclusive criar e remover usuários
- **Editor** — cria, edita e **publica** qualquer post; gerencia categorias e tags
- **Autor** — cria e edita **apenas os próprios** posts e envia para revisão; **não publica**

---

## O que ficou de fora, de propósito

- **Comentários** — carga de moderação e spam desproporcional para uma clínica;
  conteúdo de saúde atrai pedido de diagnóstico nos comentários.
- **Upload de imagem por arrastar** — hoje a imagem entra por endereço (URL).
  O armazenamento já está criado e com as permissões prontas; a tela de envio
  com barra de progresso é o próximo passo natural.
- **Salvamento automático** — o editor salva ao clicar em Salvar (e com Ctrl+S).
  O rascunho automático a cada poucos segundos é a melhoria seguinte mais valiosa.
