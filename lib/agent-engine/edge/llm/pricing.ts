/**
 * Tabela de preços versionada (stack.md §2: usage × pricing.ts → llm_calls.cost_cents).
 * ÚNICO lugar com preço de modelo no repo.
 *
 * Fonte: https://platform.claude.com/docs/en/about-claude/pricing (conferida 2026-09);
 * cache write cotado no TTL 1h (2× input) — o TTL adotado pela doutrina de caching
 * (CLAUDE.md regra 15); cache read = 0.1× input.
 *
 * Modelo fora da tabela → custo NULL (desconhecido): mais honesto que inventar 0 —
 * o budget soma coalesce(cost_cents, 0), então modelo sem preço não consome teto;
 * quem habilitar um modelo novo para uma org adiciona a linha de preço aqui.
 *
 * DUAS armadilhas já pagas, e as duas são do MESMO defeito — a tabela ficou na
 * geração 4 enquanto o catálogo (`ai_models`, migration 0101) andou:
 *
 *   1. A geração 5 (`claude-sonnet-5`, o padrão de atendimento, e `claude-opus-5`)
 *      não tinha linha. Custo NULL numa instalação real: a tela Uso e orçamento
 *      mostrava gasto zero e o teto mensal nunca disparava — medido numa VPS com
 *      28 chamadas reais, todas com `cost_cents` nulo.
 *   2. O prefixo `claude-opus-4` casava com `claude-opus-4-5` em diante e cobrava
 *      o preço do Opus 4/4.1 (aposentados, US$ 15/75) por um modelo que custa
 *      US$ 5/25 — 3× a mais, com o sinal invertido do defeito 1: aqui o teto
 *      disparava cedo demais.
 *
 * Por isso o match é pelo prefixo MAIS LONGO, e não pelo primeiro que casar: com
 * `find()` a resposta dependia da ordem das chaves do objeto, que ninguém enxerga
 * ao acrescentar uma linha.
 */

/** USD por MILHÃO de tokens; match por prefixo do id (cobre sufixo de data do vendor). */
const USD_PER_MTOK: Record<string, { input: number; output: number; cacheRead: number; cacheWrite1h: number }> = {
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.2, cacheWrite1h: 4 },
  'claude-sonnet-4': { input: 3, output: 15, cacheRead: 0.3, cacheWrite1h: 6 },
  'claude-haiku-4': { input: 1, output: 5, cacheRead: 0.1, cacheWrite1h: 2 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite1h: 10 },
  // Opus 4.5 em diante custa o mesmo que o Opus 5; o `claude-opus-4` abaixo é só
  // o Opus 4 e o 4.1, aposentados e mais caros.
  'claude-opus-4-5': { input: 5, output: 25, cacheRead: 0.5, cacheWrite1h: 10 },
  'claude-opus-4-6': { input: 5, output: 25, cacheRead: 0.5, cacheWrite1h: 10 },
  'claude-opus-4-7': { input: 5, output: 25, cacheRead: 0.5, cacheWrite1h: 10 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.5, cacheWrite1h: 10 },
  'claude-opus-4': { input: 15, output: 75, cacheRead: 1.5, cacheWrite1h: 30 },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Custo em CENTS (fracionário; coluna numeric) ou null se o modelo não tem preço
 * conhecido. `inputTokens` aqui é o TOTAL do usage do SDK — a parcela cacheada é
 * descontada e cobrada pela tarifa de cache.
 */
export function costCents(model: string, usage: TokenUsage): number | null {
  // Mais longo primeiro: `claude-opus-4-8` tem de vencer `claude-opus-4`.
  const priceKey = Object.keys(USD_PER_MTOK)
    .filter((prefix) => model.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  if (priceKey === undefined) {
    return null;
  }
  const p = USD_PER_MTOK[priceKey];
  if (p === undefined) {
    return null; // inalcançável (key veio de Object.keys); satisfaz noUncheckedIndexedAccess
  }
  const noCacheInput = Math.max(0, usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens);
  const usd =
    (noCacheInput * p.input +
      usage.cacheReadTokens * p.cacheRead +
      usage.cacheWriteTokens * p.cacheWrite1h +
      usage.outputTokens * p.output) /
    1_000_000;
  return usd * 100;
}
