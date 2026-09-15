/**
 * O TEXTO DO AVISO `event_dead` — um texto, os DOIS drenos que desistem.
 *
 * Existem dois lugares que marcam um evento de `event_log` como `dead`:
 * `lib/event-log/drain.ts` (mídia, automações, integrações — todo tipo com
 * handler registrado) e `lib/agent-engine/edge/crm/drain.ts`, que drena só
 * `ai_agent.dispatch_requested`, o evento que faz a IA responder o cliente. O
 * aviso nasceu no primeiro e o segundo seguia morrendo calado. O texto mora aqui
 * para os dois dizerem a mesma coisa, e para a regra de escrita valer nos dois.
 *
 * ═══ A REGRA DE ESCRITA ═══
 *
 * O corpo só pede o que a tela oferece. A primeira versão mandava "conferir o
 * registro de eventos e reprocessar" — não existe tela de `event_log` nem botão
 * de reprocessar, e um evento `dead` não volta para a fila sozinho. O aviso
 * pedia a quem lê a Central uma ação que o produto não oferece.
 *
 * O que a tela DE FATO oferece, e por isso o que o corpo diz:
 *  - a orientação da política (`POLITICAS_DE_AVISO.event_dead`), renderizada
 *    pela Central logo abaixo — não se repete aqui;
 *  - o botão "Marcar resolvido", que é o que REARMA o aviso: o dedupe é por
 *    `kind`, então enquanto este estiver aberto, as mortes seguintes da mesma
 *    organização não abrem outro. Quem não souber disso resolve o primeiro
 *    problema e fica cego para o segundo;
 *  - quando o dreno sabe o que o evento ia fazer, o lugar onde a pessoa
 *    consegue fazer à mão o que o sistema não fez.
 */

export interface EventoMorto {
  eventType: string;
  /** Quantas vezes o evento foi tentado, contando a que o matou. */
  tentativas: number;
  motivo: string;
  /**
   * O que deixou de acontecer, dito por quem opera. Sem isto o título cai no
   * genérico — o dreno de handlers não sabe traduzir cada tipo que carrega.
   */
  efeito?: { titulo: string; consequencia: string };
}

const CONSEQUENCIA_GENERICA =
  "O efeito que esse evento ia causar não aconteceu, e ele não será tentado de novo.";

export function avisoDeEventoMorto(evento: EventoMorto): { title: string; body: string } {
  return {
    title: evento.efeito?.titulo ?? `Um processamento parou de tentar (${evento.eventType})`,
    body:
      `O evento "${evento.eventType}" falhou ${evento.tentativas} vezes e parou de tentar. ` +
      `Motivo: ${evento.motivo.slice(0, 400)}. ` +
      `${evento.efeito?.consequencia ?? CONSEQUENCIA_GENERICA} ` +
      `Enquanto este aviso estiver aberto, outros processamentos que pararem de tentar não abrem aviso novo: ` +
      `depois de corrigida a causa, marque-o como resolvido para voltar a ser avisado.`,
  };
}
