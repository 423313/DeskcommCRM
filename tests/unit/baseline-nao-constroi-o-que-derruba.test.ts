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
 * três erros em todo `update.sh` desde que ela tinha materiais, e o
 * `deadlock detected` que apagou uma policy na v1.27.3 saiu na tela no meio
 * deles. A prova em banco é `tests/invariants/baseline-reaplica-sobre-acervo-real.test.ts`.
 *
 * O `DO $baseline_guard$` do dump NÃO conta como condicional: ele só pergunta se
 * a própria constraint já existe — é o `IF NOT EXISTS` de quem não tem
 * `IF NOT EXISTS`, o mesmo que o `create unique index if not exists` que esta
 * regra já reprova.
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

/**
 * Pares cria→derruba cujo objeto NÃO sobrevive ao arquivo. Criação do mesmo
 * nome depois do último drop é REDEFINIÇÃO (trocar predicado de índice parcial,
 * ou o `drop constraint if exists` + `add` do apêndice) e fica fora.
 */
function pares(sql: string, drop: RegExp, criacao: (nome: string) => RegExp, recriacao: (nome: string) => RegExp): Par[] {
  const drops = new Map<string, number>();
  for (const d of sql.matchAll(drop)) {
    drops.set(d[1]!.toLowerCase(), d.index!); // o ÚLTIMO drop de cada nome
  }
  const achados: Par[] = [];
  for (const [nome, posDrop] of drops) {
    if ([...sql.matchAll(recriacao(nome))].some((c) => c.index! > posDrop)) continue;
    for (const c of sql.matchAll(criacao(nome))) {
      achados.push({
        nome,
        linhaDaCriacao: linhaDe(sql, c.index!),
        linhaDoDrop: linhaDe(sql, posDrop),
        condicional: dentroDeBlocoCondicional(sql, c.index!),
      });
    }
  }
  return achados;
}

function paresDeIndice(sql: string): Par[] {
  const criacao = (nome: string) =>
    new RegExp(`create (?:unique )?index (?:concurrently )?(?:if not exists )?"?${nome}"?(?=\\s|$)`, "gi");
  return pares(sql, /drop index (?:concurrently )?if exists (?:"?public"?\.)?"?([a-z0-9_]+)"?/gi, criacao, criacao);
}

/** Só as que constroem índice: é o índice que custa lock e que falha por duplicata. */
function paresDeConstraint(sql: string): Par[] {
  return pares(
    sql,
    /drop constraint if exists\s+"?([a-z0-9_]+)"?/gi,
    (nome) => new RegExp(`add constraint\\s+"?${nome}"?\\s+(?:unique|primary key|exclude)\\b`, "gi"),
    (nome) => new RegExp(`add constraint\\s+"?${nome}"?(?=\\s)`, "gi"),
  );
}

function proibidos(achados: Par[]): string[] {
  return achados
    .filter((p) => !p.condicional)
    .map((p) => `${p.nome}: criado na linha ${p.linhaDaCriacao}, derrubado na ${p.linhaDoDrop}`);
}

/**
 * As três formas que o arquivo tinha até 2026-09-16, e as duas que NÃO são defeito.
 * Controle do instrumento: sem ele, um regex que parasse de casar devolveria
 * lista vazia, e "nenhum par proibido" ficaria verde vigiando nada.
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
alter table public.t drop constraint if exists redefinida_uk;
alter table public.t add constraint redefinida_uk unique (b);
`;

describe("baseline.sql não constrói índice que ele mesmo derruba", () => {
  it("o instrumento acha as formas proibidas e poupa as que não são defeito", () => {
    expect(proibidos(paresDeIndice(SINTETICO))).toEqual(["velho_idx: criado na linha 2, derrubado na 20"]);
    expect(
      paresDeIndice(SINTETICO).find((p) => p.nome === "cond_idx")?.condicional,
      "criação dentro de `do $$ if … end if` é condicional",
    ).toBe(true);
    expect(
      proibidos(paresDeConstraint(SINTETICO)),
      "a guarda de existência do dump não pode contar como condição",
    ).toEqual(["velha_uk: criado na linha 9, derrubado na 22"]);
    expect(
      paresDeConstraint(SINTETICO).some((p) => p.nome === "redefinida_uk"),
      "drop + add do mesmo nome é redefinição",
    ).toBe(false);
  });

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
        "com dados do modelo novo ela falha por duplicata. Tire a criação do corpo.\n",
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
