/**
 * A agenda no CELULAR: a semana é LISTA, o dia é grade.
 *
 * Por que isto tem teste: sete colunas em 360px dão ~44px cada, e a célula de
 * meia hora vira um alvo de ~44x24px. Errar o toque passa a ser o caso comum.
 * Quem marca horário está com o cliente na frente, no celular, com uma mão.
 *
 * ⚠️ A REGRA MUDOU, e este arquivo mudou com ela. Até a reestruturação de
 * 18/09 a semana no celular era a MESMA grade com seis das sete colunas
 * escondidas por `max-md:hidden` — gastava a tela inteira de uma grade de
 * horas para mostrar um dia, e o botão de avançar pulava sete de uma vez.
 * Agora a semana no celular é a lista de sete cartões do sistema anterior, e a
 * grade de horas fica para a visão de DIA, que é onde a posição na hora é a
 * informação.
 *
 * O teste não mede pixel (jsdom não faz layout): ele prova a REGRA — o que é
 * renderizado em cada visão, e que classe decide quem some abaixo de `md`. A
 * prova visual real é a spec de Playwright em 390px.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GradeDaAgenda } from "./GradeDaAgenda";

const QUARTA = new Date("2026-09-16T12:00:00-03:00");

function grade(visao: "dia" | "semana", extras?: { onEscolherDia?: (d: Date) => void }) {
  return render(
    <GradeDaAgenda
      visao={visao}
      ancora={QUARTA}
      agora={QUARTA}
      agendamentos={[]}
      pessoas={[]}
      onEscolherDia={extras?.onEscolherDia}
    />,
  );
}

describe("a semana no celular é lista", () => {
  it("na semana, a lista existe e a grade de horas some abaixo de md", () => {
    grade("semana");

    expect(screen.getByTestId("semana-em-lista")).toBeTruthy();
    for (const dia of [
      "2026-09-13",
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
    ]) {
      expect(screen.getByTestId(`cartao-dia-${dia}`), `faltou o cartão de ${dia}`).toBeTruthy();
    }

    // A grade continua no DOM — o desktop é a MESMA árvore. Esconder por
    // desmontagem quebraria a rolagem e o arraste.
    const colunas = screen.getAllByTestId(/^coluna-dia-/);
    expect(colunas).toHaveLength(7);
    const rolagem = colunas[0]?.parentElement?.parentElement;
    expect(rolagem?.className.includes("max-md:hidden")).toBe(true);
  });

  it("tocar no cabeçalho do dia escolhe aquele dia", () => {
    const escolheu = vi.fn();
    grade("semana", { onEscolherDia: escolheu });

    const cartao = screen.getByTestId("cartao-dia-2026-09-17");
    (cartao.querySelector("button") as HTMLButtonElement).click();

    expect(escolheu).toHaveBeenCalledTimes(1);
    expect(escolheu.mock.calls[0]?.[0]).toBeInstanceOf(Date);
  });

  it("na visão de dia não há lista, e a grade vale em toda largura", () => {
    grade("dia");
    expect(screen.queryByTestId("semana-em-lista")).toBeNull();
    const coluna = screen.getByTestId("coluna-dia-2026-09-16");
    const rolagem = coluna.parentElement?.parentElement;
    expect(rolagem?.className.includes("max-md:hidden")).toBe(false);
  });
});

/**
 * A JANELA ELÁSTICA. O defeito que ela conserta era PERDA DE DADO em silêncio:
 * com 07h–21h fixos, o agendamento das 06:30 não era desenhado em lugar nenhum
 * — não havia rolagem que o alcançasse, nem aviso de que ele existia.
 */
describe("a grade estica para caber o que está fora do horário comum", () => {
  // Construído no fuso LOCAL de propósito. Quem decide se a janela estica é a
  // HORA LOCAL, e o componente lê o fuso do runtime — não recebe nenhum. Um
  // fixture com deslocamento fixo ("-03:00") prova coisas DIFERENTES em
  // máquinas diferentes: aqui às 06:30 a janela descia para as 5h; no CI, que
  // roda em UTC, o mesmo instante era 09:30 e não esticava nada. Passava na
  // máquina de quem escreveu e reprovava no CI.
  const cedo = {
    id: "a1",
    titulo: "Antes de abrir",
    responsavelId: "p1",
    comeca: new Date(2026, 8, 16, 6, 30).toISOString(),
    termina: new Date(2026, 8, 16, 7, 15).toISOString(),
    origem: "ui" as const,
    situacao: "confirmed" as const,
  };

  it("um agendamento às 06:30 aparece, e a janela desce para as 5h", () => {
    render(
      <GradeDaAgenda
        visao="dia"
        ancora={QUARTA}
        agora={QUARTA}
        agendamentos={[cedo]}
        pessoas={[]}
      />,
    );
    expect(screen.getByTestId("grade-da-agenda").getAttribute("data-janela")).toBe("5-21");
    // E o cartão é desenhado — antes desta mudança, nada era.
    expect(screen.getByText("Antes de abrir")).toBeTruthy();
  });

  it("dia sem nada fora da faixa desenha a janela padrão", () => {
    render(
      <GradeDaAgenda visao="dia" ancora={QUARTA} agora={QUARTA} agendamentos={[]} pessoas={[]} />,
    );
    expect(screen.getByTestId("grade-da-agenda").getAttribute("data-janela")).toBe("7-21");
  });
});
