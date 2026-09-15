import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { audit } from "@/lib/audit";
import type { ActiveOrg, AuthUser } from "@/lib/auth/types";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { assertCatalogOrigin, downloadArtifact } from "./download";
import { causaSegura, ExtensionError } from "./errors";
import { lerManifestoAdmitido, montarInstalada, MOTIVO_PACOTE_ILEGIVEL } from "./instalada";
import { ExtensionServiceError, requireExtensionPlatform } from "./http";
import {
  checkCompatibility,
  configurationSchema,
  parseCatalog,
  validateCatalogSnapshot,
  validateArtifact,
  type CatalogEntry,
  type ExtensionConfiguration,
  type ExtensionManifest,
} from "./manifest";
import type {
  ExtensionGuideView,
  ExtensionListView,
  ExtensionOperationView,
  InstalledExtensionView,
} from "./view";

const uuid = z.string().uuid();
const catalogRowSchema = z.object({
  id: uuid,
  origin: z.string(),
  revision: z.number().int(),
  digest: z.string(),
  snapshot: z.unknown(),
  admitted_at: z.string(),
});
const artifactRowSchema = z.object({
  id: uuid,
  sha256: z.string(),
  byte_length: z.number(),
  manifest: z.unknown(),
  document: z.string(),
});
const installationRowSchema = z.object({
  id: uuid,
  catalog_id: uuid,
  artifact_id: uuid,
  publisher: z.string(),
  name: z.string(),
  version: z.string(),
});
const bindingRowSchema = z.object({
  organization_id: uuid,
  installation_id: uuid,
  enabled: z.boolean(),
  configuration: configurationSchema,
  revision: z.number().int(),
});
const operationRowSchema = z.object({
  id: uuid,
  kind: z.enum(["catalog_admission", "install", "configure"]),
  status: z.enum(["preparing", "completed", "failed", "cancelled"]),
  actor_id: uuid.nullable(),
  organization_id: uuid.nullable(),
  catalog_id: uuid.nullable(),
  installation_id: uuid.nullable(),
  publisher: z.string().nullable(),
  name: z.string().nullable(),
  version: z.string().nullable(),
  entry: z.unknown(),
  error_code: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const SQL_ERRORS: Record<string, { message: string; status: number }> = {
  extension_forbidden: {
    message: "Seu acesso mudou. Entre novamente para continuar.",
    status: 403,
  },
  extension_invalid_input: {
    message: "Confira os dados do pedido e tente novamente.",
    status: 422,
  },
  extension_idempotency_conflict: {
    message: "Este pedido já foi usado com outros dados. Recarregue a página.",
    status: 409,
  },
  extension_catalog_not_found: {
    message: "Catálogo não encontrado. Recarregue a lista de extensões.",
    status: 404,
  },
  extension_catalog_revision_conflict: {
    message:
      "O catálogo tem uma revisão anterior ou diferente da já admitida. Peça o arquivo atual ao mantenedor.",
    status: 409,
  },
  extension_catalog_stale: {
    message: "O catálogo mudou durante a preparação. Recarregue a lista antes de instalar.",
    status: 409,
  },
  extension_entry_not_found: {
    message: "Esta versão não está no catálogo admitido. Recarregue a lista.",
    status: 404,
  },
  extension_operation_not_found: {
    message: "Pedido não encontrado. Consulte o histórico da instalação.",
    status: 404,
  },
  extension_operation_conflict: {
    message: "Este pedido mudou de estado. Consulte o histórico antes de continuar.",
    status: 409,
  },
  extension_installation_not_found: { message: "Extensão não encontrada.", status: 404 },
  extension_version_conflict: {
    message: "Já existe conteúdo diferente para esta versão. Peça uma nova versão ao mantenedor.",
    status: 409,
  },
  extension_version_update_unsupported: {
    message: "Esta versão do sistema ainda não atualiza extensões já instaladas.",
    status: 409,
  },
  extension_artifact_mismatch: {
    message:
      "O arquivo recebido não corresponde à versão admitida. Peça ao mantenedor para conferir a publicação.",
    status: 422,
  },
  extension_revision_conflict: {
    message: "A configuração mudou em outra sessão. Recarregue antes de salvar.",
    status: 409,
  },
  extension_active_limit: {
    message: "O limite de extensões ativas foi atingido. Desative uma antes de ativar outra.",
    status: 409,
  },
  extension_catalog_limit: {
    message: "O limite de catálogos desta instalação foi atingido.",
    status: 409,
  },
  extension_installation_limit: {
    message: "O limite de pacotes desta instalação foi atingido.",
    status: 409,
  },
  extension_core_update_in_progress: {
    message: "O sistema está sendo atualizado. Aguarde a conclusão para instalar extensões.",
    status: 409,
  },
  extension_preparation_in_progress: {
    message:
      "Já existe uma preparação em andamento. Consulte o histórico para verificar ou cancelar o pedido.",
    status: 409,
  },
};

function dbFailure(error: { code?: string; message?: string } | null): void {
  if (!error) return;
  const known = error.code === "P0001" && error.message ? SQL_ERRORS[error.message] : undefined;
  if (known && error.message)
    throw new ExtensionServiceError(error.message, known.message, known.status);
  throw new ExtensionServiceError(
    "upstream_unavailable",
    "Não foi possível confirmar o resultado. Consulte o histórico antes de repetir o pedido.",
    503,
  );
}

function operationView(value: unknown): ExtensionOperationView {
  const row = operationRowSchema.parse(value);
  let message: string | null = row.error_code
    ? (SQL_ERRORS[row.error_code]?.message ?? null)
    : null;
  if (row.error_code && !message) {
    const known = [
      "extension_invalid_package",
      "extension_incompatible",
      "extension_download_failed",
      "extension_unsafe_origin",
      "extension_digest_mismatch",
      "extension_payload_too_large",
    ] as const;
    const code = known.find((candidate) => candidate === row.error_code);
    message = code
      ? new ExtensionError(code).message
      : "Não foi possível concluir a preparação. Confira o catálogo e faça um novo pedido.";
  }
  return {
    id: row.id,
    organization_id: row.organization_id,
    kind: row.kind,
    status: row.status,
    catalog_id: row.catalog_id,
    installation_id: row.installation_id,
    publisher: row.publisher,
    name: row.name,
    version: row.version,
    error_code: row.error_code,
    error_message: message,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const OP_COLS =
  "id,kind,status,actor_id,organization_id,catalog_id,installation_id,publisher,name,version,entry,error_code,created_at,updated_at";
const CATALOG_COLS = "id,origin,revision,digest,snapshot,admitted_at";
const INSTALL_COLS = "id,catalog_id,artifact_id,publisher,name,version";
const ARTIFACT_COLS = "id,sha256,byte_length,manifest,document";
const BINDING_COLS = "organization_id,installation_id,enabled,configuration,revision";

function admittedManifest(value: z.infer<typeof artifactRowSchema>): ExtensionManifest {
  const leitura = lerManifestoAdmitido(value);
  if (leitura.ok) return leitura.manifest;
  if (leitura.code === "extension_storage_failed") {
    throw new ExtensionServiceError(
      "extension_storage_failed",
      "O pacote local precisa ser conferido pelo administrador da instalação.",
      503,
    );
  }
  throw new ExtensionError(leitura.code);
}

/** Snapshot que esta versão já não sabe ler some do catálogo, e não da gestão inteira. */
function entradasLegiveis(row: z.infer<typeof catalogRowSchema>): CatalogEntry[] {
  try {
    return validateCatalogSnapshot(row.snapshot).entries;
  } catch (error) {
    if (!(error instanceof ExtensionError)) throw error;
    logger.warn("[extensions] catálogo admitido ilegível nesta versão", {
      catalog_id: row.id,
      error_code: error.code,
    });
    return [];
  }
}

/** Instância é lida pelo gestor autorizado; vínculos usam RLS e org explícita. */
export async function listExtensions(user: AuthUser, org: ActiveOrg): Promise<ExtensionListView> {
  const canInstall =
    user.is_platform_admin && !user.support && (await requireExtensionPlatform()).ok;
  const admin = createAdminClient();
  const session = await createClient();
  const operations = admin.from("extension_operations").select(OP_COLS);
  const scoped = canInstall
    ? operations.or(`organization_id.eq.${org.orgId},organization_id.is.null`)
    : operations.eq("organization_id", org.orgId);
  const results = await Promise.all([
    admin
      .from("extension_catalogs")
      .select(CATALOG_COLS)
      .order("admitted_at", { ascending: false })
      .limit(8),
    admin.from("extension_installations").select(INSTALL_COLS).order("installed_at").limit(128),
    admin.from("extension_artifacts").select(ARTIFACT_COLS).limit(128),
    session
      .from("organization_extensions")
      .select(BINDING_COLS)
      .eq("organization_id", org.orgId)
      .limit(128),
    scoped.neq("status", "preparing").order("created_at", { ascending: false }).limit(50),
    canInstall
      ? admin
          .from("extension_operations")
          .select(OP_COLS)
          .is("organization_id", null)
          .eq("status", "preparing")
          .order("created_at", { ascending: false })
          .limit(128)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of results) dbFailure(result.error);
  const catalogs = z.array(catalogRowSchema).parse(results[0]!.data ?? []);
  const installations = z.array(installationRowSchema).parse(results[1]!.data ?? []);
  const artifacts = new Map(
    z
      .array(artifactRowSchema)
      .parse(results[2]!.data ?? [])
      .map((item) => [item.id, item]),
  );
  const bindings = new Map(
    z
      .array(bindingRowSchema)
      .parse(results[3]!.data ?? [])
      .map((item) => [item.installation_id, item]),
  );

  const views: InstalledExtensionView[] = installations.map((item) => {
    const view = montarInstalada({
      item,
      artifact: artifacts.get(item.artifact_id),
      catalog: catalogs.find((source) => source.id === item.catalog_id),
      binding: bindings.get(item.id),
    });
    if (view.compatibility_reason === MOTIVO_PACOTE_ILEGIVEL) {
      // Registra a identidade, nunca o conteúdo do pacote.
      logger.warn("[extensions] pacote instalado ilegível nesta versão", {
        installation_id: item.id,
      });
    }
    return view;
  });
  return {
    organization_id: org.orgId,
    can_manage: org.role === "admin" && !user.support,
    can_install: canInstall,
    catalogs: catalogs.map((row) => ({
      id: row.id,
      origin: row.origin,
      revision: row.revision,
      admitted_at: row.admitted_at,
      entries: entradasLegiveis(row),
    })),
    installations: views,
    operations: [...(results[5]!.data ?? []), ...(results[4]!.data ?? [])].map(operationView),
  };
}

/** O único caminho de conteúdo instalado consulta estado local; não acessa catálogo remoto. */
export async function loadExtensionGuide(
  organizationId: string,
  installationId: string,
): Promise<ExtensionGuideView> {
  const session = await createClient();
  const bindingResult = await session
    .from("organization_extensions")
    .select(BINDING_COLS)
    .eq("organization_id", organizationId)
    .eq("installation_id", installationId)
    .maybeSingle();
  dbFailure(bindingResult.error);
  const binding = bindingRowSchema.nullable().parse(bindingResult.data);
  if (!binding?.enabled)
    throw new ExtensionServiceError(
      "extension_inactive",
      "Esta extensão está desativada nesta organização. Consulte o administrador para ativá-la.",
      404,
    );
  const admin = createAdminClient();
  const installed = await admin
    .from("extension_installations")
    .select(INSTALL_COLS)
    .eq("id", installationId)
    .maybeSingle();
  dbFailure(installed.error);
  const installation = installationRowSchema.nullable().parse(installed.data);
  if (!installation)
    throw new ExtensionServiceError(
      "extension_installation_not_found",
      "Extensão não encontrada.",
      404,
    );
  const artifactResult = await admin
    .from("extension_artifacts")
    .select(ARTIFACT_COLS)
    .eq("id", installation.artifact_id)
    .maybeSingle();
  dbFailure(artifactResult.error);
  const artifact = artifactRowSchema.parse(artifactResult.data);
  const manifest = admittedManifest(artifact);
  if (!checkCompatibility(manifest).compatible) throw new ExtensionError("extension_incompatible");
  return {
    organization_id: organizationId,
    installation_id: installation.id,
    version: installation.version,
    manifest,
    configuration: binding.configuration,
    revision: binding.revision,
  };
}

export async function loadCrmExtensions(organizationId: string): Promise<ExtensionGuideView[]> {
  const session = await createClient();
  const result = await session
    .from("organization_extensions")
    .select("installation_id")
    .eq("organization_id", organizationId)
    .eq("enabled", true)
    .limit(8);
  dbFailure(result.error);
  const ids = z.array(z.object({ installation_id: uuid })).parse(result.data ?? []);
  const guias = await Promise.allSettled(
    ids.map((item) => loadExtensionGuide(organizationId, item.installation_id)),
  );
  // Um guia ativo que esta versão já não lê (ou cujo pacote falhou na conferência) sai
  // do hub sozinho. Antes, um só derrubava a lista e escondia todos os outros cards.
  guias.forEach((resultado, indice) => {
    if (resultado.status === "rejected") {
      const motivo = resultado.reason as { code?: unknown };
      logger.warn("[extensions] guia ativo fora do hub", {
        installation_id: ids[indice]!.installation_id,
        error_code: typeof motivo?.code === "string" ? motivo.code : null,
      });
    }
  });
  const lidos = guias.flatMap((resultado) =>
    resultado.status === "fulfilled" ? [resultado.value] : [],
  );
  if (ids.length > 0 && lidos.length === 0) {
    // Nenhum dos ativos pôde ser lido: é falha, não lista vazia, e o hub precisa distinguir.
    throw (guias[0] as PromiseRejectedResult).reason;
  }
  return lidos;
}

export async function readExtensionOperation(
  operationId: string,
  organizationId: string | null,
  platform: boolean,
): Promise<ExtensionOperationView> {
  const admin = createAdminClient();
  let query = admin.from("extension_operations").select(OP_COLS).eq("id", operationId);
  if (!platform) {
    if (!organizationId)
      throw new ExtensionServiceError(
        "extension_operation_not_found",
        "Pedido não encontrado.",
        404,
      );
    query = query.eq("organization_id", organizationId);
  }
  const result = await query.maybeSingle();
  dbFailure(result.error);
  if (!result.data)
    throw new ExtensionServiceError("extension_operation_not_found", "Pedido não encontrado.", 404);
  return operationView(result.data);
}

export async function admitExtensionCatalog(
  actorId: string,
  operationId: string,
  bytes: Uint8Array,
): Promise<ExtensionOperationView> {
  const snapshot = parseCatalog(bytes);
  assertCatalogOrigin(snapshot.origin, {
    localCatalogOrigin: env.EXTENSIONS_LOCAL_CATALOG_ORIGIN || null,
    appUrl: env.NEXT_PUBLIC_APP_URL,
  });
  const digest = createHash("sha256").update(bytes).digest("hex");
  const result = await createAdminClient().rpc("fn_extensions_admit_catalog", {
    p_actor: actorId,
    p_operation: operationId,
    p_snapshot: snapshot,
    p_digest: digest,
  });
  dbFailure(result.error);
  const operation = operationView(result.data);
  await audit({
    action: "extension.catalog_admitted",
    actorUserId: actorId,
    actingAsPlatformAdmin: true,
    resourceType: "extension_catalog",
    resourceId: operation.catalog_id,
    metadata: { operation_id: operation.id, revision: snapshot.revision, digest },
  });
  return operation;
}

export interface InstallExtensionRequest {
  catalog_id: string;
  publisher: string;
  name: string;
  version: string;
}

export async function installExtension(
  actorId: string,
  operationId: string,
  input: InstallExtensionRequest,
): Promise<ExtensionOperationView> {
  const admin = createAdminClient();
  const prepared = await admin.rpc("fn_extensions_prepare_install", {
    p_actor: actorId,
    p_operation: operationId,
    p_catalog: input.catalog_id,
    p_publisher: input.publisher,
    p_name: input.name,
    p_version: input.version,
  });
  dbFailure(prepared.error);
  const receipt = operationRowSchema.parse(prepared.data);
  if (receipt.status !== "preparing") return operationView(receipt);

  const source = await admin
    .from("extension_catalogs")
    .select(CATALOG_COLS)
    .eq("id", input.catalog_id)
    .single();
  dbFailure(source.error);
  const catalog = catalogRowSchema.parse(source.data);
  // Entry vem do recibo preparado, não do pedido nem de uma segunda descoberta remota.
  const snapshot = validateCatalogSnapshot({
    format_version: 1,
    origin: catalog.origin,
    revision: catalog.revision,
    entries: [receipt.entry],
  });
  const entry: CatalogEntry = snapshot.entries[0]!;
  let bytes: Uint8Array;
  let manifest: ExtensionManifest;
  try {
    if (
      !checkCompatibility({
        format_version: 1,
        profile: "declarative",
        host_api: entry.host_api,
        permissions: entry.permissions,
        dependencies: [],
      }).compatible
    )
      throw new ExtensionError("extension_incompatible");
    bytes = await downloadArtifact(catalog.origin, entry, {
      localCatalogOrigin: env.EXTENSIONS_LOCAL_CATALOG_ORIGIN || null,
      appUrl: env.NEXT_PUBLIC_APP_URL,
    });
    manifest = await validateArtifact(bytes, entry);
    if (!checkCompatibility(manifest).compatible)
      throw new ExtensionError("extension_incompatible");
  } catch (error) {
    if (!(error instanceof ExtensionError)) throw error;
    // O recibo guarda só o código estável; o porquê operacional (status HTTP, erro de
    // rede) ia embora aqui. Vai a log e à auditoria, sem texto remoto nem do pacote.
    const causa = causaSegura(error);
    logger.warn("[extensions] instalação falhou", {
      operation_id: operationId,
      catalog_id: input.catalog_id,
      error_code: error.code,
      ...causa,
    });
    const failed = await admin.rpc("fn_extensions_fail_install", {
      p_actor: actorId,
      p_operation: operationId,
      p_error_code: error.code,
    });
    dbFailure(failed.error);
    const falha = operationView(failed.data);
    if (falha.status === "failed") {
      await audit({
        action: "extension.install_failed",
        actorUserId: actorId,
        actingAsPlatformAdmin: true,
        resourceType: "extension_operation",
        resourceId: falha.id,
        metadata: {
          operation_id: falha.id,
          error_code: error.code,
          catalog_id: input.catalog_id,
          publisher: entry.publisher,
          name: entry.name,
          version: entry.version,
          ...causa,
        },
      });
    }
    return falha;
  }
  // Só esta transação publica. Falha de conexão daqui em diante deixa resultado
  // a reconciliar; não transforma uma confirmação possivelmente consumada em failed.
  const finished = await admin.rpc("fn_extensions_finish_install", {
    p_actor: actorId,
    p_operation: operationId,
    p_manifest: manifest,
    p_sha256: createHash("sha256").update(bytes).digest("hex"),
    p_byte_length: bytes.byteLength,
    p_document: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  });
  dbFailure(finished.error);
  const operation = operationView(finished.data);
  if (operation.status === "completed") {
    await audit({
      action: "extension.installed",
      actorUserId: actorId,
      actingAsPlatformAdmin: true,
      resourceType: "extension_installation",
      resourceId: operation.installation_id,
      metadata: { operation_id: operation.id, version: entry.version, digest: entry.sha256 },
    });
  }
  return operation;
}

export async function cancelExtensionInstall(
  actorId: string,
  operationId: string,
): Promise<ExtensionOperationView> {
  const result = await createAdminClient().rpc("fn_extensions_cancel_install", {
    p_actor: actorId,
    p_operation: operationId,
  });
  dbFailure(result.error);
  const operation = operationView(result.data);
  if (operation.status === "cancelled") {
    await audit({
      action: "extension.preparation_cancelled",
      actorUserId: actorId,
      actingAsPlatformAdmin: true,
      resourceType: "extension_operation",
      resourceId: operation.id,
      metadata: { operation_id: operation.id },
    });
  }
  return operation;
}

export async function configureExtension(
  actorId: string,
  organizationId: string,
  installationId: string,
  operationId: string,
  input: { expected_revision: number; enabled: boolean; configuration: ExtensionConfiguration },
): Promise<ExtensionOperationView> {
  const admin = createAdminClient();
  // A ativação usa o mesmo contrato de leitura/instalação antes da mutação.
  if (input.enabled) {
    const result = await admin
      .from("extension_installations")
      .select("artifact_id")
      .eq("id", installationId)
      .maybeSingle();
    dbFailure(result.error);
    const installed = z.object({ artifact_id: uuid }).nullable().parse(result.data);
    if (!installed)
      throw new ExtensionServiceError(
        "extension_installation_not_found",
        "Extensão não encontrada.",
        404,
      );
    const artifact = await admin
      .from("extension_artifacts")
      .select(ARTIFACT_COLS)
      .eq("id", installed.artifact_id)
      .single();
    dbFailure(artifact.error);
    if (!checkCompatibility(admittedManifest(artifactRowSchema.parse(artifact.data))).compatible) {
      throw new ExtensionError("extension_incompatible");
    }
  }
  const result = await admin.rpc("fn_extensions_configure", {
    p_actor: actorId,
    p_organization: organizationId,
    p_installation: installationId,
    p_operation: operationId,
    p_expected_revision: input.expected_revision,
    p_enabled: input.enabled,
    p_configuration: input.configuration,
  });
  dbFailure(result.error);
  const operation = operationView(result.data);
  await audit({
    action: input.enabled ? "extension.configured" : "extension.deactivated",
    actorUserId: actorId,
    organizationId,
    resourceType: "extension_installation",
    resourceId: installationId,
    metadata: {
      operation_id: operation.id,
      expected_revision: input.expected_revision,
      enabled: input.enabled,
    },
  });
  return operation;
}
