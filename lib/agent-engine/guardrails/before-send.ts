import { assertAgentOperationPg, type AgentOperationContext } from '@/lib/ai/agents/operation';
import { assertApprovedReplyPg, type ApprovedReplyContext } from '@/lib/ai/replies/delivery';
import { assertMeetingDeliveryPg, type MeetingDeliveryContext } from '@/lib/agenda/meet-delivery';
/**
 * Cadeia de guardrails `before_send` (F2-13; edge-contract §2, blueprint 5.2) — o
 * seam determinístico entre a decisão do modelo (tool `send_message`) e o canal.
 * Estilo exit-2 do Claude Code: cada gate pode VETAR e a razão volta AO MODELO
 * como erro instrutivo (o modelo a vê no turno seguinte); só se TODOS passarem a
 * mensagem alcança o `ChannelAdapter` (e, por baixo, o sink idempotente F2-06).
 *
 * Ordem FINAL v6 (DECLARATIVA + VERSIONADA — `BEFORE_SEND_GATES`/`BEFORE_SEND_CHAIN_VERSION`,
 * F4-08/F4-09): (1) stop/opt-out — irrevogável; (2) lgpd — anonimização/base legal de
 * prospecção (F4-09); (3) anti-ban (janela/throttle/warm-up/caps — F2-11); (3.5) janela de
 * atendimento; (4) spinning (F2-12); (5) promise determinística (F4-01); (6) promise
 * semântica (F4-02); (6.5) case promise — anti-alucinação de casos humanos (spec 15 §10.2,
 * Wave 4); (6.7) internal_vocabulary — vazamento de vocabulário interno ao cliente
 * (`docs/doctrine/separacao-fala-e-operacao.md`); (7) disclosure
 * (F4-05). A ordem é código-constante DE PROPÓSITO, não config de
 * runtime: "stop primeiro" é invariante de segurança (regra dura nº 2) e mudar a ordem sem
 * bumpar a versão quebra o CI — deixá-la mutável em disco seria um footgun.
 *
 * ⚠️ Nota de 2026-07-28: a frase acima descrevia um guarda que **não existia**. Medido —
 * `BEFORE_SEND_CHAIN_VERSION` e `BEFORE_SEND_GATES` só apareciam neste arquivo, e nenhum
 * teste os referenciava. Agora existe: `tests/unit/before-send-chain-shape.test.ts`, que
 * trava ordem, tamanho, versão e unicidade. Ao mudar a cadeia de propósito, ele vermelha
 * PRIMEIRO — é o sinal de que a mudança foi vista, e não presumida. Cada gate
 * AVALIADO por tentativa vira registro estruturado de auditoria (gate + veredito + código)
 * pelo logger de obs/ E linha durável em `before_send_traces` (exportável por run — o
 * comando `pnpm audit:run`, acceptance 3).
 *
 * SERIALIZAÇÃO por número (INBOX-008): o read-then-act (ler estado de pacing/copies
 * → decidir → enviar → registrar) roda sob `pg_advisory_xact_lock(hashtext(
 * channel_session_id))` numa transação dedicada. Dois workers no MESMO número não
 * leem cap-1 ambos e estouram o cap em 1 (nem enviam copy duplicada): o segundo
 * espera o lock, relê o estado JÁ com o envio do primeiro contabilizado e veta.
 * O `channel.send` (POST ao CRM) roda na sua PRÓPRIA conexão/tx — o advisory lock
 * do nosso client serializa os concorrentes enquanto ele acontece.
 * ponytail: o lock fica retido durante o POST ao CRM (bounded por CRM_MCP_TIMEOUT_MS)
 * — aceitável no volume do MVP (throttle já espaça o número); se um número virar
 * gargalo, o upgrade é reservar o slot antes do POST e reconciliar no watchdog.
 */
import type pg from 'pg';
import type { ChannelSendResult } from '../channel-adapter';

import type { Logger } from '../obs/logger';
import { emitVetoActivity } from '@/lib/leads/veto-activity';
import type { Queryable } from '../queue/queue';
import { decidePacing } from '../pacing/engine';
import type { PacingState } from '../pacing/engine';
import type { PacingKnobs } from '../pacing/defaults';
import { loadChannelKnobs, loadPacingState, recordSend } from '../pacing/store';
import { decideSpinning } from '../spinning/engine';
import type { RecentCopy } from '../spinning/engine';
import { loadRecentCopies, loadSpinningKnobs, recordCopy } from '../spinning/store';
import type { SpinningKnobs } from '../spinning/defaults';
import { decidePromise } from './promise/engine';
import { loadPromiseTable } from './promise/table';
import type { PromiseTable } from './promise/table';
import { renderSemanticPromiseVeto } from './promise/semantic';
import type { PromiseClassification } from './promise/semantic';
import {
  bodyContainsDisclosure,
  countPriorAcceptedSends,
  loadDisclosureTemplate,
  prependDisclosure,
} from './disclosure/template';
import type { DisclosureMode } from './disclosure/template';
import { escalateLgpdVeto, isLegalBasisValid } from './lgpd/legal-basis';
import type { LgpdInput } from './lgpd/legal-basis';
import { detectHumanPromise } from './human-promise';
import { detectarVazamentoInterno, renderVetoDeVazamento } from './vazamento-interno';
// Módulo PURO de propósito (`capabilities`, não `index`): o seam não arrasta o
// adapter — e com ele o cliente HTTP do canal — para dentro do worker.
import { capabilitiesOf, DEFAULT_CHANNEL_PROVIDER } from '@/lib/channels/capabilities';
import { isWindowOpen } from './messaging-window';
import type { ChannelProvider } from '@/lib/channels/capabilities';
import { aplicarAjustesDeEstilo, lerAjustesDeEstiloDaOrg } from './ajustes-de-estilo-da-org';

