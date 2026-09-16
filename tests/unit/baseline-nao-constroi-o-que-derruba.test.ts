import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * O BASELINE NÃO CONSTRÓI UM ÍNDICE PARA O PRÓPRIO APÊNDICE DERRUBAR.
 *
 * O `baseline.sql` é aplicado inteiro em toda instalação e em todo `update.sh`.
 * Um índice criado no corpo (ou num bloco antigo do apêndice) e derrubado num
 * bloco posterior é construído e jogado fora TODA vez — `CREATE INDEX` não
 * concorrente, que trava escrita na tabela enquanto constrói. Numa tabela
 * pequena são milissegundos; numa instalação com histórico é lock e tempo em
 * cada atualização, pago por ninguém.
 *
 * Foi o que a migration 0259 trouxe na primeira versão: os três índices
 * redundantes seguiam criados acima (linha do dump, bloco da 0127, bloco do
 * calendário) e o apêndice os derrubava no fim. Medido em pg17, aplicando o
 * baseline até o rótulo da 0259: os três existiam naquele ponto.
 *
 * A regra: o índice que o arquivo derruba e não recria depois não pode ter um
 * `create … index … X` antes do drop — a não ser dentro de um bloco `do` que
 * decide por uma condição de verdade. Drop seguido de nova criação é redefinição
 * e fica fora.
 *
 * ## Vale também para constraint que constrói índice (UNIQUE, PRIMARY KEY, EXCLUDE)
 *
 * Até 2026-09-16 a régua só lia `create index`. Das três criações únicas que a
 * 0181 e a 0205 derrubam, duas estavam congeladas aqui como dívida e a terceira —
 * a constraint `ai_kbv_version_unique` — nem aparecia. E o custo deixou de ser
 * só tempo: o modelo novo PERMITE o que o índice velho proibia (várias fontes por
 * agente, cada uma com a sua versão 1), então num clone que usa o acervo a
 * recriação falhava por duplicata a cada atualização. Medido numa VPS real: os
 * três erros nos dois `update.sh` com log guardado (v1.27.2 e v1.27.3), e o
 * `deadlock detected` que apagou uma policy na v1.27.3 saiu na tela no meio
 * deles. A prova em banco é `tests/invariants/baseline-reaplica-sobre-acervo-real.test.ts`.
 *
 * O `DO $baseline_guard$` do dump NÃO conta como condicional: ele só pergunta se
 * a própria constraint já existe — é o `IF NOT EXISTS` de quem não tem
 * `IF NOT EXISTS`, o mesmo que o `create unique index if not exists` que esta
 * regra já reprova.
 *
 * ## E para policy — a mesma classe, com dano de acesso
 *
 * A revisão da mesma correção achou 19 policies criadas (17 no corpo do dump, 2
 * em blocos antigos do apêndice) e derrubadas adiante sem nunca serem recriadas
 * com o mesmo nome. Aplicado em autocommit, cada `update.sh` fazia a policy
 * AMPLA antiga (só "é da organização") valer de novo até o drop — policies
 * permissivas somam com OR, então nessa janela um `viewer` gravava e apagava o
 * que as policies novas negam; e cada passada extra de `reaplicar_baseline`
 * reabria a janela. A chave é nome + tabela: o mesmo nome em outra tabela é
 * outra policy.
 *
 * ## Escopo, escrito para não ser lido maior do que é
 *
 * Drop por nome LITERAL, com ou sem `if exists`. `execute format('… %I', …)`
 * resolve o nome em tempo de execução e fica fora. CHECK e FOREIGN KEY ficam
 * fora de propósito: não constroem índice, e as instâncias medidas validam
 * coluna recriada vazia.
 *
 * Lê texto; que o ciclo install→update sai 0 é o job `invariants` quem mede, e
 * `tests/invariants/indices-redundantes-saem.test.ts` mede o estado final.
 */
const SQL = readFileSync(join(process.cwd(), "supabase/baseline.sql"), "utf8");

interface Par {
  nome: string;
  linhaDaCriacao: number;
  linhaDoDrop: number;
  condicional: boolean;
}

interface Ocorrencia {
  chave: string;
  pos: number;
}

function linhaDe(sql: string, pos: number): number {
  return sql.slice(0, pos).split("\n").length;
}

/**
 * A posição está dentro de um `do $x$ … end $x$;` aberto e ainda não fechado,
 * que não seja a guarda de existência do dump?
 */
function dentroDeBlocoCondicional(sql: string, pos: number): boolean {
  const antes = sql.slice(0, pos);
  const aberturas = [...antes.matchAll(/^\s*do\s+\$([a-z_]*)\$/gim)];
  const ultima = aberturas.at(-1);
  if (!ultima || ultima.index === undefined) return false;
  if (ultima[1]!.toLowerCase() === "baseline_guard") return false;
  const marca = `$${ultima[1]}$`;
  const trecho = antes.slice(ultima.index + ultima[0].length);
  return !trecho.toLowerCase().includes(`end ${marca.toLowerCase()}`);
}

