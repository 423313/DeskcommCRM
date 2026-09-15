/**
 * O NÚMERO QUE A LIGAÇÃO DISCA É O QUE O WHATSAPP REGISTROU, NÃO O DO CADASTRO.
 *
 * Medido na VPS em 2026-09-15: o contato `+5531998966398` foi discado como
 * `5531998966398@s.whatsapp.net`. O WhatsApp registra esse celular como
 * `553198966398` — sem o nono dígito, o caso comum em DDD fora de São Paulo —,
 * e o WAHA confirmou (`check-exists` das duas grafias → `553198966398@c.us`).
 * O WaCalls não pergunta nada a ninguém: monta o destino com
 * `types.NewJID(dígitos, DefaultUserServer)`. A oferta saiu para um endereço
 * que não existe, o painel ficou em "Chamando…" e a ligação expirou tocando
 * sem que telefone nenhum tocasse.
 *
 * O CRM guarda o celular brasileiro COM o nono dígito, de propósito
 * (`lib/channels/phone-variants.ts`), e o envio de mensagem já pergunta ao
 * transporte qual grafia existe (`lib/waha/resolve-contact-whatsapp-id.ts`).
 * A ligação passa a fazer o mesmo, pelo WAHA da organização.
 *
 * Falha ABERTA: sem WAHA configurado, sem sessão de mensagens em pé, só `@lid`
 * ou consulta que não voltou, disca o número do cadastro — exatamente o
 * comportamento anterior. Recusar aqui trocaria "às vezes não toca" por
 * "nunca liga" em toda instalação que usa só o canal oficial.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getWahaClient, type WahaClient } from "@/lib/waha/client";
import { resolvePhoneJidDigitsForCall } from "@/lib/waha/resolve-contact-whatsapp-id";

/**
 * Quanto a ligação espera o WAHA responder antes de discar o cadastro.
 *
 * Cada `check-exists` tem teto de 15 s (`TETO_PADRAO_MS`) e são até duas grafias
 * em série: com o WAHA aceitando conexão e sem responder, a rota passava dos
 * 30 s em que o navegador desiste de uma escrita (`MUTATION_TIMEOUT_MS`). A tela
 * mostrava erro, o botão seguia livre para outro clique, e a ligação saía mesmo
 * assim ~31 s depois — uma por clique. Numa resposta normal o WAHA devolve em
 * dezenas de milissegundos; 4 s é folga, não estimativa.
 */
export const PRAZO_DA_CONSULTA_MS = 4_000;

export interface NumeroDiscavel {
  /** Só dígitos, sem `+` — a forma que `POST /api/sessions/{sid}/calls` recebe. */
  digitos: string;
  /** `whatsapp` = confirmado pelo transporte; `cadastro` = fallback sem confirmação. */
  fonte: "whatsapp" | "cadastro";
}

export async function resolverNumeroDiscavel(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  organizationId: string,
  telefone: string,
  deps: { waha: () => WahaClient | null; prazoMs?: number } = { waha: getWahaClient },
): Promise<NumeroDiscavel> {
  const doCadastro: NumeroDiscavel = { digitos: telefone.replace(/\D/g, ""), fonte: "cadastro" };

  const waha = deps.waha();
  if (!waha) return doCadastro;

  // Qualquer sessão de mensagens em pé serve: o check-exists consulta o
  // diretório do WhatsApp, e a resposta não depende de qual conta perguntou.
  const { data } = await supabase
    .from("channel_sessions")
    .select("waha_session_name")
    .eq("organization_id", organizationId)
    .eq("provider", "waha")
    .eq("status", "WORKING")
    .is("archived_at", null)
    .not("waha_session_name", "is", null)
    .limit(1)
    .maybeSingle();
  const sessao = (data as { waha_session_name: string | null } | null)?.waha_session_name;
  if (!sessao) return doCadastro;

  // A consulta que estoura o prazo segue em segundo plano e é descartada: é
  // leitura, não tem efeito a desfazer.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const prazo = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), deps.prazoMs ?? PRAZO_DA_CONSULTA_MS);
  });
  try {
    const digitos = await Promise.race([resolvePhoneJidDigitsForCall(waha, sessao, telefone), prazo]);
    return digitos ? { digitos, fonte: "whatsapp" } : doCadastro;
  } finally {
    clearTimeout(timer);
  }
}
