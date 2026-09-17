import type { Queryable } from "../queue/queue";

/**
 * Lista FECHADA de ajustes de estilo que o produto sabe aplicar e testar.
 *
 * Não existe "localizar/substituir" livre: cada item precisa de semântica
 * determinística, teste próprio e uma chave conhecida pelo servidor.
 */
export const AJUSTES_DE_ESTILO = ["sem_travessao_longo"] as const;
export type AjusteDeEstilo = (typeof AJUSTES_DE_ESTILO)[number];

/** Prefixo no vocabulário aberto de `org_guardrail_layers`. */
const PREFIXO = "estilo:";

export type AjustesDeEstiloDaOrg = Record<AjusteDeEstilo, boolean>;

export const AJUSTES_DESLIGADOS: AjustesDeEstiloDaOrg = {
  sem_travessao_longo: false,
};

export function chavePersistidaDoAjuste(ajuste: AjusteDeEstilo): string {
  return `${PREFIXO}${ajuste}`;
}

export function ajusteDaChavePersistida(layer: string): AjusteDeEstilo | null {
  if (!layer.startsWith(PREFIXO)) return null;
  const ajuste = layer.slice(PREFIXO.length);
  return (AJUSTES_DE_ESTILO as readonly string[]).includes(ajuste)
    ? (ajuste as AjusteDeEstilo)
    : null;
}

/**
 * Lê somente escolhas conhecidas da organização. Ausência de linha = desligado,
 * que é o default de produto pedido pela #378. Falha de leitura também degrada
 * para desligado: preferência de estilo não pode derrubar um atendimento.
 */
export async function lerAjustesDeEstiloDaOrg(
  db: Queryable,
  organizationId: string,
): Promise<AjustesDeEstiloDaOrg> {
  try {
    const { rows } = await db.query<{ layer: string; enabled: boolean }>(
      `select layer, enabled
         from org_guardrail_layers
        where organization_id = $1
          and layer = any($2::text[])`,
      [organizationId, AJUSTES_DE_ESTILO.map(chavePersistidaDoAjuste)],
    );
    const ajustes = { ...AJUSTES_DESLIGADOS };
    for (const row of rows) {
      const ajuste = ajusteDaChavePersistida(row.layer);
      if (ajuste !== null) ajustes[ajuste] = row.enabled;
    }
    return ajustes;
  } catch {
    return { ...AJUSTES_DESLIGADOS };
  }
}

/**
 * Primeiro item da lista fechada: troca travessão longo por vírgula + espaço.
 *
 * Nas bordas de uma linha o travessão some, em vez de virar vírgula órfã. No
 * meio, apenas espaços horizontais ao redor dele são absorvidos (`a—b` e
 * `a — b`); `\n` nunca entra na regex, então um ajuste de pontuação não achata
 * os parágrafos escritos pelo modelo.
 */
export function removerTravessaoLongo(texto: string): string {
  return texto
    .replace(/(^|\n)[ \t]*—[ \t]*/g, "$1")
    .replace(/[ \t]*—[ \t]*(?=\n|$)/g, "")
    .replace(/[ \t]*—[ \t]*/g, ", ");
}

/** Aplica os itens ligados em ordem de código, nunca por regra livre do usuário. */
export function aplicarAjustesDeEstilo(
  texto: string,
  ajustes: AjustesDeEstiloDaOrg,
): string {
  let resultado = texto;
  if (ajustes.sem_travessao_longo) resultado = removerTravessaoLongo(resultado);
  return resultado;
}
