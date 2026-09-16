import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));

import { ProspectingClient } from "@/app/app/prospecting/_client";
import { ApiError } from "@/lib/api/types";

const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const OTHER_CAMPAIGN = "11111111-1111-4111-8111-111111111112";
const CHANNEL = "22222222-2222-4222-8222-222222222222";
const PIPELINE = "33333333-3333-4333-8333-333333333333";
const STAGE = "44444444-4444-4444-8444-444444444444";
const QUALIFIED = "44444444-4444-4444-8444-444444444445";
const AGENT = "55555555-5555-4555-8555-555555555555";
const NEW_AGENT = "55555555-5555-4555-8555-555555555556";
const CONFIG = {
  agent_id: AGENT,
  channel_session_id: CHANNEL,
  pipeline_id: PIPELINE,
  stage_id: STAGE,
  qualified_stage_id: QUALIFIED,
  instruction: "Oferecer uma avaliação comercial.",
  qualification: "Confirmou a necessidade e quer conversar.",
  daily_limit: 10,
  interval_minutes: 15,
  legal_basis_ref: "Avaliação real registrada pelo operador",
};
function fixture() {
  const campaigns = [
    {
      id: CAMPAIGN,
      name: "Clínicas de estética",
      status: "draft",
      search_status: "succeeded",
      error: null,
      config: null as typeof CONFIG | null,
      result_count: 1,
      skipped_count: 0,
      cost_usd: "0.10",
      next_send_at: "2026-09-16T00:00:00Z",
    },
    {
      id: OTHER_CAMPAIGN,
      name: "Escritórios de contabilidade",
      status: "draft",
      search_status: "succeeded",
      error: null,
      config: null as typeof CONFIG | null,
      result_count: 1,
      skipped_count: 0,
      cost_usd: "0.10",
      next_send_at: "2026-09-16T00:00:00Z",
    },
  ];
  return {
    configured: true,
    campaigns,
    candidates: campaigns.map((campaign, index) => ({
      id: `candidate-${index}`,
      campaign_id: campaign.id,
      progress: "new",
      message_status: null,
      error: null,
      conversation_id: null,
      data: {
        name: "Empresa de teste",
        category: "Serviços",
        phone: null,
        address: null,
        website: null,
        rating: null,
        reviews: 0,
        emails: [],
        socials: [],
      },
    })),
    agents: [{ id: AGENT, name: "Agente existente" }],
    channels: [{ id: CHANNEL, display_name: "Comercial", phone_number: null, status: "WORKING" }],
    stages: [
      { id: STAGE, name: "Novos", pipeline_id: PIPELINE, pipeline_name: "Comercial" },
      { id: QUALIFIED, name: "Qualificados", pipeline_id: PIPELINE, pipeline_name: "Comercial" },
    ],
  };
}
let state: ReturnType<typeof fixture>;
function openPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProspectingClient />
    </QueryClientProvider>,
  );
}
async function openCreation() {
  fireEvent.click(await screen.findByRole("button", { name: "Criar agente para esta campanha" }));
  return screen.findByRole("dialog");
}
const CHAT = "/api/v1/prospecting/agents/chat";
const CREATE = "/api/v1/prospecting/agents";
function proposal(overrides = {}) {
  return {
    data: {
      message: "Preparei as instruções. Confira o resumo e crie quando estiver pronto.",
      draft: {
        name: "Clara",
        tone: "cordial",
        instruction: CONFIG.instruction,
        qualification: CONFIG.qualification,
        channel_session_id: CHANNEL,
        pipeline_id: PIPELINE,
        stage_id: STAGE,
        qualified_stage_id: QUALIFIED,
      },
      ready: true,
      choices: [],
      model_label: "IA configurada",
      needs_continuity: false,
      ...overrides,
    },
  };
}
function created() {
  return {
    data: {
      agent: { id: NEW_AGENT, name: "Clara" },
      version_id: "version-1",
      model_label: "IA configurada",
    },
  };
}
async function say(content: string) {
  fireEvent.change(screen.getByLabelText("Mensagem para configurar o agente"), {
    target: { value: content },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar mensagem" }));
}
beforeEach(() => {
  vi.clearAllMocks();
  state = fixture();
  api.get.mockImplementation(async () => ({ data: state }));
});

describe("criação conversacional do agente", () => {
  it("conversa, pede continuidade explícita, cria pelo resumo e seleciona sem iniciar campanha", async () => {
    api.post.mockImplementation(async (url) =>
      url === CHAT ? proposal({ needs_continuity: true }) : created(),
    );
    openPage();
    fireEvent.change(await screen.findByLabelText("O que a IA deve oferecer e como iniciar"), {
      target: { value: CONFIG.instruction },
    });
    await openCreation();
    await say("Quero ajudar clínicas a vender mais e descobrir se precisam de automação.");
    const create = await screen.findByRole("button", { name: "Criar e usar agente" });
    expect(create).toBeDisabled();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0]![1].draft).toMatchObject({ instruction: CONFIG.instruction });
    expect(api.post.mock.calls[0]![1].draft).not.toHaveProperty("channel_session_id");
    fireEvent.click(screen.getByRole("checkbox", { name: /Manter a continuidade/ }));
    fireEvent.click(create);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Agente de IA")).toHaveValue(NEW_AGENT);
    expect(screen.getByLabelText("Conexão de saída")).toHaveValue(CHANNEL);
    expect(screen.getByLabelText("Etapa de qualificados")).toHaveValue(QUALIFIED);
    expect(screen.getByLabelText("O que a IA deve oferecer e como iniciar")).toHaveValue(
      CONFIG.instruction,
    );
    expect(screen.getByRole("link", { name: "Configurações avançadas do agente" })).toHaveAttribute(
      "href",
      `/app/ai/agents/${NEW_AGENT}`,
    );
    const setup = api.post.mock.calls.find(([url]) => url === CREATE)![1];
    expect(setup).toMatchObject({
      campaign_id: CAMPAIGN,
      enable_router_continuity: true,
      name: "Clara",
    });
    expect(api.post.mock.calls.some(([, body]) => body.action === "start")).toBe(false);
  });

  it("falha ao ajustar invalida o resumo anterior e repete a mensagem sem duplicá-la", async () => {
    api.post
      .mockResolvedValueOnce(proposal())
      .mockRejectedValueOnce(new Error("A IA demorou para responder."))
      .mockResolvedValueOnce(proposal());
    openPage();
    await openCreation();
    await say("Criar um agente para oferecer avaliação comercial");
    await screen.findByRole("button", { name: "Criar e usar agente" });
    await say("Mude para um atendimento curto e direto.");
    await screen.findByText("A IA demorou para responder.");
    expect(screen.queryByRole("button", { name: "Criar e usar agente" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem para configurar o agente")).toHaveValue(
      "Mude para um atendimento curto e direto.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("button", { name: "Criar e usar agente" });
    expect(api.post.mock.calls[1]![1]).toEqual(api.post.mock.calls[2]![1]);
    expect(
      within(screen.getByRole("log")).getAllByText("Mude para um atendimento curto e direto."),
    ).toHaveLength(1);
  });

  it("mantém conversa e mensagem escrita ao fechar e alternar campanhas", async () => {
    api.post.mockResolvedValue(proposal());
    openPage();
    await openCreation();
    await say("Quero vender para clínicas.");
    await screen.findByRole("button", { name: "Criar e usar agente" });
    fireEvent.change(screen.getByLabelText("Mensagem para configurar o agente"), {
      target: { value: "Quero ajustar a qualificação" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Voltar à campanha" }));
    fireEvent.click(screen.getByRole("button", { name: /Escritórios de contabilidade/ }));
    await openCreation();
    expect(screen.getByLabelText("Mensagem para configurar o agente")).toHaveValue("");
    expect(screen.queryByText("Quero vender para clínicas.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Voltar à campanha" }));
    fireEvent.click(screen.getByRole("button", { name: /Clínicas de estética/ }));
    await openCreation();
    expect(screen.getByLabelText("Mensagem para configurar o agente")).toHaveValue(
      "Quero ajustar a qualificação",
    );
    expect(
      within(screen.getByRole("log")).getByText("Quero vender para clínicas."),
    ).toBeInTheDocument();
  });

  it("resposta perdida trava mudanças e recupera a criação com o mesmo identificador", async () => {
    api.post
      .mockResolvedValueOnce(proposal())
      .mockRejectedValueOnce(new Error("Conexão interrompida."))
      .mockResolvedValueOnce(created());
    openPage();
    await openCreation();
    await say("Criar um agente comercial para as empresas encontradas.");
    fireEvent.click(await screen.findByRole("button", { name: "Criar e usar agente" }));
    await screen.findByText("Conexão interrompida.");
    expect(screen.getByLabelText("Mensagem para configurar o agente")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Voltar à campanha" }));
    await openCreation();
    fireEvent.click(screen.getByRole("button", { name: "Recuperar criação do agente" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.post.mock.calls[1]![1]).toEqual(api.post.mock.calls[2]![1]);
    expect(api.post.mock.calls[1]![1].request_id).toMatch(/^[\da-f-]{36}$/);
    expect(screen.getByLabelText("Agente de IA")).toHaveValue(NEW_AGENT);
  });

  it("recusa antes da criação permite corrigir por conversa e gera outra solicitação só com alteração", async () => {
    const revised = proposal();
    revised.data.draft.instruction = "Oferecer uma conversa inicial com nossa equipe comercial.";
    api.post
      .mockResolvedValueOnce(proposal())
      .mockRejectedValueOnce(
        new ApiError(422, "validation_failed", undefined, "r1", "Escolha outro canal."),
      )
      .mockResolvedValueOnce(revised)
      .mockResolvedValueOnce(created());
    openPage();
    await openCreation();
    await say("Criar agente comercial");
    fireEvent.click(await screen.findByRole("button", { name: "Criar e usar agente" }));
    await screen.findByText("Escolha outro canal.");
    expect(screen.getByLabelText("Mensagem para configurar o agente")).toBeEnabled();
    await say("Ajuste a oferta para convidar a uma conversa inicial.");
    fireEvent.click(await screen.findByRole("button", { name: "Criar e usar agente" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const calls = api.post.mock.calls.filter(([url]) => url === CREATE);
    expect(calls[0]![1].request_id).not.toEqual(calls[1]![1].request_id);
  });

  it("opções sugeridas respondem pelo chat e não criam o agente", async () => {
    api.post
      .mockResolvedValueOnce(
        proposal({
          ready: false,
          choices: [{ label: "Usar o Comercial", value: "Quero o canal Comercial" }],
        }),
      )
      .mockResolvedValueOnce(proposal());
    openPage();
    await openCreation();
    await say("Quero um agente para qualificar clínicas.");
    fireEvent.click(await screen.findByRole("button", { name: "Usar o Comercial" }));
    await screen.findByRole("button", { name: "Criar e usar agente" });
    expect(api.post.mock.calls[1]![0]).toBe(CHAT);
    expect(api.post.mock.calls[1]![1].messages.at(-1)).toEqual({
      role: "user",
      content: "Quero o canal Comercial",
    });
    expect(api.post.mock.calls.some(([url]) => url === CREATE)).toBe(false);
  });

  it("renderiza opções homônimas sem colidir as chaves dos botões", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      api.post
        .mockResolvedValueOnce(
          proposal({
            ready: false,
            choices: [
              { label: "Conexão QA sem envio", value: "Usar Conexão QA sem envio" },
              { label: "Conexão QA sem envio", value: "Usar Conexão QA sem envio" },
            ],
          }),
        )
        .mockResolvedValueOnce(proposal());
      openPage();
      await openCreation();
      await say("Quero escolher um canal para o agente.");
      const options = await screen.findAllByRole("button", { name: "Conexão QA sem envio" });
      expect(options).toHaveLength(2);
      expect(errors.mock.calls.flat().join(" ")).not.toMatch(/same key|unique.*key/i);
      fireEvent.click(options[1]!);
      await screen.findByRole("button", { name: "Criar e usar agente" });
      expect(api.post.mock.calls[1]![1].messages.at(-1)).toEqual({
        role: "user",
        content: "Usar Conexão QA sem envio",
      });
    } finally {
      errors.mockRestore();
    }
  });

  it("conversa longa mantém a proposta e envia só o contexto recente dentro do limite", async () => {
    api.post.mockResolvedValue(proposal());
    openPage();
    await openCreation();
    for (let index = 0; index < 14; index++) {
      await say(`Ajuste ${index}: ${"Quero uma conversa comercial objetiva. ".repeat(60)}`);
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Criar e usar agente" })).toBeEnabled(),
      );
    }
    const request = api.post.mock.calls.at(-1)![1];
    expect(request.messages.length).toBeLessThanOrEqual(24);
    expect(
      request.messages.reduce(
        (total: number, message: { content: string }) => total + message.content.length,
        0,
      ),
    ).toBeLessThanOrEqual(24000);
    expect(request.draft.name).toBe("Clara");
    expect(within(screen.getByRole("log")).getByText(/^Ajuste 0:/)).toBeInTheDocument();
  });
});
afterEach(cleanup);

describe("configuração da campanha", () => {
  it("oferece criação mesmo com agentes existentes e não envia campanha ao abrir", async () => {
    openPage();
    await openCreation();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("preserva o que foi escrito em cada campanha sem levar instruções para a outra", async () => {
    openPage();
    await screen.findByRole("button", { name: "Criar agente para esta campanha" });
    const offer = () => screen.getByLabelText("O que a IA deve oferecer e como iniciar");
    fireEvent.change(offer(), { target: { value: "Oferecer avaliação para clínicas" } });
    fireEvent.click(screen.getByRole("button", { name: /Escritórios de contabilidade/ }));
    expect(offer()).toHaveValue("");
    fireEvent.change(offer(), { target: { value: "Oferecer automação para contadores" } });
    fireEvent.click(screen.getByRole("button", { name: /Clínicas de estética/ }));
    expect(offer()).toHaveValue("Oferecer avaliação para clínicas");
    fireEvent.click(screen.getByRole("button", { name: /Escritórios de contabilidade/ }));
    expect(offer()).toHaveValue("Oferecer automação para contadores");
  });

  it("preserva e bloqueia a configuração que já preparou contatos", async () => {
    state.campaigns[0]!.config = CONFIG;
    openPage();
    const select = await screen.findByLabelText("Agente de IA");
    expect(select).toHaveValue(AGENT);
    expect(select).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Criar agente para esta campanha" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("O que a IA deve oferecer e como iniciar")).toHaveValue(
      CONFIG.instruction,
    );
    expect(api.post).not.toHaveBeenCalled();
  });
});
