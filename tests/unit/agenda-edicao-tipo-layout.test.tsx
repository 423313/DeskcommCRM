/**
 * O FORMULÁRIO DE EDIÇÃO NÃO MISTURA IDENTIDADE COM LEMBRETE.
 *
 * Nome, duração e quem atende viviam na mesma grade de 3 colunas que o aviso
 * no WhatsApp. O `col-span` do checkbox empurrava "quantos minutos antes" para
 * o canto, debaixo de "quem atende" — dois assuntos na mesma linha. Esta suíte
 * trava a separação: os minutos do aviso compartilham um recipiente que NÃO
 * contém o nome do tipo.
 */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TiposDeAgendamentoClient,
  type TipoRow,
} from "@/app/app/settings/tenant/agenda/_client";

vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
vi.mock("@/components/agenda/AgendasConectadas", () => ({ AgendasConectadas: () => null }));
vi.mock("@/components/agenda/PrazosDePresenca", () => ({ PrazosDePresenca: () => null }));
vi.mock("@/components/agenda/ClientePelaAgenda", () => ({ ClientePelaAgenda: () => null }));
vi.mock("@/components/agenda/DiasBloqueados", () => ({ DiasBloqueados: () => null }));

const ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const TIPO: TipoRow = {
  id: ID,
  name: "Atendimento",
  slug: "atendimento",
  description: null,
  category: "consulta",
  duration_minutes: 60,
  location_kind: "in_person",
  location_details: null,
  default_owner_user_id: "user-1",
  requires_confirmation: false,
  is_active: true,
  reminder_enabled: true,
  reminder_minutes_before: 1440,
  reminder_extra_offsets_minutes: [100],
  reminder_body: null,
};

afterEach(() => {
  cleanup();
});

describe("edição do tipo — disposição", () => {
  it("os minutos do aviso não compartilham a grade com o nome do tipo", async () => {
    render(
      <TiposDeAgendamentoClient
        tiposIniciais={[TIPO]}
        pessoas={[{ id: "user-1", papel: "admin", nome: "Secretária" }]}
        podeEditar
        usuarioAtualId="user-1"
        podeConfigurarGoogle={false}
        clientePelaAgendaLigado={false}
        podeLigarClientePelaAgenda={false}
      />,
    );

    await userEvent.click(screen.getByTestId(`editar-${ID}`));

    const nome = screen.getByTestId(`editar-nome-${ID}`);
    const minutos = screen.getByTestId(`editar-lembrete-minutos-${ID}`);
    const extras = screen.getByTestId(`editar-lembrete-extras-${ID}`);
    const par = minutos.closest("div.grid");

    expect(par, "os dois campos de minutos sumiram da grade própria").toBeTruthy();
    expect(par).toContainElement(extras);
    expect(par).not.toContainElement(nome);
  });
});
