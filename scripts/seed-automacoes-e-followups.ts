/**
 * Seed de demonstração: AUTOMAÇÕES e FOLLOW-UPS em estados variados.
 *
 * ─── Por que existe ─────────────────────────────────────────────────────────
 *
 * Uma auditoria de VPS não conseguiu validar execução ponta a ponta de nenhum
 * dos dois: "não há automações cadastradas", "não há inscrições de Follow-up
 * para validar disparos reais". A lacuna não era só da instalação — era do
 * repositório: dos 27 seeders em `scripts/`, **nenhum** cria `automation_rules`
 * nem fluxo de follow-up. O único script que insere regra
 * (`scripts/repro-automacao-nao-envia.ts`) a apaga no fim, e as dez specs de
 * follow-up constroem tudo pela UI — o que prova o construtor e deixa as telas
 * de LISTA nascendo vazias em toda verificação visual.
 *
 * Tela vazia passa em qualquer teste. É o falso verde mais barato que existe.
 *
 * ─── O que ele NÃO faz ──────────────────────────────────────────────────────
 *
 * Não dispara nada. As regras nascem `is_active = true` e as inscrições têm
 * relógio, mas quem as executa é o motor — este script só põe o estado de pé
 * para que a execução possa ser observada e para que as telas tenham conteúdo.
 * Nenhuma mensagem sai daqui.
 *
 * ─── Idempotente ────────────────────────────────────────────────────────────
 *
 * Tudo é procurado antes de ser criado, por chave natural: regra por
 * `(organization_id, name)`, ponteiro pela `unique (organization_id, name)` que
 * a tabela já tem, contato por `(organization_id, phone_number)`. Rodar N vezes
 * dá o mesmo estado.
 *
 * Roda depois de `scripts/seed-crm-vivo.ts` (precisa do `.e2e-creds.json` e do
 * pipeline dele para a ação `create_or_move_lead` apontar para algo real).
 *
 * Run: npx tsx scripts/seed-automacoes-e-followups.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { carregarEnvLocal } from "./lib/env-de-teste";
import {
  GRAFO_DE_DEMONSTRACAO,
  NO_ESPERA,
  NO_FIM,
  NO_INICIO,
  NO_MENSAGEM,
} from "./lib/grafo-de-demonstracao";

const env = carregarEnvLocal();

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const HORA = 3_600_000;
const DIA = 24 * HORA;

interface Creds {
  org_id: string;
  users: Record<string, { id: string }>;
  crm_vivo?: { pipeline_id?: string; stage_ids?: Record<string, string> };
}

function daqui(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

// ════════════════════════════════════════════════════════════════════════════
// AUTOMAÇÕES
// ════════════════════════════════════════════════════════════════════════════

/**
 * As regras usam o vocabulário REAL, lido de `lib/schemas/webhooks.ts`:
 * `trigger_event` da lista `ENTIDADE_ESPERADA_POR_GATILHO` e `actions` do
 * `actionSchema`. Inventar um gatilho aqui criaria uma regra que a tela mostra
 * e o motor nunca casa — que é exatamente o defeito mudo que
 * `lib/automation/gatilhos-em-uma-fonte.test.ts` existe para impedir.
 */
function regras(pipelineId: string | null, stageId: string | null, managerId: string) {
  const base = [
    {
      name: "Lead novo ganha etiqueta de origem",
      trigger_event: "lead.created",
      conditions: [],
      actions: [{ type: "add_tag", config: { tags: ["novo", "automático"] } }],
    },
    {
      name: "Quem manda mensagem cai com o gerente",
      trigger_event: "message.received",
      // Condição de verdade, não `[]`: a aba Regras precisa mostrar como um
      // filtro se parece, e uma regra sem condição nenhuma não ensina nada a
      // quem abre a tela pela primeira vez.
      conditions: [{ field: "direction", op: "eq", value: "inbound" }],
      actions: [{ type: "assign_owner", config: { user_id: managerId } }],
    },
  ];

  // Só entra se o pipeline do CRM Vivo existir: uma ação apontando para um
  // estágio inexistente é uma regra que falha em toda execução, e uma demo que
  // nasce quebrada é pior que uma demo incompleta.
  if (pipelineId && stageId) {
    base.push({
      name: "Aniversariante volta para o começo do funil",
      trigger_event: "contact.birthday",
      conditions: [],
      actions: [
        { type: "create_or_move_lead", config: { pipeline_id: pipelineId, stage_id: stageId } },
      ],
    });
  }
  return base;
}

async function semearAutomacoes(
  orgId: string,
  pipelineId: string | null,
  stageId: string | null,
  managerId: string,
): Promise<string[]> {
  const ids: string[] = [];

  for (const regra of regras(pipelineId, stageId, managerId)) {
    const { data: existente } = await admin
      .from("automation_rules")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", regra.name)
      .maybeSingle();

    if (existente) {
      ids.push((existente as { id: string }).id);
      continue;
    }

    const { data, error } = await admin
      .from("automation_rules")
      .insert({ organization_id: orgId, is_active: true, ...regra })
      .select("id")
      .single();
    if (error) throw new Error(`regra "${regra.name}": ${error.message}`);
    ids.push((data as { id: string }).id);
  }

  return ids;
}