/** O que os gates enxergam — carregado UMA vez sob o lock, por tentativa de envio. */
export interface GateContext {
  now: Date;
  /** corpo candidato (para o gate de spinning). */
  body: string;
  /**
   * STOP irrevogável: `contacts.is_blocked` OR `contacts.force_human`, lidos DIRETO da
   * fonte (mesmo banco pós-fusão — não existe mais cache) SOB o lock desta tentativa,
   * OR o sinal lido no `get_lead_context` deste turno.
   */
  optedOut: boolean;
  /**
   * Canal desta tentativa. Nenhum gate pergunta QUEM é o provider (invariante 1
   * de `docs/doctrine/restricao-de-canal.md`) — só o entrega a `capabilitiesOf`
   * para perguntar o que o canal permite.
   */
  provider: ChannelProvider;
  /**
   * Insumo da janela de 24h. Guardamos o CARIMBO, não o veredito: a janela é
   * derivada (ver `messaging-window.ts`), e passar um booleano já decidido faria o
   * gate confiar numa conta feita em outro lugar, em outro instante.
   *
   * **OPCIONAL de propósito, diferente de `provider`** — e a razão não é conveniência.
   * Ausente vale `lastInboundAt: null`, que a janela lê como FECHADA: um chamador que
   * esqueça o campo produz VETOS visíveis, não envios errados silenciosos. `provider`
   * não tinha default seguro (qualquer escolha mente sobre metade dos canais), então
   * lá a obrigatoriedade se paga; aqui o default é a direção segura, e mantê-lo
   * opcional evita tocar num invariante congelado só para satisfazer o compilador.
   */
  messagingWindow?: {
    /** `conversations.last_inbound_at`. `null` = contato nunca escreveu. */
    lastInboundAt: Date | null;
    /**
     * Esta tentativa é um TEMPLATE aprovado? Fora da janela, template é
     * exatamente o que a plataforma permite — então o gate passa.
     *
     * Só ESTE gate muda; `stop`, `lgpd`, `pacing` e os demais continuam valendo.
     * Sem esta flag haveria só duas saídas, ambas erradas: o `send_template`
     * seria vetado pelo gate que ele existe para resolver, ou pularia a cadeia
     * inteira — e aí template viraria bypass de opt-out, LGPD e horário.
     */
    isTemplate?: boolean;
  };
  pacing: {
    knobs: PacingKnobs;
    state: PacingState;
    crmDailyLimit: number | null;
    rng?: () => number;
  };
  spinning: {
    knobs: SpinningKnobs;
    window: RecentCopy[];
  };
  /**
   * Tabela de preços/promessas versionada da org (F4-01), carregada por ponteiro
   * sob o lock. null = org não fiscaliza promessa (gate no-op).
   */
  promise: {
    table: PromiseTable | null;
    versionId?: string;
  };
  /**
   * Resultado da camada SEMÂNTICA de promessa (F4-02), classificado ASSÍNCRONO na carga do
   * ctx (sob o lock) via camada de modelo agnóstica — o complemento da camada determinística
   * (`promise`) para texto livre que a regex não pega. null = camada não rodou (sem
   * classificador injetado → gate no-op). suspectPhrase é trecho da PRÓPRIA candidata: volta
   * ao modelo no veto (erro de ensino), mas nunca vai a log (PII fora de log).
   */
  semanticPromise: PromiseClassification | null;
  /**
   * Disclosure "assistente virtual" (F4-05; blueprint 5.7) — carregado por ponteiro sob o
   * lock. `template` null = org não configurou disclosure (gate no-op). `isFirstOutbound`
   * = não há envio `accepted` prévio a ESTE contato (send_ledger F2-06). `mode` (knob) decide o
   * que fazer quando a 1ª mensagem sai sem disclosure: 'veto' (bloqueia + ensina) ou 'inject'
   * (o gate devolve `amendBody` com o disclosure prependado).
   */
  disclosure: {
    template: string | null;
    versionId?: string;
    isFirstOutbound: boolean;
    mode: DisclosureMode;
  };
  /**
   * Conformidade LGPD (F4-09) lida do CRM no turno (get_lead_context) — fonte da verdade,
   * nunca do body. null = não injetado (gate no-op; testes que não exercitam LGPD). `isAnonymized`
   * veta QUALQUER envio; a base legal veta o 1º toque de PROSPECÇÃO. `isFirstOutbound` é o mesmo
   * sinal do disclosure (send_ledger accepted == 0), computado uma vez sob o lock.
   */
  lgpd: (LgpdInput & { isFirstOutbound: boolean }) | null;
  /**
   * Guardrail anti-alucinação de casos humanos (spec 15 §10.2, Wave 4) — a invariante
   * sagrada é: o lead NUNCA recebe promessa-de-humano sem um caso aberto. `casesEnabled`
   * false = feature off para a org → `casePromiseGate` no-op (default retrocompatível para
   * TODOS os outros callers de `runBeforeSend`, que nem sabem desta camada). `hasOpenCase`
   * (lido no turno via `hasOpenCaseForContact`) OU `openedCaseThisTurn` (a IA já chamou
   * `open_human_case` neste turno) tornam o gate no-op também — só veta quando a candidata
   * promete humano E não há caso nenhum.
   */
  casesEnabled: boolean;
  hasOpenCase: boolean;
  openedCaseThisTurn: boolean;
  /**
   * Nome(s) próprio(s) que o PROMPT do tenant usa para a retaguarda humana (ex.:
   * "Fernando"), somados ao vocabulário genérico do `casePromiseGate`
   * (`detectHumanPromise`/`human-promise.ts`). Ausente/vazio = só os cargos
   * genéricos (comportamento anterior, retrocompatível). Sem isto, um agente cujo
   * prompt nomeia a pessoa em vez do cargo escapa 100% do detector — medido em
   * produção, tenant YADEA: dezenas de promessas nomeando "Fernando", 1 só
   * detecção em 3 dias.
   */
  humanPromiseExtraTargets?: readonly string[];
  /**
   * Arma o `internalVocabularyGate` (vazamento de vocabulário interno ao cliente).
   *
   * **OPCIONAL, e ausente = DESARMADO — a direção segura AQUI é o oposto da do
   * `messagingWindow`, e a diferença é o que acontece com o veto em cada caminho.**
   *
   * No caminho do AGENTE (`send_message` do inbound-turn) existe um modelo no laço: o
   * veto volta a ele como erro instrutivo, ele reescreve, e o fail-safe libera se
   * insistir. Lá o gate arma.
   *
   * No caminho DETERMINÍSTICO (`followup-turn.ts`, re-entrada por template versionado)
   * não há ninguém para ensinar: veto ali é DROP SILENCIOSO — o follow-up morre sem
   * sintoma, desligando por dentro o invariante 4 de `docs/doctrine/sistema-vivo.md`
   * ("nada morre sem próximo passo"). Um default ARMADO faria exatamente isso em todo
   * chamador que não conhece este campo. Por isso ausente = no-op: na pior hipótese o
   * vazamento continua (o defeito que já existe e que este gate veio MEDIR), nunca o
   * cliente mudo.
   *
   * O contra-risco — um caller do agente esquecer o campo e desarmar o guarda em
   * silêncio — é coberto por `tests/unit/gate-vazamento-interno.test.ts`, que cobra a
   * fiação nos dois sentidos: presente no `send_message`, ausente no follow-up.
   */
  internalVocabularyEnforced?: boolean;
  /**
   * Arma o `spinningGate`. **Ausente = ARMADO** — a direção segura aqui é a
   * oposta do `internalVocabularyEnforced` logo acima, e a assimetria é
   * deliberada: aquele protege o CLIENTE de uma palavra feia, este protege o
   * NÚMERO de um banimento. Um default desarmado desligaria a proteção
   * anti-ban em todo chamador que não conhece este campo.
   *
   * O único que o desarma é o AVISO DE ESCALAÇÃO
   * (`lib/agent-engine/agent/aviso-de-escalacao.ts`), e a razão é aritmética,
   * não preferência. `decideSpinning` conta as candidatas idênticas ou
   * quase-idênticas (Jaccard ≥ 0,8) nas últimas `windowSize` (20) mensagens do
   * NÚMERO — janela que cruza leads — e veta a partir da terceira
   * (`repetitionThreshold: 2`). O aviso é texto de código: por mais variantes
   * que tenha, a terceira pessoa a pedir um atendente na mesma janela cairia no
   * veto, e veto ali é DROP SILENCIOSO — exatamente o silêncio que o aviso
   * existe para acabar, produzido pelo guardrail. Medido antes de escrever esta
   * linha: com 3 variantes, 14 de 20 avisos seguidos eram vetados
   * (`tests/unit/aviso-ao-lead.test.ts` congela a conta).
   *
   * O risco de ban que isto abre é coberto do outro lado: as variantes seguem
   * existindo (o número não repete UMA frase), o aviso é UM por escalação e
   * responde a quem acabou de escrever — o oposto do blast de template que este
   * gate persegue —, e ele continua contando no cap diário (`recordSend`).
   */
  spinningEnforced?: boolean;
  /**
   * Arma o `agendaStallGate`. Ausente = no-op — mesma direção segura de
   * `internalVocabularyEnforced` (caller que não conhece o campo não arma nada).
   *
   * `active` é o agente ter QUALQUER ferramenta de agenda neste turno, e não só a de
   * marcar. ⚠️ Já foi `crm_book_appointment` sozinho, e isso desarmava o gate exatamente
   * onde ele é mais necessário: no agente que CONSULTA a agenda e não marca — o arranjo
   * de quem quer que uma pessoa confirme cada horário (clínica, salão, consultório).
   * Esse agente tem `crm_find_free_slots`, promete "vou verificar e te aviso" do mesmo
   * jeito, e ficava sem a única cura determinística que existe para isso.
   *
   * `ferramentas` não arma nem desarma: é o TEXTO do veto — as ferramentas de agenda que
   * ESTE agente tem, e só elas. Mandar um agente que só consulta "chamar
   * crm_book_appointment", ou o que só tem a conjunta chamar a avulsa, é ensinar uma
   * ferramenta que ele não tem — o modelo tenta, falha, e a correção vira um segundo
   * defeito. Já foi um booleano (`podeMarcar`), e um booleano não diz QUAL.
   *
   * `toolCalledThisTurn` é se alguma delas já foi chamada neste turno (rastreado no call
   * site, que é quem monta as tools).
   */
  agenda?: { active: boolean; ferramentas: readonly string[]; toolCalledThisTurn: boolean };
}

