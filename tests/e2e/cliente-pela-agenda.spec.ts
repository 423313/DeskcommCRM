import { randomUUID } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { escolherDiaDesenhado, irParaASemanaSeguinte } from "./helpers/agenda-semana-integra";

/**
 * CLIENTES PELA AGENDA — a jornada de quem liga a regra (migration 0262, PR #867).
 *
 * O que a tela precisa provar, e nenhum invariante prova:
 *
 *   1. desligada (o padrão), um contato COM horário marcado não aparece como
 *      cliente em lugar nenhum;
 *   2. a regra se alcança pela porta (Configurações › Tipos de agendamento), e
 *      ligar pede confirmação e diz quantos contatos ganharam a etiqueta;
 *   3. ligada, o mesmo contato tem o selo na lista, é achado pelo filtro
 *      "cliente", mostra "Cliente desde" na ficha, e a tela de Funis oferece o
 *      funil de clientes.
 *
 * ⚠️ ORGANIZAÇÃO PRÓPRIA, criada aqui e apagada no fim. Ligar a regra na
 * organização compartilhada do CI etiquetaria os contatos que as outras specs
 * marcaram — e as contagens desta dependeriam da ordem em que elas rodaram. Com
 * a própria organização, "1 contato ganhou a etiqueta" é exato, e o admin não
 * tem MFA (não é o assunto desta spec).
 *
 * O horário é marcado PELA TELA, como quem usa: é o INSERT real que passa pelo
 * trigger — com a regra desligada, ele não pode fazer ninguém virar cliente.
 */
const credenciais = credenciaisSupabaseDeTeste();
const db = createClient(credenciais.url, credenciais.serviceRole, { auth: { persistSession: false } });
const senha = `Local-${randomUUID()}!`;

test.describe.configure({ timeout: 180_000 });

const orgs: string[] = [];
const usuarios: string[] = [];

async function inserir(tabela: string, valor: Record<string, unknown>): Promise<string> {
  const { data, error } = await db.from(tabela).insert(valor).select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
}

