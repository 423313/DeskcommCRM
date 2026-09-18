/**
 * O PREÂMBULO DO CI NÃO PODE COMER O ORÇAMENTO DOS TESTES.
 *
 * ## O defeito que este arquivo congela
 *
 * O job `verify` — check OBRIGATÓRIO na branch protection — vinha sendo CANCELADO
 * pelo relógio. Medido em 95 execuções (`gh api .../actions/runs/<id>/jobs`, runs
 * 33831269531..33915100363): 20 canceladas, e as 17 que chegaram a registrar o passo
 * `pnpm/action-setup` têm ≥ 352s NELE. Nenhuma verde passou de 300s no mesmo passo.
 *
 *   passo pnpm/action-setup   min 4s · p50 174s · p90 424s · max 433s
 *   trabalho real (total − esse passo), nas 51 verdes:
 *                             min 354s · p50 550s · p90 594s · MÁXIMO 609s
 *
 * O teto é 900s. A suíte nunca chegou perto: quem estourava era um `npm install`
 * contra registry.npmjs.org escondido dentro do self-installer do `pnpm/action-setup`,
 * sem cache e sem teto. Um gate obrigatório que reprova por RELÓGIO e não por defeito
 * treina todo mundo a ignorar vermelho — e um contribuidor externo (PR #565) viu
 * `verify: FAILURE` sem ter feito nada errado, morrendo no meio do `pnpm test:unit`
 * sem uma linha FAIL e sem o rodapé do vitest.
 *
 * O conserto está em `.github/actions/preparar-node` (o cabeçalho de lá tem o
 * mecanismo e a prova com controle positivo). Este arquivo guarda que ele fica:
 * sem guarda, o próximo job novo nasce com o trio cru de novo, e o próximo aperto
 * de relógio é resolvido subindo o teto — que é trocar vermelho honesto por um CI
 * que engorda sem ninguém ver (a mesma razão escrita no cabeçalho do `e2e.yml`).
 *
 * ## Sem parser YAML, com controle positivo
 *
 * `yaml`/`js-yaml` não estão nas dependências do projeto (js-yaml só como transitiva
 * do eslint). Então regex estreito + um primeiro caso que prova que o instrumento
 * enxerga alguma coisa: sem ele, um regex que parou de casar devolve lista vazia e
 * todas as asserções seguintes passam por vacuidade.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR_WORKFLOWS = join(process.cwd(), ".github/workflows");
const ACTION = join(process.cwd(), ".github/actions/preparar-node/action.yml");

/**
 * O teto de cada job que roda a suíte, com a razão ao lado.
 *
 * Subir um número aqui é decisão consciente e visível em code review — que é
 * justamente o que faltava. O teto é o instrumento que denuncia a suíte crescendo;
 * quem o sobe tem de dizer por que o trabalho real (não o preâmbulo) cresceu.
 */
