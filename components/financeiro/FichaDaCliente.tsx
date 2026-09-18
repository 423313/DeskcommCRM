"use client";
/**
 * A FICHA DA CLIENTE — o que o sistema anterior mostrava, dentro do contato.
 *
 * Diretório próprio do fork (`components/financeiro/`): nada do upstream vive
 * aqui, então o merge semanal não disputa este arquivo.
 *
 * ⚠️ NENHUM NÚMERO É CALCULADO AQUI. Todos vêm de `fn_resumo_do_cliente`. Somar
 * na tela o que a API devolve paginado é como um indicador passa a mentir.
 *
 * ⚠️ ESTADO VAZIO MOSTRA FRASE, não zeros. "0 visitas · R$ 0,00 · ticket
 * R$ 0,00" alinhado em cartões parece medição, e é ausência de medição.
 */
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { apiClient } from "@/lib/api/client";
import { formatCents } from "@/lib/money";

type Resumo = {
  visitas: number;
  dias_distintos: number;
  total_gasto_cents: number;
  ticket_medio_cents: number;
  primeira_visita: string | null;
  ultima_visita: string | null;
  dias_desde_ultima: number | null;
  intervalo_medio_dias: number | null;
  classificacao: "ativa" | "em_risco" | "inativa" | "perdida" | "sem_compra";
  servicos: { nome: string; quantidade: number; total_cents: number }[];
  cartao: { selos: number; meta: number; completo: boolean; faltam: number };
  agendamentos_futuros: number;
};

type Comanda = {
  id: string;
  number: number;
  total_cents: number;
  finalized_at: string | null;
  reversed_at: string | null;
  notes: string | null;
  sale_items: { id: string; description: string; quantity: number; total_cents: number }[];
};

type Agendamento = { id: string; title: string | null; starts_at: string; status: string };

type Ficha = {
  resumo: Resumo | null;
  comandas: Comanda[];
  agendamentos: { futuros: Agendamento[]; passados: Agendamento[] };
};

const COR_DA_CLASSIFICACAO: Record<Resumo["classificacao"], "success" | "warning" | "destructive" | "neutral"> = {
  ativa: "success",
  em_risco: "warning",
  inativa: "neutral",
  perdida: "destructive",
  sem_compra: "neutral",
};