/**
 * Veredito de UM gate. `waitMs` (só no pacing) é o throttle a respeitar antes do
 * envio. `detail` (só em veto, ex.: promise) leva valores estruturados detectado vs
 * permitido ao trace — números/rótulos curtos, NUNCA o corpo (sem PII).
 */
export type GateVerdict =
  | { pass: true; waitMs?: number; amendBody?: string; skipped?: 'not_applicable' }
  | {
      pass: false;
      code: string;
      reason: string;
      nextAllowedAt?: Date;
      detail?: Record<string, string | number>;
    };

export interface Gate {
  readonly name: string;
  evaluate(ctx: GateContext): GateVerdict;
}

/** Gate 1 — STOP/opt-out/força-humano: veto IRREVOGÁVEL (regra dura nº 2), 1ª linha. */
const stopGate: Gate = {
  name: 'stop',
  evaluate: (ctx) =>
    ctx.optedOut
      ? {
          pass: false,
          code: 'contato_bloqueado',
          reason:
            'o lead optou por sair do atendimento (bloqueio/opt-out irrevogável) — não é ' +
            'possível enviar nada a ele; encerre o turno sem tentar de novo.',
        }
      : { pass: true },
};

/**
 * Gate LGPD (F4-09; edge-contract §5 achado 5.6) — veto de conformidade HARD, agrupado com o
 * stop entre os vetos IRREVOGÁVEIS de negócio, ANTES do anti-ban (posição 2 de
 * `BEFORE_SEND_GATES`): checar base legal/anonimização não faz sentido depois de gastar janela.
 */
