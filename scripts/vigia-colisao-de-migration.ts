/**
 * O VIGIA: o verde de um PR de schema é uma foto, e o número dele pode ser
 * tomado depois.
 *
 * O `verify` mede colisão no minuto em que roda. Medido em 19/09/2026: o
 * `verify` do #965 terminou em 16/09 às 20:09Z e seguia VERDE com cinco números
 * que a `main` ganhou depois — nenhuma lógica dentro do job conserta um job de
 * três dias atrás. Este script é o que fecha a classe: ele remede os PRs de
 * schema abertos contra a `main` de AGORA e avisa quem foi atropelado.
 *
 * Quatro limites, cada um pago numa madrugada de triagem:
 *
 *   (a) NÃO dispara CI. Mede por `git` e pela API — a cura não pode custar mais
 *       fila que a doença.
 *   (b) UM comentário por PR, editado quando o estado muda. O marcador
 *       `MARCADOR` reencontra o comentário anterior. Bot que comenta de novo a
 *       cada rodada polui o PR de quem contribuiu de graça.
 *   (c) Só fala com colisão REAL medida no minuto, dizendo QUAL número, tomado
 *       por QUEM, e a quem pedir o próximo.
 *   (d) Declara o que NÃO mede (ordem semântica), no próprio comentário.
 *
 * O que ele NÃO mede, e nenhum script infere: **ordem semântica**. Duas
 * migrations podem não colidir em número e mesmo assim depender da ordem entre
 * si (uma refaz o que a outra fez). Isso é leitura humana.
 *
 * Uso: `pnpm tsx scripts/vigia-colisao-de-migration.ts [--escrever]`
 *   sem `--escrever`, imprime o que faria e não toca em PR nenhum.
 */
import { execFileSync } from "node:child_process";

export const MARCADOR = "<!-- vigia:colisao-de-migration -->";
export const ROTULO = "colisao-de-migration";

/** Nome de migration → identidade. `null` para o que não segue o padrão. */
export function identidade(caminho: string): { nnnn: string; ts: string; nome: string } | null {
  const nome = caminho.split("/").pop() ?? "";
  const m = nome.match(/^(\d{14})_(\d{4})_.+\.sql$/);
  return m ? { ts: m[1]!, nnnn: m[2]!, nome } : null;
}

export type Colisao = { nnnn?: string; ts?: string; meu: string; tomadoPor: string };

/**
 * O que o PR acrescenta × o que a base tem HOJE. Só conta colisão com arquivo
 * que o PR NÃO tem — dois caminhos iguais são o mesmo arquivo, não disputa.
 */
export function colisoes(doPr: string[], naBase: string[]): Colisao[] {
  const meus = doPr.map(identidade).filter((x): x is NonNullable<typeof x> => x !== null);
  const deles = naBase.map(identidade).filter((x): x is NonNullable<typeof x> => x !== null);
  const achados: Colisao[] = [];
  for (const meu of meus) {
    for (const outro of deles) {
      if (outro.nome === meu.nome) continue;
      if (outro.nnnn === meu.nnnn) achados.push({ nnnn: meu.nnnn, meu: meu.nome, tomadoPor: outro.nome });
      else if (outro.ts === meu.ts) achados.push({ ts: meu.ts, meu: meu.nome, tomadoPor: outro.nome });
    }
  }
  return achados;
}

/** O maior NNNN da base, para sugerir o próximo — sugestão, nunca reserva. */
export function proximoLivre(naBase: string[]): string {
  const maior = naBase
    .map(identidade)
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .reduce((acc, x) => Math.max(acc, Number(x.nnnn)), 0);
  return String(maior + 1).padStart(4, "0");
}

