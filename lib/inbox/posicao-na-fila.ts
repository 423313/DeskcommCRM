/**
 * O NÚMERO DO SELO DA ABA FILA — a posição de ESPERA, não o lugar na lista.
 *
 * ─── O defeito que este módulo fecha ────────────────────────────────────────
 *
 * Até a unificação da ordem (#639) a aba Fila era a única com `ORDER BY`
 * próprio: `last_inbound_at` ASC, a MESMA régua de `getQueuePositions`. O índice
 * da lista visível (`i + 1`) coincidia com a posição de espera por construção, e
 * o selo "1º na fila" dizia a verdade por acidente.
 *
 * Com a lista passando a ordenar por atividade recente (`last_message_at` DESC),
 * o índice deixou de ser a posição — mas o selo continuou desenhando o índice, e
 * ele continua rotulado `aria-label="Posição N na fila"`. Resultado: o mesmo
 * produto passava a dizer números DIFERENTES para a MESMA conversa — "1º" na
 * tela do atendente e "2º" pelo MCP e pela mensagem que o cliente recebe no
 * WhatsApp (`getQueuePosition`). É a divergência que
 * `tests/unit/fila-tem-uma-definicao-so.test.ts` nomeia como sua razão de
 * existir, agora do outro lado.
 *
 * ─── Por que na BORDA HTTP, e não no handler ────────────────────────────────
 *
 * Mesma razão de `lib/users/com-nome-do-atendente.ts`, escrita em
 * `app/api/v1/conversations/route.ts`: `listConversationsHandler` é compartilhado
 * com as tools MCP, e a tool `crm_list_conversations` JÁ resolve `queue_position`
 * por conta própria (`lib/mcp/tools/conversations.ts`). Enriquecer dentro do
 * handler faria a mesma leitura duas vezes em toda chamada do agente.
 *
 * ─── Uma consulta por PÁGINA, nunca por linha ───────────────────────────────
 *
 * `getQueuePositions` devolve o mapa inteiro da fila numa consulta só (a fila é
 * pequena por natureza — quem espera está esperando). Perguntar linha a linha
 * seria N+1 numa listagem de 50.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getQueuePositions } from "@/lib/routing/queue";

/** O que a conversa ganha na borda: a posição de espera, ou `null` fora da fila. */
export type ComPosicaoNaFila<T> = T & { queue_position: number | null };

/**
 * A visão é a aba Fila?
 *
 * As abas pedem `comando` desde a migration 0203; `assigned_to=unassigned` é a
 * forma antiga, mantida porque a tela ainda a aceita como fallback
 * (`components/inbox/ConversationList.tsx`). As duas leituras têm de concordar:
 * a tela decide SE desenha o selo, e esta decide se o número existe.
 */
export function ehAVisaoDaFila(q: {
  comando?: string[] | undefined;
  assigned_to?: string | undefined;
}): boolean {
  if (q.comando?.includes("aguardando")) return true;
  return q.assigned_to === "unassigned";
}

/**
 * Acrescenta `queue_position` a cada conversa da página.
 *
 * Fora da fila o campo é `null` EXPLÍCITO, e não ausente: a tela distingue "não
 * é fila" de "é fila e a conversa não está no mapa" — a segunda é o estado em
 * que o selo não pode aparecer, porque não há número honesto a mostrar.
 */
export async function comPosicaoNaFila<T extends { id: string }>(
  supabase: SupabaseClient,
  organizationId: string,
  conversas: T[],
  ehFila: boolean,
): Promise<ComPosicaoNaFila<T>[]> {
  if (!ehFila || conversas.length === 0) {
    return conversas.map((c) => ({ ...c, queue_position: null }));
  }
  const posicoes = await getQueuePositions(supabase, organizationId);
  return conversas.map((c) => ({ ...c, queue_position: posicoes.get(c.id) ?? null }));
}