export const lgpdGate: Gate = {
  name: 'lgpd',
  evaluate: (ctx) => {
    const lgpd = ctx.lgpd;
    if (lgpd === null) return { pass: true };
    if (lgpd.isAnonymized) {
      return {
        pass: false,
        code: 'lgpd_anonymized',
        reason:
          'este contato está anonimizado no CRM (LGPD) — é proibido enviar qualquer mensagem a ' +
          'ele; encerre o turno sem tentar de novo.',
      };
    }
    if (lgpd.isProspecting && lgpd.isFirstOutbound && !isLegalBasisValid(lgpd.legalBasis)) {
      return {
        pass: false,
        code: 'lgpd_missing_legal_basis',
        reason:
          'não há base legal válida (LGPD) para o 1º contato de prospecção com este lead ' +
          '(consentimento, ou legítimo interesse com LIA registrada); não é possível iniciar a ' +
          'abordagem — encerre o turno, o time comercial vai regularizar a base legal no CRM.',
      };
    }
    return { pass: true };
  },
};

export const promiseGate: Gate = {
  name: 'promise',
  evaluate: (ctx) => {
    if (ctx.promise.table === null) return { pass: true };
    const decision = decidePromise({ candidate: ctx.body, table: ctx.promise.table });
    return decision.allow
      ? { pass: true }
      : {
          pass: false,
          code: decision.code ?? 'promise_out_of_table',
          reason: decision.reason ?? '',
          ...(decision.detail !== undefined ? { detail: decision.detail } : {}),
        };
  },
};

export const semanticPromiseGate: Gate = {
  name: 'semantic_promise',
  evaluate: (ctx) => {
    if (ctx.semanticPromise === null || !ctx.semanticPromise.isPromise) return { pass: true };
    return {
      pass: false,
      code: 'promise_semantic',
      reason: renderSemanticPromiseVeto(ctx.semanticPromise.suspectPhrase),
      detail: { promise_layer: 'semantic' },
    };
  },
};

