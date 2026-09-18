/**
 * RESGATAR O PRÊMIO — dentro de uma comanda aberta.
 *
 * O cartão completo vira desconto no item premiado e o saldo zera, numa
 * transação só. Quem faz as duas coisas é `fn_resgatar_premio` (9013): fazer
 * aqui, em duas chamadas, deixaria a janela em que o desconto existe e o
 * cartão ainda não zerou — e um F5 no meio dela dá dois prêmios.
 *
 * Chamada com o client da SESSÃO, de propósito: é `auth.uid()` que faz a
 * função exigir papel e assinar o movimento.
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

const corpoSchema = z.object({ sale_item_id: z.string().uuid() });

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const authz = await requireRole("agent", { requestId, resource: "financeiro" });
  if (!authz.ok) return authz.response;

  const lido = corpoSchema.safeParse(await req.json().catch(() => ({})));
  if (!lido.success) {
    return fail("validation_failed", lido.error.issues[0]?.message ?? "corpo inválido", 422, {
      requestId,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_resgatar_premio", {
    p_org: authz.org.orgId,
    p_sale_item: lido.data.sale_item_id,
  });

  if (error) {
    // Cada recusa da função vira a frase que explica o que fazer. Um 500
    // genérico aqui mandaria a pessoa do balcão chamar suporte por uma regra
    // de negócio que ela mesma resolve.
    const m = error.message ?? "";
    if (m.includes("fidelidade_forbidden")) {
      return fail("forbidden", "Você não pode resgatar prêmio nesta organização.", 403, { requestId });
    }
    if (m.includes("cartao_incompleto")) {
      return fail("conflict", m.replace(/^.*cartao_incompleto[: ]*/i, "") || "O cartão ainda não está completo.", 409, { requestId });
    }
    if (m.includes("servico_nao_e_premio")) {
      return fail("validation_failed", "Este serviço não está marcado como prêmio.", 422, { requestId });
    }
    if (m.includes("comanda_nao_aberta")) {
      return fail("conflict", "A comanda já foi finalizada: o item não muda mais.", 409, { requestId });
    }
    if (m.includes("comanda_sem_cliente")) {
      return fail("validation_failed", "A comanda precisa ter cliente para resgatar o cartão.", 422, { requestId });
    }
    if (m.includes("item_nao_encontrado")) {
      return fail("not_found", "Item não encontrado.", 404, { requestId });
    }
    return fail("internal_error", m, 500, { requestId });
  }

  await audit({
    action: "fidelidade.premio_resgatado",
    resourceType: "sale_item",
    resourceId: lido.data.sale_item_id,
    requestId,
    metadata: data as Record<string, unknown>,
  });

  return ok(data, { requestId });
}
