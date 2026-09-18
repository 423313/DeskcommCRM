"use client";
/**
 * As comissões na tela.
 *
 * ⚠️ NENHUM NÚMERO É SOMADO AQUI. O resumo por profissional vem pronto de
 * `fn_relatorio_financeiro` (`por_profissional`, com pendente e pago separados
 * e o nome resolvido no banco); o detalhe vem de `/financeiro/comissoes`. Somar
 * na tela o que a API devolve paginado é como um relatório passa a mentir.
 *
 * O fechamento é o laço que se fecha: a comissão sai de "a receber" e reaparece
 * como dinheiro saindo no Faturamento, na mesma conta que a pessoa escolheu.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import { formatCents } from "@/lib/money";

type Profissional = {
  professional_id: string | null;
  nome: string;
  itens: number;
  comissao_cents: number;
  pendente_cents: number;
  pago_cents: number;
};

type Relatorio = { por_profissional: Profissional[] };
type Conta = { id: string; name: string };

type Comissao = {
  id: string;
  professional_id: string | null;
  percent: number;
  amount_cents: number;
  status: "pending" | "paid" | "reversed";
  paid_at: string | null;
  sale_items: {
    description: string;
    total_cents: number;
    sales: { number: number; finalized_at: string | null };
  } | null;
};

const hoje = () => new Date().toISOString().slice(0, 10);
const primeiroDoMes = () => `${hoje().slice(0, 7)}-01`;

export function Comissoes({ podeFechar }: { podeFechar: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [de, setDe] = useState(primeiroDoMes);
  const [ate, setAte] = useState(hoje);
  const [aberta, setAberta] = useState<string | null>(null);
  const [contaId, setContaId] = useState("");

  const relatorio = useQuery({
    queryKey: ["relatorio", "financeiro", de, ate],
    queryFn: async () =>
      (await apiClient.get<{ data: Relatorio }>(`/api/v1/reports/financeiro?de=${de}&ate=${ate}`))
        .data,
  });

  const contas = useQuery({
    queryKey: ["financeiro", "catalogo", "contas"],
    queryFn: async () =>
      (await apiClient.get<{ data: Conta[] }>("/api/v1/financeiro/catalogo/contas")).data,
  });

  const detalhe = useQuery({
    queryKey: ["financeiro", "comissoes", de, ate, aberta],
    enabled: aberta !== null,
    queryFn: async () =>
      (
        await apiClient.get<{ data: Comissao[] }>(
          `/api/v1/financeiro/comissoes?de=${de}&ate=${ate}&professional_id=${aberta ?? ""}`,
        )
      ).data,
  });

  const fechar = useMutation({
    mutationFn: async (corpo: Record<string, unknown>) =>
      apiClient.post("/api/v1/financeiro/comissoes/fechar", corpo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["relatorio", "financeiro"] });
      void qc.invalidateQueries({ queryKey: ["financeiro", "comissoes"] });
      void qc.invalidateQueries({ queryKey: ["financeiro", "lancamentos"] });
    },
    onError: showApiError,
  });

  const linhas = relatorio.data?.por_profissional ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("De")}
          <input
            type="date"
            className="min-h-11 rounded-md border p-2"
            data-testid="periodo-de"
            value={de}
            onChange={(e) => setDe(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          {t("Até")}
          <input
            type="date"
            className="min-h-11 rounded-md border p-2"
            data-testid="periodo-ate"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
          />
        </label>
      </div>

      <section className="rounded-xl border p-4" data-testid="lista-de-comissoes">
        <h2 className="mb-2 text-sm font-semibold">{t("Por profissional")}</h2>

        {relatorio.isLoading ? (
          <p className="text-sm text-text-muted">{t("Carregando…")}</p>
        ) : linhas.length === 0 ? (
          /*
            Estado vazio que ENSINA: a comissão não nasce sozinha, e quem chega
            aqui sem nenhuma precisa saber que faltam duas coisas (profissional
            no item e regra de percentual), não que o sistema está quebrado.
          */
          <p className="text-sm text-text-muted">
            {t(
              "Nenhuma comissão no período. Ela nasce quando uma comanda é finalizada com profissional no item e percentual configurado — cadastre as regras em Configurações › Financeiro.",
            )}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-muted">
                <th className="py-1">{t("Profissional")}</th>
                <th className="py-1">{t("Itens")}</th>
                <th className="py-1">{t("A receber")}</th>
                <th className="py-1">{t("Já pago")}</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((p) => (
                <tr key={p.professional_id ?? "sem"} className="border-b border-border/60">
                  <td className="py-1">
                    <button
                      className="underline-offset-2 hover:underline"
                      onClick={() => setAberta(aberta === p.professional_id ? null : p.professional_id)}
                    >
                      {p.nome}
                    </button>
                  </td>
                  <td className="py-1">{p.itens}</td>
                  <td className="py-1">{formatCents(p.pendente_cents, "BRL")}</td>
                  <td className="py-1 text-text-muted">{formatCents(p.pago_cents, "BRL")}</td>
                  <td className="py-1 text-right">
                    {podeFechar && p.professional_id && p.pendente_cents > 0 ? (
                      <div className="flex items-center justify-end gap-2">
                        {(contas.data ?? []).length === 0 ? (
                          /*
                            SEM CONTA ATIVA NÃO HÁ COMO PAGAR, e um seletor
                            vazio não diz isso — só não oferece opção, e quem
                            está na tela conclui que o botão está quebrado.
                            Medido na cópia local: as duas contas estavam
                            inativas e o fechamento ficava impossível em
                            silêncio.
                          */
                          <span className="text-xs text-warning" data-testid="sem-conta-ativa">
                            {t("Nenhuma conta ativa para pagar — ative uma em Configurações › Financeiro.")}
                          </span>
                        ) : (
                          <select
                            aria-label={t("Conta de saída")}
                            className="min-h-9 rounded-md border p-1 text-xs"
                            value={contaId}
                            onChange={(e) => setContaId(e.target.value)}
                          >
                            <option value="">{t("De qual conta?")}</option>
                            {(contas.data ?? []).map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        )}
                        <Button
                          data-testid="fechar-comissao"
                          disabled={!contaId || fechar.isPending}
                          onClick={() =>
                            fechar.mutate({
                              professional_id: p.professional_id,
                              de,
                              ate,
                              account_id: contaId,
                            })
                          }
                        >
                          {t("Fechar e pagar")}
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {aberta ? (
        <section className="rounded-xl border p-4" data-testid="detalhe-da-profissional">
          <h2 className="mb-2 text-sm font-semibold">{t("Comissões do período")}</h2>
          {detalhe.isLoading ? (
            <p className="text-sm text-text-muted">{t("Carregando…")}</p>
          ) : (detalhe.data ?? []).length === 0 ? (
            <p className="text-sm text-text-muted">{t("Nenhuma comissão no período.")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-muted">
                  <th className="py-1">{t("Comanda")}</th>
                  <th className="py-1">{t("Serviço")}</th>
                  <th className="py-1">{t("Valor do item")}</th>
                  <th className="py-1">{t("Comissão")}</th>
                  <th className="py-1">{t("Situação")}</th>
                </tr>
              </thead>
              <tbody>
                {(detalhe.data ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-border/60">
                    <td className="py-1">#{c.sale_items?.sales.number ?? "—"}</td>
                    <td className="py-1">{c.sale_items?.description ?? "—"}</td>
                    <td className="py-1">{formatCents(c.sale_items?.total_cents ?? 0, "BRL")}</td>
                    <td className="py-1">
                      {formatCents(c.amount_cents, "BRL")}{" "}
                      <span className="text-xs text-text-muted">({c.percent}%)</span>
                    </td>
                    <td className="py-1 text-xs">
                      {c.status === "paid"
                        ? t("paga")
                        : c.status === "reversed"
                          ? t("estornada")
                          : t("em aberto")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}
    </div>
  );
}
