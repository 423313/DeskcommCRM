import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { expect as expectBase, test, type Page } from "@playwright/test";

import { criarAtoresDasExtensoes, type AtoresDasExtensoes } from "./fixtures/catalogo-extensoes";

/**
 * A JORNADA QUE A ADR-0003 TORNOU POSSÍVEL, PROVADA PELA TELA.
 *
 * Antes desta entrega, uma extensão instalada só conseguia abrir UMA tela: Tarefas. Todo
 * pacote era o mesmo pacote com outro texto, e a frase "Abre Tarefas" era exibida para
 * qualquer um deles — inclusive, depois da ampliação, para os que não abrem Tarefas.
 *
 * Esta prova dirige o navegador como um usuário faria e responde três perguntas que nenhum
 * teste de unidade responde:
 *
 *   1. A pessoa que vai instalar consegue VER, antes de decidir, quais telas a extensão abre?
 *   2. O botão do cartão leva mesmo para a tela certa — Conversas, e não Tarefas?
 *   3. Duas portas diferentes no mesmo pacote levam a lugares diferentes?
 *
 * O prazo maior nas asserções segue o motivo já registrado na spec irmã: quase toda asserção
 * aqui espera DUAS idas ao servidor (a mutação e a recarga que a tela faz antes de anunciar).
 */
const expect = expectBase.configure({ timeout: 20_000 });
const EVIDENCE = "evidence/extensoes-portas-novas";
const execFileAsync = promisify(execFile);
const CLI = path.join(process.cwd(), "experiments", "extensoes", "catalog", "catalog.py");

test.use({ trace: "on" });
test.describe.configure({ mode: "serial" });

let atores: AtoresDasExtensoes | undefined;
let bancada: Bancada | undefined;

interface Bancada {
  origem: string;
  arquivoDoCatalogo: string;
  publisher: string;
  name: string;
  version: string;
  parar(): Promise<void>;
}

async function cli(args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("python3", [CLI, ...args], { encoding: "utf8" });
  return stdout.trim();
}

/**
 * Publica um pacote com DUAS portas novas. O `make-example` da bancada gera o pacote no
 * formato vigente; aqui ele é reescrito para pedir Conversas e Funil — que é exatamente o
 * que era impossível antes desta entrega.
 */
async function montarBancada(): Promise<Bancada> {
  const dir = await mkdtemp(path.join(tmpdir(), "portas-novas-"));
  const banco = path.join(dir, "catalog.sqlite");
  const manifesto = path.join(dir, "pacote.json");
  const arquivoDoCatalogo = path.join(dir, "catalogo.json");
  const porta = 55080 + (process.pid % 300);
  const origem = `http://127.0.0.1:${porta}`;

  await cli(["init", "--db", banco, "--origin", origem]);
  await cli(["make-example", "--output", manifesto]);

  const sufixo = randomUUID().replaceAll("-", "").slice(0, 8);
  const base = JSON.parse(await readFile(manifesto, "utf8")) as Record<string, unknown>;
  base.publisher = `porta-nova-${sufixo}`;
  base.name = "duas-portas";
  base.permissions = ["navigation.inbox", "navigation.kanban"];
  const display = base.display as Record<string, unknown>;
  display.title = { "pt-BR": "Duas portas", es: "Dos puertas" };
  display.summary = {
    "pt-BR": "Um roteiro que leva às Conversas e ao Funil, sem passar por Tarefas.",
    es: "Una rutina que lleva a Conversaciones y al Embudo.",
  };
  const contribuicoes = base.contributions as { crm_cards: Record<string, unknown>[] };
  const modelo = contribuicoes.crm_cards[0]!;
  contribuicoes.crm_cards = [
    {
      ...modelo,
      id: "falar-com-quem-espera",
      title: { "pt-BR": "Falar com quem está esperando", es: "Hablar con quien espera" },
      action: { label: { "pt-BR": "Abrir Conversas" }, capability: "inbox.open" },
    },
    {
      ...modelo,
      id: "mover-o-que-parou",
      title: { "pt-BR": "Mover o que parou", es: "Mover lo detenido" },
      action: { label: { "pt-BR": "Abrir o Funil" }, capability: "kanban.open" },
    },
  ];
  await writeFile(manifesto, JSON.stringify(base));

  await cli(["publish", "--db", banco, "--manifest", manifesto]);
  await cli(["export", "--db", banco, "--output", arquivoDoCatalogo]);

  const servidor = execFile("python3", [CLI, "serve", "--db", banco, "--port", String(porta)]);
  // Espera o servidor aceitar conexão em vez de dormir um tempo fixo: sob carga, o fixo
  // ora sobra ora falta, e o teste vira medida da máquina.
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`${origem}/`, { signal: AbortSignal.timeout(500) });
      if (r.status > 0) break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  return {
    origem,
    arquivoDoCatalogo,
    publisher: base.publisher as string,
    name: "duas-portas",
    version: base.version as string,
    parar: async () => {
      servidor.kill("SIGTERM");
      await rm(dir, { recursive: true, force: true });
    },
  };
}


