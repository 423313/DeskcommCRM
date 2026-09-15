export const EXTENSION_ERROR_CODES = [
  "extension_invalid_package",
  "extension_incompatible",
  "extension_download_failed",
  "extension_unsafe_origin",
  "extension_digest_mismatch",
  "extension_payload_too_large",
] as const;

export type ExtensionErrorCode = (typeof EXTENSION_ERROR_CODES)[number];

const PUBLIC_MESSAGES: Record<ExtensionErrorCode, string> = {
  extension_invalid_package: "O pacote de extensão é inválido.",
  extension_incompatible: "A extensão não é compatível com esta instalação.",
  extension_download_failed: "Não foi possível baixar o pacote de extensão.",
  extension_unsafe_origin: "A origem do catálogo não é permitida.",
  extension_digest_mismatch: "O pacote baixado não corresponde ao catálogo admitido.",
  extension_payload_too_large: "O arquivo da extensão excede o limite permitido.",
};

/** Erro estável de domínio. A mensagem pública nunca incorpora bytes ou texto do pacote. */
export class ExtensionError extends Error {
  readonly code: ExtensionErrorCode;

  constructor(code: ExtensionErrorCode, options?: ErrorOptions) {
    super(PUBLIC_MESSAGES[code], options);
    this.name = "ExtensionError";
    this.code = code;
  }
}

export function isExtensionError(error: unknown): error is ExtensionError {
  return error instanceof ExtensionError;
}
