/**
 * O VOCABULÁRIO DA PASSAGEM IA → HUMANO, E A FRASE QUE UMA PESSOA LÊ.
 *
 * ─── O que esta entrega fecha ──────────────────────────────────────────────
 *
 * Toda passagem do atendimento automático para uma pessoa vira UMA LINHA DE
 * FATO em `public.passagens_de_atendimento` (migration 0291): por que a IA
 * passou, o que ela já tentou, o que o cliente quer, a última coisa que ele
 * escreveu, e se ele foi (ou não) avisado. Hoje nada disso sobrevive ao turno:
 * o motor A monta um resumo que morre no aviso da Central e o motor B abre o
 * aviso sem resumo nenhum.
 *
 * Este arquivo é a FONTE ÚNICA do vocabulário — as quatro colunas com CHECK da
 * tabela apontam para cá em `tests/invariants/vocabulario-banco-x-typescript.
 * test.ts`, e a lição daquela lista é a razão de o par nascer no mesmo commit da
 * migration: todos os que divergiram divergiram por terem nascido sozinhos.
 *
 * ─── Por que NÃO reaproveitar `HandoffReason` ──────────────────────────────
 *
 * `HandoffReason` (`lib/ai/handoff/orchestrator.ts`) é o contrato do motor B e
 * carrega `refund_mention`, que não tem emissor nenhum. `MOTIVOS_DA_PASSAGEM` é
 * superconjunto dele mais `caso_escalado` e `suspected_optout` — e é o que o
 * BANCO aceita. Amarrar os dois faria uma mudança de contrato do motor virar
 * `23514` num INSERT de caminho pouco exercitado.
 *
 * ─── O que esta onda NÃO entrega, declarado ────────────────────────────────
 *
 * `registrarPassagem(db, p)` — a escrita da linha — é da onda seguinte, junto
 * com os 13 call sites que a chamam. Ela vai aplicar `sanitizarTextoDoLead` (da
 * onda do aviso no WhatsApp, que ainda não existe nesta árvore) a `title`,
 * `notes` e `content` ANTES do insert: sem isso, um agente externo escreve
 * `https://…` no resumo e o cartão exibe um link de phishing dentro da tela de
 * quem vai atender. O schema Zod de `tentativas` já mora aqui porque ele é o que
 * o CHECK do banco não consegue exprimir (o CHECK garante só que é um array) e
 * porque o par do invariante cita ESTE arquivo.
 */
import { z } from "zod";

/**
 * Qual dos dois motores passou a conversa.
 *
 * `engine` = `lib/agent-engine` (fala com `pg.Pool`); `crm` = `lib/ai/handoff`
 * (fala com supabase-js). Os dois existem, os dois passam, e saber qual foi é o
 * que permite medir se um deles parou de gravar.
 */
export const MOTORES_DA_PASSAGEM = ["engine", "crm"] as const;
export type MotorDaPassagem = (typeof MOTORES_DA_PASSAGEM)[number];

/**
 * POR ONDE a passagem entrou — o caminho de código, não a razão humana.
 *
 * Distinto de `MOTIVOS_DA_PASSAGEM` de propósito: o mesmo motivo
 * (`requested_human`) chega por três origens diferentes (a detecção
 * determinística, a ferramenta do modelo e o MCP externo), e é a ORIGEM que
 * responde "que parte do sistema decidiu isto?" quando alguém duvida do número.
 * Os `legado_*` são os caminhos do motor B, que nomeia as suas razões antes de
 * chamar.
 */
export const ORIGENS_DA_PASSAGEM = [
  "pedido_explicito",
  "opt_out_provavel",
  "ferramenta_do_modelo",
  "teto_de_gasto",
  "caso_escalado",
  "sentimento",
  "legado_pedido",
  "legado_juridico",
  "legado_etapa",
  "legado_confianca",
  "legado_teto",
  "mcp_externo",
  "runtime_nativo",
] as const;
export type OrigemDaPassagem = (typeof ORIGENS_DA_PASSAGEM)[number];

/**
 * POR QUE a conversa saiu do automático. É o que vira frase na tela.
 *
 * Superconjunto de `HandoffReason` (ver o cabeçalho). `suspected_optout` e
 * `caso_escalado` não existem lá porque não são razões do motor B.
 */