export const casePromiseGate: Gate = {
  name: 'case_promise',
  evaluate: (ctx) => {
    if (!ctx.casesEnabled) return { pass: true };
    if (ctx.hasOpenCase || ctx.openedCaseThisTurn) return { pass: true };
    if (!detectHumanPromise(ctx.body, ctx.humanPromiseExtraTargets)) return { pass: true };
    return {
      pass: false,
      code: 'case_promise_without_case',
      reason:
        'Você prometeu envolver um humano mas não abriu um caso. Chame a tool ' +
        'open_human_case (descrevendo o que precisa) OU reformule a mensagem sem prometer humano.',
    };
  },
};

export const internalVocabularyGate: Gate = {
  name: 'internal_vocabulary',
  evaluate: (ctx) => {
    if (ctx.internalVocabularyEnforced !== true) return { pass: true };
    const achado = detectarVazamentoInterno(ctx.body);
    if (!achado.achou) return { pass: true };
    return {
      pass: false,
      code: 'internal_vocabulary_leak',
      reason: renderVetoDeVazamento(achado.termos),
      detail: { leaked_count: achado.termos.length, leaked_kinds: achado.categorias.join(',') },
    };
  },
};

const AGENDA_STALL_PATTERN =
  /\b(vou|estou|iremos|vamos)\b[^.!?\n]{0,10}\b(verificando|verificar|confirmando|confirmar|consultando|consultar)\b[^.!?\n]{0,80}\b(hor[aá]rios?|agenda|disponibilidade|agendamento|marca[çc][aã]o|encaixe|vagas?)\b/i;
const AGENDA_CONFIRMED_PATTERN =
  /\b(agendamento|hor[aá]rio|encaixe|vaga|visita)\b[^.!?\n]{0,30}\b(esta|está|ficou|fica|segue)\b[^.!?\n]{0,20}\b(confirmad[oa]|agendad[oa]|marcad[oa]|certinh[oa])\b/i;

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function nomesDasFerramentas(nomes: readonly string[]): string {
  const marcados = nomes.map((n) => `\`${n}\``);
  if (marcados.length <= 1) return marcados.join('');
  return `${marcados.slice(0, -1).join(', ')} ou ${marcados[marcados.length - 1]}`;
}

export const agendaStallGate: Gate = {
  name: 'agenda_stall',
  evaluate: (ctx) => {
    if (ctx.agenda === undefined || !ctx.agenda.active) return { pass: true };
    if (ctx.agenda.toolCalledThisTurn) return { pass: true };
    const bodySemAcento = semAcento(ctx.body);
    const stall = AGENDA_STALL_PATTERN.test(bodySemAcento);
    const confirmedSemChecar = AGENDA_CONFIRMED_PATTERN.test(bodySemAcento);
    if (!stall && !confirmedSemChecar) return { pass: true };
    return {
      pass: false,
      code: 'agenda_stall_sem_ferramenta',
      reason: (() => {
        const ferramentas =
          ctx.agenda.ferramentas.length > 0
            ? nomesDasFerramentas(ctx.agenda.ferramentas)
            : 'a ferramenta de agenda';
        return confirmedSemChecar
          ? `Você afirmou que um horário está confirmado/agendado sem ter chamado ${ferramentas} ` +
            'NESTE turno. Nunca diga que está confirmado sem a ferramenta ter registrado de fato — ' +
            'chame a ferramenta e responda com base no retorno dela.'
          : `Você prometeu verificar/confirmar um horário sem ter chamado ${ferramentas} NESTE ` +
            'turno. Chame a ferramenta agora e responda com base no retorno dela — não repita a ' +
            'promessa sem checar.';
      })(),
    };
  },
};

export const disclosureGate: Gate = {
  name: 'disclosure',
  evaluate: (ctx) => {
    const template = ctx.disclosure.template;
    if (template === null || !ctx.disclosure.isFirstOutbound) return { pass: true };
    if (bodyContainsDisclosure(ctx.body, template)) return { pass: true };
    if (ctx.disclosure.mode === 'inject') {
      return { pass: true, amendBody: prependDisclosure(ctx.body, template) };
    }
    return {
      pass: false,
      code: 'disclosure_required',
      reason:
        'a 1ª mensagem a um lead novo precisa se apresentar como assistente virtual antes de ' +
        `qualquer outra coisa; inclua no início: "${template.trim()}"`,
    };
  },
};

export const pacingGate: Gate = {
  name: 'pacing',
  evaluate: (ctx) => {
    const { banRisk } = capabilitiesOf(ctx.provider);
    const decision = decidePacing({
      now: ctx.now,
      knobs: ctx.pacing.knobs,
      state: ctx.pacing.state,
      crmDailyLimit: ctx.pacing.crmDailyLimit,
      banRisk,
      rng: ctx.pacing.rng,
    });
    if (!decision.allow) {
      return {
        pass: false,
        code: decision.code,
        reason: decision.reason,
        nextAllowedAt: decision.nextAllowedAt,
      };
    }
    return banRisk
      ? { pass: true, waitMs: decision.waitMs }
      : { pass: true, waitMs: decision.waitMs, skipped: 'not_applicable' };
  },
};

