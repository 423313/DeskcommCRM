/**
 * A FICHA DA CLIENTE — o que o balcão precisa saber antes de atender.
 *
 * Indicadores, histórico de comandas, agenda e cartão de fidelidade num pedido
 * só. Quatro leituras em paralelo, um veredito: status por seção multiplicaria
 * os estados da tela sem que ninguém soubesse o que fazer com cada um.
 *
 * ⚠️ A CONFERÊNCIA DE ORGANIZAÇÃO É OBRIGATÓRIA, e não é zelo: `requireRole` diz
 * de qual organização é a SESSÃO, e o id do contato vem da URL. Sem casar os
 * dois, pedir a ficha de um contato de outra organização devolveria zeros — que
 * a tela mostraria como "cliente sem compra". Uma mentira plausível é pior que
 * um erro.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { LIBERAM_O_HORARIO } from "@/lib/agenda/ocupados";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const COMANDAS_NA_FICHA = 10;
const AGENDAMENTOS = 5;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "financeiro" });
  if (!authz.ok) return authz.response;

  const { id: contactId } = await ctx.params;
  const supabase = await createClient();

  const { data: contato } = await supabase
    .from("contacts")
    .select("id, organization_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contato || contato.organization_id !== authz.org.orgId) {
    return fail("not_found", "Contato não encontrado.", 404, { requestId });
  }

  // O filtro da agenda sai de LIBERAM_O_HORARIO, e não de um literal digitado
  // aqui: seria a terceira cópia da mesma régua, e é onde ela desalinha.
  const naoContam = `(${[...LIBERAM_O_HORARIO].join(",")})`;

  const [resumo, comandas, futuros, passados] = await Promise.all([
    supabase.rpc("fn_resumo_do_cliente", { p_org: authz.org.orgId, p_contact: contactId }),
    supabase
      .from("sales")
      .select(
        "id, number, status, total_cents, finalized_at, reversed_at, notes, " +
          "sale_items(id, description, quantity, total_cents)",
      )
      .eq("organization_id", authz.org.orgId)
      .eq("contact_id", contactId)
      .not("finalized_at", "is", null)
      .order("finalized_at", { ascending: false })
      .limit(COMANDAS_NA_FICHA),
    supabase
      .from("calendar_appointments")
      .select("id, title, starts_at, status")
      .eq("organization_id", authz.org.orgId)
      .eq("contact_id", contactId)
      .gte("starts_at", new Date().toISOString())
      .not("status", "in", naoContam)
      .order("starts_at", { ascending: true })
      .limit(AGENDAMENTOS),
    supabase
      .from("calendar_appointments")
      .select("id, title, starts_at, status")
      .eq("organization_id", authz.org.orgId)
      .eq("contact_id", contactId)
      .lt("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: false })
      .limit(AGENDAMENTOS),
  ]);

  const falha = resumo.error ?? comandas.error ?? futuros.error ?? passados.error;
  if (falha) return fail("internal_error", falha.message, 500, { requestId });

  return ok(
    {
      contact_id: contactId,
      resumo: resumo.data ?? null,
      // A ESTORNADA vem junto, marcada: sumir com ela faria a lista não bater
      // com o que a pessoa lembra de ter feito. O resumo é que não a soma.
      comandas: comandas.data ?? [],
      agendamentos: { futuros: futuros.data ?? [], passados: passados.data ?? [] },
    },
    { requestId },
  );
}
