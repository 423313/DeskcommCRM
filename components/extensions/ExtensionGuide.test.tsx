import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import type { ExtensionGuideView } from "@/lib/extensions/view";

import { ExtensionGuide } from "./ExtensionGuide";

const { router } = vi.hoisted(() => ({ router: { push: vi.fn(), refresh: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const GUIDE: ExtensionGuideView = {
  organization_id: "00000000-0000-4000-8000-000000000001",
  installation_id: "00000000-0000-4000-8000-000000000002",
  version: "1.0.0",
  revision: 7,
  configuration: { density: "comfortable", show_description: true },
  manifest: {
    format_version: 1,
    profile: "declarative",
    publisher: "equipe-exemplo",
    name: "rotina-comercial",
    version: "1.0.0",
    license: "MIT",
    host_api: { min: 1, max: 1 },
    permissions: ["navigation.tasks"],
    dependencies: [],
    data: { mode: "none" },
    display: {
      title: { "pt-BR": "Rotina comercial" },
      summary: { "pt-BR": "Próximos passos para o time." },
      category: "sales",
      icon: "ListChecks",
    },
    configuration: { density: "comfortable", show_description: true },
    contributions: {
      crm_cards: [
        {
          id: "prioridades",
          title: { "pt-BR": "Prioridades do dia" },
          description: { "pt-BR": "Confira o que precisa de atenção." },
          icon: "Lightbulb",
          blocks: [
            {
              heading: { "pt-BR": "Primeiro passo" },
              body: { "pt-BR": "Revise os compromissos em aberto." },
            },
          ],
          action: { label: { "pt-BR": "Abrir tarefas" }, capability: "tasks.open" },
        },
      ],
    },
  },
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ExtensionGuide", () => {
  it("só abre Tarefas depois que o servidor revalida estado e revisão", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: GUIDE }))
      .mockResolvedValueOnce(json({ data: { href: "/app/tasks" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <IdiomaProvider locale="pt-BR">
        <ExtensionGuide
          organizationId={GUIDE.organization_id}
          installationId={GUIDE.installation_id}
        />
      </IdiomaProvider>,
    );

    const action = await screen.findByRole("button", { name: "Abrir tarefas" });
    expect(screen.queryByRole("link", { name: "Abrir tarefas" })).toBeNull();
    await user.click(action);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/app/tasks"));
    const [, guideInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(new Headers(guideInit.headers).get("X-Expected-Organization-Id")).toBe(
      GUIDE.organization_id,
    );
    expect(new Headers(init.headers).get("X-Expected-Organization-Id")).toBe(GUIDE.organization_id);
    expect(JSON.parse(String(init.body))).toEqual({
      capability: "tasks.open",
      expected_revision: 7,
    });
  });

  it("mantém a pessoa no guia quando a revalidação recusa a ação", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: GUIDE }))
      .mockResolvedValueOnce(
        json(
          {
            error: {
              code: "extension_inactive",
              message: "Esta extensão está desativada nesta organização.",
            },
          },
          404,
        ),
      )
      .mockResolvedValueOnce(
        json(
          {
            error: {
              code: "extension_inactive",
              message: "Esta extensão está desativada nesta organização.",
            },
          },
          404,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(
      <IdiomaProvider locale="pt-BR">
        <ExtensionGuide
          organizationId={GUIDE.organization_id}
          installationId={GUIDE.installation_id}
        />
      </IdiomaProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "Abrir tarefas" }));

    expect(
      await screen.findByRole("heading", { name: "Este guia não está disponível" }),
    ).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(
      screen.getByText("Volte à gestão para conferir se ela está ativa e qual é o próximo passo."),
    ).toBeInTheDocument();
  });

  it("separa o loading do erro definitivo e invalida outro contexto", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json(
          {
            error: {
              code: "extension_context_changed",
              message:
                "A organização ativa mudou em outra aba. Recarregue a página antes de continuar.",
            },
          },
          409,
        ),
      ),
    );

    render(
      <IdiomaProvider locale="pt-BR">
        <ExtensionGuide
          organizationId={GUIDE.organization_id}
          installationId={GUIDE.installation_id}
        />
      </IdiomaProvider>,
    );

    expect(screen.getByTestId("extension-guide-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("extension-guide-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("extension-guide-loading")).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });
});
