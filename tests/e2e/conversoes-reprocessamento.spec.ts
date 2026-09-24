import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { expect, test } from "@playwright/test";
import { credenciaisSupabaseDeTeste } from "../../scripts/lib/env-de-teste";
import { lerCreds, loginComoAdmin } from "./helpers/login-admin";

const { url, serviceRole } = credenciaisSupabaseDeTeste();
const admin = createClient<Database>(url, serviceRole, { auth: { persistSession: false } });

test("conversões: instalação sem credenciais explica a ausência e permite reprocessar uma pendência", async ({
  page,
}, testInfo) => {
  const creds = await loginComoAdmin(page, lerCreds());
  const { data: users, error: usersError } = await admin.auth.admin.listUsers();
  if (usersError) throw usersError;
  const user = users.users.find((u) => u.email === creds.users.admin!.email);
  if (!user) throw new Error("Admin de teste ausente");
  const { data: membro, error: membroError } = await admin
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (membroError) throw membroError;
  const org = membro.organization_id;
  const pipeline = randomUUID(),
    stage = randomUUID(),
    lead = randomUUID();
  const titulo = `Venda teste ${lead}`;
  try {
    const { error: p } = await admin.from("crm_pipelines").insert({
      id: pipeline,
      organization_id: org,
      name: "Conversões teste",
      slug: `conversoes-${pipeline.slice(0, 8)}`,
    });
    if (p) throw p;
    const { error: s } = await admin.from("crm_stages").insert({
      id: stage,
      organization_id: org,
      pipeline_id: pipeline,
      name: "Ganho",
      slug: "ganho",
      position: 1,
      is_won: true,
    });
    if (s) throw s;
    const { error: l } = await admin.from("crm_leads").insert({
      id: lead,
      organization_id: org,
      pipeline_id: pipeline,
      stage_id: stage,
      title: titulo,
      status: "won",
      closed_at: new Date().toISOString(),
      value_cents: 15000,
      currency: "BRL",
    });
    if (l) throw l;
    const { error: d } = await admin.from("ad_conversion_dispatches").insert({
      organization_id: org,
      lead_id: lead,
      platform: "google_ads",
      event_name: "Purchase",
      status: "error",
      reason: "sem_conexao",
      value_cents: 15000,
    });
    if (d) throw d;
    await page.goto("/app/settings/conversoes");
    await expect(page.getByRole("heading", { name: "Conversões", exact: true })).toBeVisible();
    await expect(page.getByTestId("google-ads-nao-configurado")).toBeVisible();
    await expect(page.getByText(/Aceite da API não confirma atribuição/)).toBeVisible();
    const linha = page.getByRole("row").filter({ hasText: titulo });
    await expect(linha.getByRole("cell", { name: "Google Ads", exact: true })).toBeVisible();
    const resposta = page.waitForResponse(
      (r) => r.url().endsWith(`/leads/${lead}/conversion/retry`) && r.request().method() === "POST",
    );
    await linha.getByRole("button", { name: "Verificar ou tentar novamente", exact: true }).click();
    expect((await resposta).status()).toBe(200);
    await expect(
      page.getByText("Reprocessamento agendado. Acompanhe o resultado nesta tela.").first(),
    ).toBeVisible();
    const { data: eventos, error: e } = await admin
      .from("event_log")
      .select("id")
      .eq("organization_id", org)
      .eq("entity_id", lead)
      .eq("event_type", "ad_conversion.retry_requested");
    if (e) throw e;
    expect(eventos).toHaveLength(1);
    await page.screenshot({
      path: testInfo.outputPath("conversoes-reprocessamento.png"),
      fullPage: true,
    });
  } finally {
    await admin.from("event_log").delete().eq("organization_id", org).eq("entity_id", lead);
    await admin.from("crm_leads").delete().eq("organization_id", org).eq("id", lead);
    await admin.from("crm_stages").delete().eq("organization_id", org).eq("id", stage);
    await admin.from("crm_pipelines").delete().eq("organization_id", org).eq("id", pipeline);
  }
});
