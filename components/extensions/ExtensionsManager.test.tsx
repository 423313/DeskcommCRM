import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import type { ExtensionListView, ExtensionOperationView } from "@/lib/extensions/view";

import { ExtensionsManager } from "./ExtensionsManager";
import { persistPendingReceipt, readPendingReceipts, type PendingReceipt } from "./receipt-storage";

const { router, toast } = vi.hoisted(() => ({
  router: { refresh: vi.fn() },
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast }));

const ACTOR = "00000000-0000-4000-8000-000000000010";
const ORG_A = "00000000-0000-4000-8000-000000000001";
const ORG_B = "00000000-0000-4000-8000-000000000002";
const INSTALLATION = "00000000-0000-4000-8000-000000000003";
const RECEIPT: PendingReceipt = {
  id: "00000000-0000-4000-8000-000000000004",
  kind: "install",
  label: "equipe-exemplo/rotina-comercial@1.0.0",
  targetKey: "install:catalog:equipe-exemplo:rotina-comercial:1.0.0",
  createdAt: "2026-09-15T00:00:00.000Z",
};

function list(
  organizationId = ORG_A,
  overrides: Partial<ExtensionListView> = {},
): ExtensionListView {
  return {
    organization_id: organizationId,
    can_manage: true,
    can_install: true,
    catalogs: [],
    installations: [
      {
        id: INSTALLATION,
        origin: "https://extensions.example/catalog.json",
        publisher: "equipe-exemplo",
        name: "rotina-comercial",
        version: "1.0.0",
        display: {
          title: { "pt-BR": "Rotina comercial" },
          summary: { "pt-BR": "Organiza o trabalho." },
          category: "sales",
          icon: "ListChecks",
        },
        permissions: ["navigation.tasks"],
        enabled: false,
        revision: 1,
        configuration: { density: "comfortable", show_description: true },
        compatible: true,
        compatibility_reason: null,
      },
    ],
    operations: [],
    ...overrides,
  };
}