export const MOTIVOS_DA_PASSAGEM = [
  "requested_human",
  "suspected_optout",
  "orcamento_de_ia",
  "low_sentiment",
  "low_confidence",
  "critical_stage",
  "legal_mention",
  "refund_mention",
  "caso_escalado",
] as const;
export type MotivoDaPassagem = (typeof MOTIVOS_DA_PASSAGEM)[number];

/**
 * POR QUE o cliente não foi avisado — vocabulário FECHADO, não texto livre.
 *
 * A coluna existe porque a promessa "o cliente JÁ foi avisado" era dita sem
 * ninguém olhar o desfecho do envio: `sendMessageHandler` devolve `failed` sem
 * lançar, e o caminho seguinte afirmava `avisado: true`. Quem assume precisa
 * saber se a pessoa do outro lado está esperando uma resposta ou está no escuro
 * — é a primeira frase que ele vai digitar.
 *
 * Fechado, e não `text` livre, porque a TELA traduz: uma frase gravada em
 * português no banco seria a segunda representação do mesmo fato, e a primeira
 * a ficar sem espanhol.
 */
export const MOTIVOS_DO_AVISO = [
  "na_fila_canal_fora",
  "falhou_no_envio",
  "sem_telefone",
  "pre_go_live",
  "canal_arquivado",
  "fora_da_janela",
] as const;
export type MotivoDoAviso = (typeof MOTIVOS_DO_AVISO)[number];

/**
 * A frase em PORTUGUÊS de cada motivo. A chave do dicionário É o texto pt.
 *
 * `satisfies` e não `:` — a anotação de tipo apagaria o literal e quem lesse
 * `FRASE_DO_MOTIVO.requested_human` receberia `string` em vez da frase. O
 * `satisfies` mantém as duas coisas: exaustividade cobrada pelo compilador e
 * tipo estreito na leitura.
 */
export const FRASE_DO_MOTIVO = {
  requested_human: "O cliente pediu para falar com uma pessoa",
  suspected_optout: "O cliente parece ter pedido para não receber mais mensagens",
  orcamento_de_ia: "O limite de gasto com IA foi atingido — o cliente não pediu uma pessoa",
  low_sentiment: "O cliente demonstrou irritação na conversa",
  low_confidence: "O assistente não teve confiança suficiente para responder",
  critical_stage: "O negócio chegou a uma etapa que pede uma pessoa",
  legal_mention: "A conversa tocou em assunto jurídico",
  refund_mention: "A conversa tocou em reembolso",
  caso_escalado: "Uma pessoa da equipe escalou um atendimento",
} satisfies Record<MotivoDaPassagem, string>;

/** A frase em português de cada motivo de o cliente NÃO ter sido avisado. */
export const FRASE_DO_MOTIVO_DO_AVISO = {
  na_fila_canal_fora: "A mensagem ficou na fila porque o canal está fora do ar",
  falhou_no_envio: "O canal recusou a mensagem de aviso",
  sem_telefone: "O contato não tem telefone cadastrado",
  pre_go_live: "O número ainda está em aquecimento e não envia mensagens",
  canal_arquivado: "O canal desta conversa foi arquivado",
  fora_da_janela: "Estamos fora do horário em que este canal envia mensagens",
} satisfies Record<MotivoDoAviso, string>;

/**
 * Uma tentativa da IA, do jeito que o cartão a mostra: o que ela fez e no que
 * deu. `desfecho` é opcional porque a ferramenta pode declarar só a ação.
 *
 * Os tetos não são zelo: `tentativas` é `jsonb` gravado a partir do que o MODELO
 * (ou um agente MCP externo) escreveu. Sem limite, uma linha de banco cresce sem
 * teto num campo que ninguém lê inteiro — e o cartão, que é renderizado dentro
 * da conversa, vira uma página de texto.
 */
export const tentativaDaPassagemSchema = z.object({
  o_que: z.string().trim().min(1).max(280),
  desfecho: z.string().trim().min(1).max(280).optional(),
});
export type TentativaDaPassagem = z.infer<typeof tentativaDaPassagemSchema>;

/**
 * A lista inteira. É ESTE schema que `registrarPassagem` (onda seguinte) aplica
 * antes do insert — o CHECK do banco garante só que o valor é um array, porque
 * `jsonb` lido por path sem schema central é o anti-pattern nº 6.
 */
export const tentativasDaPassagemSchema = z.array(tentativaDaPassagemSchema).max(10);
