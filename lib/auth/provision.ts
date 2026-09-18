import { createHash, randomBytes } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";

/** Normaliza o nome da empresa para um slug candidato (citext unique no DB). */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return slug || "org";
}

type ProvisionUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

/**
 * De onde veio o provisionamento. A organização nasce igual nos dois casos — o
 * que muda é a linha de auditoria, e ela precisa distinguir "primeiro acesso
 * normal" de "primeiro acesso que precisou ser recuperado": a segunda é um
 * sintoma de que o caminho do signup falhou, e some no meio da primeira.
 */
type ProvisionOptions = {
  source?: "signup" | "recovery";
};

/**
 * Provisiona o tenant de um usuário recém-confirmado via signup self-service:
 * cria a organização (status `active`, `onboarded_at` null → cai no onboarding)
 * e a membership `admin` do usuário.
 *
 * Idempotente: se o usuário já tem membership ativa (link de confirmação
 * clicado duas vezes, ou usuário que entrou antes por convite), não faz nada.
 *
 * Service role é intencional aqui — o usuário ainda não pertence a nenhuma org,
 * então RLS bloquearia os INSERTs. A fonte confiável é o JWT já validado por
 * `verifyOtp` no caller (nunca o body).
 */
export async function ensureTenantForUser(
  user: ProvisionUser,
  options: ProvisionOptions = {},
): Promise<{ provisioned: boolean; organizationId?: string }> {
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("user_organizations")
    .select("organization_id")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .limit(1)
    .maybeSingle();
  if (existing) return { provisioned: false, organizationId: existing.organization_id };

  const orgName =
    (user.user_metadata?.org_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "Minha empresa";
  const base = slugify(orgName);

  // ponytail: check-then-insert tem janela de corrida se o mesmo link for
  // confirmado 2x em paralelo (pior caso: org duplicada órfã). Advisory lock
  // por user_id se isso aparecer na prática.
  let org: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 3 && !org; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await admin
      .from("organizations")
      .insert({
        slug,
        display_name: orgName,
        legal_name: orgName,
        status: "active",
        created_by: user.id,
      })
      .select("id, slug")
      .single();
    if (data) {
      org = data;
    } else if (error && error.code !== "23505") {
      throw new Error(`signup provisioning: org insert failed: ${error.message}`);
    }
  }
  if (!org) throw new Error("signup provisioning: slug exhausted after 3 attempts");

  const { error: memberError } = await admin.from("user_organizations").insert({
    user_id: user.id,
    organization_id: org.id,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  if (memberError && memberError.code !== "23505") {
    throw new Error(`signup provisioning: membership insert failed: ${memberError.message}`);
  }

  void audit({
    action:
      options.source === "recovery" ? "tenant.created_by_recovery" : "tenant.created_by_signup",
    actorUserId: user.id,
    organizationId: org.id,
    resourceType: "organization",
    resourceId: org.id,
    bypassedRls: true,
    metadata: { slug: org.slug },
  });

  return { provisioned: true, organizationId: org.id };
}

type ExternalProvisionInput = {
  /** Quem está provisionando (ex.: `clinicfx`). Entra no slug, no marcador e no escopo da chave. */
  integration: string;
  /** Id da empresa no sistema externo. É a chave de idempotência. */
  externalId: string;
  organizationName: string;
  ownerEmail: string;
  ownerName: string;
};

/**
 * O marcador que prova que a organização nasceu DESTE provisionamento.
 *
 * O slug é determinístico, mas slug é um espaço compartilhado com o cadastro
 * pela tela: uma organização criada à mão com o mesmo slug não é "replay" — é
 * outra empresa, e devolver uma chave dela seria entregar os dados de alguém a
 * um sistema de fora. Por isso o reencontro exige o marcador, e sem ele a
 * resposta é conflito.
 */
type MarcadorDeProvisionamento = { integration: string; external_id: string };

export class ProvisionConflictError extends Error {
  constructor() {
    super("provisioning_slug_conflict");
  }
}

/**
 * Slug determinístico por (integração, id externo). O id externo entra por
 * HASH e não por `slugify`: `slugify` corta em 32 caracteres e junta
 * pontuação, então dois ids diferentes podiam cair no mesmo slug e um virar
 * "replay" do outro.
 */
export function slugDoProvisionamento(integration: string, externalId: string): string {
  const hash = createHash("sha256").update(externalId).digest("hex").slice(0, 16);
  return `${integration}-${hash}`;
}

function marcadorDe(settings: unknown): MarcadorDeProvisionamento | null {
  const m = (settings as { provisioning?: unknown } | null)?.provisioning as
    | Partial<MarcadorDeProvisionamento>
    | undefined;
  return typeof m?.integration === "string" && typeof m?.external_id === "string"
    ? { integration: m.integration, external_id: m.external_id }
    : null;
}

/**
 * Provisiona uma organização a partir de um sistema externo, via
 * `POST /api/v1/tenants/provision` — rota que só existe quando o DONO DA
 * INSTALAÇÃO define `TENANT_PROVISIONING_SECRET` (decisão do dono, doc 38 b).
 *
 * Diferente de `ensureTenantForUser` (signup self-service) e do fluxo de
 * `POST /api/v1/admin/tenants` (que convida o dono por e-mail): aqui o dono é
 * criado JÁ ATIVO, com senha aleatória e sem convite — quem opera usa o
 * sistema de fora, que fala com esta organização pela chave de API. O usuário
 * existe para `user_organizations`/`api_tokens.created_by` e para dar a um
 * humano um caminho de acesso por "esqueci minha senha".
 *
 * Idempotente por (integração, id externo), inclusive sob corrida: `23505` no
 * insert é relido e conferido pelo marcador.
 */
export async function provisionExternalTenant(
  input: ExternalProvisionInput,
): Promise<{ organizationId: string; ownerId: string; replay: boolean }> {
  const admin = createAdminClient();
  const slug = slugDoProvisionamento(input.integration, input.externalId);
  const email = input.ownerEmail.trim().toLowerCase();
  const marcador: MarcadorDeProvisionamento = {
    integration: input.integration,
    external_id: input.externalId,
  };

  const reencontrar = async (): Promise<{ organizationId: string; ownerId: string } | null> => {
    const { data } = await admin
      .from("organizations")
      .select("id, created_by, settings")
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return null;
    const achado = marcadorDe(data.settings);
    if (achado?.integration !== marcador.integration || achado.external_id !== marcador.external_id) {
      throw new ProvisionConflictError();
    }
    const ownerId = data.created_by ?? (await findAdminMember(admin, data.id));
    if (!ownerId) {
      throw new Error(`provisioning: replay sem admin encontrado para org ${data.id}`);
    }
    return { organizationId: data.id, ownerId };
  };

  const existente = await reencontrar();
  if (existente) return { ...existente, replay: true };

  const ownerId = await ensureExternalOwnerUser(admin, email, input.ownerName);

  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      slug,
      display_name: input.organizationName,
      legal_name: input.organizationName,
      status: "active",
      created_by: ownerId,
      settings: { provisioning: marcador },
    })
    .select("id")
    .single();

  if (orgError) {
    if (orgError.code === "23505") {
      const corrida = await reencontrar();
      if (corrida) return { ...corrida, replay: true };
    }
    throw new Error(`provisioning: org insert failed: ${orgError.message}`);
  }

  const { error: memberError } = await admin.from("user_organizations").insert({
    user_id: ownerId,
    organization_id: org.id,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  if (memberError && memberError.code !== "23505") {
    throw new Error(`provisioning: membership insert failed: ${memberError.message}`);
  }

  void audit({
    action: "tenant.created_by_provisioning",
    actorUserId: ownerId,
    organizationId: org.id,
    resourceType: "organization",
    resourceId: org.id,
    bypassedRls: true,
    metadata: { slug, integration: input.integration, external_id: input.externalId },
  });

  return { organizationId: org.id, ownerId, replay: false };
}

async function findAdminMember(
  admin: ReturnType<typeof createAdminClient>,
  organizationId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("user_organizations")
    .select("user_id")
    .eq("organization_id", organizationId)
    .is("revoked_at", null)
    .order("accepted_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

/** Teto da busca paginada por e-mail: 50 páginas de 1000 = 50 mil contas. */
const PAGINAS_DE_USUARIOS = 50;
const USUARIOS_POR_PAGINA = 1000;

/**
 * Cria o dono; se o e-mail já tem conta, reaproveita a conta.
 *
 * Tenta criar PRIMEIRO: no caso comum (e-mail novo) não há varredura nenhuma.
 * Só quando o GoTrue responde que o e-mail já existe é que a conta é procurada,
 * página a página — a versão anterior lia UMA página de 200 e, numa instalação
 * com mais contas, não achava a existente e falhava ao criar.
 */
async function ensureExternalOwnerUser(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
  fullName: string,
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: randomBytes(24).toString("base64url"),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (data?.user) return data.user.id;
  // `email_exists` é o código do GoTrue atual; versões anteriores só diziam
  // 422 com "already been registered" na mensagem.
  const jaExiste =
    error?.code === "email_exists" ||
    (error?.status === 422 && /already (been )?registered/i.test(error.message));
  if (!jaExiste) {
    throw new Error(`provisioning: criar dono falhou: ${error?.message ?? "sem usuário"}`);
  }

  for (let page = 1; page <= PAGINAS_DE_USUARIOS; page++) {
    const { data: lista, error: erroDaLista } = await admin.auth.admin.listUsers({
      page,
      perPage: USUARIOS_POR_PAGINA,
    });
    if (erroDaLista) throw new Error(`provisioning: listar contas falhou: ${erroDaLista.message}`);
    const achado = lista.users.find((u) => u.email?.toLowerCase() === email);
    if (achado) return achado.id;
    if (lista.users.length < USUARIOS_POR_PAGINA) break;
  }
  throw new Error("provisioning: o e-mail tem conta, mas ela não foi encontrada na listagem");
}
