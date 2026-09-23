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
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Dublês do banco e da decifragem, para `chaveDaOrganizacao` real ──────────
const banco = vi.hoisted(() => ({
  linha: null as Record<string, unknown> | null,
  erro: null as { name: string; message: string } | null,
  chamadas: [] as Array<[string, ...unknown[]]>,
}));
const decifragem = vi.hoisted(() => ({ falha: false }));
const avisos = vi.hoisted(() => [] as Array<[string, Record<string, unknown>]>);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: string) => {
      banco.chamadas.push(["from", tabela]);
      const chain: Record<string, unknown> = {};
      for (const metodo of ["select", "eq", "not", "order", "limit"]) {
        chain[metodo] = (...args: unknown[]) => {
          banco.chamadas.push([metodo, ...args]);
          return chain;
        };
      }
      chain.maybeSingle = async () => ({ data: banco.linha, error: banco.erro });
      return chain;
    },
  }),
}));

vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: (c: { ciphertext: unknown }) => {
    if (decifragem.falha) throw Object.assign(new Error("apikey_segredo_que_nao_pode_vazar"), { name: "DecryptError" });
    return `decifrada:${String(c.ciphertext)}`;
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    warn: (msg: string, ctx: Record<string, unknown>) => avisos.push([msg, ctx]),
    info: () => undefined,
    error: () => undefined,
    debug: () => undefined,
  },
}));

import { chaveDaOrganizacao, decidirNoPonto } from "@/lib/ai/decisao/ponto";

beforeEach(() => {
  banco.linha = null;
  banco.erro = null;
  banco.chamadas.length = 0;
  decifragem.falha = false;
  avisos.length = 0;
});

const PERGUNTAS = {
  clima: { tipo: "score", instrucao: "Qual o clima?", criterios: ["ruim", "neutro", "bom"] },
} as const;

const CORPO_OK = {
  model: "jev-1.13.0",
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

describe("chaveDaOrganizacao — a chave do Jev daquela empresa, e só dela", () => {
  const ORG = "33333333-3333-4333-8333-333333333333";

  it("lê a credencial typesafe ATIVA e VALIDADA mais recente, filtrando a organização", async () => {
    banco.linha = { api_key_encrypted: "cifra", api_key_iv: "iv", api_key_tag: "tag" };
    const chave = await chaveDaOrganizacao(ORG);

    expect(chave).toBe("decifrada:cifra");
    expect(banco.chamadas).toContainEqual(["from", "ai_provider_credentials"]);
    // Service role passa por cima da RLS: sem este filtro, a chave de outra
    // empresa pagaria a conta desta.
    expect(banco.chamadas).toContainEqual(["eq", "organization_id", ORG]);
    expect(banco.chamadas).toContainEqual(["eq", "provider", "typesafe"]);
    expect(banco.chamadas).toContainEqual(["eq", "is_active", true]);
    expect(banco.chamadas).toContainEqual(["not", "validated_at", "is", null]);
    expect(banco.chamadas).toContainEqual(["order", "created_at", { ascending: false }]);
  });

  it("sem credencial, devolve null sem barulho", async () => {
    expect(await chaveDaOrganizacao(ORG)).toBeNull();
    expect(avisos).toEqual([]);
  });

  it("leitura que falha devolve null e deixa rastro", async () => {
    banco.erro = { name: "PostgrestError", message: "relation does not exist" };
    expect(await chaveDaOrganizacao(ORG)).toBeNull();
    expect(avisos).toHaveLength(1);
  });

  it("decifragem quebrada devolve null, e o log leva só a CLASSE do erro", async () => {
    banco.linha = { api_key_encrypted: "cifra", api_key_iv: "iv", api_key_tag: "tag" };
    decifragem.falha = true;
    expect(await chaveDaOrganizacao(ORG)).toBeNull();
    expect(avisos).toHaveLength(1);
    expect(JSON.stringify(avisos[0])).not.toContain("apikey_segredo");
    expect(avisos[0]![1].erro).toBe("DecryptError");
  });

  it("é o caminho padrão do ponto: a chave decifrada chega ao fornecedor", async () => {
    banco.linha = { api_key_encrypted: "cifra", api_key_iv: "iv", api_key_tag: "tag" };
    const fetchImpl = vi.fn().mockResolvedValue(ok(CORPO_OK));
    const r = await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: ORG, estado: "x", perguntas: PERGUNTAS },
      { fetchImpl },
    );
    expect(r.ok).toBe(true);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit & { headers: Record<string, string> }).headers.Authorization).toBe(
      "Bearer decifrada:cifra",
    );
  });

  it("sem a credencial no banco, o caminho padrão não sai da máquina", async () => {
    const fetchImpl = vi.fn();
    const r = await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: ORG, estado: "x", perguntas: PERGUNTAS },
      { fetchImpl },
    );
    expect(r.ok === false && r.motivo).toBe("sem_credencial");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("a allowlist de egress deriva da mesma base do cliente", () => {
  it("base configurada (o dublê do e2e) passa pela allowlist e recebe a chamada", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok(CORPO_OK));
    const r = await decidirNoPonto(
      { ponto: "sentiment_classify", organizationId: "org-1", estado: "x", perguntas: PERGUNTAS },
      { buscarChave: async () => "tsk_x", fetchImpl, baseUrl: "http://127.0.0.1:4010" },
    );
    expect(r.ok).toBe(true);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe("http://127.0.0.1:4010/v1/systemone");
  });
});
