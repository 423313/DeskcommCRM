"use client";

import { useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";
import { localize, type CatalogEntry, type ExtensionManifest } from "@/lib/extensions/manifest";
import {
  BookOpen,
  CheckCircle,
  CircleNotch,
  Lightbulb,
  ListChecks,
  MagnifyingGlass,
  PuzzlePiece,
  UploadSimple,
  X,
} from "@/lib/ui/icons";

const CATEGORY_VALUES = ["all", "productivity", "sales", "service"] as const;
export type CategoryFilter = (typeof CATEGORY_VALUES)[number];

const CATEGORY_LABELS: Record<CategoryFilter, string> = {
  all: "Todas as categorias",
  productivity: "Produtividade",
  sales: "Vendas",
  service: "Atendimento",
};

const ICONS: Record<ExtensionManifest["display"]["icon"], typeof ListChecks> = {
  ListChecks,
  BookOpen,
  Lightbulb,
};

function normalizedSearch(...values: string[]): string {
  return values
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function matchesExtensionFilter(
  display: ExtensionManifest["display"],
  identity: string[],
  query: string,
  category: CategoryFilter,
  locale: "pt-BR" | "es",
): boolean {
  if (category !== "all" && display.category !== category) return false;
  const needle = normalizedSearch(query.trim());
  if (!needle) return true;
  return normalizedSearch(
    localize(display.title, locale).text,
    localize(display.summary, locale).text,
    ...identity,
  ).includes(needle);
}

export function ExtensionFilterBar({
  query,
  category,
  onQueryChange,
  onCategoryChange,
}: {
  query: string;
  category: CategoryFilter;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: CategoryFilter) => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
      <div className="relative">
        <MagnifyingGlass
          aria-hidden
          size={17}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={t("Buscar por nome ou descrição")}
          aria-label={t("Buscar extensões")}
          className="pl-9"
        />
      </div>
      <Select value={category} onValueChange={(value) => onCategoryChange(value as CategoryFilter)}>
        <SelectTrigger aria-label={t("Filtrar por categoria")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CATEGORY_VALUES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(CATEGORY_LABELS[value])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CatalogAdmission({
  file,
  onFile,
  onSubmit,
  busy,
  disabled,
  error,
  blockedReason,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  onSubmit: () => void;
  busy: boolean;
  disabled: boolean;
  error: string | null;
  blockedReason?: string;
}) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <Card className="overflow-hidden border-accent-200" data-testid="extension-catalog-admission">
      <div className="grid md:grid-cols-[1.15fr_0.85fr]">
        <div className="p-5 sm:p-6">
          <Badge variant="info">{t("Responsável pela instalação")}</Badge>
          <h2 className="mt-3 text-lg font-semibold">{t("Oriente o trabalho com novos guias")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {t(
              "Adicione guias que orientam o trabalho e só podem abrir Tarefas, sem receber dados do CRM. Escolha um catálogo revisado de uma fonte em que você confia.",
            )}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {t("O arquivo JSON pode ter até 512 KiB.")}
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => fileInput.current?.click()}
            >
              <UploadSimple aria-hidden />
              {t("Escolher arquivo JSON")}
            </Button>
            <input
              ref={fileInput}
              id="extension-catalog-file"
              data-testid="extension-catalog-file"
              className="sr-only"
              type="file"
              accept="application/json,.json"
              aria-label={t("Escolher arquivo JSON")}
              onChange={(event) => {
                onFile(event.target.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            {file ? (
              <span className="min-w-0 truncate text-sm text-muted-foreground">
                {file.name} ·{" "}
                {new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
                  file.size / 1024,
                )}{" "}
                KB
              </span>
            ) : null}
          </div>
          <Button
            data-testid="extension-catalog-submit"
            className="mt-4 w-full sm:w-auto"
            disabled={!file || busy || disabled}
            onClick={onSubmit}
          >
            {busy ? (
              <CircleNotch className="animate-spin" aria-hidden />
            ) : (
              <CheckCircle aria-hidden />
            )}
            {busy ? t("Admitindo…") : t("Admitir catálogo")}
          </Button>
          {error ? (
            <p className="mt-2 text-sm text-error-fg" role="alert">
              {error}
            </p>
          ) : blockedReason ? (
            <p className="mt-2 text-xs text-muted-foreground">{blockedReason}</p>
          ) : null}
        </div>
        <div className="border-t border-accent-200 bg-accent-soft/45 p-5 sm:p-6 md:border-t-0 md:border-l">
          <h3 className="text-sm font-semibold">{t("Antes de admitir")}</h3>
          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <CheckCircle className="mt-0.5 shrink-0 text-accent" aria-hidden />
              {t("Registra quem admitiu, quando, a origem e a revisão do arquivo.")}
            </li>
            <li className="flex gap-2">
              <CheckCircle className="mt-0.5 shrink-0 text-accent" aria-hidden />
              {t("Confere que o arquivo não mudou antes de qualquer instalação.")}
            </li>
            <li className="flex gap-2">
              <X className="mt-0.5 shrink-0 text-error" aria-hidden />
              {t("O arquivo não comprova quem o publicou. Confirme a fonte antes de escolher.")}
            </li>
          </ul>
        </div>
      </div>
    </Card>
  );
}

export function CatalogExtensionCard({
  entry,
  origin,
  canInstall,
  actionsDisabled,
  installedVersion,
  blockedReason,
  busy,
  onInstall,
}: {
  entry: CatalogEntry;
  origin: string;
  canInstall: boolean;
  actionsDisabled: boolean;
  installedVersion: string | null;
  blockedReason?: string;
  busy: boolean;
  onInstall: () => void;
}) {
  const t = useT();
  const locale = useIdioma();
  const Icon = ICONS[entry.display.icon];
  const sameVersion = installedVersion === entry.version;
  return (
    <Card
      className="flex h-full flex-col p-5"
      data-testid={`extension-catalog-${entry.publisher}-${entry.name}-${entry.version}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-elevated text-muted-foreground">
          <Icon size={22} weight="duotone" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">{localize(entry.display.title, locale).text}</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {localize(entry.display.summary, locale).text}
          </p>
          {localize(entry.display.title, locale).fallback ||
          localize(entry.display.summary, locale).fallback ? (
            <p className="mt-1 text-xs text-warning-fg">{t("Texto disponível em português.")}</p>
          ) : null}
        </div>
      </div>
      <dl className="mt-4 space-y-2 rounded-md bg-surface-elevated/55 p-3 text-xs">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("Identidade")}</dt>
          <dd className="text-right font-mono break-all">
            {entry.publisher}/{entry.name}@{entry.version}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("Origem revisada")}</dt>
          <dd className="text-right break-all">{origin}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">{t("Permissão")}</dt>
          <dd className="text-right">{t("Abre Tarefas; não lê seus dados.")}</dd>
        </div>
      </dl>
      <div className="mt-auto pt-4">
        {installedVersion ? (
          <div className="rounded-md border border-border p-3 text-sm">
            <p className="font-medium">
              {sameVersion
                ? t("Esta versão já está instalada.")
                : t("Outra versão desta extensão já está instalada.")}
            </p>
            {!sameVersion ? (
              <p className="mt-1 text-xs text-muted-foreground">
                {t("Atualização de versão ainda não faz parte desta integração.")}
              </p>
            ) : null}
          </div>
        ) : canInstall ? (
          <div>
            <Button
              data-testid={`extension-install-${entry.publisher}-${entry.name}-${entry.version}`}
              className="w-full sm:w-auto"
              disabled={busy || actionsDisabled}
              onClick={onInstall}
            >
              {busy ? (
                <CircleNotch className="animate-spin" aria-hidden />
              ) : (
                <UploadSimple aria-hidden />
              )}
              {busy ? t("Preparando…") : t("Instalar versão revisada")}
            </Button>
            {blockedReason ? (
              <p className="mt-2 text-xs text-muted-foreground">{blockedReason}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {blockedReason ?? t("Somente o responsável pela instalação pode instalar este pacote.")}
          </p>
        )}
      </div>
    </Card>
  );
}

export function ExtensionLoadingState() {
  const t = useT();
  return (
    <Card
      className="flex items-center gap-3 p-5 text-sm text-muted-foreground"
      data-testid="extensions-loading"
    >
      <CircleNotch className="animate-spin" aria-hidden />
      {t("Carregando extensões…")}
    </Card>
  );
}

export function ExtensionEmptyList({ title, description }: { title: string; description: string }) {
  return (
    <Card className="flex flex-col items-center px-5 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-elevated text-muted-foreground">
        <PuzzlePiece size={22} weight="duotone" aria-hidden />
      </div>
      <h2 className="mt-3 text-base font-semibold">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </Card>
  );
}
