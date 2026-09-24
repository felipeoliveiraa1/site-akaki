/**
 * Prepara e envia uma imagem escolhida no computador da pessoa.
 *
 * O trabalho pesado acontece aqui, no navegador, antes de enviar: uma foto de
 * celular tem 4-8 MB e 4000px de largura. Subir isso como está deixaria o blog
 * lento para o visitante — que é exatamente o que passamos o projeto inteiro
 * evitando.
 */

export type Enviada = { url: string; largura: number; altura: number };

const LARGURA_MAX = 1600;   // suficiente para tela grande, leve para celular
const QUALIDADE = 0.82;

export class ErroImagem extends Error {}

export async function prepararEEnviar(
  arquivo: File,
  pasta: string,
  aoProgredir?: (pct: number) => void,
): Promise<Enviada> {
  if (!arquivo.type.startsWith('image/')) {
    throw new ErroImagem('Esse arquivo não é uma imagem.');
  }
  if (arquivo.size > 25 * 1024 * 1024) {
    throw new ErroImagem('Imagem muito grande (acima de 25 MB).');
  }

  aoProgredir?.(5);

  // `imageOrientation: 'from-image'` respeita a orientação gravada pela câmera.
  // Sem isso, foto de iPhone em retrato sobe deitada — e ninguém entende porquê.
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  } catch {
    throw new ErroImagem(
      'Não conseguimos abrir esta imagem. Se for foto de iPhone (.HEIC), exporte como JPG antes.',
    );
  }

  aoProgredir?.(25);

  const escala = Math.min(1, LARGURA_MAX / bitmap.width);
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const tela = document.createElement('canvas');
  tela.width = largura;
  tela.height = altura;
  const ctx = tela.getContext('2d');
  if (!ctx) throw new ErroImagem('Seu navegador não conseguiu processar a imagem.');
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();

  const blob: Blob = await new Promise((resolve, reject) => {
    tela.toBlob(
      (b) => (b ? resolve(b) : reject(new ErroImagem('Falha ao converter a imagem.'))),
      'image/webp',
      QUALIDADE,
    );
  });

  // Safari em iPhone devolve tela em branco com fotos muito grandes, em silêncio.
  // Um arquivo minúsculo para uma imagem grande é o sintoma.
  if (blob.size < 1024 && largura > 400) {
    throw new ErroImagem('Esta imagem é grande demais para o navegador processar. Tente uma menor.');
  }

  aoProgredir?.(55);

  const corpo = new FormData();
  corpo.append('arquivo', new File([blob], 'imagem.webp', { type: 'image/webp' }));
  corpo.append('pasta', pasta);
  corpo.append('largura', String(largura));
  corpo.append('altura', String(altura));

  // XHR em vez de fetch: só ele informa o progresso real do envio. Barra falsa
  // vira "travou" no relato de quem está usando.
  return new Promise<Enviada>((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open('POST', '/api/admin/upload');
    req.upload.onprogress = (e) => {
      if (e.lengthComputable) aoProgredir?.(55 + Math.round((e.loaded / e.total) * 42));
    };
    req.onload = () => {
      let r: any = {};
      try { r = JSON.parse(req.responseText); } catch {}
      if (req.status >= 200 && req.status < 300 && r.url) {
        aoProgredir?.(100);
        resolve(r as Enviada);
      } else {
        reject(new ErroImagem(r.erro || `Falha no envio (${req.status}).`));
      }
    };
    req.onerror = () => reject(new ErroImagem('Sem conexão. Verifique a internet e tente de novo.'));
    req.ontimeout = () => reject(new ErroImagem('O envio demorou demais. Tente novamente.'));
    req.timeout = 90_000;
    req.send(corpo);
  });
}