const TETOS: Record<string, { minutos: number; razao: string }> = {
  "ci.yml::verify": {
    minutos: 25,
    // A razão anterior era "p90 594s, máximo 609s em 51 verdes — folga de ~4m45",
    // e ela VENCEU: a folga de 4m45 não existe mais. Medido em 18/09/2026 sobre
    // 39 rodadas, o quadro é outro e o teto passou a ser o principal reprovador
    // do repositório:
    //
    //     success     n=19   mediana 11,9 min   MÁX 14,9   ← 0,1 min de folga
    //     cancelled   n=13   mediana 15,2 min   máx 15,3   ← TODAS no teto
    //     failure     n= 7   mediana 10,2 min
    //
    // UM TERÇO das rodadas morria de relógio, e o desvio entre as 13 é de
    // SEGUNDOS — variância zero não é humano cancelando, é o teto. Mas o GitHub
    // entrega isso como `conclusion: cancelled`, idêntico a `gh run cancel`, e
    // duas sessões gastaram horas caçando um cancelador que não existia.
    //
    // O tempo tem dono medido (12 rodadas verdes, passo a passo): `Unit tests`
    // 10,3 dos 13,2 min — 78% do job. Typecheck 0,9 · lint 0,8 · kit 0,7.
    //
    // ⚠️ E SUBIR O TETO **NÃO** É O CONSERTO — é o torniquete. O conserto é
    // repartir `pnpm test:unit` (issue #1185, com a régua escrita). O que impede
    // este 25 de virar "CI que engorda em silêncio", que é o risco que esta
    // catraca existe para barrar, é o passo `Orçamento de tempo do verify`, que
    // reprova aos 16 min com `::error::` em português. O teto guarda travamento;
    // o orçamento é que denuncia crescimento.
    //
    // QUANDO O #1185 ENTRAR, ESTE NÚMERO DESCE. Teto que sobe e não volta é
    // exatamente o que a razão anterior protegia.
    razao:
      "13 de 39 rodadas morriam no teto de 15 (mediana 15,2; melhor sucesso 14,9 — 0,1 de folga), " +
      "e chegavam como `cancelled`, indistinguível de cancelamento humano. O 25 é guarda de " +
      "travamento; quem denuncia crescimento é o passo `Orçamento de tempo do verify` (16 min). " +
      "Desce quando o #1185 repartir `test:unit`, que é 78% do job. " +
      "⚠️ O orçamento companheiro subiu 16→19 em 18/09: o 16 saiu de distribuição CENSURADA " +
      "pelo teto de 15 (quem passava de 15 morria e virava `cancelled`, não `success`), e com " +
      "a censura removida o máximo real é 16,0 — o orçamento reprovava um verde. Teto e " +
      "orçamento censuram a medição que os calibra: recalibre DEPOIS de mexer, nunca antes",
  },
  // O agregado `invariants` NÃO tem teto de propósito: ele não roda a suíte, só
  // lê o desfecho de `needs`. O teto que denuncia a suíte crescendo vive na perna
  // que a roda.
  "ci.yml::invariants-majors": {
    minutos: 30,
    razao:
      "a perna deixou de ser UMA passada: agora é `test:db` + `test:db:update`, e cada uma sobe " +
      "Postgres e aplica o baseline (p90 medido de uma passada: 325s). O 30 é DECLARADO, não " +
      "medido — não há Docker onde esta matriz foi escrita; mantido em 20, a perna morreria por " +
      "relógio no meio da segunda passada",
  },
};

/**
 * O ORÇAMENTO de cada job que roda a suíte — o número que DENUNCIA crescimento.
 *
 * Existe separado de `TETOS` porque os dois papéis são distintos e foi a confusão
 * entre eles que produziu o defeito de 18/09: o teto é GUARDA DE TRAVAMENTO (mata
 * job pendurado, e o valor quase não importa); o orçamento é DETECTOR (reprova com
 * mensagem legível quando a suíte engorda).
 *
 * ⚠️ POR QUE ESTE MAPA NASCEU: medido em 18/09, o orçamento do `verify` NÃO tinha
 * catraca nenhuma. Sabotei-o de 19 para 30 e a suíte seguiu 5/5 verde — ou seja,
 * qualquer um podia subir o orçamento acima do teto e o detector viraria enfeite,
 * em silêncio, restaurando exatamente o problema que ele foi criado para resolver.
 * O teto tinha catraca; o companheiro dele, não.
 */