export function corpoDoAviso(achados: Colisao[], naBase: string[]): string {
  const linhas = achados.map((c) =>
    c.nnnn
      ? `- **${c.nnnn}** — o seu \`${c.meu}\` disputa o número com \`${c.tomadoPor}\`, que já está na \`main\`.`
      : `- **${c.ts}** — o seu \`${c.meu}\` tem o mesmo timestamp de \`${c.tomadoPor}\`. O Supabase usa o timestamp como identidade da migration.`,
  );
  return [
    MARCADOR,
    "## O número da sua migration foi tomado",
    "",
    "Isto **não é um erro seu**: o número estava livre quando você escolheu. Outro PR entrou depois e ficou com ele — não há reserva, quem mescla primeiro leva.",
    "",
    ...linhas,
    "",
    `Para consertar: renumere o arquivo — **o \`NNNN\` e o \`TIMESTAMP\` juntos, no mesmo commit**. O próximo número livre agora é **${proximoLivre(naBase)}**, mas confirme com quem estiver alocando números na rodada antes de escolher: há outros PRs de schema em voo.`,
    "",
    "<sub>Eu **não** meço ordem semântica: duas migrations podem não disputar número e mesmo assim depender da ordem entre si. Isso continua sendo leitura humana.</sub>",
  ].join("\n");
}

/** A decisão idempotente: um comentário por PR, editado, nunca repetido. */
export function acao(
  anterior: { id: number; body: string } | null,
  corpo: string | null,
): { tipo: "criar" | "editar" | "nada"; id?: number } {
  if (corpo === null) return { tipo: "nada" };
  if (!anterior) return { tipo: "criar" };
  if (anterior.body.trim() === corpo.trim()) return { tipo: "nada" };
  return { tipo: "editar", id: anterior.id };
}

// ── daqui para baixo, só I/O ────────────────────────────────────────────────
function gh(args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf-8", maxBuffer: 32 * 1024 * 1024 });
}

function main(): void {
  const escrever = process.argv.includes("--escrever");
  const repo = process.env.GITHUB_REPOSITORY ?? "melgarafael/DeskcommCRM";
  const naBase = execFileSync("git", ["ls-tree", "-r", "--name-only", "origin/main", "--", "supabase/migrations"], {
    encoding: "utf-8",
  })
    .split("\n")
    .filter((l) => l.endsWith(".sql"));
  if (naBase.length < 100) throw new Error(`li ${naBase.length} migrations na base — a sonda perdeu o caminho`);

  const abertos = JSON.parse(gh(["pr", "list", "--state", "open", "--limit", "200", "--json", "number"])) as {
    number: number;
  }[];
  let avisados = 0;
  for (const { number } of abertos) {
    const arquivos = gh(["api", "--paginate", `repos/${repo}/pulls/${number}/files`, "--jq", '.[]|select(.status=="added")|.filename'])
      .split("\n")
      .filter((f) => /^supabase\/migrations\/[^/]+\.sql$/.test(f));
    if (arquivos.length === 0) continue;

    const achados = colisoes(arquivos, naBase);
    const comentarios = JSON.parse(
      gh(["api", "--paginate", `repos/${repo}/issues/${number}/comments`, "--jq", "[.[]|{id,body}]"]),
    ) as { id: number; body: string }[];
    const anterior = comentarios.find((c) => c.body.includes(MARCADOR)) ?? null;
    const corpo = achados.length > 0 ? corpoDoAviso(achados, naBase) : null;
    const decisao = acao(anterior, corpo);

    console.log(`#${number}: ${arquivos.length} migration(ões), ${achados.length} colisão(ões) → ${decisao.tipo}`);
    if (!escrever) continue;

    if (decisao.tipo === "criar") {
      gh(["pr", "comment", String(number), "--body", corpo!]);
      gh(["pr", "edit", String(number), "--add-label", ROTULO]);
      avisados++;
    } else if (decisao.tipo === "editar") {
      gh(["api", "-X", "PATCH", `repos/${repo}/issues/comments/${decisao.id}`, "-f", `body=${corpo}`]);
      avisados++;
    }
    // Colisão resolvida: o rótulo sai, o comentário FICA (o histórico do que
    // aconteceu é do PR), e nenhuma edição nova é feita.
    if (achados.length === 0 && anterior) gh(["pr", "edit", String(number), "--remove-label", ROTULO]);
  }
  console.log(`${abertos.length} PR(s) abertos lidos; ${avisados} aviso(s) escrito(s).`);
}

if (process.argv[1]?.endsWith("vigia-colisao-de-migration.ts")) main();
