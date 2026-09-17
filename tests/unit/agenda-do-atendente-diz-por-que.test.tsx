/**
 * A AGENDA DO ATENDENTE PRECISA DIZER POR QUE — issue 896, itens (a) e (b).
 *
 * ─── O defeito que esta cerca fecha ──────────────────────────────────────
 *
 * O atendente abre a agenda da dona. Duas telas mentem sobre quem está na
 * frente e sobre o que falta:
 *
 * (a) O rótulo. Com a lista da equipe vazia (o `403` do item 1 da issue, que a
 *     lista de pessoas da agenda tomava em todo papel abaixo de quem lê a
 *     equipe), o painel caía num fallback fixo `{ id: "", nome: "Você" }` e
 *     escrevia "com Você" e "Você ainda não publicou seus horários" sobre a
 *     jornada de OUTRA pessoa — a dona, que não estava naquela sessão. "Você",
 *     nessa tela, é quem está logado, e mais ninguém.
 *
 * (b) O dia de folga. Um dia DENTRO da jornada sem janela publicada dizia
 *     "Nenhum horário publicado neste dia": a mesma frase de quem nunca
 *     publicou jornada nenhuma. Os dois casos pedem coisas diferentes de quem
 *     lê — um espera o próximo dia útil, o outro precisa publicar horários — e
 *     a tela tratava os dois como o mesmo nada.
 *
 *     npx vitest run tests/unit/agenda-do-atendente-diz-por-que.test.tsx
 */
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PainelDeMarcacao } from "@/components/agenda/PainelDeMarcacao";
import type { Pessoa } from "@/components/agenda/tipos";
import { resolverResponsavelDoPainel } from "@/lib/agenda/responsavel-do-painel";
import {
  MENSAGEM_UNICA_QUE_NAO_DISTINGUIA,
  mensagemDoDiaSemJanela,
} from "@/lib/agenda/o-que-falta-no-dia";

afterEach(cleanup);

/** Terça, 15 de setembro de 2026, meio-dia — hora de parede do processo. */
const AGORA = new Date("2026-09-15T12:00:00");
const DONA: Pessoa = { id: "dona", nome: "Ana", trilha: 1 };
const ATENDENTE = "atendente";

describe("(a) 'Você' é de quem está logado, não de quem não deu para listar", () => {
  it("sem a lista da equipe, a jornada da dona NÃO vira 'Você'", () => {
    // Estado do defeito: `pessoas: []` porque `GET /api/v1/team` deu 403 para o
    // atendente, e a agenda é a da dona (`donoId` dela).
    const pessoa = resolverResponsavelDoPainel({
      pessoas: [],
      donoId: DONA.id,
      usuarioId: ATENDENTE,
    });

    expect(pessoa.nome).not.toBe("Você");
    expect(pessoa.id).toBe(DONA.id);
  });

  it("a própria agenda continua dizendo 'Você'", () => {
    const pessoa = resolverResponsavelDoPainel({
      pessoas: [],
      donoId: ATENDENTE,
      usuarioId: ATENDENTE,
    });

    expect(pessoa.nome).toBe("Você");
  });

  it("com a lista em mãos, o nome é o do dono da agenda", () => {
    const pessoa = resolverResponsavelDoPainel({
      pessoas: [DONA, { id: ATENDENTE, nome: "Bruno", trilha: 2 }],
      donoId: DONA.id,
      usuarioId: ATENDENTE,
    });

    expect(pessoa.nome).toBe("Ana");
  });

  it("sem dono definido, a agenda é de quem está logado", () => {
    const pessoa = resolverResponsavelDoPainel({
      pessoas: [DONA, { id: ATENDENTE, nome: "Bruno", trilha: 2 }],
      donoId: null,
      usuarioId: ATENDENTE,
    });

    expect(pessoa.nome).toBe("Você");
  });

  it("o painel da dona não escreve 'Você' em lugar nenhum", () => {
    render(
      <PainelDeMarcacao
        ancora={AGORA}
        agora={AGORA}
        responsavel={resolverResponsavelDoPainel({
          pessoas: [],
          donoId: DONA.id,
          usuarioId: ATENDENTE,
        })}
        fuso="America/Sao_Paulo"
        horariosPorDia={{}}
        onConfirmar={vi.fn(async () => undefined)}
      />,
    );

    expect(screen.getByTestId("painel-de-marcacao").textContent).not.toContain("Você");
  });
});

type Props = Partial<ComponentProps<typeof PainelDeMarcacao>>;

function montar(sobre: Props = {}) {
  render(
    <PainelDeMarcacao
      ancora={AGORA}
      agora={AGORA}
      responsavel={DONA}
      fuso="America/Sao_Paulo"
      // Nenhuma janela consultada: o painel abre na âncora (terça, 15) e a
      // grade só tem quarta.
      horariosPorDia={{}}
      podeMarcarEncaixe
      {...sobre}
      onConfirmar={vi.fn(async () => undefined)}
    />,
  );
}

describe("(b) folga e jornada inexistente pedem coisas diferentes", () => {
  it("a folga DENTRO da jornada diz que o dia está fora dela", () => {
    const folga = mensagemDoDiaSemJanela(true);

    expect(folga).toContain("fora da jornada publicada");
    // A frase antiga dizia as duas coisas com as mesmas palavras; era ela que
    // fazia a folga parecer jornada que nunca foi configurada.
    expect(folga).not.toBe(MENSAGEM_UNICA_QUE_NAO_DISTINGUIA);
  });

  it("quem nunca publicou jornada ouve o outro caso, não o da folga", () => {
    const semJornada = mensagemDoDiaSemJanela(false);

    expect(semJornada).toContain("Nenhuma jornada publicada ainda");
    expect(semJornada).not.toContain("fora da jornada publicada");
    expect(semJornada).not.toBe(mensagemDoDiaSemJanela(true));
  });

  it("o painel diz o caso da folga sem repetir a frase que não distinguia", () => {
    montar({
      publicouHorarios: true,
      horarioInicial: { instante: "2026-09-15T13:00:00.000Z", rotulo: "10:00" },
    });

    const texto = screen.getByTestId("painel-de-marcacao").textContent ?? "";

    expect(texto).not.toContain(MENSAGEM_UNICA_QUE_NAO_DISTINGUIA);
  });

  it("sem jornada nenhuma, a tela não finge que é só o dia que está vazio", () => {
    montar({ publicouHorarios: false });

    // Com jornada, a porta do encaixe nem abre — e o que a tela diz é o outro
    // caso, o de quem precisa publicar horários.
    expect(screen.queryByTestId("encaixe")).toBeNull();
    const bloco = screen.getByTestId("sem-jornada-publicada").textContent ?? "";

    expect(bloco).toContain("A jornada de atendimento ainda não foi publicada");
    expect(screen.getByTestId("painel-de-marcacao").textContent).not.toContain(
      "fora da jornada publicada",
    );
  });
});
