import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';

/**
 * Lista ÚNICA de recursos do editor, usada tanto pelo navegador quanto pelo
 * servidor que gera o HTML final.
 *
 * Manter duas listas separadas é a causa clássica do bug "no editor aparece,
 * no site não" — que o time reporta e ninguém consegue reproduzir.
 */
export const extensoes = [
  StarterKit.configure({
    // H1 é o título do post. Permitir H1 no corpo cria dois títulos principais
    // na mesma página, o que o consultor de SEO aponta na primeira auditoria.
    heading: { levels: [2, 3, 4] },
    codeBlock: false,
    link: {
      openOnClick: false, // clicar no link dentro do editor abriria uma aba
      autolink: true,
      protocols: ['http', 'https', 'mailto', 'tel'],
      HTMLAttributes: { rel: 'noopener noreferrer' },
    },
  }),
  Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        // Dimensões viajam junto com a imagem: sem elas o texto "pula" quando
        // a foto carrega, e o CLS (hoje zero) vai embora.
        width: { default: null },
        height: { default: null },
        alt: { default: null },
      };
    },
  }).configure({
    inline: false,
    allowBase64: false, // base64 gravaria uma imagem de MBs dentro do post
  }),
];
