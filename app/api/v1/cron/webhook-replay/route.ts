/**
 * GET/POST /api/v1/cron/webhook-replay — a mensagem que o banco recusou por um
 * instante volta a ser tentada.
 *
 * A rota do webhook WAHA já devolve 503 quando o banco falha de forma
 * transitória, e o WAHA reentrega — mas por pouco tempo (a janela de retentativa
 * dele é de segundos, não de minutos). Um banco fora por mais que isso (reinício,
 * backup, troca de servidor) perdia a mensagem mesmo com o 503. O arquivo cru
 * dela, porém, continuava em `webhook_events_log`, marcado `error` com o prefixo
 * `transitoria:` por `lib/waha/desfecho-do-webhook.ts`.
 *
 * Este cron fecha o laço:
 *
 *   - relê essas linhas (mais velhas que `ESPERA_MS`, para não disputar com a
 *     reentrega do próprio WAHA) e as passa pela MESMA ingestão da rota;
 *   - a reentrega é segura: `unique (organization_id, external_id)` transforma a
 *     mensagem que já entrou por outro caminho num `23505`, tratado como dedup;
 *   - a cada falha transitória soma uma tentativa; em `MAX_TENTATIVAS` a linha
 *     vira `dead` e a organização recebe UM aviso na Central (família
 *     `MENSAGEM_QUE_NAO_ENTROU`) — desistir calado recriaria o defeito;
 *   - para na terceira falha transitória seguida da rodada: se o banco ainda não
 *     voltou, martelar as outras linhas só gasta o banco que está se recuperando.
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|
 * INTERNAL_SECRET, fail-closed). Agendado no serviço `scheduler`
 * (`docker/scheduler/entrypoint.sh`).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { autorizaCron } from "@/lib/auth/cron-auth";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { avisoDeEventoMorto, MENSAGEM_QUE_NAO_ENTROU } from "@/lib/event-log/aviso-de-evento-morto";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { processarEventoWaha } from "@/lib/waha/desfecho-do-webhook";
import { conferirContratoWaha, type WahaRoteamento } from "@/lib/waha/envelope";
import { PREFIXO_TRANSITORIA } from "@/lib/waha/falha-transitoria";

export const dynamic = "force-dynamic";

/** Deixa a reentrega do próprio WAHA acontecer antes (ela vem em segundos). */
export const ESPERA_MS = 2 * 60 * 1000;
/** Com o cron a cada minuto, ~20 min de banco fora antes de desistir. */
export const MAX_TENTATIVAS = 20;
const LOTE = 50;
const FALHAS_SEGUIDAS_PARA_PARAR = 3;

type Admin = ReturnType<typeof createAdminClient>;

interface LinhaArquivada {
  id: string;
  organization_id: string;
  channel_session_id: string | null;
  payload_parsed: unknown;
  attempts: number;
  error_message: string | null;
}

export interface ResultadoDoReplay {
  lidas: number;
  processadas: number;
  ainda_falhando: number;
  desistidas: number;
}

async function marcarMorta(admin: Admin, linha: LinhaArquivada, motivo: string, tentativas: number): Promise<void> {
  const { error } = await admin
    .from("webhook_events_log")
    .update({ status: "dead", attempts: tentativas, error_message: motivo.slice(0, 500) })
    .eq("id", linha.id);
  if (error) {
    logger.error("[webhook-replay] não marcou a linha como morta", { log_id: linha.id, detail: error.message });
  }
}

