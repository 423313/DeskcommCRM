"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import type { ExtensionOperationView } from "@/lib/extensions/view";
import { ArrowsClockwise, X } from "@/lib/ui/icons";

const OPERATION_STATUS: Record<
  ExtensionOperationView["status"],
  { label: string; variant: "neutral" | "success" | "warning" | "error" }
> = {
  preparing: { label: "Preparando", variant: "warning" },
  completed: { label: "Concluída", variant: "success" },
  failed: { label: "Falhou", variant: "error" },
  cancelled: { label: "Cancelada", variant: "neutral" },
};

const OPERATION_KIND: Record<ExtensionOperationView["kind"], string> = {
  catalog_admission: "Admissão de catálogo",
  install: "Instalação",
  configure: "Configuração",
};

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
          return (
            <Card
              key={operation.id}
              className="p-4"
              data-testid={`extension-operation-${operation.id}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{t(OPERATION_KIND[operation.kind])}</h3>
                    <Badge variant={status.variant}>{t(status.label)}</Badge>
                  </div>
                  <p className="mt-1 text-xs break-all text-muted-foreground">
                    {operation.publisher && operation.name
                      ? `${operation.publisher}/${operation.name}${operation.version ? `@${operation.version}` : ""}`
                      : t("Operação da plataforma")}
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
                      {t("Verificar instalação")}
                    </Button>
                    <Button
                      data-testid={`extension-operation-cancel-${operation.id}`}
                      variant="ghost"
                      size="sm"
                      disabled={actionsDisabled || busyTarget === `cancel:${operation.id}`}
                      onClick={() => void onCancel(operation)}
                    >
                      <X aria-hidden />
                      {t("Cancelar preparação")}
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
