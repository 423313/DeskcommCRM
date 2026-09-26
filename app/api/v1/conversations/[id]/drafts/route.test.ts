import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";

import { POST } from "./route";

vi.mock("@/lib/api/auth-dual", () => ({
  resolveAuthDual: vi.fn(),
  tetoDeEscritaDoToken: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));

/**
 * POST /api/v1/conversations/[id]/drafts (issue #1611) — a porta da integração.
 *
 * O banco é o MESMO dublê com predicado do teste das regras: a linha da
 * conversa só aparece se `organization_id` casar. É por isso que o caso
 * cross-tenant mede a rota, e não o mock.
 */
const ORG_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ORG_B = "bbbbbbbb-0000-4000-8000-000000000002";
const CONV_A = "aaaaaaaa-1111-4000-8000-000000000001";
const CONV_B = "bbbbbbbb-1111-4000-8000-000000000002";
const USER = "aaaaaaaa-3333-4000-8000-000000000003";

type Linha = Record<string, unknown>;

let drafts: Linha[] = [];
let inserts: number;

function clienteFake(conversas: Linha[]) {
  function builder(tabela: string) {
    const filtros: Array<[string, unknown]> = [];
    let payload: Linha | null = null;
    const linhas = () => (tabela === "conversation_drafts" ? drafts : conversas);
    const q = {
      select: () => q,
      insert: (v: Linha) => {
        payload = v;
        return q;
      },
      update: () => q,
      eq: (c: string, v: unknown) => {
        filtros.push([c, v]);
        return q;
      },
      is: () => q,
      gt: () => q,
      maybeSingle: async () => {
        if (payload) {
          inserts += 1;
          const nova = { id: "00000000-0000-4000-8000-000000000020", ...payload };
          drafts.push(nova);
          return { data: { id: nova.id }, error: null };
        }
        const alvo = linhas().find((l) => filtros.every(([c, v]) => l[c] === v)) ?? null;
        return { data: alvo, error: null };
      },
    };
    return q;
  }
  return { from: builder } as unknown as SupabaseClient;
}

function req(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const contexto = (id = CONV_A) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  drafts = [];
  inserts = 0;
  vi.mocked(requireSupportWrite).mockResolvedValue(
    null as unknown as Awaited<ReturnType<typeof requireSupportWrite>>,
  );
  vi.mocked(tetoDeEscritaDoToken).mockResolvedValue(null);
  vi.mocked(resolveAuthDual).mockResolvedValue({
    ok: true,
    organizationId: ORG_A,
    actor: { type: "user", id: USER },
    supabase: clienteFake([{ id: CONV_A, organization_id: ORG_A }]),
    idioma: "pt-BR",
    via: "token",
    apiTokenId: "token-1",
  } as unknown as Awaited<ReturnType<typeof resolveAuthDual>>);
});

describe("POST /api/v1/conversations/[id]/drafts", () => {
  it("devolve 201 com draft_id e URL, e audita a criação", async () => {
    const resposta = await POST(
      req(`/api/v1/conversations/${CONV_A}/drafts`, {
        texto: "Sua cobrança venceu hoje.",
        origem: "erp",
      }),
      contexto(),
    );

    expect(resposta.status).toBe(201);
    const corpo = (await resposta.json()) as { data: { draft_id: string; url: string } };
    expect(corpo.data.draft_id).toBe("00000000-0000-4000-8000-000000000020");
    expect(corpo.data.url).toBe(`/app/inbox?id=${CONV_A}&rascunho=${corpo.data.draft_id}`);
    expect(drafts[0]).toMatchObject({ organization_id: ORG_A, source: "erp" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "conversation.draft_created",
        organizationId: ORG_A,
        resourceId: CONV_A,
        actorApiTokenId: "token-1",
      }),
    );
  });

  it("404 quando a conversa é de OUTRA organização — e nada é gravado", async () => {
    vi.mocked(resolveAuthDual).mockResolvedValue({
      ok: true,
      organizationId: ORG_A,
      actor: { type: "user", id: USER },
      supabase: clienteFake([{ id: CONV_B, organization_id: ORG_B }]),
      idioma: "pt-BR",
      via: "token",
      apiTokenId: "token-1",
    } as unknown as Awaited<ReturnType<typeof resolveAuthDual>>);

    const resposta = await POST(
      req(`/api/v1/conversations/${CONV_B}/drafts`, { texto: "oi", origem: "erp" }),
      contexto(CONV_B),
    );

    expect(resposta.status).toBe(404);
    expect(inserts).toBe(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("422 acima do teto de 4096 caracteres, sem tocar o banco", async () => {
    const resposta = await POST(
      req(`/api/v1/conversations/${CONV_A}/drafts`, {
        texto: "x".repeat(4097),
        origem: "erp",
      }),
      contexto(),
    );

    expect(resposta.status).toBe(422);
    expect(inserts).toBe(0);
  });

  it("403 quando a identidade é negada — nem banco, nem auditoria", async () => {
    vi.mocked(resolveAuthDual).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "Acesso negado.", 403),
    });

    const resposta = await POST(
      req(`/api/v1/conversations/${CONV_A}/drafts`, { texto: "oi", origem: "erp" }),
      contexto(),
    );

    expect(resposta.status).toBe(403);
    expect(inserts).toBe(0);
    expect(audit).not.toHaveBeenCalled();
  });

  it("429 quando o teto de escrita por token recusa", async () => {
    vi.mocked(tetoDeEscritaDoToken).mockResolvedValue(
      fail("rate_limited", "Too many requests.", 429),
    );

    const resposta = await POST(
      req(`/api/v1/conversations/${CONV_A}/drafts`, { texto: "oi", origem: "erp" }),
      contexto(),
    );

    expect(resposta.status).toBe(429);
    expect(inserts).toBe(0);
    expect(audit).not.toHaveBeenCalled();
    expect(tetoDeEscritaDoToken).toHaveBeenCalledWith(expect.anything(), "drafts", expect.any(String));
  });

  it("422 quando a conversa não é UUID", async () => {
    const resposta = await POST(
      req(`/api/v1/conversations/conversa-invalida/drafts`, { texto: "oi", origem: "erp" }),
      contexto("conversa-invalida"),
    );

    expect(resposta.status).toBe(422);
    expect(inserts).toBe(0);
  });
});