/** Um aviso aberto por organização enquanto durar — Central inundada ninguém lê. */
async function avisarMensagemPerdida(admin: Admin, linha: LinhaArquivada, tentativas: number): Promise<void> {
  try {
    const { data: jaAberto } = await admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", linha.organization_id)
      .eq("kind", "event_dead")
      .eq("status", "open")
      .eq("title", MENSAGEM_QUE_NAO_ENTROU.titulo)
      .limit(1)
      .maybeSingle();
    if (jaAberto) return;
    const { title, body } = avisoDeEventoMorto({
      eventType: "waha.webhook",
      tentativas,
      motivo: linha.error_message ?? "falha transitória do banco",
      efeito: MENSAGEM_QUE_NAO_ENTROU,
    });
    const { error } = await admin.from("agent_inbox_items").insert({
      organization_id: linha.organization_id,
      kind: "event_dead",
      severity: "critical",
      title,
      body,
    });
    if (error) {
      logger.error("[webhook-replay] aviso na Central falhou", {
        organization_id: linha.organization_id,
        detail: error.message,
      });
    }
  } catch (err) {
    logger.error("[webhook-replay] aviso na Central falhou", {
      organization_id: linha.organization_id,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

export async function reprocessarWebhooksWaha(
  admin: Admin,
  now: Date,
  requestId: string,
): Promise<ResultadoDoReplay> {
  const corte = new Date(now.getTime() - ESPERA_MS).toISOString();
  const { data, error } = await admin
    .from("webhook_events_log")
    .select("id, organization_id, channel_session_id, payload_parsed, attempts, error_message")
    .eq("provider", "waha")
    .eq("status", "error")
    .like("error_message", `${PREFIXO_TRANSITORIA}%`)
    .lt("created_at", corte)
    .order("created_at", { ascending: true })
    .limit(LOTE);
  if (error) throw new Error(`query_failed: ${error.message}`);

  const linhas = (data ?? []) as LinhaArquivada[];
  const r: ResultadoDoReplay = { lidas: linhas.length, processadas: 0, ainda_falhando: 0, desistidas: 0 };
  let falhasSeguidas = 0;

  for (const linha of linhas) {
    if (falhasSeguidas >= FALHAS_SEGUIDAS_PARA_PARAR) break;

    const contrato = linha.payload_parsed
      ? conferirContratoWaha(linha.payload_parsed as WahaRoteamento)
      : null;
    if (!contrato || !contrato.ok) {
      // Sem corpo (a retenção já o limpou) ou fora do contrato: tentar de novo
      // não muda nada. Morre, com aviso — a mensagem, se era uma, se perdeu.
      await marcarMorta(admin, linha, "replay: arquivo sem corpo legível", linha.attempts);
      await avisarMensagemPerdida(admin, linha, linha.attempts);
      r.desistidas += 1;
      continue;
    }

    const base = () =>
      admin
        .from("channel_sessions")
        .select(
          "id, organization_id, waha_session_name, webhook_secret_encrypted, status, is_warmup_complete, warmup_started_at",
        )
        .eq("id", linha.channel_session_id ?? "")
        .eq("organization_id", linha.organization_id);
    const { data: session, error: sessErr } = await queryTolerantToMissingArchived(
      () => base().is(ARCHIVED_AT, null).maybeSingle(),
      () => base().maybeSingle(),
    );
    if (sessErr) {
      // A própria leitura falhou: o banco ainda não voltou. Conta e segue a regra de parada.
      falhasSeguidas += 1;
      r.ainda_falhando += 1;
      continue;
    }
    if (!session) {
      // Canal apagado ou arquivado: a rota também não ingeriria. Sem aviso — foi decisão de alguém.
      await marcarMorta(admin, linha, "replay: canal inexistente ou arquivado", linha.attempts);
      r.desistidas += 1;
      continue;
    }

    const desfecho = await processarEventoWaha(admin, session, contrato.envelope, requestId, linha.id);
    if (desfecho === "tentar_de_novo") {
      falhasSeguidas += 1;
      const tentativas = linha.attempts + 1;
      if (tentativas >= MAX_TENTATIVAS) {
        await marcarMorta(admin, linha, linha.error_message ?? "transitoria", tentativas);
        await avisarMensagemPerdida(admin, linha, tentativas);
        r.desistidas += 1;
      } else {
        await admin.from("webhook_events_log").update({ attempts: tentativas }).eq("id", linha.id);
        r.ainda_falhando += 1;
      }
      continue;
    }
    falhasSeguidas = 0;
    if (desfecho === "processado") r.processadas += 1;
    else r.desistidas += 1;
  }
  return r;
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  if (!autorizaCron(req)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let result: ResultadoDoReplay;
  try {
    result = await reprocessarWebhooksWaha(createAdminClient(), new Date(), requestId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[webhook-replay] falhou", { error: detail, requestId });
    return fail("internal_error", "Failed to replay webhooks.", 500, { requestId });
  }

  // Rodada que não reprocessou nem desistiu de nada não é mutação e não audita.
  if (result.processadas + result.desistidas > 0) {
    void audit({
      action: "webhook.replay_run",
      organizationId: null,
      bypassedRls: true,
      metadata: result as unknown as Record<string, unknown>,
      requestId,
    });
  }

  return ok(result, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
