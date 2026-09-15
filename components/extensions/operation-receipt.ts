import type { ExtensionOperationView } from "@/lib/extensions/view";

const KINDS = new Set<ExtensionOperationView["kind"]>([
  "catalog_admission",
  "install",
  "configure",
]);
const STATUSES = new Set<ExtensionOperationView["status"]>([
  "preparing",
  "completed",
  "failed",
  "cancelled",
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

/** Validação client-side: o cast genérico do fetch não prova o JSON recebido. */
export function parseExtensionOperationView(value: unknown): ExtensionOperationView | null {
  if (typeof value !== "object" || value === null) return null;
  const operation = value as Record<string, unknown>;
  if (
    typeof operation.id !== "string" ||
    !UUID.test(operation.id) ||
    !(typeof operation.organization_id === "string" || operation.organization_id === null) ||
    (typeof operation.organization_id === "string" && !UUID.test(operation.organization_id)) ||
    !KINDS.has(operation.kind as ExtensionOperationView["kind"]) ||
    !STATUSES.has(operation.status as ExtensionOperationView["status"]) ||
    !nullableString(operation.catalog_id) ||
    !nullableString(operation.installation_id) ||
    !nullableString(operation.publisher) ||
    !nullableString(operation.name) ||
    !nullableString(operation.version) ||
    !nullableString(operation.error_code) ||
    !nullableString(operation.error_message) ||
    typeof operation.created_at !== "string" ||
    typeof operation.updated_at !== "string"
  ) {
    return null;
  }
  return operation as unknown as ExtensionOperationView;
}

export function operationMatchesOrganization(
  operation: ExtensionOperationView,
  organizationId: string,
): boolean {
  if (operation.organization_id === organizationId) return true;
  return (
    operation.organization_id === null &&
    (operation.kind === "catalog_admission" || operation.kind === "install")
  );
}

export function expectedOperation(
  value: unknown,
  expected: {
    id: string;
    kind: ExtensionOperationView["kind"];
    organizationId: string;
  },
): ExtensionOperationView | null {
  const operation = parseExtensionOperationView(value);
  if (
    !operation ||
    operation.id !== expected.id ||
    operation.kind !== expected.kind ||
    !operationMatchesOrganization(operation, expected.organizationId)
  ) {
    return null;
  }
  return operation;
}
