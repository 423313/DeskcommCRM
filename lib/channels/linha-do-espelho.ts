/**
 * A linha de `meta_templates` que define um modelo PARA UMA CONEXÃO.
 *
 * O espelho tem dois donos, e eles gravam a conexão de jeitos diferentes:
 *
 *   - os parceiros (Datafy, Zernio — `app/api/v1/channels/{partner,graph-partner}/templates`)
 *     gravam `channel_session_id`: a definição é DAQUELE número;
 *   - o sync do canal oficial (`lib/channels/meta/template-sync.ts`) grava por
 *     `waba_id` e deixa `channel_session_id` nulo — a definição é da conta, e o
 *     webhook de status da Meta também chaveia por `waba_id`.
 *
 * Filtrar só por `channel_session_id = <conexão>` (como fazia o envio desde a
 * v1.45.0) não acha NENHUMA linha do canal oficial: o envio de modelo lançava
 * `template_missing` e a conferência deixava passar sem conferir — logo o modelo,
 * que é o único jeito de falar com o lead depois de 24 h.
 *
 * Por isso a busca tem duas etapas: a linha da própria conexão e, só se não
 * houver, a linha sem conexão (a do canal oficial). A linha de OUTRA conexão
 * nunca entra — é o que impede o número A de ser conferido com a definição do
 * número B, o defeito que a v1.45.0 fechou. Duas linhas na mesma etapa seguem
 * sendo erro (`maybeSingle`), como antes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChaveDaDefinicao {
  organizationId: string;
  name: string;
  language: string;
  /** Conexão da conversa. Ausente/`null` = base anterior à 0144: busca sem ela. */
  channelSessionId?: string | null;
}

export async function linhaDoEspelho<T>(
  db: SupabaseClient,
  colunas: string,
  chave: ChaveDaDefinicao,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const base = () =>
    db
      .from("meta_templates")
      .select(colunas)
      .eq("organization_id", chave.organizationId)
      .eq("name", chave.name)
      .eq("language", chave.language);

  if (!chave.channelSessionId) {
    const { data, error } = await base().maybeSingle();
    return { data: (data as T | null) ?? null, error };
  }

  const daConexao = await base().eq("channel_session_id", chave.channelSessionId).maybeSingle();
  if (daConexao.error || daConexao.data) {
    return { data: (daConexao.data as T | null) ?? null, error: daConexao.error };
  }

  const semConexao = await base().is("channel_session_id", null).maybeSingle();
  return { data: (semConexao.data as T | null) ?? null, error: semConexao.error };
}
