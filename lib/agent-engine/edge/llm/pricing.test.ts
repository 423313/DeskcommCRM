import { describe, it, expect } from "vitest";

import { costCents, type TokenUsage } from "./pricing";

/**
 * O defeito de origem, medido numa VPS real: o agente atende em
 * `claude-sonnet-5` (o padrão do catálogo desde a migration 0101) e a tabela de
 * preços parou na geração 4. Resultado: `cost_cents` NULL em toda chamada, tela
 * Uso e orçamento em zero e teto mensal que nunca dispara — porque o budget soma
 * `coalesce(cost_cents, 0)`.
 *
 * O irmão do mesmo defeito tem o sinal invertido: `claude-opus-4` casava por
 * prefixo com `claude-opus-4-8` e cobrava US$ 15/75 (preço do Opus 4/4.1,
 * aposentados) por um modelo de US$ 5/25.
 *
 * Preços conferidos em 2026-09 em platform.claude.com/docs/en/about-claude/pricing.
 */

const SEM_CACHE: TokenUsage = {
  inputTokens: 1_000_000,
  outputTokens: 1_000_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** 1 MTok de entrada + 1 MTok de saída, em CENTS: (input + output) × 100. */
function umMilhaoDeCada(model: string): number | null {
  return costCents(model, SEM_CACHE);
}

describe("costCents — a tabela cobre os modelos que o catálogo oferece", () => {
  it("claude-sonnet-5 (o padrão de atendimento) tem preço, e não NULL", () => {
    // US$ 2 de entrada + US$ 10 de saída = US$ 12 = 1200 cents.
    expect(umMilhaoDeCada("claude-sonnet-5")).toBeCloseTo(1200, 6);
  });

  it("claude-opus-5 tem preço", () => {
    // US$ 5 + US$ 25 = US$ 30.
    expect(umMilhaoDeCada("claude-opus-5")).toBeCloseTo(3000, 6);
  });

  it("claude-haiku-4-5 e claude-sonnet-4-6 seguem como estavam", () => {
    expect(umMilhaoDeCada("claude-haiku-4-5")).toBeCloseTo(600, 6);
    expect(umMilhaoDeCada("claude-sonnet-4-6")).toBeCloseTo(1800, 6);
  });

  it("modelo fora da tabela continua NULL — inventar zero consumiria teto errado", () => {
    expect(umMilhaoDeCada("gpt-4o-mini")).toBeNull();
    expect(umMilhaoDeCada("claude-inexistente-9")).toBeNull();
  });
});

describe("costCents — prefixo mais longo vence", () => {
  it("claude-opus-4-8 custa como Opus 4.8, não como o Opus 4 aposentado", () => {
    // US$ 5 + US$ 25 = US$ 30. Antes casava com `claude-opus-4`: US$ 90.
    expect(umMilhaoDeCada("claude-opus-4-8")).toBeCloseTo(3000, 6);
    expect(umMilhaoDeCada("claude-opus-4-7")).toBeCloseTo(3000, 6);
    expect(umMilhaoDeCada("claude-opus-4-6")).toBeCloseTo(3000, 6);
    expect(umMilhaoDeCada("claude-opus-4-5")).toBeCloseTo(3000, 6);
  });

  it("claude-opus-4-1 (aposentado) mantém o preço antigo", () => {
    // US$ 15 + US$ 75 = US$ 90.
    expect(umMilhaoDeCada("claude-opus-4-1")).toBeCloseTo(9000, 6);
  });

  it("sufixo de data do vendor não atrapalha o match", () => {
    expect(umMilhaoDeCada("claude-sonnet-5-20260514")).toBeCloseTo(1200, 6);
    expect(umMilhaoDeCada("claude-opus-4-8-20260210")).toBeCloseTo(3000, 6);
  });
});

describe("costCents — cache é cobrado na tarifa de cache", () => {
  it("a parcela lida do cache sai a 0,1× a entrada", () => {
    // 1 MTok, TODO vindo do cache: US$ 0,20 no sonnet-5 = 20 cents.
    const soCache: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 0,
    };
    expect(costCents("claude-sonnet-5", soCache)).toBeCloseTo(20, 6);
  });

  it("a gravação de cache (TTL 1h) sai a 2× a entrada", () => {
    // 1 MTok gravado: US$ 4 no sonnet-5 = 400 cents.
    const soGravacao: TokenUsage = {
      inputTokens: 1_000_000,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 1_000_000,
    };
    expect(costCents("claude-sonnet-5", soGravacao)).toBeCloseTo(400, 6);
  });

  it("a conversa real medida na VPS: 359.369 de entrada com 294.128 em cache", () => {
    // O turno de atendimento que gerou este PR. Entrada não-cacheada:
    // 359.369 − 294.128 = 65.241 tokens.
    const turnoReal: TokenUsage = {
      inputTokens: 359_369,
      outputTokens: 4_070,
      cacheReadTokens: 294_128,
      cacheWriteTokens: 0,
    };
    const esperado =
      ((359_369 - 294_128) * 2 + 294_128 * 0.2 + 4_070 * 10) / 1_000_000 * 100;
    expect(costCents("claude-sonnet-5", turnoReal)).toBeCloseTo(esperado, 6);
    // ~23 cents: o número que a tela Uso e orçamento passa a somar.
    expect(costCents("claude-sonnet-5", turnoReal)).toBeGreaterThan(22);
    expect(costCents("claude-sonnet-5", turnoReal)).toBeLessThan(24);
  });
});
