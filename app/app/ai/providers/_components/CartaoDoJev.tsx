"use client";

/**
 * O cartão "Jev — decisões rápidas", no painel de provedores.
 *
 * O Jev não conversa com o cliente — só decide coisas pequenas, e hoje só uma:
 * se o cliente está irritado. Por isso ele não aparece no "Modelo padrão" nem
 * no seletor de cada ponto (escolhido ali, todo atendimento morreria), e ganha
 * este cartão, que leva quem nunca ouviu falar dele da chave até os números:
 * pegar a chave, colar, testar, concordar com o envio para fora do país, ligar,
 * comparar com a IA de sempre e, só então, deixá-lo decidir.
 *
 * Os dados vêm de `GET /api/v1/ai/jev`; o estado mostrado é derivado deles, e
 * nunca guardado aqui, para a tela não discordar da rota que o worker obedece.
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { AddCredentialDialog } from "@/app/app/ai/credentials/_components/AddCredentialDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import { descreverErroDeValidacao } from "@/lib/ai/credenciais/erro-de-validacao";
import { PROVEDOR_DO_JEV } from "@/lib/ai/decisao/credencial";
import { O_QUE_FAZER_DO_JEV } from "@/lib/ai/decisao/textos";

/** O corpo de `GET /api/v1/ai/jev` (`app/api/v1/ai/jev/route.ts`). */
export interface DadosDoJev {
  provedor: { rotulo: string; quandoUsar: string; ondePegarAChave: string; prefixoDaChave: string };
  chave: {
    existe: boolean;
    validada: boolean;
    credencial_id: string | null;
    rotulo: string | null;
    erro_de_validacao: string | null;
  };
  config: {
    ligado: boolean;
    modo: "observacao" | "decide";
    aceite: { em: string; por: string } | null;
  };
  tarefas: Array<{ id: string; rotulo: string; oQueOJevFaz: string }>;
  tem_ia_de_sempre: boolean;
  numeros: {
    dias: number;
    decisoes: number;
    custo_cents: number;
    latencia_media_ms: number | null;
    reservas: number;
    observacao: { dias: number; comparadas: number; concordaram: number };
  };
  ultima_falha: { motivo: string | null; em: string } | null;
  pode_editar: boolean;
}

type Estado = "sem_chave" | "chave_nao_validada" | "pronto" | "observando" | "decidindo" | "sozinho";

function estadoDoJev(d: DadosDoJev): Estado {
  if (d.config.ligado) {
    // Sem a IA de sempre não há com quem comparar nem quem cubra: o worker
    // deixa o Jev decidir qualquer que seja o modo gravado.
    if (!d.tem_ia_de_sempre) return "sozinho";
    return d.config.modo === "decide" ? "decidindo" : "observando";
  }
  if (!d.chave.existe) return "sem_chave";
  if (!d.chave.validada) return "chave_nao_validada";
  return "pronto";
}

/** Como o Jev está no ponto `pontoId`, para a linha do cartão do ponto. */
export function jevNoPonto(
  d: DadosDoJev | null,
  pontoId: string,
): "observacao" | "decide" | "sozinho" | null {
  if (!d?.config.ligado || !d.tarefas.some((t) => t.id === pontoId)) return null;
  if (!d.tem_ia_de_sempre) return "sozinho";
  return d.config.modo;
}

type Resposta = { data?: DadosDoJev; error?: { message?: string } };

/** Carrega o cartão. Mora no painel porque o cartão do ponto também o lê. */
export function useDadosDoJev() {
  const t = useT();
  const [dados, setDados] = useState<DadosDoJev | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/ai/jev");
      const json = (await res.json().catch(() => null)) as Resposta | null;
      if (!res.ok || !json?.data) {
        setErro(
          json?.error?.message ? t(json.error.message) : `${t("não consegui carregar")} (${res.status})`,
        );
        return;
      }
      setErro(null);
      setDados(json.data);
    } catch (e) {
      setErro(e instanceof Error ? t(e.message) : t("não consegui falar com o servidor"));
    }
  }, [t]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { dados, erro, recarregar };
}

