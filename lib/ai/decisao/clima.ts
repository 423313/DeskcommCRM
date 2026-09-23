/**
 * O CLIMA DA CONVERSA, MEDIDO PELO SYSTEM ONE.
 *
 * O ponto `sentiment_classify` foi o escolhido para estrear o caminho novo por três
 * razões, nesta ordem: roda FORA do caminho crítico (worker paralelo, o cliente não
 * espera por ele), já falha em silêncio por desenho, e é `score` puro — a primitiva
 * do fornecedor encaixa sem tradução conceitual.
 *
 * ═══ A NORMALIZAÇÃO É O RISCO, NÃO A CHAMADA ═══
 *
 * O worker grava `sentiment_score` de 0 a 1 e compara com um limiar configurável
 * (default 0.3) para abrir handoff. O System One devolve a POSIÇÃO numa escala de
 * níveis — com 5 níveis, um contínuo entre 0 e 4. Trocar a origem do número sem
 * acertar a régua moveria o limiar de toda instalação em silêncio: um 2.0 (neutro)
 * lido como 2.0 numa régua de 0..1 abriria handoff em toda conversa morna.
 *
 * Por isso a conversão tem teste próprio nos extremos e no meio, e por isso um
 * score FORA da escala devolve ausência em vez de nota: se o contrato do fornecedor
 * mudar (mais níveis, outra base), o número normalizaria para algo plausível e
 * errado, e ninguém veria.
 *
 * ═══ NUNCA É O DONO DA DECISÃO ═══
 *
 * Devolve `null` para toda ausência — sem credencial, fornecedor fora do ar,
 * resposta ilegível, score fora da escala. `null` não é zero: zero é "medi e o
 * clima está péssimo", e é justamente a confusão que o gate de handoff deste
 * produto já pagou uma vez (ver `lib/kanban/card-state.ts` e o conserto em
 * `workers/ai-response-worker.ts`). Quem chama segue pelo caminho atual.
 */
import { decidirNoPonto, type DependenciasDoPonto } from "./ponto";

/**
 * A escala, ORDENADA do pior ao melhor — a ordem É o contrato do `score`, porque o
 * fornecedor devolve a posição. Inverter os níveis inverteria a nota sem erro
 * nenhum aparecer, e é o que o teste da ordem vigia.
 *
 * Cinco níveis para dar resolução comparável à nota contínua que o worker já grava;
 * o fornecedor aceita de 2 a 10.
 */
export const NIVEIS_DE_CLIMA = [
  "cliente irritado, revoltado ou ameaçando sair",
  "cliente insatisfeito ou reclamando",
  "cliente neutro, apenas trocando informação",
  "cliente satisfeito ou colaborativo",
  "cliente entusiasmado, elogiando ou agradecendo",
] as const;

const INSTRUCAO =
  "Com base na ÚLTIMA mensagem do cliente, em que ponto está o clima da conversa?";

export interface EntradaDoClima {
  organizationId: string;
  mensagem: string;
}

export interface ClimaMedido {
  /** 0 = péssimo, 1 = ótimo — a mesma régua que `messages.metadata.sentiment_score` usa. */
  score: number;
  /** Probabilidade calibrada do fornecedor. Guardada para a telemetria, não para decidir. */
  confianca: number;
  tokensDeEntrada: number;
}

export async function medirClima(
  entrada: EntradaDoClima,
  deps: DependenciasDoPonto = {},
): Promise<ClimaMedido | null> {
  const r = await decidirNoPonto(
    {
      ponto: "sentiment_classify",
      organizationId: entrada.organizationId,
      estado: entrada.mensagem,
      perguntas: {
        clima: { tipo: "score", instrucao: INSTRUCAO, criterios: NIVEIS_DE_CLIMA },
      },
    },
    deps,
  );

  if (!r.ok) return null;

  const resposta = r.respostas["clima"];
  if (resposta === undefined || resposta.tipo !== "score") return null;

  const teto = NIVEIS_DE_CLIMA.length - 1;
  if (!Number.isFinite(resposta.score) || resposta.score < 0 || resposta.score > teto) {
    // Fora da escala = contrato mudou. Normalizar assim mesmo produziria um número
    // plausível e errado, e o limiar de handoff passaria a disparar por régua trocada.
    return null;
  }

  return {
    score: resposta.score / teto,
    confianca: resposta.confianca,
    tokensDeEntrada: r.uso.tokensDeEntrada,
  };
}
