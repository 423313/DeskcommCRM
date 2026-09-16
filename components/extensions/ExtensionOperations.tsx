"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import type { ExtensionOperationView } from "@/lib/extensions/view";
import { compararVersoes } from "@/lib/extensions/versao";
import { ArrowsClockwise, X } from "@/lib/ui/icons";

import { organizacoesComElaAtiva, organizacoesDesativadas } from "./frases-de-versao";

const OPERATION_STATUS: Record<
  ExtensionOperationView["status"],
  { label: string; variant: "neutral" | "success" | "warning" | "error" }
> = {
  preparing: { label: "Preparando", variant: "warning" },
  completed: { label: "Concluída", variant: "success" },
  failed: { label: "Falhou", variant: "error" },
  cancelled: { label: "Cancelada", variant: "neutral" },
};

/** Título do recibo. `update` para uma versão menor não é "Atualização": é troca de versão. */
function operationTitle(operation: ExtensionOperationView, t: (texto: string) => string): string {
  switch (operation.kind) {
    case "catalog_admission":
      return t("Admissão de catálogo");
    case "install":
      return t("Instalação");
    case "update":
      return operation.from_version &&
        operation.to_version &&
        compararVersoes(operation.to_version, operation.from_version) < 0
        ? t("Troca de versão")
        : t("Atualização");
    case "revert":
      return t("Troca desfeita");
    case "removal":
      return t("Remoção");
    case "configure":
      return t("Configuração");
  }
}

function operationSubject(operation: ExtensionOperationView, t: (texto: string) => string): string {
  if (!operation.publisher || !operation.name) return t("Operação da plataforma");
  const identity = `${operation.publisher}/${operation.name}`;
  const count = operation.organizations_affected;
  if ((operation.kind === "update" || operation.kind === "revert") && operation.from_version && operation.to_version) {
    const base = `${identity} ${operation.from_version} → ${operation.to_version}`;
    return operation.kind === "update" && count !== null
      ? `${base} · ${organizacoesComElaAtiva(t, count)}`
      : base;
  }
  const base = `${identity}${operation.version ? `@${operation.version}` : ""}`;
  return operation.kind === "removal" && count !== null
    ? `${base} · ${organizacoesDesativadas(t, count)}`
    : base;
}

export function ExtensionOperations({
  operations,
  busyTarget,
  actionsDisabled,
  onVerify,
  onCancel,
}: {
  operations: ExtensionOperationView[];
  busyTarget: string | null;
  actionsDisabled: boolean;
  onVerify: (operation: ExtensionOperationView) => Promise<void>;
  onCancel: (operation: ExtensionOperationView) => Promise<void>;
}) {
  const t = useT();
  const locale = useIdioma();
  return (
    <section aria-labelledby="extension-operations-title" className="space-y-3">
      <div>
        <h2 id="extension-operations-title" className="text-lg font-semibold">
          {t("Atividade recente")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("Este histórico é compartilhado entre abas e mostra o resultado confirmado.")}
        </p>
      </div>
      <div className="space-y-2">
        {operations.map((operation) => {
          const status = OPERATION_STATUS[operation.status];
          const isUpdate = operation.kind === "update";
          return (
            <Card
              key={operation.id}
              className="p-4"
              data-testid={`extension-operation-${operation.id}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{operationTitle(operation, t)}</h3>
                    <Badge variant={status.variant}>{t(status.label)}</Badge>
                  </div>
                  <p className="mt-1 text-xs break-all text-muted-foreground">
                    {operationSubject(operation, t)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-text-subtle">
                    {operation.id} · {new Date(operation.updated_at).toLocaleString(locale)}
                  </p>
                  {operation.error_message ? (
                    <div className="mt-3 rounded-md bg-error-bg p-3 text-sm">
                      <p className="font-medium text-error-fg">{t(operation.error_message)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {operation.kind === "install"
                          ? t("Confira o catálogo admitido e tente a instalação novamente.")
                          : isUpdate
                            ? t(
                                "A versão instalada continua a mesma. Confira o catálogo admitido e tente a atualização novamente.",
                              )
                            : t("Revise o arquivo ou a configuração indicada e tente novamente.")}
                      </p>
                    </div>
                  ) : null}
                </div>
                {operation.status === "preparing" ? (
                  <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                    <Button
                      data-testid={`extension-operation-verify-${operation.id}`}
                      variant="outline"
                      size="sm"
                      disabled={actionsDisabled || busyTarget === `operation:${operation.id}`}
                      onClick={() => void onVerify(operation)}
                    >
                      <ArrowsClockwise aria-hidden />
                      {isUpdate ? t("Verificar atualização") : t("Verificar instalação")}
                    </Button>
                    <Button
                      data-testid={`extension-operation-cancel-${operation.id}`}
                      variant="ghost"
                      size="sm"
                      disabled={actionsDisabled || busyTarget === `cancel:${operation.id}`}
                      onClick={() => void onCancel(operation)}
                    >
                      <X aria-hidden />
                      {isUpdate ? t("Cancelar atualização") : t("Cancelar preparação")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