export function CartaoDoJev({
  dados,
  erro,
  recarregar,
}: {
  dados: DadosDoJev | null;
  erro: string | null;
  recarregar: () => Promise<void>;
}) {
  const t = useT();

  if (erro) {
    return (
      <Card className="mb-6 border-destructive/40 p-4" data-testid="cartao-do-jev">
        <h2 className="text-base font-semibold">{t("Não consegui carregar o cartão do Jev")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{erro}</p>
        <Button className="mt-3" size="sm" variant="outline" onClick={() => void recarregar()}>
          {t("Tentar de novo")}
        </Button>
      </Card>
    );
  }
  // Sem esqueleto: o cartão entra pronto, e o resto do painel não espera por ele.
  if (!dados) return null;

  const estado = estadoDoJev(dados);
  const ligado = dados.config.ligado;

  return (
    <Card className="mb-6 p-4" data-testid="cartao-do-jev" data-estado={estado}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{t("Jev — decisões rápidas")}</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t(dados.provedor.quandoUsar)}</p>
        </div>
        <SeloDoEstado estado={estado} />
      </div>

      {estado === "sem_chave" && <SemChave dados={dados} recarregar={recarregar} />}

      {/* Também com o Jev ligado: chave girada para uma que não passa, ou
          desativada, deixa-o mudo, e é aqui que a pessoa descobre por quê. */}
      {!dados.chave.validada && (dados.chave.existe || ligado) && (
        <ProblemaDaChave dados={dados} recarregar={recarregar} />
      )}

      {estado === "pronto" && <ProntoParaLigar dados={dados} recarregar={recarregar} />}

      {!dados.tem_ia_de_sempre && (
        <p className="mt-3 rounded-md bg-warning-bg p-2 text-xs text-warning-fg" data-testid="jev-sem-ia">
          {t("O Jev não conversa com o cliente — falta a chave da sua IA principal.")}{" "}
          <Link className="underline underline-offset-4" href="/app/ai/credentials">
            {t("Cadastrar uma chave")}
          </Link>
        </p>
      )}

      {ligado && <Ligado dados={dados} estado={estado} recarregar={recarregar} />}

      {!dados.pode_editar && estado !== "sem_chave" && (
        <p className="mt-3 text-xs text-muted-foreground">{t("Só quem administra a empresa pode mudar o Jev.")}</p>
      )}
    </Card>
  );
}

function SeloDoEstado({ estado }: { estado: Estado }) {
  const t = useT();
  if (estado === "observando") return <Badge variant="info">{t("Observando")}</Badge>;
  if (estado === "decidindo") return <Badge variant="success">{t("Decidindo")}</Badge>;
  if (estado === "sozinho") return <Badge variant="warning">{t("Decidindo sozinho")}</Badge>;
  return <Badge variant="neutral">{t("Desligado")}</Badge>;
}

function SemChave({ dados, recarregar }: { dados: DadosDoJev; recarregar: () => Promise<void> }) {
  const t = useT();
  const [colando, setColando] = useState(false);

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button asChild size="sm" variant="outline">
        <a href={dados.provedor.ondePegarAChave} target="_blank" rel="noreferrer">
          {t("Pegar a chave na TypeSafe")}
        </a>
      </Button>
      {dados.pode_editar ? (
        <>
          <Button size="sm" onClick={() => setColando(true)}>
            {t("Colar a chave")}
          </Button>
          <AddCredentialDialog
            open={colando}
            onOpenChange={setColando}
            providerInicial={PROVEDOR_DO_JEV}
            aoSalvar={() => {
              void recarregar();
              // O teste da chave roda depois da resposta (ver a rota de criar):
              // a segunda leitura pega o resultado sem a pessoa recarregar a tela.
              setTimeout(() => void recarregar(), 3000);
            }}
          />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("Só quem administra a empresa pode colar a chave e ligar o Jev.")}
        </p>
      )}
    </div>
  );
}

