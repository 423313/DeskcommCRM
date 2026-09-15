/**
 * O INTERRUPTOR "CLIENTES PELA AGENDA" — o que a tela promete antes de ligar.
 *
 * Ligar etiqueta de uma vez todo contato que já teve horário, e desligar depois
 * não tira a etiqueta de ninguém. Por isso a suíte protege, antes de tudo, que
 * LIGAR passa por um diálogo que diz isso — e que cancelar o diálogo não chama
 * a action. O número mostrado depois vem do CORPO da action (o que o banco
 * contou), não de uma releitura.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const definir = vi.fn();
vi.mock("@/app/actions/settings/definirClientePelaAgenda", () => ({
  definirClientePelaAgenda: (...a: unknown[]) => definir(...a),
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { ClientePelaAgenda } from "./ClientePelaAgenda";

const corpo = (ganharam: number, perderam = 0) => ({
  ok: true,
  ligado: true,
  mudou: true,
  ganharam_etiqueta: ganharam,
  perderam_etiqueta: perderam,
  clientes: ganharam,
});

beforeEach(() => {
  definir.mockReset();
});

describe("ClientePelaAgenda", () => {
  it("quem não é admin vê o interruptor desabilitado e a razão", () => {
    render(<ClientePelaAgenda ligadoInicial={false} podeLigar={false} />);
    expect(screen.getByTestId("cliente-pela-agenda-interruptor")).toBeDisabled();
    expect(screen.getByText("Só um administrador pode mudar essa regra.")).toBeInTheDocument();
  });

  it("desligada diz o que acontece desligada", () => {
    render(<ClientePelaAgenda ligadoInicial={false} podeLigar />);
    expect(screen.getByTestId("cliente-pela-agenda-estado")).toHaveTextContent(/^Desligado:/);
  });

  it("ligar abre o diálogo, e cancelar não chama a action", async () => {
    const user = userEvent.setup();
    render(<ClientePelaAgenda ligadoInicial={false} podeLigar />);

    await user.click(screen.getByTestId("cliente-pela-agenda-interruptor"));
    expect(screen.getByText("Ligar clientes pela agenda?")).toBeInTheDocument();
    expect(
      screen.getByText(/Desligar depois não tira a etiqueta de ninguém\./),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(definir).not.toHaveBeenCalled();
    expect(screen.getByTestId("cliente-pela-agenda-interruptor")).toHaveAttribute("aria-checked", "false");
  });

  it("confirmar mostra quantos contatos ganharam a etiqueta, a partir do corpo da action", async () => {
    definir.mockResolvedValue(corpo(3));
    const user = userEvent.setup();
    render(<ClientePelaAgenda ligadoInicial={false} podeLigar />);

    await user.click(screen.getByTestId("cliente-pela-agenda-interruptor"));
    await user.click(screen.getByTestId("cliente-pela-agenda-confirmar"));

    await waitFor(() =>
      expect(screen.getByTestId("cliente-pela-agenda-resultado")).toHaveTextContent(
        "3 contatos ganharam a etiqueta “cliente”.",
      ),
    );
    expect(definir).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("cliente-pela-agenda-interruptor")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("cliente-pela-agenda-estado")).toHaveTextContent(/^Ligado:/);
  });

  it("nenhum contato com horário: diz que quem marcar daqui em diante ganha", async () => {
    definir.mockResolvedValue(corpo(0));
    const user = userEvent.setup();
    render(<ClientePelaAgenda ligadoInicial={false} podeLigar />);

    await user.click(screen.getByTestId("cliente-pela-agenda-interruptor"));
    await user.click(screen.getByTestId("cliente-pela-agenda-confirmar"));

    await waitFor(() =>
      expect(screen.getByTestId("cliente-pela-agenda-resultado")).toHaveTextContent(
        "Nenhum contato tinha horário marcado ainda. Quem marcar daqui em diante ganha a etiqueta.",
      ),
    );
  });

  it("religar diz também quem deixou de ser cliente", async () => {
    definir.mockResolvedValue(corpo(1, 2));
    const user = userEvent.setup();
    render(<ClientePelaAgenda ligadoInicial={false} podeLigar />);

    await user.click(screen.getByTestId("cliente-pela-agenda-interruptor"));
    await user.click(screen.getByTestId("cliente-pela-agenda-confirmar"));

    const resultado = await screen.findByTestId("cliente-pela-agenda-resultado");
    expect(resultado).toHaveTextContent("1 contato ganhou a etiqueta “cliente”.");
    expect(resultado).toHaveTextContent(/^.*2 deixaram de ser clientes:/);
  });

  it("desligar não pede confirmação, e a recusa do banco aparece traduzida", async () => {
    definir.mockResolvedValue({ ok: false, erro: "mfa" });
    const user = userEvent.setup();
    render(<ClientePelaAgenda ligadoInicial podeLigar />);

    await user.click(screen.getByTestId("cliente-pela-agenda-interruptor"));

    expect(definir).toHaveBeenCalledWith(false);
    expect(await screen.findByRole("alert")).toHaveTextContent("Confirme a verificação em duas etapas.");
    expect(screen.getByTestId("cliente-pela-agenda-interruptor")).toHaveAttribute("aria-checked", "true");
  });
});
