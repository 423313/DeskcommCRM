/**
 * AS COMISSÕES — o que cada profissional tem a receber, e o que já recebeu.
 *
 * Uma consulta só serve às três perguntas da tela ("em aberto", "pagas" e a
 * ficha de uma profissional): muda o filtro, não a rota. Duas rotas para a
 * mesma linha divergiriam no primeiro campo novo.
 *
 * O RESUMO por profissional não vem daqui: vem de `/api/v1/reports/financeiro`
 * (`por_profissional`), que já soma pendente e pago com o nome resolvido no
 * banco. Esta rota é o DETALHE — item por item, com a comanda de origem.
 */
import { randomUUID } from "node:crypto";

import type { NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const LIMITE = 500;
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.");

const filtroSchema = z.object({
  de: dia,
  ate: dia,
  professional_id: z.string().uuid().optional(),
  status: z.enum(["pending", "paid", "reversed"]).optional(),
});

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "financeiro" });
  if (!authz.ok) return authz.response;

  const q = new URL(req.url).searchParams;
  const lido = filtroSchema.safeParse({
    de: q.get("de") ?? "",
    ate: q.get("ate") ?? "",
    professional_id: q.get("professional_id") ?? undefined,
    status: q.get("status") ?? undefined,
  });
  if (!lido.success) {
    return fail("validation_failed", lido.error.issues[0]?.message ?? "filtro inválido", 422, {
      requestId,
    });
  }
  if (lido.data.ate < lido.data.de) {
    return fail("validation_failed", "A data final é anterior à inicial.", 422, { requestId });
  }

  const supabase = await createClient();

  // O período é da COMANDA (quando o serviço foi faturado), não da comissão:
  // é assim que o fechamento recorta, e as duas telas têm de falar do mesmo
  // conjunto — senão a lista mostra uma coisa e o botão paga outra.
  let consulta = supabase
    .from("commissions")
    .select(
      "id, professional_id, percent, amount_cents, status, paid_at, reversed_at, paid_entry_id, created_at, " +
        "sale_items!inner(description, total_cents, sales!inner(number, finalized_at, reversed_at))",
    )
    // Explícito, ainda que a RLS cubra: é o padrão da rota irmã de catálogo, e
    // divergir dentro do mesmo módulo é como a regra deixa de ser regra.
    .eq("organization_id", authz.org.orgId)
    .gte("sale_items.sales.finalized_at", `${lido.data.de}T00:00:00Z`)
    .lte("sale_items.sales.finalized_at", `${lido.data.ate}T23:59:59Z`)
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  if (lido.data.professional_id) consulta = consulta.eq("professional_id", lido.data.professional_id);
  if (lido.data.status) consulta = consulta.eq("status", lido.data.status);

  const { data, error } = await consulta;
  if (error) return fail("internal_error", error.message, 500, { requestId });

  return ok(data ?? [], { requestId, meta: { has_more: (data?.length ?? 0) === LIMITE } });
}
