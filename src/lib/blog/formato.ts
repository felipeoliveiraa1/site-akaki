const FUSO = 'America/Sao_Paulo';
export const SITE = 'https://www.akaki.odo.br';

/** Data por extenso em pt-BR, sempre no fuso de São Paulo. */
export function dataLonga(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(iso));
}

/** Data curta (12/03/2026). */
export function dataCurta(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso));
}

/**
 * ISO com o deslocamento de São Paulo (…T09:00:00-03:00).
 * O Google precisa do offset explícito em datePublished/dateModified —
 * uma data "solta" é interpretada como UTC e aparece 3h deslocada.
 */
export function isoComFuso(iso: string): string {
  const d = new Date(iso);
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(d).reduce<Record<string, string>>(
    (acc, p) => (p.type !== 'literal' ? ((acc[p.type] = p.value), acc) : acc), {});

  // Deslocamento real do fuso naquele instante (o Brasil pode voltar a ter horário de verão).
  const comoUtc = Date.UTC(+partes.year, +partes.month - 1, +partes.day,
                           +partes.hour, +partes.minute, +partes.second);
  const minutos = Math.round((comoUtc - d.getTime()) / 60000);
  const sinal = minutos >= 0 ? '+' : '-';
  const abs = Math.abs(minutos);
  const off = `${sinal}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
  return `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}${off}`;
}

/** CRO formatado: "CRO-SP 45717". */
export function cro(numero?: string | null, uf?: string | null): string | null {
  if (!numero) return null;
  return uf ? `CRO-${uf} ${numero}` : `CRO ${numero}`;
}

/**
 * Título para o Google: no máximo 60 caracteres, escolhendo a variação que
 * couber. Nunca corta com reticências — título truncado na busca parece
 * defeito e desperdiça o campo mais importante do resultado.
 */
export function tituloSeo(titulo: string, sobrescrita?: string | null): string {
  if (sobrescrita?.trim()) return sobrescrita.trim();
  const opcoes = [
    `${titulo} | Akaki Odontologia`,
    `${titulo} | Akaki`,
    titulo,
  ];
  return opcoes.find((o) => o.length <= 60) ?? titulo;
}

/** Descrição de 120–158 caracteres, cortando em frase ou palavra inteira. */
export function descricaoSeo(
  sobrescrita: string | null | undefined,
  resumo: string | null | undefined,
  html: string,
): string {
  const cru = (sobrescrita?.trim() || resumo?.trim() || semHtml(html)).replace(/\s+/g, ' ').trim();
  if (cru.length <= 158) return cru;
  const frase = cru.slice(0, 158).lastIndexOf('. ');
  if (frase > 90) return cru.slice(0, frase + 1);
  const palavra = cru.slice(0, 155).lastIndexOf(' ');
  return cru.slice(0, palavra > 0 ? palavra : 155) + '…';
}

export function semHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Prepara o HTML do post para a página pública:
 *  - garante lazy nas imagens do corpo (a capa é renderizada à parte)
 *  - dá id aos títulos, para o índice lateral e links diretos
 *  - envolve tabelas num container rolável (senão estouram no celular)
 */
export function prepararHtml(html: string): { html: string; indice: { id: string; texto: string }[] } {
  const indice: { id: string; texto: string }[] = [];
  const usados = new Set<string>();

  let saida = html.replace(/<h2([^>]*)>([\s\S]*?)<\/h2>/g, (_m, attrs, miolo) => {
    const texto = semHtml(miolo);
    let id = texto.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'secao';
    let n = 1;
    while (usados.has(id)) id = `${id}-${++n}`;
    usados.add(id);
    indice.push({ id, texto });
    return `<h2 id="${id}"${attrs}>${miolo}</h2>`;
  });

  saida = saida.replace(/<img(?![^>]*\bloading=)([^>]*)>/g, '<img loading="lazy" decoding="async"$1>');
  saida = saida.replace(/<table/g, '<div class="tabela-rolavel"><table')
               .replace(/<\/table>/g, '</table></div>');

  return { html: saida, indice };
}

/**
 * URL de perfil válida para o `sameAs` do JSON-LD, ou null.
 *
 * O campo é digitado por gente leiga no /admin/perfil e já chegou a receber
 * o próprio rótulo colado por engano. `sameAs` é onde o Google lê os perfis
 * oficiais da pessoa: um valor que não é URL invalida a entidade Person
 * inteira. Na dúvida, é melhor não declarar sameAs do que declarar lixo.
 */
export function perfilExterno(valor?: string | null): string | null {
  const v = valor?.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : null;
  } catch {
    return null;
  }
}
