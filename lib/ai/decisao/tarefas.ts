/**
 * AS TAREFAS DO JEV — o que ele faz, e em que estado cada coisa está.
 *
 * Uma tarefa não é um ponto de IA. Ponto (`lib/ai/pontos/registro.ts`) é onde
 * um modelo de linguagem é chamado; tarefa é uma pergunta que o Jev responde.
 * O clima mora num ponto, mas uma tarefa pode não ter ponto nenhum (uma regra
 * sem IA que o Jev só observa). O cartão, a rota e o "Usada em" da chave derivam
 * DESTA lista, nunca de uma cópia à mão.
 *
 * ═══ O ESTADO EFETIVO, NESTA ORDEM ═══
 *
 *  1. Interruptor mestre desligado (ou sem aceite) ⇒ desligada.
 *  2. A tarefa pede mais do que o aceite cobre (alcance) ⇒ desligada. Falha
 *     FECHADA: o aceite é o que a empresa consentiu mandar para fora do país.
 *  3. Estado gravado para a tarefa ⇒ ele. Gravado e ilegível já chega aqui
 *     como `desligada` (`./config.ts`): ilegível nunca é "ninguém escolheu".
 *  4. O clima sem estado gravado ⇒ o `modo` da onda 1.
 *  5. Tarefa nova, sem estado gravado, que cabe no aceite de "cada mensagem,
 *     sozinha" ⇒ observando (DEC-012 #3): observar não muda nada para o
 *     cliente e usa o dado já aceito. Uma que pede a conversa nunca começa
 *     sozinha.
 */
import type { CamadaSemantica } from "@/lib/agent-engine/guardrails/camadas-da-org";

import {
  ALCANCES,
  ESTADO_DO_MODO,
  type Alcance,
  type ConfigDoJev,
  type EstadoDaTarefa,
  type IdDaTarefa,
  type TarefaGravada,
} from "./config";

export interface TarefaDoJev {
  id: IdDaTarefa;
  /** O ponto do registro que ela substitui ou acompanha, quando há um. */
  ponto?: string;
  /** A pergunta que o Jev responde — a mesma do `decisaoRapida` do ponto. */
  primitiva: "score" | "choice" | "noul";
  /** O que sai para o fornecedor. Maior que o aceite ⇒ desligada. */
  alcance: Alcance;
  /**
   * Como ela convive com o que já existe: `substitui` (o Jev pode decidir no
   * lugar do mecanismo de hoje), `soma` (decidindo, o sinal dele se SOMA ao do
   * mecanismo de hoje e nunca o apaga), `cascata` (só pergunta onde a regra
   * disse não) ou `novo` (não há mecanismo hoje).
   */
  familia: "substitui" | "soma" | "cascata" | "novo";
  /**
   * O que muda quando ela DECIDE, dito ao leigo: no cartão do Jev (`aoDecidir`)
   * e no cartão do ponto, sobre o modelo que ele mostra logo abaixo
   * (`aoDecidirNoPonto`). É por tarefa, e não pela família: o clima e o
   * roteador são os dois `substitui`, e a IA de sempre é chamada só quando o
   * Jev falha num, e a cada mensagem no outro. Uma frase por família fez o
   * roteador herdar a do clima.
   */
  aoDecidir: string;
  aoDecidirNoPonto: string;
  /**
   * A camada de segurança que ela ACOMPANHA, quando há uma: desligada para a
   * organização, o turno não pergunta nem à IA de sempre nem ao Jev, e a tarefa
   * não roda qualquer que seja o estado dela (`tarefaSemCamada`).
   */
  camada?: CamadaSemantica;
  /**
   * Para quem não é engenheiro: vão à tela por `t()`. O `rotulo` é o nome do que
   * o JEV faz, e pode diferir do nome do ponto; o `oQueFaz` é o `oQueOJevFaz` do
   * registro, igual.
   */
  rotulo: string;
  oQueFaz: string;
}

