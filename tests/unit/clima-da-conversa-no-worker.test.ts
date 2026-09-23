/**
 * O CLIMA DA CONVERSA PELO WORKER DE VERDADE — `processSentiment`, não o medidor.
 *
 * `lib/ai/decisao/clima.test.ts` prova o medidor isolado. Aqui roda o worker
 * inteiro, com o resolvedor de modelo REAL (`resolverModeloDoPonto`) e o log
 * REAL (`logInvocation`) gravando num banco de brinquedo — as linhas de
 * `llm_calls` que a tela de Execuções lê são afirmadas como ficaram, não como o
 * worker pediu que ficassem.
 *
 * ## A chave colada pela tela (D12)
 *
 * O worker desistia logo na entrada com `isAiGatewayConfigured()`, que só olha
 * três variáveis do `.env`. A instalação cuja chave foi colada em IA ›
 * Credenciais (o `install.sh` deixa a chave opcional: "dá para cadastrar depois
 * pela tela") nunca media o clima — e, sem clima, ninguém era chamado quando o
 * cliente se irritava. O resolvedor que vem logo depois já sabia achar essa
 * chave; o portão na frente dele é que não deixava chegar lá.
 *
 * Em todos os casos o `.env` está VAZIO de chave de IA: um verde aqui só pode
 * ter vindo da credencial da organização.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const envMock: Record<string, string> = {
  ANTHROPIC_API_KEY: "",
  AI_GATEWAY_API_KEY: "",
  OPENROUTER_API_KEY: "",
  OPENAI_API_KEY: "",
};
vi.mock("@/lib/env", () => ({
  get env() {
    return envMock;
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/ai/cost", () => ({ computeCost: vi.fn(async () => 1) }));
vi.mock("ai", () => ({ generateObject: vi.fn() }));
// A chave "cifrada" do banco de brinquedo é o próprio texto: o que se prova
// aqui é QUAL credencial foi lida, não a criptografia.
vi.mock("@/lib/crypto/aes_gcm", () => ({
  byteaToBuffer: (v: unknown) => v,
  decryptKey: (c: { ciphertext: unknown }) => String(c.ciphertext),
}));

import { generateObject } from "ai";

import { createAdminClient } from "@/lib/supabase/admin";
import type { EventRow } from "@/lib/event-log/dispatcher";
import { processSentiment } from "@/workers/ai-sentiment-worker";

type Linha = Record<string, unknown>;
/** As tabelas que os casos afirmam são nomeadas; o resto nasce vazio sob demanda. */
interface Banco {
  [tabela: string]: Linha[] | undefined;
  messages: Linha[];
  llm_calls: Linha[];
  agent_inbox_items: Linha[];
}

const ORG = "11111111-1111-4111-8111-111111111111";
const MSG = "22222222-2222-4222-8222-222222222222";
const CONV = "33333333-3333-4333-8333-333333333333";
const CRED_ANTHROPIC = "44444444-4444-4444-8444-444444444444";
const CRED_OPENAI = "55555555-5555-4555-8555-555555555555";

// ── Banco de brinquedo: filtra, ordena, grava e conta ────────────────────────
//
// Mais caro que devolver objeto fixo, e é o que deixa o teste medir a CONSULTA:
// um dublê que devolvesse sempre a mesma credencial aprovaria o worker que não
// filtra por organização nem por provedor.

interface Consulta {
  select(colunas?: string, opcoes?: { count?: string; head?: boolean }): Consulta;
  insert(linha: Linha | Linha[]): Consulta;
  update(mudanca: Linha): Consulta;
  eq(coluna: string, valor: unknown): Consulta;
  is(coluna: string, valor: unknown): Consulta;
  in(coluna: string, valores: unknown[]): Consulta;
  not(coluna: string, operador: string, valor: unknown): Consulta;
  gte(coluna: string, valor: unknown): Consulta;
  order(coluna: string, opcoes?: { ascending?: boolean }): Consulta;
  limit(n: number): Consulta;
  maybeSingle(): Promise<{ data: Linha | null; error: null }>;
  single(): Promise<{ data: Linha | null; error: null }>;
  then<T>(ok: (v: unknown) => T, falha?: (e: unknown) => T): Promise<T>;
}

