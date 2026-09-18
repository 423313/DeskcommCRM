import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";

import { Comissoes } from "./_client";

export const dynamic = "force-dynamic";

/**
 * AS COMISSÕES — quanto cada profissional tem a receber, e o ato de pagar.
 *
 * Fica em Análise › Dinheiro, ao lado do Faturamento, porque é a mesma cadência:
 * pergunta de quinzena ou de mês, não de balcão. O Faturamento já mostrava o
 * número ("quanto cada pessoa tem a receber") e não deixava pagar — esta tela
 * cumpre a segunda metade daquela promessa.
 *
 * `viewer` para ver, pelo mesmo motivo do Faturamento: conferir não é
 * privilégio de quem lança. FECHAR exige `manager`, e quem barra de verdade é a
 * função no banco — esconder o botão é cortesia, não segurança.
 *
 * O CADASTRO de profissionais e as regras de percentual NÃO ficam aqui: moram
 * em Configurações › Financeiro, que é onde o negócio se descreve uma vez.
 * Duas portas para a mesma coisa é o erro que o catálogo de navegação
 * documenta em "Funis" versus "Etapas do funil".
 */
export default async function Page() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) redirect("/app");

  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold">{t("Comissões")}</h1>
        <p className="text-sm text-text-muted">
          {t("Quanto cada profissional tem a receber no período, e o fechamento do pagamento.")}
        </p>
      </div>
      <Comissoes podeFechar={ROLE_RANK[org.role] >= ROLE_RANK.manager} />
    </div>
  );
}
