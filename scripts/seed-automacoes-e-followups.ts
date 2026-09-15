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
 * ─── O que ele NÃO faz, e o que o estado dele FAZ ───────────────────────────
 *
 * O script não dispara nada nem envia mensagem. Mas o estado que ele deixa é
 * ATIVO — é o padrão dos seeds irmãos (`seed-e2e-acervo`, `seed-e2e-agenda`,
 * `seed-e2e-credentials`, `seed-e2e-followup-agent` gravam `is_active: true`), e
 * uma demonstração desligada não demonstra execução. Então, quando o motor rodar
 * na organização do `.e2e-creds.json`:
 *   • lead criado com a etiqueta `vip` ganha `prioridade` e vai para o gerente;
 *   • mensagem com "orçamento" etiqueta o contato;
 *   • a inscrição `active` chega ao nó de mensagem em 6 h. O contato de
 *     demonstração não tem conversa, e o que o motor faz com isso não foi medido.
 *
 * ─── Onde grava, e por que recusa destino remoto ────────────────────────────
 *
 * Grava onde `credenciaisSupabaseDeTeste()` apontar: o ambiente, ou o
 * `.env.local` — que num checkout de trabalho aponta para PRODUÇÃO. Os seeds
 * irmãos só ANUNCIAM o destino (`anunciarDestino`); este também recusa um
 * destino que não seja local, porque o que ele cria age sozinho (regras e
 * follow-up ativos) e nenhum fluxo automatizado precisa dele fora da máquina.
 * Quem quer mesmo semear um Supabase remoto (a auditoria de uma VPS, por
 * exemplo) passa `--permitir-remoto` e lê o aviso impresso antes.
 *
 * Roda SÓ por comando manual: nenhum `install.sh`, `update.sh`,
 * `bootstrap-owner.ts`, script do `package.json` ou workflow o chama.
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
 * Run: npx tsx scripts/seed-automacoes-e-followups.ts [--permitir-remoto]
 */

import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  historicoDeDemonstracao,
  regrasDeDemonstracao,
} from "./lib/automacoes-de-demonstracao";
import { anunciarDestino, credenciaisSupabaseDeTeste, destinoEhLocal } from "./lib/env-de-teste";
import {
  GRAFO_DE_DEMONSTRACAO,
  NO_ESPERA,
  NO_FIM,
  NO_INICIO,
  NO_MENSAGEM,
} from "./lib/grafo-de-demonstracao";

// `process.env` VENCE o `.env.local` (ver scripts/lib/env-de-teste.ts).
const credenciais = credenciaisSupabaseDeTeste();
anunciarDestino("seed-automacoes-e-followups", credenciais);

// Só a URL decide: este script fala apenas com a API do Supabase (admin client)
// e nunca abre `pg.Pool`, então o `dbUrl` não é destino dele.
if (!destinoEhLocal(credenciais.url) && !process.argv.includes("--permitir-remoto")) {
  console.error(
    `[seed-automacoes-e-followups] recusado: ${credenciais.url} não é local, e este seed cria ` +
      "regras de automação e follow-up ATIVOS. Para gravar mesmo assim, rode de novo com " +
      "--permitir-remoto.",
  );
  process.exit(2);
}

const admin = createClient(credenciais.url, credenciais.serviceRole, {
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
 * As regras vêm de `scripts/lib/automacoes-de-demonstracao.ts`, onde um teste as
 * passa pelo schema da API e pelo avaliador de condições do motor. Devolve o id
 * de cada regra pelo NOME, que é a chave natural do seed.
 */
async function semearAutomacoes(
  orgId: string,
  pipelineId: string | null,
  stageId: string | null,
  managerId: string,
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const regra of regrasDeDemonstracao({ pipelineId, stageId, managerId })) {
    const { data: existente } = await admin
      .from("automation_rules")
      .select("id")
      .eq("organization_id", orgId)
      .eq("name", regra.name)
      .maybeSingle();

    if (existente) {
      ids.set(regra.name, (existente as { id: string }).id);
      continue;
    }

    const { data, error } = await admin
      .from("automation_rules")
      .insert({ organization_id: orgId, is_active: true, ...regra })
      .select("id")
      .single();
    if (error) throw new Error(`regra "${regra.name}": ${error.message}`);
    ids.set(regra.name, (data as { id: string }).id);
  }

  return ids;
}

/**
 * Histórico com os TRÊS desfechos que a aba Atividade distingue.
 *
 * A aba Atividade (`app/app/webhooks/_components/ActivityTab.tsx`) lê
 * `automation_rule_runs`, e uma lista só com `success` não prova que a tela sabe
 * mostrar um erro — que é justamente a linha que alguém vai procurar quando
 * disser "a automação não funcionou". Cada execução descreve as ações da regra
 * a que pertence (ver `historicoDeDemonstracao`).
 */
async function semearHistorico(
  orgId: string,
  ruleIds: Map<string, string>,
  managerId: string,
): Promise<number> {
  const { count } = await admin
    .from("automation_rule_runs")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if ((count ?? 0) > 0) return 0; // já semeado

  const linhas = historicoDeDemonstracao(managerId).map((execucao) => {
    const ruleId = ruleIds.get(execucao.regra);
    if (!ruleId) throw new Error(`histórico aponta para a regra "${execucao.regra}", que não foi semeada`);
    return {
      organization_id: orgId,
      rule_id: ruleId,
      status: execucao.status,
      actions_result: execucao.actions_result,
      created_at: daqui(-execucao.horasAtras * HORA),
    };
  });

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
  const runs = await semearHistorico(orgId, ruleIds, managerId);

  const { pointerId, versionId } = await semearFluxo(orgId);
  const contatos = await garantirContatos(orgId);
  const inscricoes = await semearInscricoes(orgId, pointerId, versionId, contatos);

  console.info(
    `\n✅ Seed de automações e follow-ups completo.` +
      `\n   Automações: ${ruleIds.size} regras ativas, ${runs} execuções no histórico` +
      `\n   Follow-up:  fluxo "${NOME_DO_FLUXO}" ativo, ${inscricoes} inscrições` +
      `\n   Telas: /app/webhooks (abas Regras e Atividade) e /app/ai/followups`,
  );
}

main().catch((err) => {
  console.error("❌ Seed de automações e follow-ups falhou:", err);
  process.exit(1);
});