export const messagingWindowGate: Gate = {
  name: 'messaging_window',
  evaluate: (ctx) => {
    const caps = capabilitiesOf(ctx.provider);
    if (caps.freeformOutsideWindow) return { pass: true, skipped: 'not_applicable' };
    if (ctx.messagingWindow?.isTemplate === true) return { pass: true };
    if (isWindowOpen(ctx.now, ctx.messagingWindow?.lastInboundAt ?? null)) return { pass: true };
    return {
      pass: false,
      code: 'messaging_window_closed',
      reason:
        'a janela de 24 horas com este contato fechou; o canal vai recusar texto livre. ' +
        'Use um template aprovado (ferramenta send_template) ou encerre o turno sem enviar.',
    };
  },
};

const spinningGate: Gate = {
  name: 'spinning',
  evaluate: (ctx) => {
    if (ctx.spinningEnforced === false) return { pass: true, skipped: 'not_applicable' };
    const decision = decideSpinning({
      candidate: ctx.body,
      window: ctx.spinning.window,
      knobs: ctx.spinning.knobs,
    });
    return decision.allow
      ? { pass: true }
      : { pass: false, code: decision.code, reason: decision.reason };
  },
};

export const BEFORE_SEND_CHAIN_VERSION = 7;

export const BEFORE_SEND_GATES: readonly Gate[] = [
  stopGate,
  lgpdGate,
  pacingGate,
  messagingWindowGate,
  spinningGate,
  promiseGate,
  semanticPromiseGate,
  casePromiseGate,
  internalVocabularyGate,
  agendaStallGate,
  disclosureGate,
];

export interface GateTraceEntry {
  gate: string;
  verdict: 'pass' | 'veto' | 'skipped';
  code?: string;
  detail?: Record<string, string | number>;
}

export type BeforeSendResult =
  | { status: 'sent'; outcome: ChannelSendResult; trace: GateTraceEntry[] }
  | {
      status: 'vetoed';
      gate: string;
      code: string;
      message: string;
      nextAllowedAt?: Date;
      trace: GateTraceEntry[];
    };

export interface RunBeforeSendArgs {
  agentOperation?: AgentOperationContext;
  approvedReply?: ApprovedReplyContext;
  meetingDelivery?: MeetingDeliveryContext;
  pool: pg.Pool;
  log: Logger;
  tenantId: string;
  leadId: string;
  isTemplate?: boolean;
  jobId?: string;
  channelSessionId: string;
  body: string;
  optedOutThisTurn: boolean;
  agentId?: string | null;
  crmDailyLimit: number | null;
  now: Date;
  rng?: () => number;
  sleep?: (ms: number) => Promise<void>;
  gates?: readonly Gate[];
  classifyPromiseSemantic?: (body: string) => Promise<PromiseClassification>;
  disclosureMode?: DisclosureMode;
  lgpd?: LgpdInput;
  casesEnabled?: boolean;
  hasOpenCase?: boolean;
  openedCaseThisTurn?: boolean;
  humanPromiseExtraTargets?: readonly string[];
  enforceInternalVocabulary?: boolean;
  enforceSpinning?: boolean;
  agenda?: GateContext['agenda'];
  esperaForaDoLock?: () => Promise<void>;
  send: (body: string) => Promise<ChannelSendResult>;
}