export function FichaDaCliente({ contactId }: { contactId: string }) {
  const t = useT();
  // A data segue o idioma de quem lê, não um literal: é o que o gate
  // `i18n-a-data-segue-o-idioma` cobra, e o motivo é que 09/12 e 12/09 são o
  // mesmo dia escrito de dois jeitos.
  const tagDoIdioma = useTagDeIdioma();

  const ROTULO_DA_CLASSIFICACAO: Record<Resumo["classificacao"], string> = {
    ativa: t("Ativa"),
    em_risco: t("Em risco"),
    inativa: t("Inativa"),
    perdida: t("Perdida"),
    sem_compra: t("Sem compra"),
  };

  const ficha = useQuery({
    queryKey: ["ficha-do-cliente", contactId],
    queryFn: async () =>
      (await apiClient.get<{ data: Ficha }>(`/api/v1/contacts/${contactId}/ficha`)).data,
  });

  if (ficha.isLoading) {
    return <p className="text-sm text-text-muted">{t("Carregando…")}</p>;
  }
  if (ficha.isError || !ficha.data) {
    return <p className="text-sm text-text-muted">{t("Não foi possível carregar a ficha.")}</p>;
  }

  const r = ficha.data.resumo;
  const data = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(tagDoIdioma, { timeZone: "America/Sao_Paulo" }) : "—";

  if (!r || r.classificacao === "sem_compra") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-text-muted" data-testid="ficha-sem-compra">
          {t("Ainda não há comanda finalizada para esta cliente. Os indicadores aparecem depois do primeiro atendimento cobrado.")}
        </p>
        {r && r.agendamentos_futuros > 0 ? (
          <p className="text-sm">
            {t("Mas já tem horário marcado.")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="ficha-da-cliente">
      {/* Indicadores */}
      <section className="flex flex-wrap gap-3">
        <Cartao rotulo={t("Visitas")} valor={String(r.visitas)} nota={t("desde") + " " + data(r.primeira_visita)} testid="ficha-visitas" />
        <Cartao rotulo={t("Total gasto")} valor={formatCents(r.total_gasto_cents, "BRL")} testid="ficha-total-gasto" />
        <Cartao rotulo={t("Ticket médio")} valor={formatCents(r.ticket_medio_cents, "BRL")} />
        <Cartao
          rotulo={t("Última visita")}
          valor={r.dias_desde_ultima === null ? "—" : `${r.dias_desde_ultima} ${t("dias")}`}
          nota={
            r.intervalo_medio_dias
              ? `${t("volta a cada")} ${r.intervalo_medio_dias} ${t("dias")}`
              : data(r.ultima_visita)
          }
        />
        <div className="flex items-center">
          <Badge variant={COR_DA_CLASSIFICACAO[r.classificacao]} data-testid="ficha-classificacao">
            {ROTULO_DA_CLASSIFICACAO[r.classificacao]}
          </Badge>
        </div>
      </section>

      {/* Cartão de fidelidade */}
      <section className="rounded-xl border p-4">
        <h3 className="mb-1 text-sm font-semibold">{t("Cartão de fidelidade")}</h3>
        <p className="text-sm" data-testid="ficha-cartao">
          {r.cartao.completo
            ? t("Cartão completo — pode resgatar o prêmio na próxima comanda.")
            : `${r.cartao.selos} ${t("de")} ${r.cartao.meta} ${t("selos")} · ${t("faltam")} ${r.cartao.faltam}`}
        </p>
      </section>

      {/* Serviços mais feitos */}
      {r.servicos.length > 0 ? (
        <section className="rounded-xl border p-4">
          <h3 className="mb-2 text-sm font-semibold">{t("Serviços mais feitos")}</h3>
          <ul className="space-y-1 text-sm">
            {r.servicos.map((s) => (
              <li key={s.nome} className="flex justify-between gap-4">
                <span>{s.nome}</span>
                <span className="text-text-muted">
                  {s.quantidade}× · {formatCents(s.total_cents, "BRL")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Histórico de comandas */}
      <section className="rounded-xl border p-4">
        <h3 className="mb-2 text-sm font-semibold">{t("Histórico de comandas")}</h3>
        <ul className="space-y-2 text-sm" data-testid="ficha-comandas">
          {ficha.data.comandas.map((c) => (
            <li key={c.id} className="border-b border-border/60 pb-2 last:border-0">
              <div className="flex justify-between gap-4">
                <span>
                  {data(c.finalized_at)} · #{c.number}
                  {c.reversed_at ? (
                    <Badge variant="destructive" className="ml-2">
                      {t("Estornada")}
                    </Badge>
                  ) : null}
                </span>
                <span>{formatCents(c.total_cents, "BRL")}</span>
              </div>
              <p className="text-xs text-text-muted">
                {c.sale_items.map((i) => i.description).join(" · ")}
              </p>
              {c.notes ? <p className="text-xs text-text-muted italic">{c.notes}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      {/* Agenda */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border p-4">
          <h3 className="mb-2 text-sm font-semibold">{t("Próximos horários")}</h3>
          {ficha.data.agendamentos.futuros.length === 0 ? (
            <p className="text-sm text-text-muted">{t("Nenhum horário marcado.")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {ficha.data.agendamentos.futuros.map((a) => (
                <li key={a.id}>
                  {data(a.starts_at)} · {a.title ?? t("Atendimento")}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border p-4">
          <h3 className="mb-2 text-sm font-semibold">{t("Últimos horários")}</h3>
          {ficha.data.agendamentos.passados.length === 0 ? (
            <p className="text-sm text-text-muted">{t("Nenhum horário anterior.")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {ficha.data.agendamentos.passados.map((a) => (
                <li key={a.id}>
                  {data(a.starts_at)} · {a.title ?? t("Atendimento")}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  testid,
}: {
  rotulo: string;
  valor: string;
  nota?: string;
  testid?: string;
}) {
  return (
    <div className="min-w-32 rounded-xl border p-3" data-testid={testid}>
      <p className="text-xs text-text-muted">{rotulo}</p>
      <p className="text-lg font-semibold">{valor}</p>
      {nota ? <p className="text-xs text-text-muted">{nota}</p> : null}
    </div>
  );
}
