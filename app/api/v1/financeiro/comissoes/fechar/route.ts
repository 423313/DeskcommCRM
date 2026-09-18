/**
 * FECHAR A COMISSÃO — pagar o período de uma profissional.
 *
 * Um POST, uma transação: as comissões pendentes do período viram `paid` e
 * nasce UM lançamento de saída que as representa. Não existe tabela de
 * fechamento — o lançamento É o fechamento, e as comissões apontam para ele
 * por `paid_entry_id`.
 *
 * ⚠️ Repetir o mesmo período NÃO devolve "ok, já estava fechado": devolve 409.
 * Mascarar isso esconderia justamente o caso de quem achou que estava fechando
 * comissão nova e pagou o mesmo mês duas vezes.
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

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");

const corpoSchema = z.object({
  professional_id: z.string().uuid(),
  de: dia,
  ate: dia,
  /**
   * De onde o dinheiro sai. Obrigatória, e não adivinhada: escolher sozinho a
   * conta repetiria o defeito da forma de pagamento que não diz para onde o
   * dinheiro vai — o que trava a finalização de comanda até hoje.
   */
  account_id: z.string().uuid(),
  account_plan_id: z.string().uuid().nullish(),
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
  if (lido.data.ate < lido.data.de) {
    return fail("validation_failed", "A data final é anterior à inicial.", 422, { requestId });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_fechar_comissoes", {
    p_org: authz.org.orgId,
    p_professional: lido.data.professional_id,
    p_de: lido.data.de,
    p_ate: lido.data.ate,
    p_account: lido.data.account_id,
    p_account_plan: lido.data.account_plan_id ?? null,
  });

  if (error) {
    const m = error.message ?? "";
    if (m.includes("NENHUM_ITEM_PENDENTE")) {
      return fail(
        "conflict",
        "Não há comissão em aberto para esta profissional no período escolhido.",
        409,
        { requestId },
      );
    }
    if (m.includes("comissao_forbidden")) {
      return fail("forbidden", "Só quem administra fecha comissão.", 403, { requestId });
    }
    if (m.includes("periodo_invalido")) {
      return fail("validation_failed", "A data final é anterior à inicial.", 422, { requestId });
    }
    if (m.includes("profissional_nao_encontrada")) {
      return fail("not_found", "Profissional não encontrada.", 404, { requestId });
    }
    if (m.includes("conta_invalida")) {
      return fail("validation_failed", "Escolha uma conta ativa desta organização.", 422, { requestId });
    }
    if (m.includes("fechamento_inconsistente")) {
      // Nada foi pago: a função conferiu que o lançamento não corresponderia às
      // linhas e desfez. É defeito nosso, e precisa aparecer como tal.
      return fail("internal_error", m, 500, { requestId });
    }
    return fail("internal_error", m, 500, { requestId });
  }

  await audit({
    action: "financeiro.comissoes_fechadas",
    resourceType: "professional",
    resourceId: lido.data.professional_id,
    requestId,
    // Sem nome de pessoa: o id basta, e o audit log é lido por quem não precisa
    // saber de quem é a comissão.
    metadata: { de: lido.data.de, ate: lido.data.ate, ...(data as Record<string, unknown>) },
  });

  return ok(data, { requestId });
}
