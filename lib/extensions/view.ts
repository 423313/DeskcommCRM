/** Contrato de apresentação; não importa cliente de banco nem configuração do servidor. */
import type { CatalogEntry, ExtensionConfiguration, ExtensionManifest } from "./manifest";

export interface ExtensionOperationView {
  id: string;
  organization_id: string | null;
  kind: "catalog_admission" | "install" | "configure";
  status: "preparing" | "completed" | "failed" | "cancelled";
  catalog_id: string | null;
  installation_id: string | null;
  publisher: string | null;
  name: string | null;
  version: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstalledExtensionView {
  id: string;
  origin: string;
  publisher: string;
  name: string;
  version: string;
  display: ExtensionManifest["display"];
  permissions: ExtensionManifest["permissions"];
  enabled: boolean;
  revision: number;
  configuration: ExtensionConfiguration;
  compatible: boolean;
  compatibility_reason: string | null;
}

export interface ExtensionListView {
  organization_id: string;
  can_manage: boolean;
  can_install: boolean;
  catalogs: Array<{
    id: string;
    origin: string;
    revision: number;
    admitted_at: string;
    entries: CatalogEntry[];
  }>;
  installations: InstalledExtensionView[];
  operations: ExtensionOperationView[];
}

export interface ExtensionGuideView {
  organization_id: string;
  installation_id: string;
  version: string;
  manifest: ExtensionManifest;
  configuration: ExtensionConfiguration;
  revision: number;
}
