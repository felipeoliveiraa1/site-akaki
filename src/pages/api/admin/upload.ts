export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * Recebe a imagem já reduzida pelo navegador e guarda no armazenamento.
 *
 * Usa o cliente da sessão de quem está logado (não a chave administrativa):
 * assim quem autoriza o envio é o próprio banco, pelas mesmas regras que
 * valem para todo o resto.
 */

const TIPOS = ['image/webp', 'image/jpeg', 'image/png', 'image/avif'];
const TAMANHO_MAX = 3 * 1024 * 1024; // 3 MB — o navegador já reduz antes

const erro = (msg: string, status = 400) =>
  new Response(JSON.stringify({ erro: msg }), {
    status, headers: { 'Content-Type': 'application/json' },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  const supabase = locals.supabase;
  const perfil = locals.perfil;
  if (!supabase || !perfil) return erro('Sessão expirada. Entre novamente.', 401);

  let dados: FormData;
  try {
    dados = await request.formData();
  } catch {
    return erro('Não foi possível ler o arquivo enviado.');
  }

  const arquivo = dados.get('arquivo');
  const pasta = String(dados.get('pasta') ?? 'geral').replace(/[^a-zA-Z0-9-]/g, '');
  const largura = Number(dados.get('largura') ?? 0);
  const altura = Number(dados.get('altura') ?? 0);

  if (!(arquivo instanceof File)) return erro('Nenhum arquivo recebido.');
  if (!TIPOS.includes(arquivo.type)) {
    return erro('Formato não aceito. Envie JPG, PNG ou WebP.', 415);
  }
  if (arquivo.size > TAMANHO_MAX) {
    return erro('A imagem ficou grande demais mesmo depois de reduzida. Tente outra.', 413);
  }
  if (!largura || !altura) {
    // Sem as medidas a página "pula" quando a foto carrega — e é justamente
    // isso que mantém a nota de desempenho do site.
    return erro('Não conseguimos ler as dimensões da imagem.');
  }

  const extensao = arquivo.type === 'image/png' ? 'png'
    : arquivo.type === 'image/avif' ? 'avif'
    : arquivo.type === 'image/jpeg' ? 'jpg' : 'webp';
  const caminho = `posts/${pasta}/${crypto.randomUUID()}.${extensao}`;

  const { error } = await supabase.storage
    .from('blog')
    .upload(caminho, arquivo, {
      contentType: arquivo.type,
      cacheControl: '31536000', // nome único por envio, então pode cachear por 1 ano
      upsert: false,
    });

  if (error) {
    return erro(`Falha ao guardar a imagem: ${error.message}`, 500);
  }

  const { data } = supabase.storage.from('blog').getPublicUrl(caminho);

  return new Response(JSON.stringify({
    url: data.publicUrl, largura, altura, caminho,
  }), { headers: { 'Content-Type': 'application/json' } });
};
