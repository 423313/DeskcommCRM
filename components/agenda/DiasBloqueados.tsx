"use client";
/**
 * A tela dos dias fora da rotina — os que FECHAM e os que ABREM.
 *
 * Existe porque `calendar_availability_exceptions` era respeitada pelo motor de
 * horários livres desde a migration 0177 e **não tinha como receber uma linha**:
 * nem rota, nem tela, nem action. Quem precisasse fechar a agenda num feriado
 * marcava um compromisso falso de dia inteiro — que polui a agenda, conta como
 * atendimento e aparece na timeline do lead.
 *
 * ## Por que ABRIR também mora aqui
 *
 * A coluna `is_unavailable` sempre teve os dois sentidos, a rota sempre aceitou
 * os dois (`POST /api/v1/agenda/excecoes` audita `agenda.dia_bloqueado` OU
 * `agenda.dia_aberto`) e a lista abaixo sempre soube rotular o segundo
 * ("aberto excepcionalmente"). Só o formulário não: ele mandava
 * `is_unavailable: true` e dia inteiro, fixos. Metade da capacidade existia no
 * banco, na rota, no motor e na listagem, e não tinha por onde entrar —
 * invariante 6 do Sistema Vivo.
 *
 * Quem paga por isso é quem NÃO trabalha em jornada semanal fixa. Medido numa
 * instalação real (clínica com atendimento em dias irregulares, cada dia numa
 * unidade): a jornada semanal fica vazia de propósito, para todo dia nascer
 * fechado, e cada data de atendimento é uma exceção ABERTA. Essa agenda não
 * tinha como ser montada pela tela — só por SQL.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";

type Excecao = {
  id: string;
  exception_date: string;
  is_unavailable: boolean;
  start_minute: number;
  end_minute: number;
  reason: string | null;
};

const DIA_INTEIRO = { start_minute: 0, end_minute: 1440 };

/** "0..1440" vira "o dia todo"; o resto vira "09:00–12:00". */
function faixa(e: Excecao, t: (s: string) => string): string {
  if (e.start_minute === 0 && e.end_minute === 1440) return t("o dia todo");
  const hhmm = (m: number) =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${hhmm(e.start_minute)}–${hhmm(e.end_minute)}`;
}

/** "14:00" vira 840 — o caminho inverso do `faixa` acima. */
function emMinutos(hhmm: string): number {
  const [h = "0", m = "0"] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

export function DiasBloqueados({ podeEditar }: { podeEditar: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [data, setData] = useState("");
  const [motivo, setMotivo] = useState("");
  const [modo, setModo] = useState<"fechar" | "abrir">("fechar");
  const [de, setDe] = useState("08:00");
  const [ate, setAte] = useState("12:00");

  const abrindo = modo === "abrir";
  // O CHECK do banco é `end_minute > start_minute`; barrar aqui troca um 422 por
  // um botão que não deixa errar.
  const faixaInvalida = abrindo && emMinutos(ate) <= emMinutos(de);

  const query = useQuery({
    queryKey: ["agenda", "excecoes"],
    queryFn: async () =>
      (await apiClient.get<{ data: Excecao[] }>("/api/v1/agenda/excecoes")).data,
  });

  const invalidar = () => {
    // A agenda também muda: um dia fechado tira horários da consulta.
    void qc.invalidateQueries({ queryKey: ["agenda"] });
  };

  const criar = useMutation({
    mutationFn: () =>
      apiClient.post("/api/v1/agenda/excecoes", {
        exception_date: data,
        is_unavailable: !abrindo,
        // Dia FECHADO é sempre inteiro — fechar meio dia é o caso de quem
        // ABRE o outro meio, e esse caminho é o de cima.
        ...(abrindo ? { start_minute: emMinutos(de), end_minute: emMinutos(ate) } : DIA_INTEIRO),
        ...(motivo.trim() ? { reason: motivo.trim() } : {}),
      }),
    onSuccess: () => {
      setData("");
      setMotivo("");
      invalidar();
    },
    onError: showApiError,
  });

  const remover = useMutation({
    mutationFn: (id: string) => apiClient.delete("/api/v1/agenda/excecoes", { id }),
    onSuccess: invalidar,
    onError: showApiError,
  });

  const lista = query.data ?? [];

  return (
    <section className="space-y-3 rounded-xl border p-4" data-testid="dias-bloqueados">
      <h2 className="font-semibold">{t("Dias fora da rotina")}</h2>
      <p className="text-sm text-text-muted">
        {t(
          "Feche um dia (feriado, férias, viagem) ou abra um dia que a sua jornada semanal não cobre. Em dia fechado o sistema deixa de oferecer horários, e o que já estava marcado continua marcado, para você decidir o que fazer com cada um.",
        )}
      </p>

      {podeEditar ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="block text-sm">{t("O que fazer")}</span>
            <select
              aria-label={t("O que fazer")}
              className="mt-1 rounded-md border p-2"
              data-testid="modo-do-dia"
              value={modo}
              onChange={(e) => setModo(e.target.value === "abrir" ? "abrir" : "fechar")}
            >
              <option value="fechar">{t("Fechar o dia")}</option>
              <option value="abrir">{t("Abrir para atendimento")}</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-sm">{t("Dia")}</span>
            <input
              aria-label={t("Dia")}
              className="mt-1 rounded-md border p-2"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </label>
          {abrindo ? (
            <>
              <label className="block">
                <span className="block text-sm">{t("Das")}</span>
                <input
                  aria-label={t("Das")}
                  className="mt-1 rounded-md border p-2"
                  type="time"
                  value={de}
                  onChange={(e) => setDe(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="block text-sm">{t("Até")}</span>
                <input
                  aria-label={t("Até")}
                  className="mt-1 rounded-md border p-2"
                  type="time"
                  value={ate}
                  onChange={(e) => setAte(e.target.value)}
                />
              </label>
            </>
          ) : null}
          <label className="block flex-1">
            <span className="block text-sm">{t("Motivo (opcional)")}</span>
            <input
              aria-label={t("Motivo (opcional)")}
              className="mt-1 w-full rounded-md border p-2"
              maxLength={200}
              placeholder={t("Ex.: feriado")}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <Button
            // Alvo de toque generoso: esta tela também é usada no celular.
            className="min-h-11"
            disabled={!data || criar.isPending || faixaInvalida}
            onClick={() => criar.mutate()}
          >
            {abrindo ? t("Abrir este dia") : t("Fechar este dia")}
          </Button>
          {faixaInvalida ? (
            <p className="w-full text-sm text-destructive">
              {t("A hora final precisa ser maior que a inicial.")}
            </p>
          ) : null}
        </div>
      ) : null}

      {query.isError ? (
        <Button variant="outline" onClick={() => void query.refetch()}>
          {t("Tentar novamente")}
        </Button>
      ) : query.isLoading ? (
        <p>{t("Carregando…")}</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-text-muted">{t("Nenhum dia fora da rotina daqui para a frente.")}</p>
      ) : (
        <ul className="space-y-1">
          {lista.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 text-sm">
              <span>
                {new Date(`${e.exception_date}T12:00:00`).toLocaleDateString()} · {faixa(e, t)}
                {e.is_unavailable ? "" : ` · ${t("aberto excepcionalmente")}`}
                {e.reason ? ` · ${e.reason}` : ""}
              </span>
              {podeEditar ? (
                <Button
                  variant="ghost"
                  className="min-h-11"
                  disabled={remover.isPending}
                  onClick={() => remover.mutate(e.id)}
                >
                  {t("Reabrir")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
