/**
 * O JEV NUNCA CALA, BLOQUEIA NEM RESPONDE O CLIENTE (R3 do plano da onda 2).
 *
 * O Jev é barato, rápido e erra de um jeito que ninguém ainda mediu em cada
 * tarefa nova. Por isso o que ele decide é sempre um SINAL: a nota do clima,
 * uma escolha, um aviso na Central. Quem cala a conversa (`bot_silenced_until`),
 * passa para humano (`force_human`), bloqueia o contato (`is_blocked`) ou manda
 * mensagem é o mecanismo de sempre, que lê o sinal — nunca o módulo do Jev.
 *
 * A cerca varre `lib/ai/decisao/**`, onde mora todo módulo do Jev (a mesma
 * premissa de `pontos-de-ia-decisao-rapida.test.ts`), e reprova:
 *
 *  1. qualquer menção CÓDIGO às três colunas — comentário não conta, lido pelo
 *     scanner do TypeScript, que descarta comentário (o comentário que explica
 *     a proibição contém a palavra proibida);
 *  2. import de módulo que envia algo a alguém ou passa a conversa adiante;
 *  3. escrita (insert/update/upsert/delete) nas tabelas da conversa.
 *
 * Cada regra tem controle positivo: uma varredura quebrada devolve zero, e zero
 * se lê como "tudo certo".
 */
