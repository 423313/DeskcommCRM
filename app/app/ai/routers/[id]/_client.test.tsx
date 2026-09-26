/**
 * B1 (parte 2) da revisão do #1573: o seletor "Fluxo de atendimento" da
 * intenção aparecia com o módulo DESLIGADO — amarrar a um roteiro que a
 * instalação não roda.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { authMock, flowsMock, testeMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  flowsMock: vi.fn(),
  testeMock: vi.fn(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, data: undefined as unknown })),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: authMock, usePermission: () => true }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/followup/useFollowupFlows", () => ({ useFollowupFlows: flowsMock }));
vi.mock("@/hooks/ai/useRouters", () => {
  const mut = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  return {
    useRouter: () => ({ data: undefined }),
    useUpdateRouter: mut,
    useDeleteRouter: mut,
    useSaveMembers: mut,
    useTestRouter: testeMock,
  };
});

import { RouterEditorClient } from "./_client";

afterEach(cleanup);

function renderizar() {
  return render(
    <RouterEditorClient
      routerId="r1"
      initialState={{
        router: {
          id: "r1",
          name: "Roteador",
          channel_session_id: "s1",
          is_active: true,
          config: {},
          fallback_agent_id: null,
        },
        members: [
          {
            id: "m1",
            agent_id: "a1",
            intent_name: "financiamento",
            intent_description: "quer financiar",
            examples: [],
            position: 0,
            flow_pointer_id: null,
          } as never,
        ],
      }}
      agents={[{ id: "a1", name: "Agente" }]}
      channelSessions={[]}
      classifierModels={[]}
    />,
  );
}

describe("seletor de roteiro na intenção × módulo", () => {
  it("desligado: o seletor não aparece e a lista de roteiros nem é buscada", () => {
    authMock.mockReturnValue({ activeOrg: { modulos_ligados: [] } });
    flowsMock.mockReturnValue({ data: undefined });
    renderizar();
    // Controle positivo: a intenção foi desenhada.
    expect(screen.getByDisplayValue("financiamento")).toBeTruthy();
    expect(screen.queryByTestId("seletor-de-roteiro")).toBeNull();
    expect(flowsMock).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
  });

  it("ligado: o seletor aparece", () => {
    authMock.mockReturnValue({ activeOrg: { modulos_ligados: ["fluxos_atendimento"] } });
    flowsMock.mockReturnValue({ data: [{ id: "f1", name: "Cadastro" }] });
    renderizar();
    expect(screen.getByTestId("seletor-de-roteiro")).toBeTruthy();
  });
});

describe("Testar classificação com o Jev (onda 2 do Jev, bloco 2.2)", () => {
  const RESULTADO = {
    intent_name: "financiamento",
    confidence: 0.82,
    min_confidence: 0.6,
    agent_id: "a1",
    agent_name: "Agente Financiamento",
  };
  const DO_JEV = {
    estado: "observando" as const,
    respondeu: true,
    intent_name: "suporte",
    confidence: 0.91,
    agent_id: "a2",
    agent_name: "Agente Suporte",
    decide: false,
  };

  function comResultado(data: unknown) {
    authMock.mockReturnValue({ activeOrg: { modulos_ligados: [] } });
    flowsMock.mockReturnValue({ data: undefined });
    testeMock.mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, data });
    renderizar();
  }

  it("Jev desligado: a tela é a de sempre, sem o lado dele", () => {
    comResultado({ ...RESULTADO, jev: null });
    expect(screen.getByTestId("teste-agente-que-atenderia").textContent).toBe("Agente Financiamento");
    expect(screen.queryByTestId("teste-com-o-jev")).toBeNull();
  });

  it("observando: as duas escolhas lado a lado, e quem atende é o da sua IA", () => {
    comResultado({ ...RESULTADO, jev: DO_JEV });
    expect(screen.getByTestId("teste-escolha-da-ia").textContent).toContain("Agente Financiamento");
    expect(screen.getByTestId("teste-escolha-da-ia").textContent).toContain("82%");
    expect(screen.getByTestId("teste-escolha-do-jev").textContent).toContain("Agente Suporte");
    expect(screen.getByTestId("teste-escolha-do-jev").textContent).toContain("suporte · 91%");
    expect(screen.getByTestId("teste-agente-que-atenderia").textContent).toBe("Agente Financiamento");
    expect(screen.getByTestId("teste-quem-decide").textContent).toMatch(/só observa/);
  });

  it("decidindo: quem atende é o escolhido pelo Jev", () => {
    comResultado({ ...RESULTADO, jev: { ...DO_JEV, estado: "decidindo", decide: true } });
    expect(screen.getByTestId("teste-agente-que-atenderia").textContent).toBe("Agente Suporte");
    expect(screen.getByTestId("teste-quem-decide").textContent).toMatch(/vale a escolha dele/);
  });

  it("decidindo sem a sua IA (R2): quem atende NÃO é o do Jev", () => {
    comResultado({
      ...RESULTADO,
      intent_name: null,
      confidence: null,
      agent_id: null,
      agent_name: null,
      jev: { ...DO_JEV, estado: "decidindo", decide: false },
    });
    expect(screen.getByTestId("teste-escolha-da-ia").textContent).toContain("não respondeu");
    expect(screen.getByTestId("teste-agente-que-atenderia").textContent).not.toContain("Agente Suporte");
    expect(screen.getByTestId("teste-quem-decide").textContent).toMatch(/nunca só o Jev/);
  });

  it("ligado e sem resposta: o lado dele diz que não respondeu, sem número inventado", () => {
    comResultado({
      ...RESULTADO,
      jev: { ...DO_JEV, respondeu: false, intent_name: null, confidence: null, agent_id: null, agent_name: null },
    });
    expect(screen.getByTestId("teste-escolha-do-jev").textContent).toContain("não respondeu");
    expect(screen.getByTestId("teste-escolha-do-jev").textContent).not.toContain("%");
  });
});
