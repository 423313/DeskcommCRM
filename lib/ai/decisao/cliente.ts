/**
 * CLIENTE DO SYSTEM ONE (Jev, da TypeSafe AI) — decisões tipadas com probabilidade
 * calibrada, no lugar de texto.
 *
 * ═══ POR QUE ISTO EXISTE, E POR QUE NÃO É UM `LanguageModel` ═══
 *
 * O seam de modelo (`lib/agent-engine/edge/llm/run-model-call.ts`) termina em
 * `generateText`, e o `ProviderRegistry` devolve `LanguageModel`. O Jev não gera
 * texto: ele recebe um estado e um mapa de perguntas tipadas e devolve valores com
 * probabilidade, todas as perguntas avaliadas numa passada. Fingir que é um
 * `LanguageModel` — um adaptador que traduzisse prompt livre em `questions` — seria
 * gambiarra: o prompt é texto e as perguntas exigem `criteria` estruturados.
 *
 * Por isso este módulo é um seam IRMÃO, não um provider a mais.
 *
 * ═══ NUNCA LANÇA ═══
 *
 * Toda decisão que passa por aqui tem um caminho atual do lado. Se este cliente
 * lançasse, cada call site precisaria lembrar de um try/catch, e o primeiro que
 * esquecesse derrubaria um turno de atendimento por causa de um fornecedor em early
 * access (v0.01 na data desta escrita). Devolvendo um resultado discriminado, o
 * compilador obriga quem chama a tratar a ausência — o fallback deixa de depender
 * de disciplina.
 *
 * ═══ O 422 É DIFERENTE DOS OUTROS ═══
 *
 * 401/429/529/rede são indisponibilidade: o fornecedor não respondeu, e o caminho
 * atual assume sem barulho. O 422 é pergunta MALFORMADA — defeito nosso. Silenciado
 * junto com os demais, um `criterios` quebrado numa edição vira degradação
 * permanente e invisível: tudo cai no fallback para sempre e ninguém percebe. Por
 * isso o resultado carrega `defeitoNosso`, e quem consome liga alerta a ele.
 *
 * ═══ VALIDAÇÃO DA RESPOSTA ═══
 *
 * O fornecedor promete "zero type errors by construction". A promessa vale para o
 * modelo, não para a rede: proxy, página de erro em HTML e versão nova do contrato
 * chegam aqui do mesmo jeito. Confiar na promessa sem validar é o mesmo erro de
 * confiar em saída de LLM sem `zod` — e é o erro que este repo já pagou em sete
 * arquivos de parse defensivo.
 */
import { z } from "zod";

/** Endpoint do fornecedor. NÃO é knob de política: é o destino intrínseco do provider. */
export const ENDPOINT_SYSTEM_ONE = "https://api.typesafe.ai/v1/systemone";

/** O modelo de topo. Tag móvel do fornecedor, como `latest` — trocar é decisão de config. */
const MODELO = "jev-latest";

// ── As três primitivas, e só elas ────────────────────────────────────────────

export type Pergunta =
  /** Sim/não. A resposta é uma probabilidade de "sim", de 0 a 1. */
  | { tipo: "noul"; instrucao: string; criterios?: { true: string; false: string } }
  /** Uma entre até 255 opções, com a probabilidade de cada uma. */
  | { tipo: "choice"; instrucao: string; criterios: Record<string, string | null> }
  /** Posição numa escala ORDENADA de 2 a 10 níveis — a resposta é contínua (ex.: 1.4). */
  | { tipo: "score"; instrucao: string; criterios: readonly [string, string, ...string[]] };

export type Resposta =
  | { tipo: "noul"; noul: number }
  | { tipo: "choice"; escolha: string; probabilidades: Record<string, number>; confianca: number }
  | { tipo: "score"; score: number; probabilidades: Record<string, number>; confianca: number };

/** Por que não houve resposta. Vira `llm_calls.error_code`. */
export type MotivoDaAusencia =
  | "sem_credencial"
  | "credencial_invalida"
  | "contrato_invalido"
  | "limite_de_taxa"
  | "provedor_sobrecarregado"
  | "provedor_indisponivel"
  | "resposta_ilegivel";

export interface UsoDeTokens {
  tokensDeEntrada: number;
  /** O fornecedor não cobra saída; guardamos o campo para a telemetria não mentir por omissão. */
  tokensDeSaida: number;
}

export type ResultadoDaDecisao =
  | { ok: true; respostas: Record<string, Resposta>; uso: UsoDeTokens; modelo: string }
  | { ok: false; motivo: MotivoDaAusencia; defeitoNosso: boolean; status: number | null };

export interface EntradaDaDecisao {
  chave: string;
  estado: string | Record<string, unknown> | ReadonlyArray<unknown>;
  perguntas: Record<string, Pergunta>;
  /** Teto por chamada. O fornecedor anuncia 70–500 ms; o default aqui é folgado de propósito. */
  tetoMs?: number;
}

export interface DependenciasDaDecisao {
  fetchImpl?: typeof fetch;
}

const TETO_PADRAO_MS = 3_000;