const ORCAMENTOS: Record<string, { minutos: number; razao: string }> = {
  "ci.yml::verify": {
    minutos: 19,
    razao:
      "distribuição NÃO censurada (20 sucessos do `verify` posteriores ao merge de 18:32:12Z, " +
      "quando o teto subiu para 25): mediana 14,9 · p90 15,8 · p95 15,9 · MÁX 16,0. O 19 é " +
      "máx+3,0, com 6 min até o teto — então o detector dispara ANTES do corte, que é o que " +
      "faz o erro legível chegar em vez do `cancelled`. " +
      "⚠️ O valor anterior (16) veio de distribuição CENSURADA: foi calibrado sobre `máx " +
      "sucesso 14,9` medido sob o teto de 15, e sob aquele teto todo job que passaria de 15 " +
      "morria e entrava em `cancelled`, não em `success` — eu medi os SOBREVIVENTES e tratei " +
      "como a distribuição dos jobs. Com a censura removida, 10 de 31 jobs passam de 15 e o 16 " +
      "já reprovava 1 verde. LIÇÃO DE MÉTODO: teto e orçamento censuram a medição que os " +
      "calibra — recalibre DEPOIS de mexer, nunca antes",
  },
};

interface Linha {
  arquivo: string;
  n: number;
  texto: string;
}

function linhasEfetivas(dir: string, arquivos: string[]): Linha[] {
  return arquivos.flatMap((arquivo) =>
    readFileSync(join(dir, arquivo), "utf8")
      .split("\n")
      .map((texto, i) => ({ arquivo, n: i + 1, texto }))
      // Comentário não conta: estes arquivos comentam longamente sobre
      // `pnpm/action-setup` e não pode ser o comentário a satisfazer o gate.
      .filter((l) => !l.texto.trimStart().startsWith("#")),
  );
}

function workflows(): string[] {
  return readdirSync(DIR_WORKFLOWS).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
}