function operation({
  id = RECEIPT.id,
  organizationId = ORG_A,
  kind = "install",
}: {
  id?: string;
  organizationId?: string | null;
  kind?: ExtensionOperationView["kind"];
} = {}): ExtensionOperationView {
  return {
    id,
    organization_id: organizationId,
    kind,
    status: "completed",
    catalog_id: null,
    installation_id: INSTALLATION,
    publisher: "equipe-exemplo",
    name: "rotina-comercial",
    version: "1.0.0",
    error_code: null,
    error_message: null,
    created_at: "2026-09-15T00:00:00.000Z",
    updated_at: "2026-09-15T00:01:00.000Z",
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderManager() {
  return render(
    <IdiomaProvider locale="pt-BR">
      <ExtensionsManager organizationId={ORG_A} actorId={ACTOR} />
    </IdiomaProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  router.refresh.mockReset();
  toast.error.mockReset();
  toast.info.mockReset();
  toast.success.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ExtensionsManager", () => {
  it("envia a organização apresentada como precondição da leitura e configuração", async () => {
    let configurationReceipt: ExtensionOperationView | null = null;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        const id = new Headers(init?.headers).get("Idempotency-Key")!;
        configurationReceipt = operation({ id, kind: "configure" });
        return Promise.resolve(json({ data: configurationReceipt }));
      })
      .mockImplementationOnce(() =>
        Promise.resolve(json({ data: list(ORG_A, { operations: [configurationReceipt!] }) })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("switch", { name: "Ativa no CRM" }));
    await user.click(screen.getByTestId(`extension-save-${INSTALLATION}`));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const listHeaders = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    const configHeaders = new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers);
    expect(listHeaders.get("X-Expected-Organization-Id")).toBe(ORG_A);
    expect(configHeaders.get("X-Expected-Organization-Id")).toBe(ORG_A);
    expect(await screen.findByText("Configuração salva.")).toBeVisible();
    expect(toast.success).not.toHaveBeenCalledWith("Configuração salva.");
  });

  it.each([
    [
      "sem organization_id",
      (id: string) => {
        const { organization_id: _, ...missing } = operation({ id, kind: "configure" });
        return missing;
      },
    ],
    [
      "com organização diferente",
      (id: string) => operation({ id, kind: "configure", organizationId: ORG_B }),
    ],
  ])("preserva o recibo e não anuncia configuração %s", async (_case, response) => {
    let receiptId = "";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockImplementationOnce((_input: RequestInfo | URL, init?: RequestInit) => {
        receiptId = new Headers(init?.headers).get("Idempotency-Key")!;
        return Promise.resolve(json({ data: response(receiptId) }));
      })
      .mockResolvedValue(json({ data: list() }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    renderManager();

    await user.click(await screen.findByRole("switch", { name: "Ativa no CRM" }));
    await user.click(screen.getByTestId(`extension-save-${INSTALLATION}`));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(screen.queryByText("Configuração salva.")).toBeNull();
    expect(readPendingReceipts(window.localStorage, ACTOR, ORG_A)).toEqual([
      expect.objectContaining({ id: receiptId, kind: "configure" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("invalida o snapshot quando outra organização aparece e remove as ações", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockResolvedValueOnce(json({ data: list(ORG_B) }));
    vi.stubGlobal("fetch", fetchMock);
    renderManager();
    await screen.findByTestId(`extension-installed-${INSTALLATION}`);

    fireEvent(window, new Event("focus"));

    expect(await screen.findByTestId("extensions-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId(`extension-installed-${INSTALLATION}`)).toBeNull();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("não apresenta falha inicial como lista vazia", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json({ error: { code: "upstream_unavailable", message: "Serviço indisponível." } }, 503),
        ),
    );
    renderManager();

    expect(await screen.findByTestId("extensions-unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma extensão instalada")).toBeNull();
    expect(screen.queryByText("Nenhum catálogo revisado disponível")).toBeNull();
  });

  it("marca snapshot anterior como desatualizado e bloqueia mutações", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockResolvedValueOnce(
        json({ error: { code: "upstream_unavailable", message: "Serviço indisponível." } }, 503),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderManager();
    await screen.findByTestId(`extension-save-${INSTALLATION}`);

    fireEvent(window, new Event("focus"));

    expect(await screen.findByTestId("extensions-stale")).toBeInTheDocument();
    expect(screen.getByTestId(`extension-save-${INSTALLATION}`)).toBeDisabled();
    expect(screen.getByTestId(`extension-installed-${INSTALLATION}`)).toBeInTheDocument();
  });

  it("recusa catálogo acima de 512 KiB antes de ler o arquivo", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: list() })));
    renderManager();
    const input = await screen.findByTestId("extension-catalog-file");
    const file = new File([new Uint8Array(512 * 1024 + 1)], "grande.json", {
      type: "application/json",
    });
    const arrayBuffer = vi.fn();
    Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });

    await userEvent.upload(input, file);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O arquivo pode ter até 512 KiB. Escolha um arquivo menor.",
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("explica falha de leitura do catálogo sem iniciar a admissão", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: list() }));
    vi.stubGlobal("fetch", fetchMock);
    renderManager();
    const input = await screen.findByTestId("extension-catalog-file");
    const file = new File(["{}"], "catalogo.json", { type: "application/json" });
    Object.defineProperty(file, "arrayBuffer", {
      value: vi.fn().mockRejectedValue(new DOMException("unreadable", "NotReadableError")),
    });

    await userEvent.upload(input, file);
    await userEvent.click(screen.getByTestId("extension-catalog-submit"));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível ler este arquivo. Escolha o catálogo novamente e tente outra vez.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("não inicia mutação quando o recibo não pode ser persistido", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: list() }));
    vi.stubGlobal("fetch", fetchMock);
    renderManager();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("switch", { name: "Ativa no CRM" }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    await user.click(screen.getByTestId(`extension-save-${INSTALLATION}`));

    expect(await screen.findByText("Os pedidos estão bloqueados neste navegador")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conserva recibo diante de 404 HTML", async () => {
    persistPendingReceipt(window.localStorage, ACTOR, ORG_A, RECEIPT);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockResolvedValueOnce(new Response("<html>proxy</html>", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    renderManager();

    await userEvent.click(await screen.findByText("Verificar recibo"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const operationHeaders = new Headers((fetchMock.mock.calls[1]?.[1] as RequestInit).headers);
    expect(operationHeaders.get("X-Expected-Organization-Id")).toBe(ORG_A);
    expect(readPendingReceipts(window.localStorage, ACTOR, ORG_A)).toEqual([RECEIPT]);
  });

  it.each([
    [
      "sem organization_id",
      () => {
        const { organization_id: _, ...missing } = operation();
        return missing;
      },
    ],
    ["com organização diferente", () => operation({ organizationId: ORG_B })],
    ["com UUID diferente", () => operation({ id: "00000000-0000-4000-8000-000000000099" })],
  ])("conserva recibo quando o GET retorna DTO %s", async (_case, response) => {
    persistPendingReceipt(window.localStorage, ACTOR, ORG_A, RECEIPT);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockResolvedValueOnce(json({ data: response() }));
    vi.stubGlobal("fetch", fetchMock);
    renderManager();

    await userEvent.click(await screen.findByText("Verificar recibo"));

    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(readPendingReceipts(window.localStorage, ACTOR, ORG_A)).toEqual([RECEIPT]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sincroniza recibo criado por outra aba", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ data: list() })));
    renderManager();
    await screen.findByTestId(`extension-installed-${INSTALLATION}`);

    persistPendingReceipt(window.localStorage, ACTOR, ORG_A, RECEIPT);
    const key = window.localStorage.key(0);
    fireEvent(window, new StorageEvent("storage", { key }));

    expect(await screen.findByTestId(`extension-local-receipt-${RECEIPT.id}`)).toBeVisible();
  });

  it("remove recibo somente no 404 canônico", async () => {
    persistPendingReceipt(window.localStorage, ACTOR, ORG_A, RECEIPT);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockResolvedValueOnce(
        json(
          {
            error: {
              code: "extension_operation_not_found",
              message: "Pedido não encontrado. Consulte o histórico da instalação.",
            },
          },
          404,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderManager();

    await userEvent.click(await screen.findByText("Verificar recibo"));

    await waitFor(() => expect(readPendingReceipts(window.localStorage, ACTOR, ORG_A)).toEqual([]));
  });

  it("remove recibo confirmado mesmo fora da janela da lista", async () => {
    persistPendingReceipt(window.localStorage, ACTOR, ORG_A, RECEIPT);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json({ data: list() }))
      .mockResolvedValueOnce(json({ data: operation() }))
      .mockResolvedValueOnce(json({ data: list() }));
    vi.stubGlobal("fetch", fetchMock);
    renderManager();

    await userEvent.click(await screen.findByText("Verificar recibo"));

    await waitFor(() => expect(readPendingReceipts(window.localStorage, ACTOR, ORG_A)).toEqual([]));
  });
});