/** O id da instalação nasce no servidor; a tela o usa nos `data-testid`. */
async function esperarInstalacao(publisher: string, name: string): Promise<string> {
  for (let i = 0; i < 60; i += 1) {
    const { data } = await atores!.db
      .from("extension_installations")
      .select("id")
      .eq("publisher", publisher)
      .eq("name", name)
      .is("removed_at", null)
      .maybeSingle();
    if (data?.id) return data.id as string;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`instalação de ${publisher}/${name} não apareceu no banco`);
}

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 60_000 });
}

test.beforeAll(async () => {
  await mkdir(EVIDENCE, { recursive: true });
  atores = await criarAtoresDasExtensoes();
  bancada = await montarBancada();
});

test.afterAll(async () => {
  await bancada?.parar();
  await atores?.limpar();
});

test("uma extensão de duas portas: a tela diz quais são, e cada botão leva à sua", async ({
  page,
}) => {
  const a = atores!;
  const b = bancada!;

  await login(page, a.usuarios.owner.email, a.senha);
  await page.goto("/app/extensions");

  // ── 1. Admitir o catálogo ────────────────────────────────────────────────
  await page
    .getByTestId("extension-catalog-file")
    .setInputFiles(b.arquivoDoCatalogo);
  await page.getByTestId("extension-catalog-submit").click();

  const cartao = page.getByTestId(`extension-catalog-${b.publisher}-${b.name}-${b.version}`);
  await expect(cartao).toBeVisible();

  // ── 2. A pergunta que importa: a tela diz o que a extensão abre? ──────────
  // Antes desta entrega, este texto era fixo: "Abre Tarefas" aparecia para TODO pacote.
  await expect(cartao).toContainText("Conversas");
  await expect(cartao).toContainText("Funil");
  await expect(cartao).not.toContainText("Abre Tarefas");
  await page.screenshot({ path: `${EVIDENCE}/1-vitrine-diz-as-portas.png`, fullPage: true });

  // ── 3. Instalar ──────────────────────────────────────────────────────────
  const identidade = `${b.publisher}-${b.name}-${b.version}`;
  await page.getByTestId(`extension-install-${identidade}`).click();
  // Quando há confirmação (troca/reinstalação), ela aparece; numa instalação nova, não.
  const confirmar = page.getByTestId(`extension-install-confirm-${identidade}`);
  if (await confirmar.isVisible().catch(() => false)) await confirmar.click();

  // O id da instalação é UUID, então ele vem do banco — a tela o usa nos data-testid.
  const instalacaoId = await esperarInstalacao(b.publisher, b.name);
  const instalada = page.getByTestId(`extension-installed-${instalacaoId}`);
  await expect(instalada).toBeVisible();
  // A lista de portas também aparece DEPOIS de instalada, no cartão de gestão.
  await expect(instalada).toContainText("Conversas");
  await expect(instalada).toContainText("Funil");

  // ── 4. Ativar na organização ─────────────────────────────────────────────
  await page.getByTestId(`extension-enabled-${instalacaoId}`).click();
  await expect(page.getByTestId(`extension-enabled-${instalacaoId}`)).toBeChecked();
  await page.screenshot({ path: `${EVIDENCE}/2-instalada-e-ativa.png`, fullPage: true });

  // ── 5. O guia, e a primeira porta ────────────────────────────────────────
  await page.goto("/app/crm");
  const cardHub = page.getByText("Falar com quem está esperando").first();
  await expect(cardHub).toBeVisible();
  await cardHub.click();
  await page.waitForURL(/\/app\/extensions\//, { timeout: 30_000 });
  await page.screenshot({ path: `${EVIDENCE}/3-guia-aberto.png`, fullPage: true });

  await page.getByTestId("extension-open-falar-com-quem-espera").click();
  // A PROVA: vai para Conversas, não para Tarefas.
  await page.waitForURL(/\/app\/inbox/, { timeout: 30_000 });
  await page.screenshot({ path: `${EVIDENCE}/4-abriu-conversas.png`, fullPage: true });

  // ── 6. A segunda porta leva a outro lugar ────────────────────────────────
  await page.goBack();
  await page.getByTestId("extension-open-mover-o-que-parou").click();
  await page.waitForURL(/\/app\/kanban/, { timeout: 30_000 });
  await page.screenshot({ path: `${EVIDENCE}/5-abriu-o-funil.png`, fullPage: true });
});
