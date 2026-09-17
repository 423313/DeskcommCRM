/**
 * ABRIR UM DIA PELA TELA — a metade da capacidade que não tinha por onde entrar.
 *
 * `calendar_availability_exceptions.is_unavailable` sempre teve os dois
 * sentidos; a rota sempre aceitou os dois (ela audita `agenda.dia_bloqueado`
 * OU `agenda.dia_aberto`); o motor de horários livres sempre respeitou o
 * segundo — em `janelasDoDia`, uma exceção ABERTA substitui a jornada do dia —;
 * e a lista desta tela sempre soube rotulá-lo ("aberto excepcionalmente").
 *
 * Só o formulário não: ele mandava `is_unavailable: true` e `0..1440`, fixos no
 * código. Capacidade viva no banco, na rota, no motor e na listagem, sem porta
 * na interface (invariante 6 do Sistema Vivo).
 *
 * Quem paga é quem NÃO trabalha em jornada semanal fixa. Medido numa clínica
 * com atendimento em dias irregulares, cada dia numa unidade diferente: a
 * jornada fica vazia de propósito (todo dia nasce fechado) e cada data de
 * atendimento é uma exceção aberta com faixa de horário. Essa agenda não tinha
 * como ser montada pela tela — só escrevendo no banco à mão.
 *
 * As três asserções, e por que cada uma existe:
 *
 *   1. FECHAR continua fechando o dia inteiro. É o caminho que já existia, e a
 *      regressão mais cara seria um dia de férias virar meio dia.
 *   2. ABRIR manda `is_unavailable: false` COM a faixa escolhida. Sem a faixa,
 *      abrir o dia inteiro ofereceria horário de madrugada.
 *   3. Faixa invertida não chega a sair. O CHECK do banco (`end_minute >
 *      start_minute`) devolveria 422; barrar no botão troca o erro por um
 *      botão que não deixa errar.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn(() => Promise.resolve({ data: {} }));
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: () => Promise.resolve({ data: [] }),
    post: (...a: unknown[]) => post(...a),
    delete: () => Promise.resolve({}),
  },
}));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { DiasBloqueados } from "./DiasBloqueados";

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <DiasBloqueados podeEditar />
    </QueryClientProvider>,
  );
}

/** O corpo do único POST que saiu. */
function corpoEnviado(): Record<string, unknown> {
  expect(post).toHaveBeenCalledTimes(1);
  return post.mock.calls[0]?.[1] as Record<string, unknown>;
}

describe("Dias fora da rotina — fechar e abrir", () => {
  beforeEach(() => post.mockClear());

  it("fechar continua mandando o dia INTEIRO", async () => {
    const u = userEvent.setup();
    montar();

    await u.type(screen.getByLabelText("Dia"), "2026-10-01");
    await u.click(screen.getByRole("button", { name: "Fechar este dia" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(corpoEnviado()).toMatchObject({
      exception_date: "2026-10-01",
      is_unavailable: true,
      start_minute: 0,
      end_minute: 1440,
    });
  });

  it("abrir manda is_unavailable false COM a faixa escolhida", async () => {
    const u = userEvent.setup();
    montar();

    await u.selectOptions(screen.getByTestId("modo-do-dia"), "abrir");
    await u.type(screen.getByLabelText("Dia"), "2026-10-01");
    await u.clear(screen.getByLabelText("Das"));
    await u.type(screen.getByLabelText("Das"), "14:00");
    await u.clear(screen.getByLabelText("Até"));
    await u.type(screen.getByLabelText("Até"), "18:00");
    await u.click(screen.getByRole("button", { name: "Abrir este dia" }));

    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(corpoEnviado()).toMatchObject({
      exception_date: "2026-10-01",
      is_unavailable: false,
      start_minute: 840,
      end_minute: 1080,
    });
  });

  it("faixa invertida não chega a sair", async () => {
    const u = userEvent.setup();
    montar();

    await u.selectOptions(screen.getByTestId("modo-do-dia"), "abrir");
    await u.type(screen.getByLabelText("Dia"), "2026-10-01");
    await u.clear(screen.getByLabelText("Das"));
    await u.type(screen.getByLabelText("Das"), "18:00");
    await u.clear(screen.getByLabelText("Até"));
    await u.type(screen.getByLabelText("Até"), "14:00");

    expect(screen.getByRole("button", { name: "Abrir este dia" })).toBeDisabled();
    expect(post).not.toHaveBeenCalled();
  });
});
