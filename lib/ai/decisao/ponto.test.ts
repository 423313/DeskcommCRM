/**
 * O SEAM DO PONTO — o que liga o System One ao resto do sistema.
 *
 * Três garantias, e todas são sobre NÃO quebrar o que já funciona:
 *
 *  1. sem credencial configurada, nada sai da máquina e ninguém espera timeout;
 *  2. o destino passa pela allowlist de egress (F4-03), com o host vindo da
 *     CONFIG — host fora dela falha fechado, como todo egress do runtime;
 *  3. o resultado nunca lança: quem chama recebe `{ ok: false, motivo }` e
 *     segue pelo caminho atual.
 *
 * O que este módulo NÃO faz, de propósito: decidir por conta própria se o
 * fornecedor deve ser usado. Isso é do call site, que conhece o seu fallback.
 */
import { describe, expect, it, vi } from "vitest";

import { decidirNoPonto } from "@/lib/ai/decisao/ponto";

const PERGUNTAS = {
  clima: { tipo: "score", instrucao: "Qual o clima?", criterios: ["ruim", "neutro", "bom"] },
} as const;

const CORPO_OK = {
  model: "jev-latest",
  answers: {
    clima: { type: "score", score: 2.0, legend: {}, probabilities: { "2": 1 }, confidence: 0.9 },
  },
  usage: { input_tokens: 100, output_tokens: 0 },
};

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });
}

describe("decidirNoPonto", () => {
  it("sem credencial, não sai byte e não espera timeout", async () => {
    const fetchImpl = vi.fn();
    const r = await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: "org-1", estado: "oi", perguntas: PERGUNTAS },
      { buscarChave: async () => null, fetchImpl },
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("sem_credencial");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("com credencial, decide e devolve o uso para a telemetria", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(CORPO_OK));
    const r = await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: "org-1", estado: "adorei!", perguntas: PERGUNTAS },
      { buscarChave: async () => "tsk_x", fetchImpl },
    );

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.respostas.clima?.tipo).toBe("score");
    expect(r.uso.tokensDeEntrada).toBe(100);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe("Bearer tsk_x");
  });

  it("a credencial é buscada POR ORGANIZAÇÃO — nunca uma chave global", async () => {
    const buscarChave = vi.fn().mockResolvedValue("tsk_x");
    await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: "org-42", estado: "x", perguntas: PERGUNTAS },
      { buscarChave, fetchImpl: vi.fn().mockResolvedValue(ok(CORPO_OK)) },
    );
    expect(buscarChave).toHaveBeenCalledWith("org-42");
  });

  it("destino fora da allowlist falha fechado, sem lançar", async () => {
    // O egress do runtime é fail-closed por desenho (F4-03). Aqui a allowlist é
    // forçada a um host que não é o do fornecedor: a chamada tem de ser barrada
    // ANTES de sair, e chegar a quem chamou como ausência de resposta — nunca
    // como exceção que derruba o turno.
    const fetchImpl = vi.fn();
    const r = await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: "org-1", estado: "x", perguntas: PERGUNTAS },
      { buscarChave: async () => "tsk_x", fetchImpl, hostsPermitidos: ["exemplo.invalido"] },
    );

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("provedor_indisponivel");
    expect(fetchImpl, "egress bloqueado não chega a fazer a requisição").not.toHaveBeenCalled();
  });

  it("falha do fornecedor não lança — o call site segue pelo caminho atual", async () => {
    const r = await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: "org-1", estado: "x", perguntas: PERGUNTAS },
      {
        buscarChave: async () => "tsk_x",
        fetchImpl: vi.fn().mockResolvedValue(new Response("{}", { status: 529 })),
      },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("provedor_sobrecarregado");
    expect(r.defeitoNosso).toBe(false);
  });
});