function ocorrencias(sql: string, rx: RegExp, chave: (m: RegExpMatchArray) => string): Ocorrencia[] {
  return [...sql.matchAll(rx)].map((m) => ({ chave: chave(m).toLowerCase(), pos: m.index! }));
}

/**
 * Pares cria→derruba cujo objeto NÃO sobrevive ao arquivo. Uma recriação da
 * mesma chave depois do último drop é REDEFINIÇÃO (trocar predicado de índice
 * parcial, o `drop … if exists` + `create` do apêndice, a constraint que volta
 * como índice único do mesmo nome) e fica fora.
 */
function pares(sql: string, drops: Ocorrencia[], criacoes: Ocorrencia[], recriacoes: Ocorrencia[]): Par[] {
  const ultimoDrop = new Map<string, number>();
  for (const d of drops) ultimoDrop.set(d.chave, d.pos);
  const achados: Par[] = [];
  for (const [chave, posDrop] of ultimoDrop) {
    if (recriacoes.some((r) => r.chave === chave && r.pos > posDrop)) continue;
    for (const c of criacoes.filter((c) => c.chave === chave && c.pos < posDrop)) {
      achados.push({
        nome: chave,
        linhaDaCriacao: linhaDe(sql, c.pos),
        linhaDoDrop: linhaDe(sql, posDrop),
        condicional: dentroDeBlocoCondicional(sql, c.pos),
      });
    }
  }
  return achados;
}

const nome = (m: RegExpMatchArray) => m[1]!;
const nomeNaTabela = (m: RegExpMatchArray) => `${m[1]} on ${m[2]}`;

function criacoesDeIndice(sql: string): Ocorrencia[] {
  return ocorrencias(sql, /create (?:unique )?index (?:concurrently )?(?:if not exists )?"?([a-z0-9_]+)"?(?=\s|$)/gi, nome);
}

function paresDeIndice(sql: string): Par[] {
  const criacoes = criacoesDeIndice(sql);
  const drops = ocorrencias(sql, /drop index (?:concurrently )?(?:if exists )?(?:"?public"?\.)?"?([a-z0-9_]+)"?/gi, nome);
  return pares(sql, drops, criacoes, criacoes);
}

/** Só as que constroem índice: é o índice que custa lock e que falha por duplicata. */
function paresDeConstraint(sql: string): Par[] {
  const drops = ocorrencias(sql, /drop constraint (?:if exists )?"?([a-z0-9_]+)"?/gi, nome);
  const criacoes = ocorrencias(sql, /add constraint\s+"?([a-z0-9_]+)"?\s+(?:unique|primary key|exclude)\b/gi, nome);
  const recriacoes = [
    ...ocorrencias(sql, /add constraint\s+"?([a-z0-9_]+)"?(?=\s)/gi, nome),
    ...criacoesDeIndice(sql),
  ];
  return pares(sql, drops, criacoes, recriacoes);
}

function paresDePolicy(sql: string): Par[] {
  const alvo = String.raw`"?([a-z0-9_]+)"?\s+on\s+(?:"?public"?\.)?"?([a-z0-9_]+)"?`;
  const criacoes = ocorrencias(sql, new RegExp(String.raw`create policy\s+` + alvo, "gi"), nomeNaTabela);
  const drops = ocorrencias(sql, new RegExp(String.raw`drop policy\s+(?:if exists\s+)?` + alvo, "gi"), nomeNaTabela);
  return pares(sql, drops, criacoes, criacoes);
}

function proibidos(achados: Par[]): string[] {
  return achados
    .filter((p) => !p.condicional)
    .map((p) => `${p.nome}: criado na linha ${p.linhaDaCriacao}, derrubado na ${p.linhaDoDrop}`);
}

const nomes = (achados: Par[]) => achados.map((p) => p.nome).sort();

/**
 * As formas que o arquivo teve até 2026-09-16, e as que NÃO são defeito.
 * Controle do instrumento: sem ele, um regex que parasse de casar devolveria
 * lista vazia, e "nenhum par proibido" ficaria verde vigiando nada. Cada
 * propriedade tem o seu caso, para que uma régua cega e uma guarda contada como
 * condição não reprovem com a mesma mensagem.
 */