export function evaluateBeforeSend(
  initial: GateContext,
  gates: readonly Gate[] = BEFORE_SEND_GATES,
) {
  const ctx = { ...initial };
  const trace: GateTraceEntry[] = [];
  let veto: { gate: string; code: string; message: string; nextAllowedAt?: Date } | null = null;
  let throttleWaitMs = 0;
  for (const gate of gates) {
    if (veto !== null) {
      trace.push({ gate: gate.name, verdict: 'skipped' });
      continue;
    }
    const verdict = gate.evaluate(ctx);
    if (verdict.pass) {
      trace.push(
        verdict.skipped !== undefined
          ? { gate: gate.name, verdict: 'skipped', code: verdict.skipped }
          : { gate: gate.name, verdict: 'pass' },
      );
      if (verdict.waitMs !== undefined && verdict.waitMs > throttleWaitMs)
        throttleWaitMs = verdict.waitMs;
      if (verdict.amendBody !== undefined) ctx.body = verdict.amendBody;
    } else {
      trace.push({
        gate: gate.name,
        verdict: 'veto',
        code: verdict.code,
        ...(verdict.detail !== undefined ? { detail: verdict.detail } : {}),
      });
      veto = {
        gate: gate.name,
        code: verdict.code,
        message: verdict.reason,
        ...(verdict.nextAllowedAt !== undefined ? { nextAllowedAt: verdict.nextAllowedAt } : {}),
      };
    }
  }
  return { body: ctx.body, trace, veto, throttleWaitMs };
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export async function runBeforeSend(args: RunBeforeSendArgs): Promise<BeforeSendResult> {
  const gates = args.gates ?? BEFORE_SEND_GATES;
  if (args.esperaForaDoLock) await args.esperaForaDoLock();
  const client = await args.pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [args.channelSessionId]);

    const provider = await loadChannelProvider(client, args.tenantId, args.channelSessionId);
    if (
      args.meetingDelivery &&
      (args.meetingDelivery.organizationId !== args.tenantId ||
        args.meetingDelivery.jobId !== args.jobId)
    )
      throw new Error('meet_scope_mismatch');
    const meetingPolicy = args.meetingDelivery
      ? await assertMeetingDeliveryPg(client, args.meetingDelivery)
      : null;
    if (
      meetingPolicy &&
      (meetingPolicy.contactId !== args.leadId ||
        meetingPolicy.channelSessionId !== args.channelSessionId)
    )
      throw new Error('meet_scope_mismatch');
    if (args.agentOperation) await assertAgentOperationPg(client, args.agentOperation);
    const replyPolicy = args.approvedReply
      ? await assertApprovedReplyPg(client, args.approvedReply)
      : null;
    if (
      args.approvedReply &&
      (args.approvedReply.organizationId !== args.tenantId ||
        args.approvedReply.jobId !== args.jobId ||
        replyPolicy?.contact_id !== args.leadId ||
        replyPolicy?.channel_session_id !== args.channelSessionId ||
        replyPolicy?.body !== args.body)
    )
      throw new Error('reply_scope_mismatch');

    // Presença (true OU false), não o valor: só `send_message` do modelo conhece
    // este campo. O re-run do fail-safe muda true→false, mas continua texto do
    // modelo e portanto continua recebendo o mesmo ajuste de estilo.
    const bodyDoModelo =
      args.enforceInternalVocabulary !== undefined
        ? aplicarAjustesDeEstilo(
            args.body,
            await lerAjustesDeEstiloDaOrg(client, args.tenantId),
          )
        : args.body;

    const optedOut =
      args.optedOutThisTurn ||
      (await readStopFlags(
        client,
        args.tenantId,
        args.leadId,
        meetingPolicy?.humanCommand === true || replyPolicy !== null,
      ));
    const pacingCfg = await loadChannelKnobs(
      client,
      args.tenantId,
      args.channelSessionId,
      args.log,
    );
    const pacingState = await loadPacingState(client, args.tenantId, args.channelSessionId, {
      now: args.now,
      timezone: pacingCfg.knobs.timezone,
      numberActivatedAt: pacingCfg.numberActivatedAt,
    });
    const spinningKnobs = await loadSpinningKnobs(
      client,
      args.tenantId,
      args.channelSessionId,
      args.log,
    );
    const window = await loadRecentCopies(
      client,
      args.tenantId,
      args.channelSessionId,
      spinningKnobs.windowSize,
    );
    const promise = await loadPromiseTable(client, args.tenantId);
    const semanticPromise = args.classifyPromiseSemantic
      ? await args.classifyPromiseSemantic(bodyDoModelo)
      : null;
    const disclosure = await loadDisclosureTemplate(client, args.tenantId);
    const isFirstOutbound =
      disclosure !== null || args.lgpd !== undefined
        ? (await countPriorAcceptedSends(client, args.tenantId, args.leadId)) === 0
        : false;

    const lastInboundAt = await readLastInboundAt(
      client,
      args.tenantId,
      args.leadId,
      args.channelSessionId,
    );

    const ctx: GateContext = {
      now: args.now,
      body: bodyDoModelo,
      optedOut,
      provider,
      messagingWindow: { lastInboundAt, ...(args.isTemplate === true ? { isTemplate: true } : {}) },
      pacing: {
        knobs: pacingCfg.knobs,
        state: pacingState,
        crmDailyLimit: args.crmDailyLimit,
        rng: args.rng,
      },
      spinning: { knobs: spinningKnobs, window },
      ...(args.enforceSpinning === false ? { spinningEnforced: false as const } : {}),
      promise: {
        table: promise?.table ?? null,
        ...(promise?.versionId !== undefined ? { versionId: promise.versionId } : {}),
      },
      semanticPromise,
      disclosure: {
        template: disclosure?.body ?? null,
        ...(disclosure?.versionId !== undefined ? { versionId: disclosure.versionId } : {}),
        isFirstOutbound,
        mode: args.disclosureMode ?? 'inject',
      },
      lgpd: args.lgpd !== undefined ? { ...args.lgpd, isFirstOutbound } : null,
      casesEnabled: args.casesEnabled ?? false,
      hasOpenCase: args.hasOpenCase ?? false,
      openedCaseThisTurn: args.openedCaseThisTurn ?? false,
      ...(args.humanPromiseExtraTargets !== undefined
        ? { humanPromiseExtraTargets: args.humanPromiseExtraTargets }
        : {}),
      internalVocabularyEnforced: args.enforceInternalVocabulary ?? false,
      ...(args.agenda !== undefined ? { agenda: args.agenda } : {}),
    };

    const { body: evaluatedBody, trace, veto, throttleWaitMs } = evaluateBeforeSend(ctx, gates);
    ctx.body = evaluatedBody;
    emitTrace(args.log, args.channelSessionId, trace);
    const traceId = await persistTrace(args, trace, veto);

    if (veto && traceId) {
      try {
        const r = await emitVetoActivity({
          pool: args.pool,
          organizationId: args.tenantId,
          contactId: args.leadId,
          traceId,
          gate: veto.gate,
          code: veto.code,
          agentId: args.agentId ?? null,
        });
        if (!r.routed) {
          args.log.info('veto sem negócio para pendurar: registrado no event_log', {
            channel_session_id: args.channelSessionId,
            reason: r.reason,
          });
        }
      } catch (err) {
        args.log.error('falha ao registrar atividade de veto (segue)', {
          channel_session_id: args.channelSessionId,
          error: err instanceof Error ? err.name : 'unknown',
        });
      }
    }

    if (veto !== null && veto.code.startsWith('lgpd_')) {
      await escalateLgpdVeto(
        args.pool,
        { tenantId: args.tenantId, leadId: args.leadId, code: veto.code },
        args.log,
      );
    }

    if (veto !== null) {
      await client.query('rollback');
      return { status: 'vetoed', trace, ...veto };
    }

    if (throttleWaitMs > 0) await (args.sleep ?? realSleep)(throttleWaitMs);

    if (args.approvedReply && ctx.body !== args.body)
      throw new Error('reply_body_changed_reapproval_required');
    const outcome = await args.send(ctx.body);

    if (outcome.kind === 'sent') {
      await recordSend(client, args.tenantId, args.channelSessionId, args.now);
      if (args.enforceSpinning !== false) {
        await recordCopy(client, args.tenantId, args.channelSessionId, ctx.body, args.now);
      }
    }
    await client.query('commit');
    return { status: 'sent', outcome, trace };
  } catch (err) {
    await rollback(client, err);
    throw err;
  } finally {
    client.release();
  }
}

