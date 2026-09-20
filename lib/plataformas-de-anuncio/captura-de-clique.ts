/**
 * O token curto do clique — o pedaço que é IGUAL em toda captura, e por isso
 * mora um degrau acima de `google/` e de `meta/`.
 *
 * O que MUDA entre um caminho e outro é o dado guardado (o `gclid` de um
 * clique do Google Ads, as UTMs de uma landing page da Meta) e a tabela onde
 * ele mora. O que NÃO muda é o token: mesmo alfabeto, mesmo tamanho, mesma
 * retentativa em colisão, mesma regra de "erro que não é 23505 não se resolve
 * tentando de novo". Uma segunda cópia deste laço divergiria da primeira no
 * dia em que só uma das duas ganhasse uma correção — e o sintoma seria uma
 * landing page quebrada por um choque de 1 em 1 bilhão que a outra já sabia
 * tratar.
 */
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

// Sem 0/O/1/I/L: são os pares que mais se confundem ao reler — o token nunca é
// DIGITADO por um humano (vai pronto no link), mas é lido por humano quando
// alguém depura um clique perdido no log ou no banco.
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const TAMANHO_DO_TOKEN = 6;
const TENTATIVAS_MAXIMAS = 5;

/**
 * As tabelas de vestíbulo do clique. Lista fechada porque o nome da tabela
 * chega aqui como texto: o tipo é o que impede uma chamada nova de escrever
 * num lugar que não tem o índice único de `(organization_id, token)`.
 */
export type TabelaDeClickRefs = "google_ads_click_refs" | "meta_ads_click_refs";

function gerarToken(): string {
  let token = "";
  for (let i = 0; i < TAMANHO_DO_TOKEN; i++) {
    token += ALFABETO[randomInt(ALFABETO.length)];
  }
  return token;
}

export interface ClickRefCriado {
  token: string;
}

/**
 * Grava uma linha de clique com token único. Colisão é praticamente impossível
 * (32^6 ≈ 1 bilhão de combinações por organização), mas as tabelas têm índice
 * único em `(organization_id, token)` e aqui se retenta em vez de deixar a
 * landing page quebrar por causa de um choque de 1 em 1 bilhão.
 */
export async function criarClickRef(
  admin: SupabaseClient,
  tabela: TabelaDeClickRefs,
  organizationId: string,
  campos: Record<string, unknown>,
): Promise<ClickRefCriado | null> {
  for (let tentativa = 0; tentativa < TENTATIVAS_MAXIMAS; tentativa++) {
    const token = gerarToken();
    const { error } = await admin.from(tabela).insert({
      organization_id: organizationId,
      token,
      ...campos,
    });
    if (!error) return { token };
    // 23505 = unique_violation. Qualquer outro código não se resolve tentando
    // de novo com outro token — é falha de rede/schema, não de sorte.
    if (error.code !== "23505") {
      logger.error("[plataformas-de-anuncio.captura-de-clique] insert falhou", {
        tabela,
        organizationId,
        codigo: error.code,
        detalhe: error.message,
      });
      return null;
    }
  }
  logger.error("[plataformas-de-anuncio.captura-de-clique] esgotou tentativas de token único", {
    tabela,
    organizationId,
  });
  return null;
}