function ProblemaDaChave({ dados, recarregar }: { dados: DadosDoJev; recarregar: () => Promise<void> }) {
  const t = useT();
  const [testando, setTestando] = useState(false);
  const erro = descreverErroDeValidacao(dados.chave.erro_de_validacao);
  const motivo = !dados.chave.existe
    ? t("O Jev está ligado, mas sem chave ativa: enquanto isso, ele não mede nada.")
    : !dados.chave.erro_de_validacao
      ? t("A chave ainda está sendo testada. Leva alguns segundos.")
      : erro.generico
        ? `${t("Falha na validação")} (${dados.chave.erro_de_validacao}).`
        : t(erro.frase);

  async function testar() {
    setTestando(true);
    try {
      const res = await fetch(`/api/v1/ai/credentials/${dados.chave.credencial_id}/revalidate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { validated_at: string | null };
        error?: { message?: string };
      } | null;
      if (!res.ok) toast.error(json?.error?.message ? t(json.error.message) : t("não consegui salvar"));
      else if (json?.data?.validated_at) toast.success(t("A chave passou no teste."));
      else toast.error(t("A chave não passou no teste."));
      await recarregar();
    } catch {
      toast.error(t("não consegui falar com o servidor"));
    } finally {
      setTestando(false);
    }
  }

  return (
    <div className="mt-4 rounded-md bg-warning-bg p-3 text-sm text-warning-fg" data-testid="jev-chave">
      <p>{motivo}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {dados.pode_editar && dados.chave.credencial_id && (
          <Button size="sm" variant="outline" disabled={testando} onClick={() => void testar()}>
            {testando ? t("Testando…") : t("Testar de novo")}
          </Button>
        )}
        <Link className="text-xs underline underline-offset-4" href="/app/ai/credentials">
          {t("Trocar a chave em Credenciais")}
        </Link>
      </div>
    </div>
  );
}

/** Um PATCH na rota do Jev, com o aviso de volta e a releitura do cartão. */
function useMudarOJev(recarregar: () => Promise<void>) {
  const t = useT();
  const [enviando, setEnviando] = useState(false);

  async function mudar(corpo: Record<string, unknown>, sucesso: string) {
    setEnviando(true);
    try {
      const res = await fetch("/api/v1/ai/jev", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        // A recusa da rota já vem escrita para leigo e no idioma de quem pediu.
        toast.error(json?.error?.message ? t(json.error.message) : t("não consegui salvar"));
        return;
      }
      toast.success(sucesso);
      await recarregar();
    } catch {
      toast.error(t("não consegui falar com o servidor"));
    } finally {
      setEnviando(false);
    }
  }

  return { mudar, enviando };
}

function ProntoParaLigar({ dados, recarregar }: { dados: DadosDoJev; recarregar: () => Promise<void> }) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { mudar, enviando } = useMudarOJev(recarregar);
  const [concordo, setConcordo] = useState(false);
  // O aceite é da empresa, e vale uma vez (D6): religar não pergunta de novo.
  const aceite = dados.config.aceite;
  const pedeAceite = aceite === null;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-sm font-medium">{t("O que o Jev vai fazer")}</p>
        <ul className="mt-1 space-y-1 text-sm">
          {dados.tarefas.map((tarefa) => (
            <li key={tarefa.id}>
              <span className="font-medium">{t(tarefa.rotulo)}</span>
              <span className="text-muted-foreground"> — {t(tarefa.oQueOJevFaz)}</span>
            </li>
          ))}
        </ul>
        {dados.tem_ia_de_sempre && (
          <p className="mt-2 text-xs text-muted-foreground">
            {dados.config.modo === "observacao"
              ? t(
                  "Ele começa só observando: a sua IA de sempre continua decidindo, e você compara os dois antes de deixar o Jev decidir.",
                )
              : t("Ele volta decidindo, como estava antes de ser desligado.")}
          </p>
        )}
      </div>

      <div className="rounded-md border border-border p-3 text-sm">
        <p>
          {t(
            "Ao ligar, cada mensagem que o cliente manda vai para a TypeSafe AI, nos Estados Unidos, uma de cada vez e sem o resto da conversa, para o Jev avaliar. Antes de sair, o sistema apaga CPF, telefone e e-mail do texto. Com o Jev desligado, nada é enviado.",
          )}
        </p>
        {aceite === null ? (
          <div className="mt-3 flex items-start gap-2">
            <input
              id="jev-aceite"
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-[var(--color-accent)]"
              checked={concordo}
              onChange={(e) => setConcordo(e.target.checked)}
              disabled={!dados.pode_editar}
            />
            <label htmlFor="jev-aceite" className="text-sm">
              {t(
                "Concordo com o envio de cada mensagem dos clientes, uma de cada vez e sem o resto da conversa, para a TypeSafe AI, nos Estados Unidos.",
              )}
            </label>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Envio aceito pela empresa em")}{" "}
            {new Date(aceite.em).toLocaleDateString(tagDoIdioma)}.
          </p>
        )}
      </div>

      {dados.pode_editar && (
        <Button
          size="sm"
          disabled={enviando || (pedeAceite && !concordo)}
          onClick={() =>
            void mudar(pedeAceite ? { ligado: true, aceite_lgpd: true } : { ligado: true }, t("O Jev foi ligado."))
          }
        >
          {enviando ? t("Ligando…") : t("Ligar o Jev")}
        </Button>
      )}
    </div>
  );
}

function Ligado({
  dados,
  estado,
  recarregar,
}: {
  dados: DadosDoJev;
  estado: Estado;
  recarregar: () => Promise<void>;
}) {
  const t = useT();
  const tagDoIdioma = useTagDeIdioma();
  const { mudar, enviando } = useMudarOJev(recarregar);
  const n = dados.numeros;
  const o = n.observacao;

  // `cost_cents` é centavo de DÓLAR, e o Jev custa fração de centavo por
  // mensagem: com 2 casas a semana inteira mostraria "US$ 0,00".
  const usd = new Intl.NumberFormat(tagDoIdioma, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
  const segundos = new Intl.NumberFormat(tagDoIdioma, { maximumFractionDigits: 1 });
  const inteiro = new Intl.NumberFormat(tagDoIdioma);
  const falha = dados.ultima_falha;
  const frasesDeFalha: Readonly<Record<string, string>> = O_QUE_FAZER_DO_JEV;
  const oQueFazer = falha?.motivo ? frasesDeFalha[falha.motivo] : undefined;

  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm">
        {estado === "observando" &&
          t("Observando — a sua IA de sempre ainda decide. Compare os dois antes de deixar o Jev decidir.")}
        {estado === "decidindo" &&
          t("Decidindo — o Jev mede primeiro, e a sua IA de sempre só entra se ele não responder.")}
        {estado === "sozinho" &&
          t("Decidindo sozinho — a empresa não tem a IA de sempre, então o Jev mede o clima sem reserva.")}
      </p>

      {estado === "observando" && (
        <p className="text-sm" data-testid="jev-concordancia">
          {o.comparadas === 0 ? (
            t("Ainda não há mensagens medidas pelos dois. A comparação aparece aqui assim que houver.")
          ) : (
            <>
              {t("Nos últimos")} {o.dias} {t("dias, o Jev e a sua IA de sempre chegaram à mesma conclusão em")}{" "}
              <span className="font-mono font-medium">
                {inteiro.format(o.concordaram)} {t("de")} {inteiro.format(o.comparadas)}
              </span>{" "}
              {t("mensagens — os dois chamariam, ou não, uma pessoa para a conversa.")}
            </>
          )}
        </p>
      )}

      <div>
        <p className="text-xs text-muted-foreground">
          {t("Nos últimos")} {n.dias} {t("dias")}
        </p>
        <dl
          className="mt-2 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-4"
          data-testid="jev-numeros"
        >
          <Numero rotulo={t("Mensagens medidas")} valor={inteiro.format(n.decisoes)} />
          <Numero rotulo={t("Custo")} valor={usd.format(n.custo_cents / 100)} />
          <Numero
            rotulo={t("Tempo médio")}
            valor={n.latencia_media_ms === null ? "—" : `${segundos.format(n.latencia_media_ms / 1000)} s`}
          />
          {estado !== "sozinho" && (
            <Numero rotulo={t("Vezes que a IA de sempre cobriu o Jev")} valor={inteiro.format(n.reservas)} />
          )}
        </dl>
      </div>

      {falha && (
        <p className="rounded-md bg-warning-bg p-2 text-xs text-warning-fg" data-testid="jev-ultima-falha">
          <span className="font-medium">
            {t("Última falha")} ({new Date(falha.em).toLocaleString(tagDoIdioma)}):
          </span>{" "}
          {oQueFazer ? t(oQueFazer) : t("O Jev não conseguiu medir.")}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          className="text-sm underline underline-offset-4"
          href={`/app/ai/runs?provider=${PROVEDOR_DO_JEV}`}
        >
          {t("Ver as decisões do Jev")}
        </Link>
        {dados.pode_editar && (
          <>
            {estado === "observando" && (
              <Button
                size="sm"
                disabled={enviando}
                onClick={() => void mudar({ modo: "decide" }, t("Agora o Jev decide."))}
              >
                {t("Deixar o Jev decidir")}
              </Button>
            )}
            {/* Sem este caminho, quem deixou o Jev decidir só voltaria a
                comparar desligando — e religar mantém o modo gravado. */}
            {estado === "decidindo" && (
              <Button
                size="sm"
                variant="outline"
                disabled={enviando}
                onClick={() => void mudar({ modo: "observacao" }, t("O Jev voltou a só observar."))}
              >
                {t("Voltar a só observar")}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={enviando}
              onClick={() => void mudar({ ligado: false }, t("O Jev foi desligado."))}
            >
              {t("Desligar")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="mt-0.5 font-mono text-lg">{valor}</dd>
    </div>
  );
}
