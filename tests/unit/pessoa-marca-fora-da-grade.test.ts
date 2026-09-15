/**
 * Quem pode marcar FORA da grade de horários — e o que ninguém pode.
 *
 * A grade (início da jornada + múltiplos da duração) é o que o sistema OFERECE.
 * Uma pessoa da equipe precisa marcar o que combinou por fora dela: o cliente
 * que só pode 10:30, o encaixe, o atendimento que começa mais cedo. A IA não —
 * ela oferece o que a agenda publicou, e escolher horário que ninguém publicou é
 * decisão de quem responde pelo negócio.
 *
 * ⚠️ O QUE ESTE ARQUIVO REALMENTE VIGIA é a metade de baixo: relaxar a grade sem
 * relaxar a SOBREPOSIÇÃO. Não há `exclude` nem índice no schema impedindo dois
 * compromissos no mesmo horário — a única guarda era a lista de slots. Quem
 * mexer aqui de novo precisa que a segunda suíte continue vermelha ao tirar
 * `exigeSemSobreposicao`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  exigeSemSobreposicao,
  podeMarcarForaDaGrade,
} from "@/app/api/v1/agenda/agendamentos/_handler";

const PESSOA = { type: "user" as const, id: "11111111-1111-4111-8111-111111111111" };
const AGENTE = { type: "ai_agent" as const, id: "run-1", role: "agent" };
const WEBHOOK = { type: "webhook_source" as const, id: "src-1" };

describe("quem marca fora da grade", () => {
  it("uma PESSOA pode — é o encaixe que ela combinou com a cliente", () => {
    expect(podeMarcarForaDaGrade(PESSOA)).toBe(true);
  });

  it("a IA NÃO pode — ela oferece o que a agenda publicou", () => {
    expect(podeMarcarForaDaGrade(AGENTE)).toBe(false);
  });

  // ⚠️ FALTA AQUI O CASO DO TOKEN DE SERVIDOR, e a ausência é a dependência.
  // `deriveActor` ainda devolve `type: "user"` para todo token sem escopo de
  // agente, então a variante `api_token` nem existe no tipo `Actor` — este caso
  // não compilaria. Enquanto for assim, uma integração com token HERDA o poder
  // de marcar fora da grade. O PR #848 separa os dois; quando entrar, o caso
  // volta e passa a valer.

  it("webhook NÃO pode", () => {
    expect(podeMarcarForaDaGrade(WEBHOOK)).toBe(false);
  });
});

describe("a sobreposição continua barrada — para todo mundo", () => {
  /**
   * Um supabase de mentira que responde à consulta de cruzamento. `linhas` é o
   * que o banco "acha": vazio = horário livre; com item = já tem alguém.
   */
  function bancoQueResponde(linhas: unknown[]) {
    const filtros: Record<string, unknown> = {};
    const cadeia: Record<string, unknown> = {};
    for (const m of ["eq", "not", "lt", "gt", "neq", "limit"]) {
      // `.not()` recebe TRÊS argumentos (coluna, operador, valor); os demais,
      // dois. Guardar o último não-vazio cobre os dois formatos.
      cadeia[m] = (...args: unknown[]) => {
        filtros[`${m}:${String(args[0])}`] = args[args.length - 1];
        return cadeia;
      };
    }
    cadeia.then = (r: (v: unknown) => unknown) => r({ data: linhas, error: null });
    return {
      filtros,
      client: { from: () => ({ select: () => cadeia }) } as never,
    };
  }

  const ctx = { organization_id: "org-1", requestId: "req-1" } as never;
  const quando = {
    donoId: "dono-1",
    inicio: new Date("2026-10-10T13:30:00.000Z"),
    fim: new Date("2026-10-10T15:00:00.000Z"),
  };

  it("horário livre passa", async () => {
    const b = bancoQueResponde([]);
    await expect(exigeSemSobreposicao(b.client, ctx, quando)).resolves.toBeUndefined();
  });

  it("horário ocupado é RECUSADO — é o overbooking que a grade segurava", async () => {
    const b = bancoQueResponde([{ id: "outro" }]);
    await expect(exigeSemSobreposicao(b.client, ctx, quando)).rejects.toThrow(
      /Já existe um compromisso neste horário/,
    );
  });

  it("cancelado e falta NÃO ocupam a cadeira", async () => {
    const b = bancoQueResponde([]);
    await exigeSemSobreposicao(b.client, ctx, quando);
    expect(String(b.filtros["not:status"])).toContain("cancelled");
    expect(String(b.filtros["not:status"])).toContain("no_show");
  });

  it("o cruzamento é ESTRITO: encostar não é sobrepor", async () => {
    // Um que termina 11:00 e outro que começa 11:00 convivem. Com `lte`/`gte` no
    // lugar de `lt`/`gt`, a agenda recusaria horários consecutivos — que é como
    // a grade sempre funcionou.
    const b = bancoQueResponde([]);
    await exigeSemSobreposicao(b.client, ctx, quando);
    expect(b.filtros["lt:starts_at"]).toBe(quando.fim.toISOString());
    expect(b.filtros["gt:ends_at"]).toBe(quando.inicio.toISOString());
  });

  it("ao remarcar, o próprio compromisso não conta como conflito", async () => {
    const b = bancoQueResponde([]);
    await exigeSemSobreposicao(b.client, ctx, { ...quando, ignorarId: "eu-mesmo" });
    expect(b.filtros["neq:id"]).toBe("eu-mesmo");
  });
});

describe("a guarda está LIGADA nos dois caminhos", () => {
  /**
   * ⚠️ ESTE BLOCO EXISTE PORQUE OS DE CIMA NÃO BASTAM, e isso foi medido: com a
   * chamada de `exigeSemSobreposicao` removida do handler, os nove casos
   * anteriores continuaram verdes. Eles exercitam a FUNÇÃO; nada exercitava o
   * fato de ela ser chamada.
   *
   * Uma função de segurança que ninguém invoca é o mesmo que não existir — e o
   * desfecho aqui é overbooking silencioso.
   *
   * Sem comentários: o texto que EXPLICA a chamada é o mais parecido com ela.
   */
  const fonte = readFileSync(
    join(__dirname, "..", "..", "app", "api", "v1", "agenda", "agendamentos", "_handler.ts"),
    "utf8",
  ).replace(/\/\/[^\n]*/g, "");

  it("marcar: relaxar a grade obriga a conferir sobreposição", () => {
    expect(fonte).toMatch(
      /exigirGrade: !foraDaGrade[\s\S]{0,400}if \(foraDaGrade\) \{[\s\S]{0,300}exigeSemSobreposicao/,
    );
  });

  it("remarcar: a mesma dupla, com `ignorarId`", () => {
    expect(fonte).toMatch(/if \(foraDaGrade\) \{[\s\S]{0,400}ignorarId/);
  });

  it("nenhum caminho passa `exigirGrade: false` sem a conferência ao lado", () => {
    // Conta as vezes que a grade é relaxada e as vezes que a sobreposição é
    // conferida. Se alguém relaxar num terceiro lugar e esquecer a guarda, os
    // números deixam de bater.
    const relaxa = [...fonte.matchAll(/exigirGrade: !foraDaGrade/g)].length;
    const confere = [...fonte.matchAll(/await exigeSemSobreposicao\(/g)].length;
    expect(relaxa, "nenhum caminho relaxa a grade — o recurso sumiu?").toBeGreaterThan(0);
    expect(confere, `${relaxa} caminho(s) relaxam a grade e ${confere} conferem sobreposição`).toBe(
      relaxa,
    );
  });
});
