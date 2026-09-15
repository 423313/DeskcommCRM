import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  pairSession: vi.fn(),
  audit: vi.fn(),
  guarda: vi.fn(),
  canal: null as { id: string; wacalls_session_id: string } | null,
  inseridas: [] as Record<string, unknown>[],
}));
const ORG = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: async () => ({ ok: true, user: { id: "admin" }, org: { orgId: ORG } }),
}));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/voice/guarda", () => ({ exigirVozLigada: mocks.guarda }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: {
    WACALLS_API_BASE_URL: "http://voz.invalid",
    WACALLS_API_TOKEN: "credencial-sintetica",
  },
}));
vi.mock("@/lib/wacalls/client", () => ({
  getWacallsClient: () => mocks,
  wacallsFriendlyError: () => "Falha no serviço de voz.",
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({ data: mocks.canal, error: null }),
        insert: (linha: Record<string, unknown>) => {
          mocks.inseridas.push(linha);
          mocks.canal = { id: "canal", wacalls_session_id: String(linha.wacalls_session_id) };
          return query;
        },
        single: async () => ({ data: mocks.canal, error: null }),
      };
      return query;
    },
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.canal = null;
  mocks.inseridas = [];
  mocks.guarda.mockResolvedValue(null);
  mocks.createSession.mockResolvedValue({ id: "sessao-voz" });
  mocks.pairSession.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

function pedido(body: unknown) {
  return new Request("http://crm.invalid/api/v1/voice/sessions/pair", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
async function parear(body: unknown) {
  const { POST } = await import("@/app/api/v1/voice/sessions/pair/route");
  return (POST as (request: Request) => Promise<Response>)(pedido(body));
}

describe("preparação da sessão sem perder o primeiro QR", () => {
  it("cria o vínculo da organização antes dos eventos, sem iniciar o pareamento", async () => {
    expect((await parear({ prepare_only: true })).status).toBe(200);
    expect(mocks.inseridas).toHaveLength(1);
    expect(mocks.inseridas[0]).toMatchObject({ organization_id: ORG, provider: "wacalls" });
    expect(mocks.pairSession).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "voice.session_prepared" }),
    );
    expect((await parear({})).status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.pairSession).toHaveBeenCalledExactlyOnceWith("sessao-voz");
  });

  it("preparar continua exigindo que a organização tenha ligado a voz", async () => {
    mocks.guarda.mockResolvedValue(new Response(null, { status: 422 }));
    expect((await parear({ prepare_only: true })).status).toBe(422);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("rejeita opção malformada sem criar sessão", async () => {
    expect((await parear({ prepare_only: "sim" })).status).toBe(400);
    expect(mocks.createSession).not.toHaveBeenCalled();
  });
});

it("o QR chega pelo relay autenticado e só para a organização dona", async () => {
  mocks.canal = { id: "canal", wacalls_session_id: "sessao-voz" };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      if (new Headers(init.headers).get("Authorization") !== "Bearer credencial-sintetica") {
        return new Response(null, { status: 401 });
      }
      const linhas = [
        { type: "auth-state", sessionId: "outra-organizacao", paired: true },
        { type: "auth-state", sessionId: "sessao-voz", qr: "qr-sintetico" },
      ]
        .map((e) => `data: ${JSON.stringify(e)}\n\n`)
        .join("");
      return new Response(linhas, { headers: { "Content-Type": "text/event-stream" } });
    }),
  );
  const { GET } = await import("@/app/api/v1/voice/events/route");
  const resposta = await GET();
  expect(resposta.status).toBe(200);
  const texto = await resposta.text();
  expect(texto).toContain('"type":"qr"');
  expect(texto).not.toContain('"type":"paired"');
  expect(texto).not.toContain("credencial-sintetica");
});

it("fecha a conexão com o serviço quando o navegador sai do pareamento", async () => {
  mocks.canal = { id: "canal", wacalls_session_id: "sessao-voz" };
  const fechar = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({ cancel: fechar }))));
  const { GET } = await import("@/app/api/v1/voice/events/route");
  const resposta = await GET();
  const reader = resposta.body!.getReader();
  await reader.read(); // comentário inicial que libera o onopen
  await reader.cancel();
  await vi.waitFor(() => expect(fechar).toHaveBeenCalledOnce());
});
