/**
 * POST /api/v1/tenants/provision — um sistema externo cria (ou reencontra,
 * idempotente por integração + id externo) uma organização e recebe uma chave
 * de API `dsk_…` para operá-la.
 *
 * Decisão do dono (doc 38, opção b): a porta existe, mas a chave é do DONO DA
 * INSTALAÇÃO — `TENANT_PROVISIONING_SECRET` no `.env`, nunca uma chave de
 * organização — e nasce DESLIGADA. Sem o segredo (ou com um curto demais), a
 * rota responde 404: para quem não ligou, ela não existe. É uma segunda porta
 * de cadastro que não passa pela chave de cadastro da instalação, então só quem
 * já manda na instalação pode abri-la.
 *
 * O `organization_id` não vem do cliente em momento nenhum: ele nasce aqui, ou é
 * reencontrado pelo marcador que o próprio provisionamento gravou.
 */
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { ProvisionConflictError, provisionExternalTenant } from "@/lib/auth/provision";
import { env } from "@/lib/env";
import { ipDoCliente } from "@/lib/http/ip-do-cliente";
import { logger } from "@/lib/logger";
import { provisionTenantSchema, type ProvisionTenantInput } from "@/lib/schemas/tenant-provisioning";
import { validateRequest } from "@/lib/schemas/_validate";
import { rotateIntegrationApiKey } from "@/lib/tenants/api-key";

export const dynamic = "force-dynamic";

/** Abaixo disto o segredo é adivinhável, e a rota fica desligada. */
const TAMANHO_MINIMO_DO_SEGREDO = 32;
/** Pedidos por IP por minuto — acima disto é varredura de segredo, não integração. */
const PEDIDOS_POR_MINUTO = 10;

function segredoDaInstalacao(): string | null {
  const segredo = env.TENANT_PROVISIONING_SECRET.trim();
  return segredo.length >= TAMANHO_MINIMO_DO_SEGREDO ? segredo : null;
}

/** Comparação em tempo constante; tamanhos diferentes nunca autenticam. */
function bearerConfere(req: NextRequest, esperado: string): boolean {
  const auth = req.headers.get("authorization") ?? "";
  const recebido = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const esperado = segredoDaInstalacao();
  if (!esperado) return fail("not_found", "Not found.", 404, { requestId });

  // Antes de conferir o segredo: o limite existe para quem tenta adivinhá-lo.
  const limite = await checkRateLimit(
    `tenants_provision:${ipDoCliente(req.headers) ?? "desconhecido"}`,
    PEDIDOS_POR_MINUTO,
    60,
  );
  const cabecalhosDoLimite = {
    "X-RateLimit-Limit": String(limite.limit),
    "X-RateLimit-Remaining": String(Math.max(0, limite.limit - limite.count)),
  };
  if (!limite.allowed) {
    return fail("rate_limited", "Too many requests.", 429, {
      requestId,
      headers: { ...cabecalhosDoLimite, "Retry-After": "60" },
    });
  }

  if (!bearerConfere(req, esperado)) {
    return fail("unauthenticated", "Credencial inválida.", 401, {
      requestId,
      headers: cabecalhosDoLimite,
    });
  }

  let input: ProvisionTenantInput;
  try {
    input = await validateRequest(provisionTenantSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  try {
    const { organizationId, ownerId, replay } = await provisionExternalTenant({
      integration: input.integration,
      externalId: input.external_id,
      organizationName: input.organization_name,
      ownerEmail: input.owner_email,
      ownerName: input.owner_name,
    });

    const apiKey = await rotateIntegrationApiKey({
      organizationId,
      createdBy: ownerId,
      integrationScope: `integration:${input.integration}`,
      name: `${input.integration} (integração)`,
      requestId,
    });

    return ok(
      { organization_id: organizationId, api_key: apiKey, replay },
      { status: replay ? 200 : 201, requestId, headers: cabecalhosDoLimite },
    );
  } catch (err) {
    if (err instanceof ProvisionConflictError) {
      return fail(
        "provisioning_conflict",
        "Já existe uma organização com este identificador que não nasceu deste provisionamento.",
        409,
        { requestId },
      );
    }
    logger.error("[tenants.provision] falhou", {
      requestId,
      erro: err instanceof Error ? err.message : String(err),
    });
    return fail("internal_error", "Não foi possível provisionar a organização.", 500, { requestId });
  }
}