async function organizacaoDeTeste() {
  const email = `cliente-agenda-${randomUUID()}@invariant.test`;
  const { data, error } = await db.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("usuário não criado");
  const usuario = data.user.id;
  usuarios.push(usuario);
  const org = await inserir("organizations", {
    slug: `cliente-agenda-${randomUUID()}`,
    display_name: "Estúdio Cliente pela Agenda",
    legal_name: "Estúdio Cliente pela Agenda",
    onboarded_at: new Date().toISOString(),
  });
  orgs.push(org);
  await inserir("user_organizations", {
    organization_id: org,
    user_id: usuario,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  await inserir("calendar_event_types", {
    organization_id: org,
    name: "Sessão de estúdio",
    slug: "sessao-de-estudio",
    duration_minutes: 30,
    minimum_notice_minutes: 60,
    booking_window_days: 60,
    is_active: true,
    default_owner_user_id: usuario,
  });
  const jornada = await db.from("attendant_availability").upsert(
    {
      organization_id: org,
      user_id: usuario,
      is_available: true,
      schedule: {
        timezone: "America/Sao_Paulo",
        windows: [1, 2, 3, 4, 5].map((dow) => ({ dow, start: "09:00", end: "18:00" })),
      },
    },
    { onConflict: "organization_id,user_id" },
  );
  if (jornada.error) throw jornada.error;
  const contato = await inserir("contacts", {
    organization_id: org,
    name: "Bruna Tatuada",
    display_name: "Bruna Tatuada",
    source: "manual",
  });
  return { org, email, contato };
}

async function entrar(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(senha);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(?:\/|$)/, { timeout: 60_000 });
}

async function evidencia(page: Page, info: TestInfo, nome: string) {
  await page.screenshot({ path: info.outputPath(`${nome}.png`), fullPage: true });
}

/** A linha do contato na lista de Contatos. */
function linhaDoContato(page: Page) {
  return page.getByRole("row").filter({ hasText: "Bruna Tatuada" });
}

test.afterAll(async () => {
  // Apagar a organização atravessa a cascata de todas as tabelas dela; sob carga
  // passou dos 30 s padrão do hook (medido numa rodada local).
  test.setTimeout(120_000);
  for (const org of orgs) {
    const r = await db.from("organizations").delete().eq("id", org);
    if (r.error) throw r.error;
  }
  for (const usuario of usuarios) {
    const r = await db.auth.admin.deleteUser(usuario);
    if (r.error) throw r.error;
  }
});

test("ligar 'Clientes pela agenda' transforma quem tem horário marcado em cliente, e só depois de ligar", async ({
  page,
}, info) => {
  const f = await organizacaoDeTeste();
  await entrar(page, f.email);

  // ── 1 · marca o horário PELA TELA, com a regra desligada ─────────────────
  await page.goto("/app/agenda");
  await expect(page.getByTestId("tela-agenda")).toBeVisible({ timeout: 30_000 });
  const dias = await irParaASemanaSeguinte(page);
  await page.getByRole("button", { name: /novo agendamento/i }).click();
  await expect(page.getByTestId("painel-de-marcacao")).toBeVisible({ timeout: 15_000 });
  const quem = page.getByLabel("Quem será atendido");
  await expect(quem.locator(`option[value="${f.contato}"]`)).toHaveCount(1, { timeout: 15_000 });
  await quem.selectOption(f.contato);
  await page.getByRole("button", { name: /^Sessão de estúdio/ }).click();
  await escolherDiaDesenhado(page, dias);
  await page.locator('[data-testid^="horario-"]').first().click();
  const marcou = page.waitForResponse(
    (r) => r.url().includes("/api/v1/agenda/agendamentos") && r.request().method() === "POST",
  );
  await page.getByTestId("confirmar-marcacao").click();
  const resposta = await marcou;
  expect(resposta.ok(), `a marcação foi recusada: ${await resposta.text()}`).toBe(true);
  const { data: agendamento } = await db
    .from("calendar_appointments")
    .select("contact_id")
    .eq("organization_id", f.org)
    .single();
  expect(agendamento?.contact_id, "o horário nasceu sem o contato escolhido").toBe(f.contato);

  // ── 2 · desligada: nada de cliente ──────────────────────────────────────
  await page.goto("/app/contacts");
  await expect(linhaDoContato(page)).toBeVisible({ timeout: 30_000 });
  await expect(linhaDoContato(page).getByText("Cliente", { exact: true })).toHaveCount(0);
  await evidencia(page, info, "1-contatos-regra-desligada");

  // ── 3 · a porta: Configurações › Tipos de agendamento ───────────────────
  await page.goto("/app/settings");
  await page.getByRole("link", { name: /Tipos de agendamento/ }).first().click();
  await expect(page).toHaveURL(/\/app\/settings\/tenant\/agenda/, { timeout: 30_000 });
  const secao = page.getByTestId("cliente-pela-agenda");
  await expect(secao).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("cliente-pela-agenda-estado")).toContainText("Desligado:");
  await secao.scrollIntoViewIfNeeded();
  await evidencia(page, info, "2-regra-desligada");

  await page.getByTestId("cliente-pela-agenda-interruptor").click();
  await expect(page.getByRole("alertdialog")).toContainText("Ligar clientes pela agenda?");
  await expect(page.getByRole("alertdialog")).toContainText("Desligar depois não tira a etiqueta de ninguém.");
  await evidencia(page, info, "3-confirmacao");
  await page.getByTestId("cliente-pela-agenda-confirmar").click();

  await expect(page.getByTestId("cliente-pela-agenda-resultado")).toHaveText(
    "1 contato ganhou a etiqueta “cliente”.",
    { timeout: 30_000 },
  );
  await expect(page.getByTestId("cliente-pela-agenda-estado")).toContainText("Ligado:");
  const interruptor = page.getByTestId("cliente-pela-agenda-interruptor");
  await expect(interruptor).toHaveAttribute("aria-checked", "true");
  // Medido, não olhado: o interruptor volta a responder depois de salvar (um
  // `disabled` preso pela transição deixaria a regra impossível de desligar).
  await expect(interruptor).toBeEnabled();
  const medida = await interruptor.evaluate((el) => ({
    opacidade: getComputedStyle(el).opacity,
    estado: el.getAttribute("data-state"),
  }));
  expect(medida).toEqual({ opacidade: "1", estado: "checked" });
  await evidencia(page, info, "4-regra-ligada");

  // ── 4 · ligada: selo, filtro, ficha e funil ─────────────────────────────
  await page.goto("/app/contacts");
  await expect(linhaDoContato(page).getByText("Cliente", { exact: true })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Tag:/ }).click();
  await page.getByRole("menuitem", { name: "cliente", exact: true }).click();
  await expect(page.getByRole("button", { name: "Tag: cliente" })).toBeVisible();
  await expect(linhaDoContato(page)).toBeVisible({ timeout: 30_000 });
  await evidencia(page, info, "5-contatos-filtro-cliente");

  await page.goto(`/app/contacts/${f.contato}`);
  await expect(page.getByText("Cliente desde")).toBeVisible({ timeout: 30_000 });
  await evidencia(page, info, "6-ficha-cliente-desde");

  await page.goto("/app/kanban");
  // ⚠️ `toBeVisible` ANTES do texto, e não é redundância — medido nesta spec. A
  // página de Funis tem `loading.tsx`: o conteúdo chega por streaming dentro de
  // um `<div hidden>` e só depois substitui o esqueleto. `toContainText` não
  // exige visibilidade, e passou com a tela ainda mostrando o esqueleto (a
  // evidência capturada era o esqueleto, com o botão já no DOM).
  const botaoDeClientes = page.locator('[data-testid^="clientes-"]').first();
  await expect(botaoDeClientes).toBeVisible({ timeout: 60_000 });
  await expect(botaoDeClientes).toContainText("Funil de clientes");
  await expect(page.getByTestId("funis-rodape-clientes")).toBeVisible();
  await expect(page.getByTestId("funis-rodape-clientes")).toContainText(
    "Quem já tem atendimento marcado entra pelo funil de clientes.",
  );
  await evidencia(page, info, "7-funis-com-funil-de-clientes");
});