// ── Contrato da resposta, validado ───────────────────────────────────────────

const respostaNoul = z.object({ type: z.literal("noul"), noul: z.number() });
const respostaChoice = z.object({
  type: z.literal("choice"),
  choice: z.string(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});
const respostaScore = z.object({
  type: z.literal("score"),
  score: z.number(),
  probabilities: z.record(z.string(), z.number()),
  confidence: z.number(),
});

const corpoDaResposta = z.object({
  model: z.string().optional(),
  answers: z.record(z.string(), z.union([respostaNoul, respostaChoice, respostaScore])),
  usage: z
    .object({ input_tokens: z.number().optional(), output_tokens: z.number().optional() })
    .optional(),
});

/** Nosso vocabulário → o do fornecedor. A tradução mora num lugar só. */
function paraOFornecedor(p: Pergunta): Record<string, unknown> {
  if (p.tipo === "noul") {
    return { type: "noul", instructions: p.instrucao, ...(p.criterios ? { criteria: p.criterios } : {}) };
  }
  if (p.tipo === "choice") {
    return { type: "choice", instructions: p.instrucao, criteria: p.criterios };
  }
  return { type: "score", instructions: p.instrucao, criteria: p.criterios };
}

function daResposta(a: z.infer<typeof corpoDaResposta>["answers"][string]): Resposta {
  if (a.type === "noul") return { tipo: "noul", noul: a.noul };
  if (a.type === "choice") {
    return { tipo: "choice", escolha: a.choice, probabilidades: a.probabilities, confianca: a.confidence };
  }
  return { tipo: "score", score: a.score, probabilidades: a.probabilities, confianca: a.confidence };
}

/**
 * Traduz o status HTTP no motivo. O `defeitoNosso` sai daqui junto, porque é a mesma
 * decisão: separar "o fornecedor não respondeu" de "nós perguntamos errado".
 */
function doStatus(status: number): { motivo: MotivoDaAusencia; defeitoNosso: boolean } {
  if (status === 401 || status === 403) return { motivo: "credencial_invalida", defeitoNosso: true };
  if (status === 422 || status === 400) return { motivo: "contrato_invalido", defeitoNosso: true };
  if (status === 429) return { motivo: "limite_de_taxa", defeitoNosso: false };
  if (status === 529) return { motivo: "provedor_sobrecarregado", defeitoNosso: false };
  return { motivo: "provedor_indisponivel", defeitoNosso: false };
}

/**
 * Pergunta ao System One. **Nunca lança** — ver o cabeçalho.
 *
 * O `fetch` entra por injeção porque quem chama já traz o seu: em produção é o
 * `allowlistedFetch` do egress (a allowlist vem da CONFIG do binding, nunca
 * hardcoded aqui), e em teste é o dublê.
 */
export async function decidir(
  entrada: EntradaDaDecisao,
  deps: DependenciasDaDecisao = {},
): Promise<ResultadoDaDecisao> {
  if (!entrada.chave.trim()) {
    // Sem credencial não se gasta requisição nem se espera timeout: a ausência é
    // configuração, e o caminho atual assume no mesmo milissegundo.
    return { ok: false, motivo: "sem_credencial", defeitoNosso: false, status: null };
  }

  const questions: Record<string, unknown> = {};
  for (const [id, pergunta] of Object.entries(entrada.perguntas)) {
    questions[id] = paraOFornecedor(pergunta);
  }

  const abortador = new AbortController();
  const relogio = setTimeout(() => abortador.abort(), entrada.tetoMs ?? TETO_PADRAO_MS);
  try {
    const res = await (deps.fetchImpl ?? fetch)(ENDPOINT_SYSTEM_ONE, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${entrada.chave}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model: MODELO, state: entrada.estado, questions }),
      signal: abortador.signal,
    });

    if (!res.ok) {
      const { motivo, defeitoNosso } = doStatus(res.status);
      return { ok: false, motivo, defeitoNosso, status: res.status };
    }

    const cru: unknown = await res.json();
    const lido = corpoDaResposta.safeParse(cru);
    if (!lido.success) {
      return { ok: false, motivo: "resposta_ilegivel", defeitoNosso: false, status: res.status };
    }

    const respostas: Record<string, Resposta> = {};
    for (const [id, a] of Object.entries(lido.data.answers)) respostas[id] = daResposta(a);

    return {
      ok: true,
      respostas,
      modelo: lido.data.model ?? MODELO,
      uso: {
        tokensDeEntrada: lido.data.usage?.input_tokens ?? 0,
        tokensDeSaida: lido.data.usage?.output_tokens ?? 0,
      },
    };
  } catch {
    // Rede, abort por teto, JSON impossível de ler: tudo é indisponibilidade do
    // ponto de vista de quem chama, e o caminho atual assume. O erro cru não sobe
    // porque ele carrega URL e cabeçalho — e o cabeçalho tem a chave (regra 8).
    return { ok: false, motivo: "provedor_indisponivel", defeitoNosso: false, status: null };
  } finally {
    clearTimeout(relogio);
  }
}