export async function loadChannelProvider(
  db: Queryable,
  organizationId: string,
  channelSessionId: string,
): Promise<ChannelProvider> {
  const { rows } = await db.query<{ provider: string }>(
    'select provider from channel_sessions where organization_id = $1 and id = $2',
    [organizationId, channelSessionId],
  );
  const provider = rows[0]?.provider;
  return provider === undefined ? DEFAULT_CHANNEL_PROVIDER : (provider as ChannelProvider);
}

async function readStopFlags(
  db: Queryable,
  organizationId: string,
  contactId: string,
  humanMeetingCommand = false,
): Promise<boolean> {
  const { rows } = await db.query<{ stopped: boolean }>(
    humanMeetingCommand
      ? 'select is_blocked as stopped from contacts where organization_id = $1 and id = $2'
      : 'select (is_blocked or force_human) as stopped from contacts where organization_id = $1 and id = $2',
    [organizationId, contactId],
  );
  return rows[0]?.stopped === true;
}

async function readLastInboundAt(
  db: Queryable,
  organizationId: string,
  contactId: string,
  channelSessionId: string,
): Promise<Date | null> {
  const { rows } = await db.query<{ last_inbound_at: Date | null }>(
    `select last_inbound_at from conversations
      where organization_id = $1 and contact_id = $2 and channel_session_id = $3
      order by last_inbound_at desc nulls last
      limit 1`,
    [organizationId, contactId, channelSessionId],
  );
  return rows[0]?.last_inbound_at ?? null;
}

function emitTrace(log: Logger, channelSessionId: string, trace: GateTraceEntry[]): void {
  for (const entry of trace) {
    log.info('before_send gate avaliado', {
      channel_session_id: channelSessionId,
      gate: entry.gate,
      verdict: entry.verdict,
      ...(entry.code !== undefined ? { code: entry.code } : {}),
      ...(entry.detail ?? {}),
    });
  }
}

async function persistTrace(
  args: RunBeforeSendArgs,
  trace: GateTraceEntry[],
  veto: { gate: string; code: string } | null,
): Promise<string | null> {
  if (args.jobId === undefined) return null;
  try {
    const { rows } = await args.pool.query<{ id: string }>(
      `insert into before_send_traces
         (organization_id, job_id, contact_id, channel_session_id, trace, vetoed_gate, vetoed_code)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id`,
      [
        args.tenantId,
        args.jobId,
        args.leadId,
        args.channelSessionId,
        JSON.stringify(trace),
        veto?.gate ?? null,
        veto?.code ?? null,
      ],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    args.log.error('falha ao persistir trace de auditoria before_send (segue: logger é backup)', {
      channel_session_id: args.channelSessionId,
      error: err instanceof Error ? err.name : 'unknown',
    });
    return null;
  }
}

async function rollback(client: pg.PoolClient, cause: unknown): Promise<void> {
  try {
    await client.query('rollback');
  } catch (rollbackErr) {
    throw new AggregateError(
      [cause, rollbackErr],
      'rollback falhou após erro na cadeia before_send',
    );
  }
}
