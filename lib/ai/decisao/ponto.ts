/**
 * O SEAM DO PONTO — onde o System One encosta no resto do sistema.
 *
 * ═══ POR QUE ESTE LADO, E NÃO O `runModelCall` ═══
 *
 * O relatório em `docs/research/2026-09-19-jev-system-one-no-deskcomm.md` desenhou
 * um `runDecisionCall` espelhando `runModelCall`. Ao implementar, o repo corrigiu o
 * desenho: há DUAS pilhas, e o próprio `lib/ai/gateway-binding.ts` já documenta a
 * divisão — o seam do agente fala `pg.Pool`, e os workers do Next falam Supabase.
 *
 * O primeiro ponto a ser ligado (`sentiment_classify`, escolhido por rodar fora do
 * caminho crítico e por já falhar em silêncio por desenho) vive na pilha do Next.
 * Seguir o ponto onde ele está é mais honesto que arrastar o ponto até o desenho:
 * a versão `pg.Pool` nasce quando um ponto do agent-engine for ligado, e as duas
 * compartilham o cliente (`./cliente`), que é onde mora o contrato do fornecedor.
 *
 * ═══ O QUE ELE GARANTE ═══
 *
 *  1. **Sem credencial, nada sai da máquina.** A ausência é configuração, não
 *     incidente: o caminho atual assume no mesmo milissegundo, sem gastar
 *     requisição nem esperar timeout.
 *  2. **O destino passa pela allowlist de egress** (F4-03), com o host vindo da
 *     config — nunca um `fetch` cru. Host fora dela falha FECHADO, como todo
 *     egress do runtime.
 *  3. **Nunca lança.** Egress bloqueado, fornecedor fora do ar, resposta ilegível:
 *     tudo chega a quem chamou como `{ ok: false, motivo }`.
 *
 * ═══ O QUE ELE NÃO FAZ ═══
 *
 * Não decide se o fornecedor DEVE ser usado, e não conhece o fallback. Isso é do
 * call site, que é quem sabe o que fazer quando a resposta não vem — e é por isso
 * que o resultado é discriminado em vez de um valor com default.
 */
import { allowlistedFetch, buildAllowlist } from "@/lib/agent-engine/edge/egress";
import { logger } from "@/lib/logger";

import { decidir, ENDPOINT_SYSTEM_ONE, type Pergunta, type ResultadoDaDecisao } from "./cliente";

export interface EntradaDoPonto {
  /** O ponto de IA, como no registro (`lib/ai/pontos/registro.ts`). Vai à telemetria. */
  ponto: string;
  organizationId: string;
  estado: string | Record<string, unknown> | ReadonlyArray<unknown>;
  perguntas: Record<string, Pergunta>;
  tetoMs?: number;
}

export interface DependenciasDoPonto {
  /** Resolve a chave do fornecedor PARA AQUELA organização. `null` = não configurado. */
  buscarChave?: (organizationId: string) => Promise<string | null>;
  fetchImpl?: typeof fetch;
  /** Allowlist de egress. O default é o endpoint intrínseco do fornecedor. */
  hostsPermitidos?: readonly string[];
}

/**
 * Busca a chave do provider `typesafe` da organização.
 *
 * Fica como ponteiro até a onda que cadastra o provedor no painel: enquanto o
 * provedor não existe em `ai_provider_credentials`, devolver `null` é a resposta
 * CORRETA — e é o que mantém o produto exatamente como está hoje para quem não
 * configurou nada. Substituir isto por uma chave de ambiente global seria o
 * contrário da doutrina BYOK: uma instalação pagaria a conta de outra.
 */
async function chaveDaOrganizacao(_organizationId: string): Promise<string | null> {
  return null;
}

export async function decidirNoPonto(
  entrada: EntradaDoPonto,
  deps: DependenciasDoPonto = {},
): Promise<ResultadoDaDecisao> {
  const chave = await (deps.buscarChave ?? chaveDaOrganizacao)(entrada.organizationId);
  if (chave === null || chave.trim() === "") {
    return { ok: false, motivo: "sem_credencial", defeitoNosso: false, status: null };
  }

  const allowlist = buildAllowlist([...(deps.hostsPermitidos ?? [ENDPOINT_SYSTEM_ONE])]);
  const fetchContido: typeof fetch = (input, init) =>
    allowlistedFetch(
      typeof input === "string" || input instanceof URL ? input : input.url,
      init,
      { allowlist, fetchImpl: deps.fetchImpl, log: logger },
    );

  return decidir(
    {
      chave,
      estado: entrada.estado,
      perguntas: entrada.perguntas,
      ...(entrada.tetoMs !== undefined ? { tetoMs: entrada.tetoMs } : {}),
    },
    { fetchImpl: fetchContido },
  );
}
