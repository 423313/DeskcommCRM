/**
 * Vocabulário e transições de uma atualização disparada pela UI.
 *
 * Os valores de RunStatus e RunStep são os MESMOS do CHECK em
 * `system_update_runs` (migration 0089). O invariante
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts` compara os dois —
 * mudar um lado sem o outro fica vermelho.
 */

export type RunStatus = "dispatched" | "success" | "failed" | "failed_rolled_back";
export type RunStep = "backup" | "codigo" | "banco";

/**
 * Depois disso sem notícia, a UI trata o run como desfecho desconhecido.
 * 15 min é folgado: uma atualização real leva ~2 min, e o agente ainda tenta
 * reportar por ~2 min após o reinício do app.
 */
export const RUN_STALE_AFTER_MS = 15 * 60 * 1000;

const TERMINAL: readonly RunStatus[] = ["success", "failed", "failed_rolled_back"];

/**
 * Só existe uma transição legítima: de `dispatched` para um desfecho. Um run
 * que já terminou é imutável — se o agente reportar duas vezes (retry após o
 * reinício do app), a segunda é recusada em vez de reescrever a história.
 */
export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return from === "dispatched" && TERMINAL.includes(to);
}

/**
 * `unknown` é DERIVADO na leitura, nunca gravado: um agente morto não consegue
 * anunciar a própria morte.
 */
export function isRunStale(dispatchedAt: string, now: Date): boolean {
  const started = Date.parse(dispatchedAt);
  if (Number.isNaN(started)) return true;
  return now.getTime() - started > RUN_STALE_AFTER_MS;
}

/**
 * O rollback deste run já foi superado por uma troca de app que não passou por
 * aqui?
 *
 * ## As duas situações, que o tempo sozinho NÃO separa
 *
 * **(a) Logo depois do rollback.** O agente do host roda `git describe` DEPOIS
 * do checkout, então ele reporta a versão NOVA — a que acabou de quebrar. Essa
 * batida chega segundos depois de o run terminar, e é a mentira que o run
 * existe para desfazer. Aqui o run tem de vencer.
 *
 * **(b) Oito dias e vários deploys depois.** O app trocou de versão por
 * caminhos que não criam run (`docker compose up -d`, deploy por CI,
 * `update.sh` no terminal). O run virou notícia velha e seguia nomeando a
 * versão no ar — medido em produção: o rodapé anunciou por oito dias uma versão
 * de 28 de agosto. Aqui o host tem de vencer.
 *
 * Nos DOIS o host reporta depois do run. A primeira versão desta função
 * comparava só as datas, e por isso consertava (b) quebrando (a) — pego pela
 * `tests/e2e/system-update.spec.ts`, que percorre exatamente o cenário (a).
 *
 * ## O que separa: a versão reportada, não o relógio
 *
 * Em (a) o host reporta `run.to_version` — a que o checkout instalou e que o
 * contêiner recusou. Em (b) ele reporta o que um outro caminho subiu, que é
 * outra coisa. Então o run só é superado quando o host reporta uma versão que
 * **o run não descreve** — nem a que tentou instalar, nem a que restaurou.
 *
 * O caso que fica de fora é reinstalar À MÃO exatamente a versão que falhou e
 * dessa vez funcionar: ali o rodapé segue nomeando a anterior. Falha
 * conservadora e de propósito — ela empurra para atualizar, enquanto o erro
 * oposto seria anunciar como no ar justamente a versão que quebrou.
 *
 * Falso sempre que falta uma das datas — ausência de prova não é prova de
 * deploy, e o run continua sendo a informação mais específica sobre o que subiu.
 */
export function rollbackFoiSuperado(
  versionUpdatedAt: string | null | undefined,
  runFinishedAt: string | null | undefined,
  versaoReportadaPeloHost?: string | null | undefined,
  run?: { from_version?: string | null; to_version?: string | null } | null,
): boolean {
  if (!versionUpdatedAt || !runFinishedAt) return false;
  const gravado = Date.parse(versionUpdatedAt);
  const terminou = Date.parse(runFinishedAt);
  if (Number.isNaN(gravado) || Number.isNaN(terminou)) return false;
  if (gravado <= terminou) return false;

  // Sem saber o que o host reportou, fica valendo o run: é o degrau
  // conservador, e é o comportamento de antes desta função existir.
  if (!versaoReportadaPeloHost) return false;
  const descritasPeloRun = [run?.to_version, run?.from_version].filter(Boolean);
  return !descritasPeloRun.includes(versaoReportadaPeloHost);
}

