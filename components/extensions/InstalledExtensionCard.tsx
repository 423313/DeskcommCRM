"use client";

import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import {
  localize,
  type ExtensionConfiguration,
  type ExtensionManifest,
} from "@/lib/extensions/manifest";
import type { InstalledExtensionView } from "@/lib/extensions/view";
import { BookOpen, CircleNotch, Lightbulb, ListChecks } from "@/lib/ui/icons";

const ICONS: Record<ExtensionManifest["display"]["icon"], typeof ListChecks> = {
  ListChecks,
  BookOpen,
  Lightbulb,
};

function permissionCopy(permissions: InstalledExtensionView["permissions"]): string {
  return permissions.includes("navigation.tasks")
    ? "Abre Tarefas; não lê seus dados."
    : "Não recebe acesso aos dados do CRM.";
}

export function InstalledExtensionCard({
  extension,
  canManage,
  actionsDisabled,
  manageBlockedReason,
  supportMode,
  busy,
  onConfigure,
}: {
  extension: InstalledExtensionView;
  canManage: boolean;
  actionsDisabled: boolean;
  manageBlockedReason?: string;
  supportMode: boolean;
  busy: boolean;
  onConfigure: (
    extension: InstalledExtensionView,
    enabled: boolean,
    configuration: ExtensionConfiguration,
  ) => Promise<{ ok: boolean; message: string }>;
}) {
  const t = useT();
  const locale = useIdioma();
  const Icon = ICONS[extension.display.icon];
  const [enabled, setEnabled] = useState(extension.enabled);
  const [density, setDensity] = useState<ExtensionConfiguration["density"]>(
    extension.configuration.density,
  );
  const [showDescription, setShowDescription] = useState(extension.configuration.show_description);
  const [feedback, setFeedback] = useState<string | null>(null);
  const changed =
    enabled !== extension.enabled ||
    density !== extension.configuration.density ||
    showDescription !== extension.configuration.show_description;

  async function save() {
    setFeedback(null);
    const result = await onConfigure(extension, enabled, {
      density,
      show_description: showDescription,
    });
    setFeedback(result.message);
  }

  const status = !extension.compatible
    ? { label: "Incompatível", variant: "error" as const }
    : extension.enabled
      ? { label: "Ativa", variant: "success" as const }
      : { label: "Desativada", variant: "neutral" as const };

  return (
    <Card className="flex h-full flex-col p-5" data-testid={`extension-installed-${extension.id}`}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <Icon size={22} weight="duotone" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">
              {localize(extension.display.title, locale).text}
            </h2>
            <Badge variant={status.variant}>{t(status.label)}</Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {localize(extension.display.summary, locale).text}
          </p>
          {localize(extension.display.title, locale).fallback ||
          localize(extension.display.summary, locale).fallback ? (
            <p className="mt-1 text-xs text-warning-fg">{t("Texto disponível em português.")}</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-2 rounded-md border border-border bg-surface-elevated/55 p-3 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{t("Versão")}</dt>
          <dd className="mt-0.5 font-mono">{extension.version}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t("Origem")}</dt>
          <dd className="mt-0.5 break-all">{extension.origin}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">{t("Permissão")}</dt>
          <dd className="mt-0.5">{t(permissionCopy(extension.permissions))}</dd>
        </div>
      </dl>

      {!extension.compatible ? (
        <div className="mt-4 rounded-md border border-error/30 bg-error-bg p-3 text-sm">
          <p className="font-medium text-error-fg">{t("Esta versão não pode ser ativada")}</p>
          <p className="mt-1 text-muted-foreground">
            {extension.compatibility_reason ??
              t("O servidor recusou a compatibilidade desta versão.")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("Peça ao responsável pela instalação uma versão compatível.")}
          </p>
        </div>
      ) : canManage ? (
        <div className="mt-4 space-y-4 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor={`enabled-${extension.id}`}>{t("Ativa no CRM")}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {enabled
                  ? t("Os guias aparecem no hub do CRM.")
                  : t("A configuração fica preservada enquanto estiver desativada.")}
              </p>
            </div>
            <Switch
              id={`enabled-${extension.id}`}
              data-testid={`extension-enabled-${extension.id}`}
              checked={enabled}
              disabled={actionsDisabled}
              onCheckedChange={setEnabled}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`density-${extension.id}`}>{t("Densidade dos cards")}</Label>
              <Select
                value={density}
                disabled={actionsDisabled}
                onValueChange={(value) => setDensity(value as ExtensionConfiguration["density"])}
              >
                <SelectTrigger
                  id={`density-${extension.id}`}
                  data-testid={`extension-density-${extension.id}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="comfortable">{t("Confortável")}</SelectItem>
                  <SelectItem value="compact">{t("Compacta")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border p-3">
              <Label htmlFor={`description-${extension.id}`} className="leading-snug">
                {t("Mostrar descrição nos cards")}
              </Label>
              <Switch
                id={`description-${extension.id}`}
                data-testid={`extension-description-${extension.id}`}
                checked={showDescription}
                disabled={actionsDisabled}
                onCheckedChange={setShowDescription}
              />
            </div>
          </div>
          {feedback ? (
            <p role="status" className="text-xs text-muted-foreground">
              {feedback}
            </p>
          ) : null}
          {manageBlockedReason ? (
            <p className="text-xs text-muted-foreground">{manageBlockedReason}</p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
            {extension.enabled ? (
              <Button asChild variant="outline">
                <Link href={`/app/extensions/${encodeURIComponent(extension.id)}`}>
                  {t("Abrir guia")}
                </Link>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">{t("Ative para abrir o guia.")}</p>
            )}
            <Button
              data-testid={`extension-save-${extension.id}`}
              disabled={!changed || busy || actionsDisabled}
              onClick={() => void save()}
            >
              {busy ? <CircleNotch className="animate-spin" aria-hidden /> : null}
              {busy ? t("Salvando…") : t("Salvar configuração")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {supportMode
              ? t("Saia do acompanhamento para configurar extensões.")
              : extension.enabled
                ? t("Este guia está pronto para uso.")
                : t("Peça a um administrador da organização para ativar este guia.")}
          </p>
          {extension.enabled ? (
            <Button asChild variant="outline">
              <Link href={`/app/extensions/${encodeURIComponent(extension.id)}`}>
                {t("Abrir guia")}
              </Link>
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
