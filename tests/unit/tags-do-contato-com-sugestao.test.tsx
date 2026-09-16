import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ContactTagsEditor } from "@/components/inbox/ContactTagsEditor";

/**
 * Tags do CONTATO sem sugestão (#852, item 1 da divisão). O editor de tags da
 * conversa já oferecia as tags em uso; o do contato obrigava a digitar do zero,
 * e cada operador criava a sua variação ("google", "gogle", "google ads").
 *
 * Dois lados, porque um sem o outro não resolve:
 *  - a ROTA precisa devolver as tags que existem, só da organização da sessão;
 *  - o EDITOR precisa oferecê-las e gravar a escolhida.
 */

const get = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: { get: (...args: unknown[]) => get(...args), post: vi.fn(), patch: vi.fn() },
}));
const mutate = vi.fn();
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutate, isPending: false }),
}));

const ORG = "org-1";

beforeEach(() => {
  get.mockReset();
  mutate.mockReset();
});

describe("ContactTagsEditor", () => {
  it("oferece as tags existentes que o contato ainda não tem, e clicar grava", async () => {
    get.mockResolvedValue({ data: ["google", "vip"] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ContactTagsEditor contactId="c-1" orgId={ORG} tags={["vip"]} />
      </QueryClientProvider>,
    );

    const sugestao = await screen.findByRole("button", { name: "+ google" });
    expect(screen.queryByRole("button", { name: "+ vip" })).toBeNull();

    await userEvent.click(sugestao);

    expect(mutate).toHaveBeenCalledWith({ tags: ["vip", "google"] });
  });

  /**
   * As duas direções da mesma cegueira: o filtro comparava com sensibilidade a
   * caixa, então bastava a tag estar gravada fora da forma normalizada — de um
   * lado ou do outro — para o chip nunca sumir. Clicar nele gravava a variante
   * minúscula, o contato ficava com as DUAS, e do segundo clique em diante o
   * botão não fazia nada.
   */
  it("tag do vocabulário em caixa mista não vira chip para quem já a tem", async () => {
    get.mockResolvedValue({ data: ["VIP"] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ContactTagsEditor contactId="c-1" orgId={ORG} tags={["vip"]} />
      </QueryClientProvider>,
    );

    await screen.findByLabelText("Adicionar tag ao contato");
    expect(screen.queryByRole("button", { name: /\+ ?VIP/i })).toBeNull();
  });

  it("contato com a tag em caixa mista não recebe o chip da versão minúscula", async () => {
    get.mockResolvedValue({ data: ["vip"] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ContactTagsEditor contactId="c-1" orgId={ORG} tags={["VIP"]} />
      </QueryClientProvider>,
    );

    await screen.findByLabelText("Adicionar tag ao contato");
    expect(screen.queryByRole("button", { name: /\+ ?vip/i })).toBeNull();
  });
});