/**
 * O run terminou BEM e o host ainda não teve chance de contar?
 *
 * ## O silêncio de até 5 minutos depois de dar certo
 *
 * `run_result` com `status: "success"` escreve só em `system_update_runs` — ele
 * **não toca** `system_version.current_version`. Quem escreve essa coluna é o
 * heartbeat do `agent.sh`, e ele roda de 5 em 5 minutos — o cabeçalho do
 * próprio `agent.sh` diz "a cada 5 minutos", e a linha de cron que o instalador
 * escreve está em `hostgator-setup-kit/test-validators.sh`.
 *
 * Então, na janela entre o fim da atualização e a batida seguinte,
 * `current_version` ainda nomeia a versão ANTIGA — e `update_available`
 * (`latest !== current`) continua verdadeiro. A tela volta do reinício
 * oferecendo o botão "Atualizar agora" para a versão que **acabou de ser
 * instalada**. Quem clicou faz tudo de novo, ou conclui que não funcionou.
 *
 * ## Por que assumir o `to_version` é seguro aqui
 *
 * `success` é o agente do host dizendo que o `update.sh` foi até o fim — a
 * troca de imagem incluída. Diferente do caso de rollback (onde o host reporta
 * a versão que QUEBROU e o run precisa contradizê-lo), aqui os dois concordam;
 * o host só ainda não falou.
 *
 * E é auto-corrigível por construção: assim que a batida chega,
 * `system_version.updated_at` passa a ser posterior ao `finished_at` e esta
 * função devolve `false` — o host volta a mandar, sem exceção nenhuma. É o
 * mesmo desempate temporal de `rollbackFoiSuperado`, na direção contrária.
 *
 * Sem `finished_at` (run antigo, agente velho) devolve `false`: sem a data não
 * há como saber se o host já falou depois, e o degrau conservador é o de antes.
 * Sem `versionUpdatedAt` devolve `true` — o host nunca reportou coisa alguma, e
 * o run é a única notícia que existe.
 */
export function sucessoJaInstalado(
  versionUpdatedAt: string | null | undefined,
  runFinishedAt: string | null | undefined,
  run?: { status?: string | null; to_version?: string | null } | null,
): boolean {
  if (run?.status !== "success" || !run.to_version) return false;
  if (!runFinishedAt) return false;
  const terminou = Date.parse(runFinishedAt);
  if (Number.isNaN(terminou)) return false;
  if (!versionUpdatedAt) return true;
  const gravado = Date.parse(versionUpdatedAt);
  if (Number.isNaN(gravado)) return true;
  // Empate conta como "o host ainda não falou": a escrita do `run_result` e a
  // do heartbeat são de relógios diferentes, e na janela de um segundo o degrau
  // seguro é o que NÃO volta a oferecer a versão já instalada.
  return gravado <= terminou;
}

/**
 * O que aconteceu com o banco na rodada de atualização — o pedaço que até
 * agora só existia no log do servidor. Quando o baseline é reaplicado com o
 * sistema no ar, a primeira passada pode não fechar e o kit tenta de novo; sem
 * estes três números, uma rodada que precisou de três passadas fica idêntica a
 * uma que fechou de primeira, e quem operou não sabe que o banco estava em uso.
 */
export type RodadaDoBanco = {
  /** Houve disputa de lock com o sistema no ar em alguma passada. */
  disputa: boolean;
  /** Quantas retentativas a rodada gastou depois da primeira passada. */
  retentativas: number;
  /** Em qual passada a rodada fechou (1 = primeira). */
  passada: number;
};

/**
 * Lê a rodada de banco da linha de `system_update_runs`. Devolve `null` quando
 * ela não foi medida por inteiro — coluna nula é "não medido", e nulo é o que
 * a tela precisa para ficar calada em vez de inventar um zero.
 */
export function rodadaDoBancoDaLinha(
  linha:
    | {
        disputa_de_banco?: boolean | null;
        retentativas_do_banco?: number | null;
        passada_do_banco?: number | null;
      }
    | null
    | undefined,
): RodadaDoBanco | null {
  if (!linha) return null;
  if (typeof linha.disputa_de_banco !== "boolean") return null;
  if (typeof linha.retentativas_do_banco !== "number") return null;
  if (typeof linha.passada_do_banco !== "number") return null;
  return {
    disputa: linha.disputa_de_banco,
    retentativas: linha.retentativas_do_banco,
    passada: linha.passada_do_banco,
  };
}

function passadasPorExtenso(passada: number): string {
  return passada === 2 ? "duas passadas" : `${passada} passadas`;
}

function retentativasPorExtenso(retentativas: number): string {
  return retentativas === 1 ? "uma retentativa" : `${retentativas} retentativas`;
}

/**
 * Conta o que aconteceu com o banco quando a atualização terminou — em
 * português de gente, para a tela de atualização mostrar. Devolve `null` quando
 * não há o que contar (ninguém mediu, ou os números não fazem sentido): a tela
 * fica silenciosa em vez de afirmar uma passada que não aconteceu.
 */
export function textoDaRodadaDoBanco(
  rodada: RodadaDoBanco | null | undefined,
): string | null {
  if (!rodada) return null;

  const { disputa, retentativas, passada } = rodada;
  if (typeof disputa !== "boolean") return null;
  if (!Number.isInteger(retentativas) || retentativas < 0) return null;
  if (!Number.isInteger(passada) || passada < 1) return null;
  // Uma passada por tentativa: sem isto, { retentativas: 5, passada: 2 } viraria
  // uma frase que contradiz a si mesma.
  if (passada < retentativas + 1) return null;

  if (retentativas === 0) {
    return disputa
      ? "Houve disputa com o sistema usando o banco, mas a primeira passada fechou."
      : "O banco atualizou de uma vez, na primeira passada, sem disputa com o sistema no ar.";
  }

  if (disputa) {
    return `O banco estava em disputa com o sistema no ar: foram ${passadasPorExtenso(
      passada,
    )} e ${retentativasPorExtenso(retentativas)} até a atualização do banco fechar.`;
  }

  return `A primeira passada não aplicou o banco inteiro: foram ${passadasPorExtenso(
    passada,
  )} e ${retentativasPorExtenso(retentativas)} até fechar.`;
}
