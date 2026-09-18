/**
 * A barra de atalhos do celular.
 *
 * O que este arquivo prende é a REGRA que faz dela uma barra contextual e não
 * uma tab bar: o Menu é fixo, a tela empresta as suas ações, e quem não
 * empresta nada recebe navegação. Sem isto, a primeira mudança inocente
 * transforma a barra em cinco destinos fixos — que é a versão que duplica a
 * gaveta e não poupa toque nenhum.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BarraInferior } from "./BarraInferior";
import { ProvedorDeAcoesDaBarra, usePublicarAcoesDaBarra } from "./acoes-da-barra-inferior";

const rota = vi.hoisted(() => ({ atual: "/app" }));

vi.mock("next/navigation", () => ({
  usePathname: () => rota.atual,
  useRouter: () => ({ push: vi.fn() }),
}));

function TelaQuePublica({ aoTocarNovo }: { aoTocarNovo: () => void }) {
  usePublicarAcoesDaBarra([
    { id: "hoje", rotulo: "Hoje", icone: "CalendarDots", aoTocar: () => {} },
    { id: "novo", rotulo: "Novo", icone: "Plus", tom: "acao", aoTocar: aoTocarNovo },
  ]);
  return null;
}

function montar(tela?: React.ReactNode) {
  return render(
    <ProvedorDeAcoesDaBarra>
      {tela}
      <BarraInferior aoAbrirMenu={() => {}} />
    </ProvedorDeAcoesDaBarra>,
  );
}

describe("barra de atalhos do celular", () => {
  it("some do desktop e o Menu é sempre o primeiro item", () => {
    montar();
    const barra = screen.getByTestId("barra-inferior");
    // O desktop tem a barra lateral; duas navegações ao mesmo tempo seria ruído.
    expect(barra.className.includes("md:hidden")).toBe(true);
    expect(barra.querySelector('[data-testid="barra-menu"]')).toBeTruthy();
  });

  it("sem tela publicando nada, oferece Inbox e Agenda", () => {
    rota.atual = "/app";
    montar();
    // O sistema anterior punha Agenda e a central do robô de WhatsApp aqui. O
    // robô sai de cena; quem ocupa o lugar é o Inbox.
    expect(screen.getByTestId("barra-inbox")).toBeTruthy();
    expect(screen.getByTestId("barra-agenda")).toBeTruthy();
  });

  it("a tela empresta suas ações, e elas VENCEM a navegação", () => {
    rota.atual = "/app/agenda";
    const tocou = vi.fn();
    montar(<TelaQuePublica aoTocarNovo={tocou} />);

    expect(screen.getByTestId("barra-hoje")).toBeTruthy();
    // Um atalho para a agenda, estando na agenda, é toque desperdiçado.
    expect(screen.queryByTestId("barra-inbox")).toBeNull();

    (screen.getByTestId("barra-novo") as HTMLButtonElement).click();
    expect(tocou).toHaveBeenCalledTimes(1);
  });

  it("o botão do Menu chama quem abre a gaveta", () => {
    const abriu = vi.fn();
    render(
      <ProvedorDeAcoesDaBarra>
        <BarraInferior aoAbrirMenu={abriu} />
      </ProvedorDeAcoesDaBarra>,
    );
    (screen.getByTestId("barra-menu") as HTMLButtonElement).click();
    expect(abriu).toHaveBeenCalledTimes(1);
  });
});
