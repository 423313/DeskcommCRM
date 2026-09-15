"use client";

import { useId, useState, useTransition } from "react";

import {
  definirClientePelaAgenda,
  type ErroClientePelaAgenda,
  type ResultadoClientePelaAgenda,
} from "@/app/actions/settings/definirClientePelaAgenda";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";

/**
 * CLIENTES PELA AGENDA — o interruptor da regra da migration 0262.
 *
 * Mora em Configurações › Tipos de agendamento, logo abaixo de "Confirmação de
 * presença": é a única tela com regra de comportamento da agenda por
 * organização, e a regra nasce de `calendar_appointments`.
 *
 * ⚠️ LIGAR PEDE CONFIRMAÇÃO, DESLIGAR NÃO. Ligar etiqueta de uma vez todo
 * contato que já teve horário, e desligar depois não tira a etiqueta de
 * ninguém — o diálogo diz isso ANTES, que é o único momento em que a frase
 * serve. Desligar não mexe em contato nenhum, então não há o que confirmar.
 *
 * ⚠️ O ESTADO E O RESULTADO VÊM DO CORPO DA ACTION, nunca de um
 * `router.refresh` que perca a corrida para os prefetches da barra lateral. O
 * número de contatos etiquetados é o que o banco contou na mesma transação.
 */

/** A frase de cada recusa. Textos que o produto já usa em outras telas. */
const TEXTO_DO_ERRO: Record<ErroClientePelaAgenda, string> = {
  sessao: "Sua sessão expirou. Entre de novo.",
  somente_leitura: "Acompanhamento somente leitura ou encerrado.",
  sem_empresa: "Nenhuma empresa ativa.",
  sem_permissao: "Só um administrador pode mudar essa regra.",
  mfa: "Confirme a verificação em duas etapas.",
  tente_de_novo: "Outra mudança estava em andamento. Tente de novo.",
  falha: "Não consegui salvar essa mudança agora.",
};

export function ClientePelaAgenda({
  ligadoInicial,
  podeLigar,
}: {
  ligadoInicial: boolean;
  /** Espelha o papel `admin` que `fn_definir_cliente_pela_agenda` cobra. Cortesia, não autorização. */
  podeLigar: boolean;
}) {
  const t = useT();
  const idDoRotulo = useId();
  const [ligado, setLigado] = useState(ligadoInicial);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoClientePelaAgenda | null>(null);
  const [erro, setErro] = useState<ErroClientePelaAgenda | null>(null);
  const [salvando, iniciar] = useTransition();

  function aplicar(novo: boolean) {
    setErro(null);
    setResultado(null);
    iniciar(async () => {
      const r = await definirClientePelaAgenda(novo);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setLigado(r.ligado);
      // Só a LIGAÇÃO tem o que contar; ao desligar, nenhum contato mudou.
      if (r.ligado && r.mudou) {
        setResultado({
          ligado: r.ligado,
          mudou: r.mudou,
          ganharam_etiqueta: r.ganharam_etiqueta,
          perderam_etiqueta: r.perderam_etiqueta,
          clientes: r.clientes,
        });
      }
    });
  }

  function aoMudar(novo: boolean) {
    if (novo) {
      setConfirmando(true);
      return;
    }
    aplicar(false);
  }

  return (
    <section className="space-y-3 rounded-xl border p-4" data-testid="cliente-pela-agenda">
      <h2 className="font-semibold">{t("Clientes pela agenda")}</h2>

      <div className="flex items-center gap-3">
        <Switch
          checked={ligado}
          onCheckedChange={aoMudar}
          disabled={!podeLigar || salvando}
          aria-labelledby={idDoRotulo}
          data-testid="cliente-pela-agenda-interruptor"
        />
        <span id={idDoRotulo} className="text-sm font-medium">
          {t("Quem tem horário marcado vira cliente")}
        </span>
      </div>

      <p className="text-sm text-text-muted">
        {t(
          "Com isto ligado, todo contato com horário marcado ganha a etiqueta “cliente” e a ficha passa a mostrar “Cliente desde”. Ao ligar, quem já teve horário marcado também ganha. Horário cancelado e falta não contam: se não sobrar nenhum horário que conte, a etiqueta sai. Se alguém da equipe tirar a etiqueta à mão, ela não volta enquanto a pessoa continuar cliente.",
        )}
      </p>

      <p className="text-sm" data-testid="cliente-pela-agenda-estado">
        {ligado
          ? t("Ligado: quem marcar horário ganha a etiqueta “cliente” na hora.")
          : t(
              "Desligado: ninguém ganha a etiqueta, a ficha não mostra “Cliente desde” e todo contato novo entra pelo funil padrão. As etiquetas que já existem ficam como estão.",
            )}
      </p>

      <p className="text-sm text-text-muted">
        {t(
          "As automações “Quando um contato ganhar uma tag” disparam para quem virar cliente depois de ligar — não para quem já era cliente antes.",
        )}
      </p>

      {!podeLigar && (
        <p className="text-sm text-text-muted">{t("Só um administrador pode mudar essa regra.")}</p>
      )}

      {resultado && (
        <div role="status" className="space-y-1 text-sm" data-testid="cliente-pela-agenda-resultado">
          <p>
            {resultado.ganharam_etiqueta === 0
              ? t(
                  "Nenhum contato tinha horário marcado ainda. Quem marcar daqui em diante ganha a etiqueta.",
                )
              : resultado.ganharam_etiqueta === 1
                ? t("1 contato ganhou a etiqueta “cliente”.")
                : t("{n} contatos ganharam a etiqueta “cliente”.").replace(
                    "{n}",
                    String(resultado.ganharam_etiqueta),
                  )}
          </p>
          {resultado.perderam_etiqueta > 0 && (
            <p>
              {t(
                "{m} deixaram de ser clientes: os horários deles foram cancelados ou tiveram falta enquanto a regra estava desligada.",
              ).replace("{m}", String(resultado.perderam_etiqueta))}
            </p>
          )}
        </div>
      )}

      {erro && (
        <p role="alert" className="text-sm text-destructive" data-testid="cliente-pela-agenda-erro">
          {t(TEXTO_DO_ERRO[erro])}
        </p>
      )}

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Ligar clientes pela agenda?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "Todos os contatos que já tiveram horário marcado (sem contar cancelados e faltas) ganham a etiqueta “cliente” agora. Desligar depois não tira a etiqueta de ninguém.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Cancelar")}</AlertDialogCancel>
            <Button
              onClick={() => {
                setConfirmando(false);
                aplicar(true);
              }}
              data-testid="cliente-pela-agenda-confirmar"
            >
              {t("Ligar")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