const SINTETICO = `
CREATE UNIQUE INDEX IF NOT EXISTS "velho_idx" ON "public"."t" USING "btree" ("a") WHERE "ativo";

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint
                WHERE conname = 'velha_uk' AND conrelid = '"public"."t"'::regclass)
   AND to_regclass('"public"."velha_uk"') IS NULL THEN
ALTER TABLE ONLY "public"."t"
    ADD CONSTRAINT "velha_uk" UNIQUE ("a", "b");
END IF; END $baseline_guard$;

ALTER TABLE ONLY "public"."t"
    ADD CONSTRAINT "velha_pk" PRIMARY KEY ("a");

alter table public.t add constraint velha_ex exclude using gist (a with =);

alter table public.t add constraint vira_indice unique (c);

DO $baseline_guard$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_policy
                WHERE polname = 'velha_pol' AND polrelid = '"public"."t"'::regclass) THEN
CREATE POLICY "velha_pol" ON "public"."t" USING (true);
END IF; END $baseline_guard$;

create policy "mesmo_nome" on public.outra using (true);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'outra_uk') then
    create unique index if not exists cond_idx on public.t (a);
  end if;
end $$;

-- ---- apêndice (migration 9999) ----
drop index if exists public.velho_idx;
drop index if exists public.cond_idx;
alter table public.t drop constraint if exists velha_uk;
alter table public.t drop constraint velha_pk;
alter table public.t drop constraint if exists velha_ex;
alter table public.t drop constraint vira_indice;
create unique index if not exists vira_indice on public.t (c);
alter table public.t drop constraint if exists redefinida_uk;
alter table public.t add constraint redefinida_uk unique (b);
drop policy if exists velha_pol on public.t;
drop policy if exists "mesmo_nome" on public.t;
`;

describe("o instrumento, contra formas conhecidas", () => {
  it("índice: acha a criação incondicional e poupa a condicional", () => {
    expect(proibidos(paresDeIndice(SINTETICO))).toEqual([
      expect.stringMatching(/^velho_idx: criado na linha 2, derrubado na \d+$/),
    ]);
    expect(paresDeIndice(SINTETICO).find((p) => p.nome === "cond_idx")?.condicional).toBe(true);
  });

  it("constraint: a régua enxerga UNIQUE, PRIMARY KEY e EXCLUDE, com drop com ou sem if exists", () => {
    expect(nomes(paresDeConstraint(SINTETICO))).toEqual(["velha_ex", "velha_pk", "velha_uk"]);
  });

  it("constraint: a guarda de existência do dump não conta como condição", () => {
    expect(paresDeConstraint(SINTETICO).find((p) => p.nome === "velha_uk")?.condicional).toBe(false);
  });

  it("constraint: voltar como índice único do mesmo nome é redefinição, e drop + add também", () => {
    const achados = nomes(paresDeConstraint(SINTETICO));
    expect(achados).not.toContain("vira_indice");
    expect(achados).not.toContain("redefinida_uk");
  });

  it("policy: casa nome E tabela, e a guarda de existência não conta como condição", () => {
    expect(proibidos(paresDePolicy(SINTETICO))).toEqual([
      expect.stringMatching(/^velha_pol on t: criado na linha \d+, derrubado na \d+$/),
    ]);
  });
});

describe("baseline.sql não constrói o que ele mesmo derruba", () => {
  it("o instrumento está vivo no arquivo real: acha drops", () => {
    expect(paresDeIndice(SQL).length, "nenhum par cria→derruba encontrado — o parser mudou?").toBeGreaterThan(0);
  });

  it("nenhuma criação incondicional de índice antes do drop", () => {
    expect(
      proibidos(paresDeIndice(SQL)),
      "Índice construído e jogado fora a cada install/update. Tire a criação (ou a torne " +
        "condicional ao mesmo predicado do drop, invertido).\n",
    ).toEqual([]);
  });

  it("nenhuma constraint que constrói índice é criada antes do próprio drop", () => {
    expect(
      proibidos(paresDeConstraint(SQL)),
      "Constraint UNIQUE/PK/EXCLUDE construída e derrubada a cada install/update — e num clone " +
        "com dados do modelo novo ela falha por duplicata. Tire a criação.\n",
    ).toEqual([]);
  });

  it("nenhuma policy é criada antes do próprio drop", () => {
    expect(
      proibidos(paresDePolicy(SQL)),
      "Policy recriada e derrubada a cada install/update: entre as duas, a regra antiga volta a " +
        "valer somada às novas. Tire a criação.\n",
    ).toEqual([]);
  });

  it("a criação condicional de ai_models_provider_model_unique depende da AUSÊNCIA da constraint", () => {
    // O bloco `do` sozinho não prova nada: um `if true then create …` passaria no
    // caso acima. O que torna a criação inofensiva é o predicado ser o inverso do
    // guard do drop da 0259 — os dois nunca agem sobre o mesmo banco.
    const par = paresDeIndice(SQL).find((p) => p.nome === "ai_models_provider_model_unique");
    expect(par, "a criação da 0127 sumiu — confira se a unicidade ainda tem fallback").toBeDefined();
    const linhas = SQL.split("\n");
    const janela = linhas.slice(Math.max(0, par!.linhaDaCriacao - 8), par!.linhaDaCriacao).join("\n");
    expect(janela).toMatch(/if not exists \(\s*select 1 from pg_constraint\s+where conname = 'ai_models_unique'/);
  });
});