/**
 * O clima: a única tarefa da onda 1, e a única cujo estado também se chama
 * `modo` (ver `./config.ts`). Os textos são os do ponto `sentiment_classify`.
 */
export const TAREFA_DO_CLIMA = {
  id: "clima",
  ponto: "sentiment_classify",
  primitiva: "score",
  alcance: "mensagem",
  familia: "substitui",
  // A IA de sempre só é chamada quando o Jev falha (`workers/ai-sentiment-worker.ts`).
  aoDecidir: "O Jev mede primeiro; a sua IA de sempre só entra se ele não responder.",
  aoDecidirNoPonto: "O Jev mede primeiro; o modelo abaixo é a reserva.",
  rotulo: "Medir o clima da conversa",
  oQueFaz:
    "Percebe, geralmente em menos de um segundo, se o cliente está irritado — e avisa para passar a conversa a uma pessoa.",
} as const satisfies TarefaDoJev;

/**
 * A manipulação (`./manipulacao.ts`): a mesma pergunta do classificador
 * anti-manipulação do turno, com os mesmos três níveis. É `soma`, e não
 * `substitui`: o classificador de hoje é advisório e nunca veta, e o Jev
 * decidindo só pode ACRESCENTAR sinal ao dele — o maior dos dois vale, e sem a
 * IA de sempre vale "nenhum sinal", como hoje (R2).
 */
export const TAREFA_DA_MANIPULACAO = {
  id: "manipulacao",
  ponto: "jailbreak_detect",
  primitiva: "choice",
  alcance: "mensagem",
  familia: "soma",
  aoDecidir: "A sua IA de sempre segue decidindo; o Jev só soma o alerta dele ao dela, sem nunca apagá-lo.",
  aoDecidirNoPonto: "O modelo abaixo decide; o Jev soma o sinal dele, sem nunca apagar o do modelo.",
  camada: "jailbreak",
  // O nome do ponto ("Barrar…") é o do classificador; o Jev não barra nada —
  // percebe e soma o sinal. Dizer "barrar" ao leigo prometeria um bloqueio.
  rotulo: "Perceber tentativa de manipulação",
  oQueFaz:
    "Percebe, na mensagem do cliente, quem tenta enganar o agente para ele fugir das suas regras — e soma esse sinal ao da sua IA de sempre, sem nunca apagá-lo.",
} as const satisfies TarefaDoJev;

/**
 * O roteador (`./roteador.ts`): qual agente atende, entre os membros do
 * roteador de intenção do número. É `substitui`: decidindo, a escolha dele
 * toma o lugar da do classificador de sempre, que vira a reserva — e sem ele
 * vale o que vale hoje (o agente de antes, ou o de reserva do roteador),
 * nunca o Jev (R2). Só roda onde há um roteador ativo: sem ele o turno não
 * classifica nada (`tarefaSemRoteador`).
 */
export const TAREFA_DO_ROTEADOR = {
  id: "roteador",
  ponto: "intent_router",
  primitiva: "choice",
  alcance: "mensagem",
  familia: "substitui",
  // Os dois perguntam a cada mensagem (`resolve-turn-agent.ts`), e sem a
  // resposta da IA de sempre a do Jev não vale (R2) — ao contrário do clima.
  aoDecidir:
    "A sua IA de sempre continua sendo perguntada a cada mensagem, ao mesmo tempo que o Jev, e continua custando: vale a escolha do Jev, e a dela entra quando ele não responde. Sem a resposta da sua IA de sempre, vale o agente de antes ou o de reserva do roteador — nunca só o Jev.",
  aoDecidirNoPonto:
    "Vale a escolha do Jev, mas o modelo abaixo continua sendo chamado a cada mensagem: é a reserva quando o Jev não responde, e sem ele o Jev não escolhe sozinho.",
  rotulo: "Escolher qual agente atende",
  oQueFaz:
    "Lê a última mensagem do cliente, sozinha, e escolhe entre as intenções do seu roteador qual agente deve atender.",
} as const satisfies TarefaDoJev;

