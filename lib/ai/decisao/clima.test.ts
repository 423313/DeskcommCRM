/**
 * O CLIMA DA CONVERSA PELO SYSTEM ONE — e a normalização, que é onde mora o risco.
 *
 * O worker grava `sentiment_score` de 0 a 1 e compara com um limiar configurável
 * (default 0.3) para abrir handoff. O System One devolve a posição numa escala de
 * NÍVEIS: com 5 níveis, um número contínuo entre 0 e 4.
 *
 * Trocar a origem do número sem acertar a escala moveria o limiar de todo mundo em
 * silêncio — um 2.0 (neutro) lido como 2.0 numa régua de 0..1 abriria handoff em
 * toda conversa morna. Por isso a normalização tem teste próprio, com os extremos e
 * o meio, e não uma conferência "parece certo".
 */
import { describe, expect, it, vi } from "vitest";

import { medirClima, NIVEIS_DE_CLIMA } from "@/lib/ai/decisao/clima";

function respostaComScore(score: number): Response {
  return new Response(
    JSON.stringify({
      model: "jev-latest",
      answers: {
        clima: { type: "score", score, legend: {}, probabilities: { "0": 1 }, confidence: 0.9 },
      },
      usage: { input_tokens: 80, output_tokens: 0 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("medirClima", () => {
  it.each([
    [0, 0],
    [NIVEIS_DE_CLIMA.length - 1, 1],
    [(NIVEIS_DE_CLIMA.length - 1) / 2, 0.5],
  ])("normaliza o nível %s da escala para %s em 0..1", async (bruto, esperado) => {
    const r = await medirClima(
      { organizationId: "org-1", mensagem: "oi" },
      { buscarChave: async () => "tsk_x", fetchImpl: vi.fn().mockResolvedValue(respostaComScore(bruto)) },
    );
    expect(r).not.toBeNull();
    expect(r?.score).toBeCloseTo(esperado, 5);
  });

  it("devolve null quando não há resposta — o chamador segue pelo caminho atual", async () => {
    const r = await medirClima(
      { organizationId: "org-1", mensagem: "oi" },
      { buscarChave: async () => null, fetchImpl: vi.fn() },
    );
    expect(r, "sem credencial, o clima não é medido aqui — e isso não é um zero").toBeNull();
  });

  it("score fora da escala não vira nota — vira ausência", async () => {
    // Defesa contra o contrato do fornecedor mudar (mais níveis, outra base) sem
    // ninguém perceber: um número fora da faixa normalizaria para algo plausível
    // e ERRADO, e o limiar de handoff passaria a disparar por régua trocada.
    const r = await medirClima(
      { organizationId: "org-1", mensagem: "oi" },
      { buscarChave: async () => "tsk_x", fetchImpl: vi.fn().mockResolvedValue(respostaComScore(99)) },
    );
    expect(r).toBeNull();
  });

  it("a pergunta enviada tem a escala ORDENADA do pior ao melhor", async () => {
    // A ordem é o contrato do `score`: o fornecedor devolve a POSIÇÃO na escala,
    // então inverter os níveis inverteria a nota sem erro nenhum aparecer.
    const fetchImpl = vi.fn().mockResolvedValue(respostaComScore(2));
    await medirClima({ organizationId: "org-1", mensagem: "oi" }, { buscarChave: async () => "tsk_x", fetchImpl });
    const [, init] = fetchImpl.mock.calls[0]!;
    const body = JSON.parse((init as RequestInit).body as string) as {
      questions: { clima: { criteria: string[] } };
    };
    expect(body.questions.clima.criteria).toEqual([...NIVEIS_DE_CLIMA]);
    expect(body.questions.clima.criteria[0]).toMatch(/irritad|revoltad|péssim/i);
  });
});
