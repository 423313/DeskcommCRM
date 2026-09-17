import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { DICIONARIO } from "@/lib/i18n/dicionario";

const RAIZ = process.cwd();
const DOCUMENTO = join(RAIZ, "lib/ai/rag/ingest/documento.ts");
const ROTA_UPLOAD = join(RAIZ, "app/api/v1/ai/knowledge/sources/upload/route.ts");

type ChaveEncontrada = { chave: string; local: string };

function textoEstatico(expr: ts.Expression): string | null {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
  if (ts.isParenthesizedExpression(expr)) return textoEstatico(expr.expression);
  if (
    ts.isBinaryExpression(expr) &&
    expr.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const esquerda = textoEstatico(expr.left);
    const direita = textoEstatico(expr.right);
    return esquerda !== null && direita !== null ? esquerda + direita : null;
  }
  return null;
}

function mensagensDeErroDeExtracao(): {
  chaves: ChaveEncontrada[];
  dinamicas: string[];
} {
  const src = readFileSync(DOCUMENTO, "utf8");
  const fonte = ts.createSourceFile(DOCUMENTO, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const rel = relative(RAIZ, DOCUMENTO).split(sep).join("/");
  const chaves: ChaveEncontrada[] = [];
  const dinamicas: string[] = [];

  const visita = (no: ts.Node): void => {
    if (
      ts.isNewExpression(no) &&
      ts.isIdentifier(no.expression) &&
      no.expression.text === "ErroDeExtracao"
    ) {
      const primeiro = no.arguments?.[0];
      const linha = fonte.getLineAndCharacterOfPosition(no.getStart()).line + 1;
      const local = `${rel}:${linha}`;
      const chave = primeiro ? textoEstatico(primeiro) : null;
      if (chave === null) dinamicas.push(local);
      else chaves.push({ chave, local });
    }
    ts.forEachChild(no, visita);
  };

  visita(fonte);
  return { chaves, dinamicas };
}

describe("erros de extração que chegam à tela", () => {
  it("toda mensagem de ErroDeExtracao é uma chave estável, nunca texto de runtime", () => {
    const { dinamicas } = mensagensDeErroDeExtracao();
    expect(
      dinamicas,
      "ErroDeExtracao chega à rota de upload e vira texto visível; mensagem dinâmica não pode ser chave de tradução",
    ).toEqual([]);
  });

  it("toda chave de ErroDeExtracao tem espanhol", () => {
    const { chaves } = mensagensDeErroDeExtracao();
    const semEspanhol = chaves
      .filter(({ chave }) => !DICIONARIO[chave]?.es)
      .map(({ chave, local }) => `${local} → ${JSON.stringify(chave)}`);

    expect(
      semEspanhol,
      "ErroDeExtracao sem espanhol chega à tela em português porque a rota traduz err.message",
    ).toEqual([]);
  });

  it("a rota de upload traduz a mensagem de ErroDeExtracao antes de responder", () => {
    const rota = readFileSync(ROTA_UPLOAD, "utf8");
    expect(rota).toMatch(
      /err instanceof ErroDeExtracao[\s\S]{0,240}t\(err\.message\)/,
    );
  });
});
