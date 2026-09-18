/**
 * O publish-image.yml cancela a rodada superada em pull_request E no push da
 * `main` (o `latest` superado é sobrescrito minutos depois), mas NUNCA a de uma
 * tag — é ela que publica a versão e promove `stable`. Aqui a expressão do
 * workflow é AVALIADA nos quatro eventos, não só lida.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const YML = readFileSync(".github/workflows/publish-image.yml", "utf-8");

function expressao(chave: string): string {
  const m = YML.match(new RegExp(`^concurrency:\\n(?:  .*\\n)*?  ${chave}: \\$\\{\\{ (.+) \\}\\}$`, "m"));
  if (!m) throw new Error(`concurrency.${chave} não encontrado`);
  return m[1];
}

type Contexto = { event_name: string; ref: string; workflow: string; pr?: number };

// Tradutor mínimo das expressões do Actions usadas aqui (==, !=, ||, &&,
// strings entre aspas simples). Qualquer outro token faz `new Function` falhar
// e o teste reprovar — melhor que avaliar errado em silêncio.
function avaliar(expr: string, c: Contexto): unknown {
  const js = expr
    .replace(/github\.event\.pull_request\.number/g, "c.pr")
    .replace(/github\.event_name/g, "c.event_name")
    .replace(/github\.workflow/g, "c.workflow")
    .replace(/github\.ref\b/g, "c.ref")
    .replace(/==/g, "===")
    .replace(/!=/g, "!==");
  return new Function("c", `return (${js});`)(c);
}

const WORKFLOW = "Publicar imagem Docker (GHCR)";
const EVENTOS: Record<string, Contexto> = {
  pr: { event_name: "pull_request", ref: "refs/pull/42/merge", workflow: WORKFLOW, pr: 42 },
  main: { event_name: "push", ref: "refs/heads/main", workflow: WORKFLOW },
  tag: { event_name: "push", ref: "refs/tags/v1.35.0", workflow: WORKFLOW },
  dispatch: { event_name: "workflow_dispatch", ref: "refs/heads/main", workflow: WORKFLOW },
};

describe("publish-image: cancela só o que se supera", () => {
  const cancela = expressao("cancel-in-progress");
  // `${{ a }}-${{ b }}` é concatenação: cada lado entre parênteses, senão o
  // `||` de `b` engoliria a soma inteira.
  const grupo = expressao("group")
    .split(" }}-${{ ")
    .map((lado) => `(${lado})`)
    .join(" + '-' + ");

  it("cancela PR e push da main; nunca tag nem dispatch", () => {
    expect(avaliar(cancela, EVENTOS.pr)).toBe(true);
    expect(avaliar(cancela, EVENTOS.main)).toBe(true);
    expect(avaliar(cancela, EVENTOS.tag)).toBe(false);
    expect(avaliar(cancela, EVENTOS.dispatch)).toBe(false);
  });

  // Segunda trava, independente da primeira: mesmo que a condição mudasse, a
  // tag cai num grupo só dela e não há rodada da main para cancelá-la.
  it("tag fica fora do grupo da main — o grupo de uma tag é só dela", () => {
    const g = (c: Contexto) => String(avaliar(grupo, c));
    expect(g(EVENTOS.tag)).not.toBe(g(EVENTOS.main));
    expect(g(EVENTOS.tag)).toContain("refs/tags/v1.35.0");
    expect(g({ ...EVENTOS.tag, ref: "refs/tags/v1.36.0" })).not.toBe(g(EVENTOS.tag));
  });
});