describe("o preâmbulo do CI não come o orçamento dos testes", () => {
  it("o instrumento está vivo: acha os workflows e os usos da action", () => {
    // Controle positivo das três asserções seguintes.
    const arquivos = workflows();
    expect(arquivos.length, "workflows em .github/workflows").toBeGreaterThanOrEqual(4);

    const usos = linhasEfetivas(DIR_WORKFLOWS, arquivos).filter((l) =>
      /uses:\s*\.\/\.github\/actions\/preparar-node\s*$/.test(l.texto),
    );
    expect(usos.length, "pontos que usam ./.github/actions/preparar-node").toBeGreaterThanOrEqual(6);
  });

  it("nenhum workflow instala pnpm por fora da action preparada", () => {
    const crus = linhasEfetivas(DIR_WORKFLOWS, workflows())
      .filter((l) => /uses:\s*pnpm\/action-setup/.test(l.texto))
      .map((l) => `${l.arquivo}:${l.n}`);

    expect(
      crus,
      "trio cru de volta: esse passo já cancelou 17 execuções do `verify` por relógio — use ./.github/actions/preparar-node",
    ).toEqual([]);
  });

  it("todo uso da action carrega o seu teto de tempo", () => {
    const semTeto: string[] = [];
    for (const arquivo of workflows()) {
      const linhas = readFileSync(join(DIR_WORKFLOWS, arquivo), "utf8").split("\n");
      linhas.forEach((texto, i) => {
        if (!/uses:\s*\.\/\.github\/actions\/preparar-node\s*$/.test(texto)) return;
        // O passo vai até a próxima linha que abre outro item de lista (`- `)
        // no mesmo recuo, ou até o fim do arquivo.
        const recuo = texto.length - texto.trimStart().length;
        let fim = linhas.length;
        for (let j = i + 1; j < linhas.length; j++) {
          const l = linhas[j]!;
          if (l.trim() === "") continue;
          const r = l.length - l.trimStart().length;
          if (r <= recuo) {
            fim = j;
            break;
          }
        }
        const corpo = linhas.slice(i + 1, fim).filter((l) => !l.trimStart().startsWith("#"));
        if (!corpo.some((l) => /^\s+timeout-minutes:\s*\d+\s*$/.test(l))) {
          semTeto.push(`${arquivo}:${i + 1}`);
        }
      });
    }

    expect(
      semTeto,
      "uso sem timeout-minutes: sem o cinto, um dia de cache frio volta a consumir o orçamento dos testes",
    ).toEqual([]);
  });

  it("o teto dos jobs que rodam a suíte não sobe sem razão escrita", () => {
    const texto = readFileSync(join(DIR_WORKFLOWS, "ci.yml"), "utf8");
    const achados: Record<string, number> = {};
    const re = /^ {2}([A-Za-z0-9_-]+):\s*$/gm;
    for (const m of texto.matchAll(re)) {
      const corpo = texto.slice(m.index! + m[0].length, m.index! + m[0].length + 400);
      const teto = corpo.match(/^ {4}timeout-minutes:\s*(\d+)\s*$/m);
      if (teto) achados[`ci.yml::${m[1]!}`] = Number(teto[1]);
    }

    // Controle positivo: o regex tem de achar os dois jobs de ci.yml.
    expect(Object.keys(achados).sort(), "jobs de ci.yml com teto declarado").toEqual(
      Object.keys(TETOS).sort(),
    );

    for (const [chave, { minutos, razao }] of Object.entries(TETOS)) {
      expect(
        achados[chave],
        `${chave}: o teto mudou. Subir troca vermelho honesto por CI que engorda em silêncio — razão em vigor: ${razao}`,
      ).toBe(minutos);
    }
  });

  it("o orçamento declarado no ci.yml é o do mapa (catraca anti-deriva)", () => {
    const texto = readFileSync(join(DIR_WORKFLOWS, "ci.yml"), "utf8");
    const achados: Record<string, number> = {};
    // O orçamento vive no `env:` do passo, então a âncora é o nome do passo.
    const re = /name: Orçamento de tempo do (\w+)\n(?:.*\n)*?\s+ORCAMENTO_MIN: "(\d+)"/g;
    for (const m of texto.matchAll(re)) achados[`ci.yml::${m[1]!}`] = Number(m[2]!);

    // Controle de VIVACIDADE: sem ele, um regex que deixasse de casar daria verde
    // por vacuidade — é o modo de falha que derrubou duas entregas em 18/09.
    expect(
      Object.keys(achados).sort(),
      "nenhum ORCAMENTO_MIN encontrado no ci.yml — o passo mudou de nome e esta catraca cegou",
    ).toEqual(Object.keys(ORCAMENTOS).sort());

    for (const [chave, { minutos, razao }] of Object.entries(ORCAMENTOS)) {
      expect(
        achados[chave],
        `${chave}: o orçamento mudou. Ele é o DETECTOR de crescimento — razão em vigor: ${razao}`,
      ).toBe(minutos);
    }
  });

  it("o orçamento é MENOR que o teto — senão o detector nunca dispara", () => {
    // O invariante que importa mais que os dois números: se o orçamento passar do
    // teto, o job morre de relógio ANTES de o passo de orçamento rodar, e o sinal
    // volta a ser `cancelled` — indistinguível de cancelamento humano. O detector
    // existiria e nunca falaria.
    for (const [chave, { minutos }] of Object.entries(ORCAMENTOS)) {
      const teto = TETOS[chave]?.minutos;
      expect(teto, `${chave}: há orçamento declarado e nenhum teto para comparar`).toBeDefined();
      expect(
        minutos,
        `${chave}: orçamento ${minutos} >= teto ${teto}. O job morre no teto antes de o ` +
          "orçamento rodar, e o vermelho volta a chegar como `cancelled`.",
      ).toBeLessThan(teto!);
    }
  });

  it("a action preparada tira o registry npm do caminho crítico", () => {
    const a = readFileSync(ACTION, "utf8")
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("#"))
      .join("\n");

    expect(a, "cache do npm ausente: sem ele o self-installer volta a ir ao registry").toMatch(
      /uses:\s*actions\/cache@v\d[\s\S]*?path:\s*~\/\.npm/,
    );
    expect(a, "sem prefer-offline o cache não é usado: npm revalida no registry").toMatch(
      /npm_config_prefer_offline:\s*['"]?true/,
    );
    expect(a, "a versão do pnpm tem de entrar na chave do cache").toMatch(
      /key:[^\n]*steps\.pino\.outputs\.versao/,
    );
  });
});
