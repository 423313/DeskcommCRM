/**
 * AJUSTAR O CARTÃO — a mão humana, com motivo.
 *
 * Serve ao cartão de papel que veio de antes do sistema e ao engano de balcão.
 * Define o saldo para um valor; quem grava o delta contra o saldo derivado é
 * `fn_ajustar_fidelidade` (9013), porque o saldo é soma dos movimentos e
 * gravá-lo direto criaria a segunda fonte do mesmo número.
 *
 * Motivo é obrigatório no banco, não só aqui: ajuste sem motivo é saldo que
 * ninguém sabe explicar depois.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const corpoSchema = z.object({
  contact_id: z.string().uuid(),
  selos: z.number().int().min(0).max(10_000),
  motivo: z.string().trim().min(3).max(200),
});

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const authz = await requireRole("manager", { requestId, resource: "financeiro" });
  if (!authz.ok) return authz.response;

  const lido = corpoSchema.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) {
    return fail("validation_failed", lido.error.issues[0]?.message ?? "corpo inválido", 422, {
      requestId,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_ajustar_fidelidade", {
    p_org: authz.org.orgId,
    p_contact: lido.data.contact_id,
    p_selos: lido.data.selos,
    p_motivo: lido.data.motivo,
  });

  if (error) {
    const m = error.message ?? "";
    if (m.includes("fidelidade_forbidden")) {
      return fail("forbidden", "Só quem administra ajusta cartão.", 403, { requestId });
    }
    if (m.includes("motivo_obrigatorio")) {
      return fail("validation_failed", "Escreva o motivo do ajuste.", 422, { requestId });
    }
    if (m.includes("contato_nao_encontrado")) {
      return fail("not_found", "Contato não encontrado.", 404, { requestId });
    }
    return fail("internal_error", m, 500, { requestId });
  }

  await audit({
    action: "fidelidade.cartao_ajustado",
    resourceType: "contact",
    resourceId: lido.data.contact_id,
    requestId,
    // O motivo entra: é ele que explica o ajuste numa auditoria futura.
    metadata: { ...(data as Record<string, unknown>), motivo: lido.data.motivo },
  });

  return ok(data, { requestId });
}
