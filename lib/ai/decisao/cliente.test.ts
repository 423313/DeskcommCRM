/**
 * O CLIENTE DO SYSTEM ONE NUNCA LANÇA — e isso é o contrato, não um detalhe.
 *
 * Toda decisão que passa por aqui tem um caminho atual do lado (regex, heurística,
 * LLM). Se o cliente lançasse, cada call site precisaria lembrar de um try/catch, e
 * o primeiro que esquecesse derrubaria um turno de atendimento por causa de um
 * fornecedor em early access. Devolvendo `{ ok: false, motivo }`, o compilador
 * obriga quem chama a tratar a ausência de resposta — o fallback deixa de depender
 * de disciplina.
 *
 * O `motivo` é tipado porque ele vira `llm_calls.error_code`, e porque UM deles é
 * diferente dos outros: `contrato_invalido` (422) é defeito NOSSO, não
 * indisponibilidade do fornecedor. Silenciá-lo junto com os demais transformaria
 * uma pergunta malformada em degradação permanente e invisível.
 */
import { describe, expect, it, vi } from "vitest";

import { decidir, ENDPOINT_SYSTEM_ONE } from "@/lib/ai/decisao/cliente";

const CHAVE = "tsk_teste";
const PERGUNTAS = {
  clima: { tipo: "score", instrucao: "Qual o clima?", criterios: ["péssimo", "neutro", "ótimo"] },
} as const;

function respostaHttp(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const CORPO_OK = {
  model: "jev-latest",
  answers: {
    clima: {
      type: "score",
      score: 1.4,
      legend: { "0": "péssimo", "1": "neutro", "2": "ótimo" },
      probabilities: { "0": 0.1, "1": 0.4, "2": 0.5 },
      confidence: 0.82,
    },
  },
  usage: { input_tokens: 412, output_tokens: 0 },
};

describe("cliente do System One", () => {
  it("monta a requisição no contrato do fornecedor", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaHttp(200, CORPO_OK));
    await decidir(
      { chave: CHAVE, estado: "cliente disse: adorei!", perguntas: PERGUNTAS },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe(ENDPOINT_SYSTEM_ONE);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${CHAVE}`);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.model).toBe("jev-latest");
    expect(body.state).toBe("cliente disse: adorei!");
    expect(body.questions).toEqual({
      clima: { type: "score", instructions: "Qual o clima?", criteria: ["péssimo", "neutro", "ótimo"] },
    });
  });

  it("devolve a resposta tipada, com o uso para a telemetria", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaHttp(200, CORPO_OK));
    const r = await decidir({ chave: CHAVE, estado: "x", perguntas: PERGUNTAS }, { fetchImpl });

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const clima = r.respostas.clima;
    expect(clima?.tipo).toBe("score");
    if (clima?.tipo !== "score") return;
    expect(clima.score).toBe(1.4);
    expect(clima.confianca).toBe(0.82);
    expect(r.uso).toEqual({ tokensDeEntrada: 412, tokensDeSaida: 0 });
  });

  it.each([
    [401, "credencial_invalida"],
    [422, "contrato_invalido"],
    [429, "limite_de_taxa"],
    [529, "provedor_sobrecarregado"],
    [500, "provedor_indisponivel"],
  ])("HTTP %i não lança — devolve motivo %s", async (status, motivo) => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaHttp(status, { error: "x" }));
    const r = await decidir({ chave: CHAVE, estado: "x", perguntas: PERGUNTAS }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe(motivo);
  });

  it("falha de rede não lança", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const r = await decidir({ chave: CHAVE, estado: "x", perguntas: PERGUNTAS }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("provedor_indisponivel");
  });

  it("corpo fora do contrato não lança e não inventa resposta", async () => {
    // O fornecedor promete "zero type errors by construction". Isso vale para o
    // modelo, não para a rede: um proxy, uma página de erro em HTML ou uma versão
    // nova do contrato chegam aqui igual. Confiar na promessa é o mesmo erro de
    // confiar em saída de LLM sem validar.
    const fetchImpl = vi.fn().mockResolvedValue(respostaHttp(200, { answers: { clima: { type: "?" } } }));
    const r = await decidir({ chave: CHAVE, estado: "x", perguntas: PERGUNTAS }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("resposta_ilegivel");
  });

  it("sem chave, nem sai da máquina", async () => {
    const fetchImpl = vi.fn();
    const r = await decidir({ chave: "", estado: "x", perguntas: PERGUNTAS }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.motivo).toBe("sem_credencial");
    expect(fetchImpl, "sem credencial não se gasta requisição").not.toHaveBeenCalled();
  });

  it("o 422 é o único motivo que pede alerta — é defeito nosso, não do fornecedor", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaHttp(422, { error: "malformed" }));
    const r = await decidir({ chave: CHAVE, estado: "x", perguntas: PERGUNTAS }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.defeitoNosso, "422 sinaliza pergunta malformada nossa").toBe(true);

    const indisponivel = await decidir(
      { chave: CHAVE, estado: "x", perguntas: PERGUNTAS },
      { fetchImpl: vi.fn().mockResolvedValue(respostaHttp(529, {})) },
    );
    expect(indisponivel.ok).toBe(false);
    if (indisponivel.ok) return;
    expect(indisponivel.defeitoNosso).toBe(false);
  });
});
