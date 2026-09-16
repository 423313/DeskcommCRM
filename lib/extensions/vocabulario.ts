/**
 * O vocabulário dos recibos de extensão — a ÚNICA lista.
 *
 * `extension_operations.kind` e `.status` têm CHECK no banco (migration 0263). Antes disto o
 * TypeScript repetia as listas em quatro lugares (a view, o Zod do serviço e dois módulos do
 * navegador), e nada comparava nenhuma delas com o banco: um kind novo na migration passaria
 * verde e o navegador descartaria o recibo como inválido. O par é vigiado por
 * `tests/invariants/vocabulario-banco-x-typescript.test.ts`, que lê as duas tuplas abaixo.
 *
 * Módulo puro: é importado também pelo navegador.
 */
export const EXTENSION_OPERATION_KINDS = ["catalog_admission", "install", "configure"] as const;
export type ExtensionOperationKind = (typeof EXTENSION_OPERATION_KINDS)[number];

export const EXTENSION_OPERATION_STATUSES = [
  "preparing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type ExtensionOperationStatus = (typeof EXTENSION_OPERATION_STATUSES)[number];

export function ehTipoDeOperacao(valor: unknown): valor is ExtensionOperationKind {
  return (EXTENSION_OPERATION_KINDS as readonly unknown[]).includes(valor);
}

export function ehEstadoDeOperacao(valor: unknown): valor is ExtensionOperationStatus {
  return (EXTENSION_OPERATION_STATUSES as readonly unknown[]).includes(valor);
}
