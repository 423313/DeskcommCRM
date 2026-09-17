import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * O CRON DE DEVOLUÇÃO NÃO TEM REGRA PRÓPRIA: ele lê quem venceu e chama a
 * MESMA função do botão da tela. E, como todo cron daqui, só deixa rastro de
 * rodada quando fez alguma coisa.
 *
 * O que se prova, nas duas direções:
 *   - conversa vencida, sessão com agente → `devolverAtendimentoAoAgente` é
 *     chamada com a origem automática e o prazo, e a rodada audita;
 *   - nada vencido → zero chamadas, zero linhas de auditoria;
 *   - sem o segredo → 403 e nenhum acesso ao banco.
 */

const SEGREDO = "segredo-do-cron";
const ORG = "22222222-2222-4222-8222-222222222222";
const SESSAO = "33333333-3333-4333-8333-333333333333";
const VENCIDA = "44444444-4444-4444-8444-444444444444";
const RECENTE = "55555555-5555-4555-8555-555555555555";

const min = (n: number) => new Date(Date.now() - n * 60_000).toISOString();

const devolver = vi.fn();
const auditar = vi.fn();
let acessosAoBanco = 0;

interface Banco {
  organizations: Array<{ id: string; settings: unknown }>;
  conversations: Array<Record<string, unknown>>;
  ai_agents: Array<Record<string, unknown>>;
  ai_routers: Array<Record<string, unknown>>;
}
let banco: Banco;

// `vi.mock` é içado acima das constantes: o segredo vai literal aqui e em `SEGREDO`.
vi.mock("@/lib/env", () => ({ env: { INTERNAL_CRON_SECRET: "segredo-do-cron", INTERNAL_SECRET: "" } }));
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => auditar(...a) }));
vi.mock("@/lib/escalacao/retomada", () => ({
  devolverAtendimentoAoAgente: (...a: unknown[]) => devolver(...a),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (tabela: keyof Banco) => {
      acessosAoBanco++;
      // O filtro fino (`.or`, `.in`) é do PostgREST; aqui o banco devolve a
      // tabela inteira e quem tem de escolher é a regra pura — é ela que o
      // teste vigia.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: () => chain,
        not: () => chain,
        in: () => chain,
        is: () => chain,
        eq: () => chain,
        or: () => chain,
        limit: () => Promise.resolve({ data: banco[tabela], error: null }),
        then: (res: (v: unknown) => unknown) =>
          Promise.resolve({ data: banco[tabela], error: null }).then(res),
      };
      return chain;
    },
  }),
}));

import { GET } from "@/app/api/v1/cron/handoff-devolucao/route";

function chamar(segredo = SEGREDO): Promise<Response> {
  return GET(
    new NextRequest("http://local/api/v1/cron/handoff-devolucao", {
      headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
    }),
  );
}

function conversa(id: string, minutosParada: number): Record<string, unknown> {
  return {
    id,
    organization_id: ORG,
    channel_session_id: SESSAO,
    status: "pending",
    assignee_kind: "user",
    assigned_to_user_id: null,
    assigned_at: null,
    bot_silenced_until: "infinity",
    last_handoff_at: min(minutosParada),
    last_outbound_at: null,
    status_changed_at: min(minutosParada),
  };
}

beforeEach(() => {
  devolver.mockReset();
  auditar.mockReset();
  acessosAoBanco = 0;
  devolver.mockResolvedValue({ ok: true, conversationId: VENCIDA, jaEstavaComOAgente: false });
  banco = {
    organizations: [{ id: ORG, settings: { routing: { handoff_return_after_minutes: 60 } } }],
    conversations: [conversa(VENCIDA, 61), conversa(RECENTE, 20)],
    ai_agents: [
      {
        organization_id: ORG,
        published_version_id: "v",
        ai_agent_versions: { channel_session_id: SESSAO, status: "published" },
      },
    ],
    ai_routers: [],
  };
});

describe("GET /api/v1/cron/handoff-devolucao", () => {
  it("sem o segredo: 403, e o banco nem é aberto", async () => {
    const res = await chamar("");
    expect(res.status).toBe(403);
    expect(acessosAoBanco).toBe(0);
    expect(devolver).not.toHaveBeenCalled();
  });

  it("devolve SÓ a vencida, pela função compartilhada, com a origem automática — e audita a rodada", async () => {
    const res = await chamar();
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { data: Record<string, number> };
    expect(corpo.data).toEqual({ organizacoes: 1, examinadas: 2, devolvidas: 1, falhas: 0 });

    expect(devolver).toHaveBeenCalledTimes(1);
    const [deps, input] = devolver.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(deps.organizationId).toBe(ORG);
    expect(deps.actor).toEqual({ type: "webhook_source", id: "cron:handoff-devolucao" });
    expect(input).toEqual({ conversationId: VENCIDA, origem: { automatica: { minutos: 60 } } });

    expect(auditar).toHaveBeenCalledTimes(1);
    expect(auditar.mock.calls[0]?.[0]).toMatchObject({
      action: "conversation.handoff_auto_return_run",
      metadata: { devolvidas: 1 },
    });
  });

  it("nada vencido: nenhuma devolução e nenhuma linha de auditoria", async () => {
    banco.conversations = [conversa(RECENTE, 20)];
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(devolver).not.toHaveBeenCalled();
    expect(auditar).not.toHaveBeenCalled();
  });

  it("organização sem o prazo: nem lê as conversas (IA-06 de sempre)", async () => {
    banco.organizations = [{ id: ORG, settings: { routing: {} } }];
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { data: Record<string, number> }).data.organizacoes).toBe(0);
    expect(devolver).not.toHaveBeenCalled();
    expect(auditar).not.toHaveBeenCalled();
  });

  it("sessão sem agente publicado nem roteador: a vencida fica com a pessoa", async () => {
    banco.ai_agents = [];
    await chamar();
    expect(devolver).not.toHaveBeenCalled();
  });

  it("alguém assumiu no meio (assignment_conflict) não é falha: a pessoa ganhou", async () => {
    devolver.mockResolvedValue({ ok: false, erro: "assignment_conflict" });
    const corpo = (await (await chamar()).json()) as { data: Record<string, number> };
    expect(corpo.data).toMatchObject({ devolvidas: 0, falhas: 0 });
    expect(auditar).not.toHaveBeenCalled();
  });
});