/**
 * Histórico com os TRÊS desfechos que a constraint aceita.
 *
 * A aba Atividade (`app/app/webhooks/_components/ActivityTab.tsx`) lê
 * `automation_rule_runs`, e uma lista só com `success` não prova que a tela sabe
 * mostrar um erro — que é justamente a linha que alguém vai procurar quando
 * disser "a automação não funcionou".
 */
async function semearHistorico(orgId: string, ruleIds: string[]): Promise<number> {
  if (!ruleIds.length) return 0;

  const { count } = await admin
    .from("automation_rule_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if ((count ?? 0) > 0) return 0; // já semeado

  const primeira = ruleIds[0]!;
  const linhas = [
    {
      organization_id: orgId,
      rule_id: primeira,
      status: "success",
      actions_result: [{ type: "add_tag", status: "success", detail: { added: ["novo"] } }],
      created_at: daqui(-2 * HORA),
    },
    {
      organization_id: orgId,
      rule_id: primeira,
      status: "partial",
      actions_result: [
        { type: "add_tag", status: "success", detail: { added: ["automático"] } },
        { type: "assign_owner", status: "skipped", detail: { reason: "no_target" } },
      ],
      created_at: daqui(-6 * HORA),
    },
    {
      organization_id: orgId,
      rule_id: ruleIds[ruleIds.length - 1]!,
      status: "failed",
      actions_result: [{ type: "assign_owner", status: "failed", error: "owner_not_found" }],
      error: "owner_not_found",
      created_at: daqui(-1 * DIA),
    },
  ];

  const { error } = await admin.from("automation_rule_runs").insert(linhas);
  if (error) throw new Error(`histórico de automação: ${error.message}`);
  return linhas.length;
}

// ════════════════════════════════════════════════════════════════════════════
// FOLLOW-UPS
// ════════════════════════════════════════════════════════════════════════════

const NOME_DO_FLUXO = "Retomada de contato (demonstração)";

async function semearFluxo(orgId: string): Promise<{ pointerId: string; versionId: string }> {
  const { data: ponteiro } = await admin
    .from("followup_flow_pointers")
    .select("id, active_version_id")
    .eq("organization_id", orgId)
    .eq("name", NOME_DO_FLUXO)
    .maybeSingle();

  if (ponteiro && (ponteiro as { active_version_id: string | null }).active_version_id) {
    const p = ponteiro as { id: string; active_version_id: string };
    return { pointerId: p.id, versionId: p.active_version_id };
  }

  const { data: versao, error: erroVersao } = await admin
    .from("followup_flow_versions")
    .insert({ organization_id: orgId, graph: GRAFO_DE_DEMONSTRACAO })
    .select("id")
    .single();
  if (erroVersao) throw new Error(`versão do fluxo: ${erroVersao.message}`);
  const versionId = (versao as { id: string }).id;

  if (ponteiro) {
    const id = (ponteiro as { id: string }).id;
    const { error } = await admin
      .from("followup_flow_pointers")
      .update({ status: "active", active_version_id: versionId })
      .eq("id", id)
      .eq("organization_id", orgId);
    if (error) throw new Error(`ativar ponteiro: ${error.message}`);
    return { pointerId: id, versionId };
  }

  const { data: novo, error } = await admin
    .from("followup_flow_pointers")
    .insert({
      organization_id: orgId,
      name: NOME_DO_FLUXO,
      status: "active",
      active_version_id: versionId,
      handoff_policy: "pause",
      trigger_config: { kind: "manual" },
    })
    .select("id")
    .single();
  if (error) throw new Error(`ponteiro do fluxo: ${error.message}`);
  return { pointerId: (novo as { id: string }).id, versionId };
}

/** Contatos próprios da demo — um por inscrição VIVA (ver o aviso abaixo). */
const CONTATOS = [
  { nome: "Follow-up · aguardando o relógio", telefone: "+5511970000101" },
  { nome: "Follow-up · esperando resposta", telefone: "+5511970000102" },
  { nome: "Follow-up · pausado por atendimento", telefone: "+5511970000103" },
  { nome: "Follow-up · concluído", telefone: "+5511970000104" },
];

async function garantirContatos(orgId: string): Promise<string[]> {
  const ids: string[] = [];
  for (const c of CONTATOS) {
    const { data: existente } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", orgId)
      .eq("phone_number", c.telefone)
      .maybeSingle();
    if (existente) {
      ids.push((existente as { id: string }).id);
      continue;
    }
    const { data, error } = await admin
      .from("contacts")
      .insert({ organization_id: orgId, name: c.nome, phone_number: c.telefone })
      .select("id")
      .single();
    if (error) throw new Error(`contato "${c.nome}": ${error.message}`);
    ids.push((data as { id: string }).id);
  }
  return ids;
}

/**
 * ⚠️ UM CONTATO POR INSCRIÇÃO VIVA, E ISSO NÃO É ESTILO.
 *
 * `idx_followup_enrollments_one_live` é UNIQUE em
 * `(organization_id, contact_id)` onde o status está em
 * `active | waiting_reply | paused_handoff | paused_manual` — **um follow-up
 * vivo por contato na organização inteira**, não um por fluxo. É o guard
 * anti-empilhamento: sem ele o mesmo contato entra em N sequências e leva N
 * mensagens, que é o bug de spam que a doutrina anti-banimento existe para
 * impedir.
 *
 * Reusar um contato entre dois estados vivos bate `23505` — e como o
 * `silence-sweep` trata `23505` como skip silencioso, um seeder que reusasse
 * contato criaria MENOS inscrições do que anuncia, sem erro visível.
 *
 * O `completed` é o único que pode dividir contato com outro, porque está fora
 * do predicado do índice. Mesmo assim ganha contato próprio: a lista fica mais
 * legível com um nome por estado.
 *
 * E o CHECK da tabela amarra relógio a estado: `active`/`waiting_reply` EXIGEM
 * `next_eval_at`; `paused_*` e terminais exigem que ele seja nulo.
 */
async function semearInscricoes(
  orgId: string,
  pointerId: string,
  versionId: string,
  contatos: string[],
): Promise<number> {
  const { count } = await admin
    .from("followup_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("pointer_id", pointerId);
  if ((count ?? 0) > 0) return 0; // já semeado

  const comum = { organization_id: orgId, pointer_id: pointerId, version_id: versionId };
  const linhas = [
    {
      ...comum,
      contact_id: contatos[0]!,
      current_node_id: NO_ESPERA,
      status: "active",
      next_eval_at: daqui(6 * HORA),
      steps_taken: 1,
    },
    {
      ...comum,
      contact_id: contatos[1]!,
      current_node_id: NO_MENSAGEM,
      status: "waiting_reply",
      next_eval_at: daqui(2 * DIA),
      steps_taken: 2,
    },
    {
      ...comum,
      contact_id: contatos[2]!,
      current_node_id: NO_MENSAGEM,
      status: "paused_handoff",
      next_eval_at: null,
      steps_taken: 2,
    },
    {
      ...comum,
      contact_id: contatos[3]!,
      current_node_id: NO_FIM,
      status: "completed",
      next_eval_at: null,
      steps_taken: 3,
      outcome: "exhausted",
      completed_at: daqui(-3 * HORA),
    },
  ];

  const { data, error } = await admin.from("followup_enrollments").insert(linhas).select("id");
  if (error) throw new Error(`inscrições: ${error.message}`);

  const criadas = (data ?? []) as { id: string }[];

  // A trilha: sem ela a tela de uma inscrição mostra estado sem história, e
  // "por que esta pessoa parou aqui?" fica sem resposta.
  const eventos = criadas.flatMap((e, i) => [
    {
      organization_id: orgId,
      enrollment_id: e.id,
      node_id: NO_INICIO,
      event_type: "enrolled",
      payload: { origem: "seed" },
      created_at: daqui(-(i + 2) * DIA),
    },
    {
      organization_id: orgId,
      enrollment_id: e.id,
      node_id: NO_ESPERA,
      event_type: "node_entered",
      payload: { node_type: "wait" },
      created_at: daqui(-(i + 1) * DIA),
    },
  ]);
  const { error: erroEventos } = await admin
    .from("followup_enrollment_events")
    .insert(eventos);
  if (erroEventos) throw new Error(`trilha das inscrições: ${erroEventos.message}`);

  return linhas.length;
}

// ════════════════════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  if (!fs.existsSync(CREDS_PATH)) {
    throw new Error(
      `${CREDS_PATH} não existe — rode scripts/seed-e2e-credentials.ts (e seed-crm-vivo.ts) antes.`,
    );
  }
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  const orgId = creds.org_id;
  const managerId = creds.users.manager?.id ?? creds.users.admin!.id;

  const pipelineId = creds.crm_vivo?.pipeline_id ?? null;
  const stageId = creds.crm_vivo?.stage_ids?.["primeiro_contato"] ?? null;
  if (!pipelineId) {
    console.warn(
      "[seed] sem crm_vivo em .e2e-creds.json — a regra de aniversário fica de fora " +
        "(rode scripts/seed-crm-vivo.ts antes para tê-la).",
    );
  }

  const ruleIds = await semearAutomacoes(orgId, pipelineId, stageId, managerId);
  const runs = await semearHistorico(orgId, ruleIds);

  const { pointerId, versionId } = await semearFluxo(orgId);
  const contatos = await garantirContatos(orgId);
  const inscricoes = await semearInscricoes(orgId, pointerId, versionId, contatos);

  console.info(
    `\n✅ Seed de automações e follow-ups completo.` +
      `\n   Automações: ${ruleIds.length} regras ativas, ${runs} execuções no histórico` +
      `\n   Follow-up:  fluxo "${NOME_DO_FLUXO}" ativo, ${inscricoes} inscrições` +
      `\n   Telas: /app/webhooks (abas Regras e Atividade) e /app/ai/followups`,
  );
}

main().catch((err) => {
  console.error("❌ Seed de automações e follow-ups falhou:", err);
  process.exit(1);
});
