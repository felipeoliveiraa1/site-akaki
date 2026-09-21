import { generateHTML } from '@tiptap/html';
import sanitizeHtml from 'sanitize-html';
import { extensoes } from './extensoes';

/**
 * Converte o conteúdo do editor em HTML seguro. Roda SEMPRE no servidor.
 *
 * Regra de ouro: o navegador envia apenas o conteúdo estruturado (JSON), nunca
 * HTML. Um "autor" é só parcialmente confiável — se HTML viesse pronto do
 * navegador e fosse gravado como está, um texto malicioso rodaria no site
 * público e também dentro do admin, na sessão de um administrador.
 *
 * O banco reforça isso: o privilégio de escrita na coluna conteudo_html foi
 * revogado, então nem por chamada direta à API dá para gravar HTML.
 */

const HOST_PERMITIDO = (() => {
  try {
    return new URL(import.meta.env.SUPABASE_URL ?? 'https://exemplo.supabase.co').host;
  } catch {
    return '';
  }
})();

const REGRAS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'h2', 'h3', 'h4', 'strong', 'em', 's', 'u', 'br', 'hr',
    'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'figure', 'figcaption',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'code', 'pre', 'mark', 'sup', 'sub',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'rel', 'target'],
    img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
    '*': ['class'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['https'] },
  transformTags: {
    a: (_tag, attrs) => {
      const href = attrs.href ?? '';
      const externo = /^https?:\/\//i.test(href) && !href.includes('akaki.odo.br');
      return {
        tagName: 'a',
        attribs: {
          ...attrs,
          // nofollow só em link externo; link interno passa autoridade de propósito
          rel: externo ? 'noopener noreferrer nofollow' : 'noopener',
          ...(externo ? { target: '_blank' } : {}),
        },
      };
    },
    img: (_tag, attrs) => ({
      tagName: 'img',
      attribs: { ...attrs, loading: 'lazy', decoding: 'async' },
    }),
  },
  exclusiveFilter: (frame) => {
    if (frame.tag !== 'img') return false;
    const { src, width, height } = frame.attribs;
    // Remove imagem de fora do nosso armazenamento (hotlink de terceiro)…
    if (HOST_PERMITIDO && src) {
      try { if (new URL(src).host !== HOST_PERMITIDO) return true; } catch { return true; }
    }
    // …e imagem sem dimensões, que causaria salto de layout.
    return !width || !height;
  },
};

export function renderizarConteudo(json: unknown): { html: string; texto: string; minutos: number } {
  let bruto = '';
  try {
    bruto = generateHTML(json as any, extensoes as any);
  } catch {
    return { html: '', texto: '', minutos: 1 };
  }

  const html = sanitizeHtml(bruto, REGRAS);
  const texto = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const palavras = texto ? texto.split(' ').length : 0;
  // 200 palavras/min é a média de leitura em português.
  const minutos = Math.max(1, Math.round(palavras / 200));

  return { html, texto, minutos };
}

/** Lista imagens sem texto alternativo — usado para barrar a publicação. */
export function imagensSemAlt(json: any): number {
  let faltando = 0;
  const andar = (no: any) => {
    if (!no || typeof no !== 'object') return;
    if (no.type === 'image' && !String(no.attrs?.alt ?? '').trim()) faltando++;
    (no.content ?? []).forEach(andar);
  };
  andar(json);
  return faltando;
}
