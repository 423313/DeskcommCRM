import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { resolveAuthDual, tetoDeEscritaDoToken } from "@/lib/api/auth-dual";
import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";
import { validateRequest } from "@/lib/schemas";
import {
  criarRascunho,
  JANELA_MAXIMA_HORAS,
  JANELA_PADRAO_HORAS,
  TEXTO_MAXIMO,
} from "@/lib/inbox/rascunho-sugerido";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/v1/conversations/[id]/drafts — a porta de criação do rascunho
 * sugerido por integração (issue #1611).
 *
 * Devolve a URL; NUNCA envia mensagem. Quem recebe o link abre a conversa com o
 * texto no `Composer` e o aviso de origem, e só um clique de gente manda.
 *
 * Auth-dual (sessão OU Bearer `dsk_...` com escopo `mcp:write`) — a mesma
 * metade que `POST /api/v1/conversations/open-with-contact` já aceita, porque a
 * conversa pode nascer ali. O rate limit por token é o mesmo das outras portas
 * que aceitam Bearer (`tetoDeEscritaDoToken`): o que não é contado na rota não
 * é contado em lugar nenhum.
 */
export async function POST(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await resolveAuthDual(req, {
    requestId,
    resource: "conversations",
    role: "agent",
    scope: "mcp:write",
  });
  if (!authz.ok) return authz.response;
  // O ramo do token não traz idioma: cai no padrão do produto.
  const t = (texto: string) => traduzir(texto, authz.idioma ?? IDIOMA_PADRAO);

  const teto = await tetoDeEscritaDoToken(authz, "drafts", requestId);
  if (teto) return teto;

  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success) {
    return fail("validation_error", t("Conversa inválida."), 422, { requestId });
  }

  let input;
  try {
    input = await validateRequest(
      z.object({
        texto: z.string().min(1).max(TEXTO_MAXIMO),
        origem: z.string().trim().min(1).max(64).default("integracao"),
        expira_em_horas: z
          .number()
          .int()
          .min(1)
          .max(JANELA_MAXIMA_HORAS)
          .default(JANELA_PADRAO_HORAS),
      }),
      req,
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const resultado = await criarRascunho(authz.supabase, {
    organizationId: authz.organizationId,
    conversationId: id,
    texto: input.texto,
    origem: input.origem,
    expiraEmHoras: input.expira_em_horas,
    apiTokenId: authz.apiTokenId ?? null,
  });

  if (!resultado.ok) {
    if (resultado.motivo === "conversa_nao_encontrada") {
      return fail("not_found", t("Conversa não encontrada."), 404, { requestId });
    }
    if (resultado.motivo === "origem_invalida") {
      return fail("validation_error", t("Origem do rascunho inválida."), 422, { requestId });
    }
    return fail("validation_error", t("Texto do rascunho inválido."), 422, { requestId });
  }

  await audit({
    action: "conversation.draft_created",
    actorUserId: authz.actor.type === "user" ? authz.actor.id : null,
    actorApiTokenId: authz.apiTokenId ?? null,
    organizationId: authz.organizationId,
    resourceType: "conversation",
    resourceId: id,
    requestId,
    metadata: { draft_id: resultado.draftId, origem: input.origem },
  });

  return ok({ draft_id: resultado.draftId, url: resultado.url }, { status: 201, requestId });
}
