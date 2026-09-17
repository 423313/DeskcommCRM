import { beforeEach, describe, expect, it, vi } from "vitest";
import { processRagIndexer } from "@/workers/rag-indexer";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolverChaveDeEmbedding } from "@/lib/ai/embeddings/chave";
import { acquireDebounce } from "@/lib/ai/rag/debounce";
import { extrairTextoDoArquivo } from "@/lib/ai/rag/ingest/documento";

/**
 * A CAUSA DE UMA FALHA DE EXTRAÇÃO CHEGA A QUEM LÊ O CARTÃO E A CENTRAL.
 *
 * `ErroDeExtracao.message` é chave de UI (estável, traduzível na rota de
 * upload) e o diagnóstico — erro do Storage, mensagem do parser de PDF — mora
 * em `detalhe`. Na reindexação, o worker é o ÚNICO lugar que registra a falha:
 * `last_index_error` da fonte e o corpo do aviso da Central. Se ele gravar só a
 * chave, "Falha ao processar o envio do arquivo." vira o registro inteiro, e o
 * `Cannot find package 'pdfjs-dist'` que diria ao operador o que consertar
 * desaparece de todo lugar.
 */

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/ai/embed", () => ({
  embedText: vi.fn(),
  SemChaveDeEmbeddingError: class SemChaveDeEmbeddingError extends Error {},
}));
vi.mock("@/lib/ai/embeddings/chave", () => ({ resolverChaveDeEmbedding: vi.fn() }));
vi.mock("@/lib/ai/rag/debounce", () => ({ acquireDebounce: vi.fn() }));
vi.mock("@/lib/ai/rag/ingest/documento", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/ai/rag/ingest/documento")>();
  return { ...real, extrairTextoDoArquivo: vi.fn() };
});
vi.mock("@/lib/ai/rag/version", () => ({
  createKnowledgeVersion: vi.fn(),
  markVersionReady: vi.fn(),
  markVersionFailed: vi.fn(),
  activateVersion: vi.fn(),
}));

const FONTE = {
  id: "ks-doc",
  organization_id: "org-1",
  agent_id: null,
  source_type: "documento",
  name: "Tabela de preços",
  status: "ready",
  is_active: true,
  source_metadata: { blob_path: "org-1/tabela.pdf", filename: "tabela.pdf", ext: "pdf" },
};

const EVENTO = {
  id: "ev-1",
  organization_id: "org-1",
  event_type: "knowledge_source.updated",
  entity_kind: "ai_knowledge_source",
  entity_id: "ks-doc",
  payload: { knowledge_source_id: "ks-doc" },
  metadata: {},
  created_at: new Date().toISOString(),
};

let carimbos: Array<Record<string, unknown>> = [];
let avisos: Array<Record<string, unknown>> = [];

beforeEach(async () => {
  vi.clearAllMocks();
  carimbos = [];
  avisos = [];

  vi.mocked(createAdminClient).mockReturnValue({
    from: (tabela: string) => {
      if (tabela === "ai_knowledge_sources") {
        const leitura = {
          select: () => leitura,
          eq: () => leitura,
          maybeSingle: () => Promise.resolve({ data: FONTE, error: null }),
        };
        return {
          ...leitura,
          update: (campos: Record<string, unknown>) => {
            carimbos.push(campos);
            const escrita = { eq: () => escrita, then: (ok: (v: unknown) => void) => ok({ error: null }) };
            return escrita;
          },
        };
      }
      if (tabela === "agent_inbox_items") {
        const leitura = {
          select: () => leitura,
          eq: () => leitura,
          is: () => leitura,
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        };
        return {
          ...leitura,
          insert: (linha: Record<string, unknown>) => {
            avisos.push(linha);
            return Promise.resolve({ error: null });
          },
        };
      }
      throw new Error(`tabela não dublada no teste: ${tabela}`);
    },
  } as never);

  vi.mocked(acquireDebounce).mockResolvedValue(true as never);
  vi.mocked(resolverChaveDeEmbedding).mockResolvedValue({ origem: "org" } as never);

  const { ErroDeExtracao } = await import("@/lib/ai/rag/ingest/documento");
  vi.mocked(extrairTextoDoArquivo).mockRejectedValue(
    new ErroDeExtracao("Falha ao processar o envio do arquivo.", "Cannot find package 'pdfjs-dist'"),
  );
});

describe("rag-indexer — falha de extração guarda a causa", () => {
  it("last_index_error e o aviso da Central trazem a chave E o detalhe", async () => {
    const resultado = await processRagIndexer(EVENTO as never);

    expect(resultado.status).toBe("error");

    const falha = carimbos.find((c) => c["last_index_status"] === "failed");
    expect(falha, "a fonte precisa ser carimbada como failed").toBeDefined();
    expect(String(falha!["last_index_error"])).toContain("Falha ao processar o envio do arquivo.");
    expect(String(falha!["last_index_error"])).toContain("pdfjs-dist");

    expect(avisos).toHaveLength(1);
    expect(String(avisos[0]!["body"])).toContain("pdfjs-dist");
  });
});