import { existsSync, readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { arquivosDeCodigo, caminhoRelativo } from "./helpers/varrer-codigo";

const COLUNAS_QUE_CALAM = /^(is_blocked|force_human|bot_silenced_until)$/;

/**
 * Módulos que mandam mensagem, e-mail ou notificação, ou que passam a conversa
 * a uma pessoa. Prefixo: um arquivo novo dentro deles já nasce proibido.
 */
const QUEM_ENVIA = [
  /^@\/lib\/waha\//,
  /^@\/lib\/channels\//,
  /^@\/lib\/agent-engine\/edge\/crm\//,
  /^@\/lib\/agent-engine\/agent\//,
  /^@\/lib\/ai\/runtime\//,
  /^@\/lib\/followup\//,
  /^@\/lib\/email\//,
  /^@\/lib\/notifications\//,
  /^@\/lib\/escalacao\//,
  /^@\/lib\/prospecting\//,
];

/** Um de cada prefixo, que existe e envia (ou passa adiante) — o controle de `QUEM_ENVIA`. */
const REMETENTES_CONHECIDOS = [
  "@/lib/waha/send",
  "@/lib/channels/transporte",
  "@/lib/agent-engine/edge/crm/send-message",
  "@/lib/agent-engine/agent/split-message",
  "@/lib/ai/runtime/finalize",
  "@/lib/followup/enviar-texto-fixo",
  "@/lib/email/roteador",
  "@/lib/notifications/web_push",
  "@/lib/escalacao/passagem",
  "@/lib/prospecting/worker",
];

const TABELAS_DA_CONVERSA = new Set(["messages", "conversations", "contacts"]);
const ESCRITAS = new Set(["insert", "update", "upsert", "delete"]);

function fonteDe(texto: string): ts.SourceFile {
  return ts.createSourceFile("x.ts", texto, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Identificadores e textos do CÓDIGO, sem comentário. */
function tokensDoCodigo(texto: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.JSX, texto);
  const tokens: string[] = [];
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    if (k === ts.SyntaxKind.Identifier) tokens.push(scanner.getTokenText());
    else if (k === ts.SyntaxKind.StringLiteral || k === ts.SyntaxKind.NoSubstitutionTemplateLiteral) {
      tokens.push(scanner.getTokenValue());
    }
  }
  return tokens;
}

function modulosImportados(texto: string): string[] {
  const modulos: string[] = [];
  const visitar = (no: ts.Node): void => {
    if ((ts.isImportDeclaration(no) || ts.isExportDeclaration(no)) && no.moduleSpecifier && ts.isStringLiteral(no.moduleSpecifier)) {
      modulos.push(no.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(no) &&
      no.expression.kind === ts.SyntaxKind.ImportKeyword &&
      no.arguments[0] &&
      ts.isStringLiteralLike(no.arguments[0])
    ) {
      modulos.push(no.arguments[0].text);
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonteDe(texto));
  return modulos;
}

/** `x.from("messages")….update(…)` e afins: a tabela é a do `.from` mais perto na cadeia. */
function escritasNaConversa(texto: string): string[] {
  const achadas: string[] = [];
  const fonte = fonteDe(texto);
  const tabelaDaCadeia = (e: ts.Expression): string | null => {
    let atual: ts.Expression = e;
    for (;;) {
      if (ts.isCallExpression(atual)) {
        const chamada = atual.expression;
        const arg = atual.arguments[0];
        if (ts.isPropertyAccessExpression(chamada) && chamada.name.text === "from" && arg && ts.isStringLiteralLike(arg)) {
          return arg.text;
        }
        atual = chamada;
      } else if (ts.isPropertyAccessExpression(atual)) {
        atual = atual.expression;
      } else if (ts.isAwaitExpression(atual) || ts.isParenthesizedExpression(atual)) {
        atual = atual.expression;
      } else {
        return null;
      }
    }
  };
  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no) && ts.isPropertyAccessExpression(no.expression) && ESCRITAS.has(no.expression.name.text)) {
      const tabela = tabelaDaCadeia(no.expression.expression);
      if (tabela !== null && TABELAS_DA_CONVERSA.has(tabela)) {
        const linha = fonte.getLineAndCharacterOfPosition(no.getStart()).line + 1;
        achadas.push(`${no.expression.name.text} em ${tabela} (linha ${linha})`);
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return achadas;
}

const modulosDoJev = arquivosDeCodigo(["lib/ai/decisao"]).map((abs) => ({
  arquivo: caminhoRelativo(abs),
  texto: readFileSync(abs, "utf8"),
}));

describe("o Jev nunca cala, bloqueia nem responde o cliente", () => {
  it("a varredura enxerga os módulos do Jev (controle positivo)", () => {
    const arquivos = modulosDoJev.map((m) => m.arquivo);
    expect(arquivos).toContain("lib/ai/decisao/clima.ts");
    expect(arquivos).toContain("lib/ai/decisao/aviso.ts");
    expect(arquivos.some((a) => a.endsWith(".test.ts")), "teste não é módulo do Jev").toBe(false);
  });

  it("os três detectores acusam o que devem, e só isso (sabotagem sintética)", () => {
    expect(tokensDoCodigo(`// nunca escreve force_human\nconst x = 1;`).some((t) => COLUNAS_QUE_CALAM.test(t))).toBe(false);
    expect(tokensDoCodigo(`db.update({ force_human: true })`).some((t) => COLUNAS_QUE_CALAM.test(t))).toBe(true);
    expect(tokensDoCodigo(`db.update({ "bot_silenced_until": agora })`).some((t) => COLUNAS_QUE_CALAM.test(t))).toBe(true);

    expect(modulosImportados(`import { enviar } from "@/lib/waha/send";`)).toEqual(["@/lib/waha/send"]);
    expect(modulosImportados(`const m = await import('@/lib/email/roteador');`)).toEqual(["@/lib/email/roteador"]);

    expect(escritasNaConversa(`await admin.from("messages").insert({ body: "oi" });`)).toHaveLength(1);
    expect(escritasNaConversa(`await db.from('conversations').update({ x: 1 }).eq("id", id);`)).toHaveLength(1);
    expect(escritasNaConversa(`await admin.from("agent_inbox_items").insert({ title });`)).toEqual([]);
    expect(escritasNaConversa(`await db.from("messages").select("id").eq("id", id);`)).toEqual([]);
  });

  it("toda regra de remetente alcança um remetente que existe (controle de QUEM_ENVIA)", () => {
    const ausentes = REMETENTES_CONHECIDOS.filter(
      (m) => !existsSync(`${m.replace(/^@\//, "")}.ts`) && !existsSync(`${m.replace(/^@\//, "")}.tsx`),
    );
    expect(ausentes, "remetente de controle mudou de lugar — atualize a lista").toEqual([]);
    const semRegra = QUEM_ENVIA.filter((r) => !REMETENTES_CONHECIDOS.some((m) => r.test(m)));
    expect(semRegra.map(String), "regra sem remetente conhecido: não se sabe se ela alcança algo").toEqual([]);
  });

  it("nenhum módulo do Jev toca is_blocked, force_human ou bot_silenced_until", () => {
    const tocam = modulosDoJev.flatMap((m) => {
      const colunas = [...new Set(tokensDoCodigo(m.texto).filter((t) => COLUNAS_QUE_CALAM.test(t)))];
      return colunas.length > 0 ? [`${m.arquivo}: ${colunas.join(", ")}`] : [];
    });
    expect(tocam, "o Jev só dá o sinal; quem cala, passa ou bloqueia é o mecanismo de sempre").toEqual([]);
  });

  it("nenhum módulo do Jev importa quem envia mensagem ou passa a conversa", () => {
    const importam = modulosDoJev.flatMap((m) =>
      modulosImportados(m.texto)
        .filter((mod) => QUEM_ENVIA.some((r) => r.test(mod)))
        .map((mod) => `${m.arquivo} → ${mod}`),
    );
    expect(importam, "o Jev nunca fala com o cliente nem chama uma pessoa por conta própria").toEqual([]);
  });

  it("nenhum módulo do Jev escreve na mensagem, na conversa ou no contato", () => {
    const escrevem = modulosDoJev.flatMap((m) => escritasNaConversa(m.texto).map((e) => `${m.arquivo}: ${e}`));
    expect(escrevem).toEqual([]);
  });
});
