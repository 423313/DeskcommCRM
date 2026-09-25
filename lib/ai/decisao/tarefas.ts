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
   * lugar do mecanismo de hoje), `cascata` (só pergunta onde a regra disse não)
   * ou `novo` (não há mecanismo hoje).
   */
  familia: "substitui" | "cascata" | "novo";
  /** Para quem não é engenheiro: vão à tela por `t()`. */
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
  rotulo: "Medir o clima da conversa",
  oQueFaz:
    "Percebe, geralmente em menos de um segundo, se o cliente está irritado — e avisa para passar a conversa a uma pessoa.",
} as const satisfies TarefaDoJev;

export const TAREFAS_DO_JEV: readonly TarefaDoJev[] = [TAREFA_DO_CLIMA];

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
