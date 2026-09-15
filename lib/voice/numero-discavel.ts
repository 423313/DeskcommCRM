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
  deps: { waha: () => WahaClient | null } = { waha: getWahaClient },
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

  const digitos = await resolvePhoneJidDigitsForCall(waha, sessao, telefone);
  return digitos ? { digitos, fonte: "whatsapp" } : doCadastro;
}