export const TAREFAS_DO_JEV: readonly TarefaDoJev[] = [TAREFA_DO_CLIMA, TAREFA_DA_MANIPULACAO, TAREFA_DO_ROTEADOR];

/**
 * O estado que a EMPRESA escolheu para a tarefa, sem olhar o interruptor nem o
 * aceite. `undefined` = ninguém escolheu ainda (tarefa nova).
 */
export function estadoGravadoDaTarefa(config: ConfigDoJev, id: string): EstadoDaTarefa | undefined {
  const gravadas: Partial<Record<string, TarefaGravada>> = config.tarefas ?? {};
  const gravada = gravadas[id];
  if (gravada !== undefined) return gravada.estado;
  if (id === TAREFA_DO_CLIMA.id) return ESTADO_DO_MODO[config.modo];
  return undefined;
}

/**
 * Só o que a regra lê de uma tarefa. O `id` é `string` para a regra valer
 * também para a tarefa que ainda não existe — é assim que o teste prova o
 * item 5 antes de haver uma segunda tarefa.
 */
type TarefaNaRegra = Pick<TarefaDoJev, "alcance"> & { id: string };

/** Itens 2 a 5 do cabeçalho, com o Jev ligado sob o aceite `aceito`. */
function estadoSobOAceite(config: ConfigDoJev, tarefa: TarefaNaRegra, aceito: Alcance): EstadoDaTarefa {
  if (ALCANCES.indexOf(tarefa.alcance) > ALCANCES.indexOf(aceito)) return "desligada";
  return (
    estadoGravadoDaTarefa(config, tarefa.id) ?? (tarefa.alcance === "mensagem" ? "observando" : "desligada")
  );
}

/** O estado que vale agora — ver o cabeçalho. */
export function estadoEfetivoDaTarefa(config: ConfigDoJev, tarefa: TarefaNaRegra): EstadoDaTarefa {
  if (!config.ligado || config.aceite === null) return "desligada";
  return estadoSobOAceite(config, tarefa, config.aceite.alcance ?? "mensagem");
}

/**
 * O estado em que a tarefa fica se o Jev for ligado AGORA — o que o "pronto
 * para ligar" promete. Sem aceite ainda, vale o que a tela pede: cada
 * mensagem, sozinha (`app/api/v1/ai/jev/route.ts`, ao ligar).
 */
export function estadoAoLigar(config: ConfigDoJev, tarefa: TarefaNaRegra): EstadoDaTarefa {
  return estadoSobOAceite(config, tarefa, config.aceite?.alcance ?? "mensagem");
}

/** Começou sozinha e ninguém escolheu nada ainda: é o selo "Novo" do cartão. */
export function tarefaEhNova(config: ConfigDoJev, tarefa: TarefaNaRegra): boolean {
  return estadoGravadoDaTarefa(config, tarefa.id) === undefined && estadoEfetivoDaTarefa(config, tarefa) !== "desligada";
}

/**
 * A tarefa acompanha uma camada que está desligada para a organização? Então ela
 * não roda: o turno só pergunta ao Jev onde a IA de sempre também pergunta
 * (`lib/agent-engine/agent/inbound-turn.ts`). `camadas` é o efetivo da
 * organização (`camadasEfetivas`).
 */
export function tarefaSemCamada(
  tarefa: TarefaDoJev,
  camadas: Readonly<Record<CamadaSemantica, boolean>>,
): boolean {
  return tarefa.camada !== undefined && !camadas[tarefa.camada];
}

/**
 * A tarefa do roteador numa organização sem roteador de intenção ativo: o turno
 * não escolhe agente, e o Jev não tem com quem comparar. `temRoteadorAtivo` é
 * lido por quem chama (`ai_routers.is_active`).
 */
export function tarefaSemRoteador(tarefa: Pick<TarefaDoJev, "id">, temRoteadorAtivo: boolean): boolean {
  return tarefa.id === TAREFA_DO_ROTEADOR.id && !temRoteadorAtivo;
}
