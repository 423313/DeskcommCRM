import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { InboxKeyboardShortcuts } from "./InboxKeyboardShortcuts";

/**
 * O atalho "e" chamava `window.confirm()` direto — mesmo defeito do botão
 * "Fechar" de `ConversationHeader`: bloqueado em iframe, ignora o tema, não
 * passa por `t()`. Agora usa o mesmo `AlertDialog` do resto do produto.
 */

function renderAtalhos(
  overrides: Partial<React.ComponentProps<typeof InboxKeyboardShortcuts>> = {},
) {
  const onClose = vi.fn();
  const props: React.ComponentProps<typeof InboxKeyboardShortcuts> = {
    visibleIds: ["c1"],
    selectedId: "c1",
    onSelect: vi.fn(),
    onFocusReply: vi.fn(),
    onClaim: vi.fn(),
    onClose,
    onToggleHelp: vi.fn(),
    ...overrides,
  };
  render(<InboxKeyboardShortcuts {...props} />);
  return { onClose };
}

describe("atalho de teclado 'e' — fechar conversa", () => {
  it("apertar 'e' abre a confirmação e só fecha no clique de dentro dela", async () => {
    const user = userEvent.setup();
    const { onClose } = renderAtalhos();

    await user.keyboard("e");

    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Fechar conversa?")).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(within(dialogo).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("e");
    const dialogo2 = await screen.findByRole("alertdialog");
    await user.click(within(dialogo2).getByRole("button", { name: "Fechar" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("com os atalhos desligados, 'e' não abre confirmação nenhuma", async () => {
    const user = userEvent.setup();
    renderAtalhos({ enabled: false });

    await user.keyboard("e");

    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
