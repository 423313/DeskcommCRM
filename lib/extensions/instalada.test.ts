import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { MOTIVO_PACOTE_ILEGIVEL, lerManifestoAdmitido, montarInstalada } from "./instalada";

const INSTALACAO = "00000000-0000-4000-8000-000000000031";
const ARTEFATO = "00000000-0000-4000-8000-000000000032";
const CATALOGO = "00000000-0000-4000-8000-000000000033";

const manifesto = {
  format_version: 1,
  profile: "declarative",
  publisher: "acme",
  name: "tarefas-praticas",
  version: "1.2.3",
  license: "MIT",
  host_api: { min: 1, max: 1 },
  permissions: ["navigation.tasks"],
  dependencies: [],
  data: { mode: "none" },
  display: {
    title: { "pt-BR": "Tarefas práticas" },
    summary: { "pt-BR": "Orientações para organizar o trabalho." },
    category: "productivity",
    icon: "ListChecks",
  },
  configuration: { density: "comfortable", show_description: true },
  contributions: {
    crm_cards: [
      {
        id: "primeiros-passos",
        title: { "pt-BR": "Primeiros passos" },
        description: { "pt-BR": "Abra a lista de tarefas." },
        icon: "BookOpen",
        blocks: [{ heading: { "pt-BR": "Comece" }, body: { "pt-BR": "Revise as tarefas abertas." } }],
        action: { label: { "pt-BR": "Abrir tarefas" }, capability: "tasks.open" },
      },
    ],
  },
};

const sha = (texto: string) => createHash("sha256").update(texto).digest("hex");
function artefato(documento = JSON.stringify(manifesto), hashDe = documento) {
  return {
    id: ARTEFATO,
    sha256: sha(hashDe),
    byte_length: Buffer.byteLength(hashDe),
    manifest: {},
    document: documento,
  };
}
const item = {
  id: INSTALACAO,
  catalog_id: CATALOGO,
  artifact_id: ARTEFATO,
  publisher: "acme",
  name: "tarefas-praticas",
  version: "1.2.3",
};
const catalogo = { id: CATALOGO, origin: "https://catalogo.example" };
const ativa = {
  enabled: true,
  revision: 3,
  configuration: { density: "compact" as const, show_description: false },
};

describe("montarInstalada", () => {
  it("pacote legível vira view compatível com o display do próprio manifesto", () => {
    const view = montarInstalada({ item, artifact: artefato(), catalog: catalogo, binding: ativa });
    expect(view.compatible).toBe(true);
    expect(view.compatibility_reason).toBeNull();
    expect(view.display.title).toEqual({ "pt-BR": "Tarefas práticas" });
    expect(view).toMatchObject({ enabled: true, revision: 3, origin: "https://catalogo.example" });
  });

  it("documento que não confere com o hash gravado vira incompatível, sem derrubar a lista", () => {
    const adulterado = artefato(JSON.stringify({ ...manifesto, version: "9.9.9" }), JSON.stringify(manifesto));
    const view = montarInstalada({ item, artifact: adulterado, catalog: catalogo, binding: ativa });
    expect(view.compatible).toBe(false);
    expect(view.compatibility_reason).toBe(MOTIVO_PACOTE_ILEGIVEL);
    expect(view.display.title).toEqual({ "pt-BR": "acme/tarefas-praticas" });
  });

  it("pacote íntegro que esta versão já não sabe ler vira incompatível, sem lançar", () => {
    const documento = JSON.stringify({ ...manifesto, profile: "executable" });
    const view = montarInstalada({ item, artifact: artefato(documento), catalog: catalogo, binding: ativa });
    expect(view.compatible).toBe(false);
    expect(view.compatibility_reason).toBe(MOTIVO_PACOTE_ILEGIVEL);
  });

  it("artefato ausente vira incompatível e preserva o vínculo, para ainda ser possível desativar", () => {
    const view = montarInstalada({ item, artifact: undefined, catalog: undefined, binding: ativa });
    expect(view).toMatchObject({ compatible: false, enabled: true, revision: 3, origin: "" });
    expect(view.configuration).toEqual(ativa.configuration);
  });
});

describe("lerManifestoAdmitido", () => {
  it("devolve o motivo em vez de lançar", () => {
    expect(lerManifestoAdmitido(artefato()).ok).toBe(true);
    const adulterado = artefato("{}", JSON.stringify(manifesto));
    expect(lerManifestoAdmitido(adulterado)).toEqual({ ok: false, code: "extension_storage_failed" });
  });
});