function fazerAdmin(banco: Banco, rpcs: Linha[]) {
  const from = (tabela: string): Consulta => {
    const filtros: Array<(l: Linha) => boolean> = [];
    let modo: "select" | "insert" | "update" = "select";
    let soContar = false;
    let mudanca: Linha = {};
    let novas: Linha[] = [];
    let ordem: { coluna: string; asc: boolean } | null = null;
    let limite: number | null = null;

    const tabelaViva = (): Linha[] => (banco[tabela] ??= []);
    const filtradas = (): Linha[] => {
      let ls = tabelaViva().filter((l) => filtros.every((f) => f(l)));
      if (ordem) {
        const { coluna, asc } = ordem;
        ls = [...ls].sort((a, b) => ((a[coluna] as never) < (b[coluna] as never) ? -1 : 1) * (asc ? 1 : -1));
      }
      return limite === null ? ls : ls.slice(0, limite);
    };
    const executar = () => {
      if (modo === "insert") {
        tabelaViva().push(...novas);
        return { data: null, error: null };
      }
      if (modo === "update") {
        for (const l of filtradas()) Object.assign(l, mudanca);
        return { data: null, error: null };
      }
      const ls = filtradas();
      return soContar ? { data: null, count: ls.length, error: null } : { data: ls, error: null };
    };

    const c: Consulta = {
      select: (_colunas, opcoes) => {
        if (opcoes?.head === true) soContar = true;
        return c;
      },
      insert: (linha) => {
        modo = "insert";
        novas = Array.isArray(linha) ? linha : [linha];
        return c;
      },
      update: (m) => {
        modo = "update";
        mudanca = m;
        return c;
      },
      eq: (col, val) => (filtros.push((l) => l[col] === val), c),
      is: (col, val) => (filtros.push((l) => (l[col] ?? null) === val), c),
      in: (col, vals) => (filtros.push((l) => vals.includes(l[col])), c),
      not: (col, _op, val) => (filtros.push((l) => (l[col] ?? null) !== val), c),
      gte: (col, val) => (filtros.push((l) => (l[col] as never) >= (val as never)), c),
      order: (col, opcoes) => ((ordem = { coluna: col, asc: opcoes?.ascending !== false }), c),
      limit: (n) => ((limite = n), c),
      maybeSingle: () => Promise.resolve({ data: filtradas()[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: filtradas()[0] ?? null, error: null }),
      then: (ok, falha) => Promise.resolve(executar()).then(ok, falha),
    };
    return c;
  };

  return {
    from,
    rpc: (nome: string, args: Linha) => {
      rpcs.push({ nome, ...args });
      return Promise.resolve({ data: null, error: null });
    },
  };
}

interface Cenario {
  /** `organizations.settings` — o provedor escolhido (e, mais tarde, o Jev). */
  settings?: Linha;
  credenciais?: Linha[];
  bindings?: Linha[];
}

function montarBanco(c: Cenario): Banco {
  return {
    organizations: [{ id: ORG, settings: c.settings ?? {}, locale: "pt-BR" }],
    ai_provider_credentials: c.credenciais ?? [],
    ai_purpose_bindings: c.bindings ?? [],
    messages: [
      {
        id: MSG,
        organization_id: ORG,
        conversation_id: CONV,
        body: "já é a terceira vez que eu peço isso",
        direction: "inbound",
        metadata: {},
      },
    ],
    conversations: [{ id: CONV, organization_id: ORG, channel_session_id: null, active_ai_agent_id: null }],
    ai_agents: [],
    ai_agent_versions: [],
    llm_calls: [],
    agent_inbox_items: [],
  };
}

function credencial(id: string, provider: string, chave: string): Linha {
  return {
    id,
    organization_id: ORG,
    provider,
    is_active: true,
    validated_at: "2026-09-01T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    api_key_encrypted: chave,
    api_key_iv: "iv",
    api_key_tag: "tag",
  };
}

const evento = {
  id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  organization_id: ORG,
  entity_id: MSG,
  payload: { message_id: MSG, conversation_id: CONV },
} as unknown as EventRow;

/** O log é fire-and-forget (`queueMicrotask`): espera a linha cair no banco. */
async function drenar(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

async function rodar(c: Cenario) {
  const banco = montarBanco(c);
  const rpcs: Linha[] = [];
  vi.mocked(createAdminClient).mockReturnValue(
    fazerAdmin(banco, rpcs) as unknown as ReturnType<typeof createAdminClient>,
  );
  const resultado = await processSentiment(evento);
  await drenar();
  return { resultado, banco, rpcs };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateObject).mockResolvedValue({
    object: { sentiment_score: 0.2, reasoning_short: "cliente repetindo o pedido" },
    usage: { inputTokens: 40, outputTokens: 12 },
  } as unknown as Awaited<ReturnType<typeof generateObject>>);
});

describe("D12 — o clima roda com a chave colada pela tela", () => {
  it("chave da Anthropic cadastrada em Credenciais, .env vazio: o clima é medido", async () => {
    const { resultado, banco } = await rodar({
      settings: { llm: { provider: "anthropic" } },
      credenciais: [credencial(CRED_ANTHROPIC, "anthropic", "sk-ant-da-tela")],
    });

    expect(resultado, `o worker desistiu: ${resultado.reason ?? "-"}`).toMatchObject({
      skipped: false,
      sentiment_score: 0.2,
    });
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(banco.llm_calls).toHaveLength(1);
    expect(banco.llm_calls[0]).toMatchObject({
      purpose: "sentiment_classify",
      provider: "anthropic",
      model: "anthropic/claude-haiku-4-5",
      status: "ok",
    });
    expect(banco.messages[0]!.metadata).toMatchObject({ sentiment_score: 0.2 });
  });

  it("OpenAI cadastrada em Credenciais e escolhida no painel para o clima: o clima é medido", async () => {
    const { resultado, banco } = await rodar({
      settings: { llm: { provider: "openai" } },
      credenciais: [credencial(CRED_OPENAI, "openai", "sk-openai-da-tela")],
      bindings: [
        {
          organization_id: ORG,
          purpose: "sentiment_classify",
          provider: "openai",
          credential_id: CRED_OPENAI,
          model_id: "gpt-5.4-nano",
          base_url: null,
          is_enabled: true,
        },
      ],
    });

    expect(resultado.skipped, `o worker desistiu: ${resultado.reason ?? "-"}`).toBe(false);
    expect(banco.llm_calls[0]).toMatchObject({ provider: "openai", model: "gpt-5.4-nano", status: "ok" });
  });

  it("sem chave em lugar nenhum, pula sem chamar ninguém e sem linha (controle)", async () => {
    // Sem este caso, um worker que medisse com modelo inventado passaria nos
    // dois de cima. E é ele que prova que o `.env` deste arquivo está vazio.
    const { resultado, banco } = await rodar({ settings: { llm: { provider: "anthropic" } } });

    expect(resultado).toEqual({ skipped: true, reason: "ai_gateway_key_missing" });
    expect(generateObject).not.toHaveBeenCalled();
    expect(banco.llm_calls).toHaveLength(0);
  });
});
