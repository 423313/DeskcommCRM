/**
 * A RECUSA DE FRONTEIRA DE FUNIL (P-01) FALA ESPANHOL.
 *
 * O texto desta recusa é CHAVE do dicionário. Quando o PR que criou a rota de
 * clone reescreveu a frase nos dois call sites (`/move` e o `moveLeadHandler`)
 * sem tocar `lib/i18n/dicionario.ts`, `traduzir` passou a cair no fallback — quem
 * usa o produto em espanhol voltou a ler português — e as duas entradas antigas
 * ficaram órfãs. O `verify` ficou verde: o gate de i18n
 * (`tests/unit/i18n-espanhol-cobre-a-tela.test.ts`) varre `app` e `components` e
 * ignora `api`, que é justamente onde esta frase vive.
 *
 * Este arquivo mede o COMPORTAMENTO de `traduzir` sobre a constante que os dois
 * call sites usam — não o texto-fonte deles. Mudar a frase e esquecer a tradução
 * deixa isto vermelho.
 */
import { describe, expect, it } from "vitest";

import { traduzir } from "@/lib/i18n/dicionario";
import { RECUSA_DE_TROCA_DE_FUNIL } from "@/lib/leads/clonar-para-funil";

describe("mover para outro funil, em espanhol", () => {
  it("a recusa tem tradução — e não volta em português pelo fallback", () => {
    const es = traduzir(RECUSA_DE_TROCA_DE_FUNIL, "es");
    expect(es).not.toBe(RECUSA_DE_TROCA_DE_FUNIL);
    expect(es).toContain("embudo");
  });

  it("e continua apontando o endpoint do clone nas duas línguas", () => {
    // O ponteiro é o que o consumidor lê para saber o que fazer: uma tradução
    // que o perca transforma a recusa num beco, que é o defeito original.
    for (const idioma of ["pt-BR", "es"] as const) {
      expect(traduzir(RECUSA_DE_TROCA_DE_FUNIL, idioma)).toContain(
        "/api/v1/leads/[id]/clone",
      );
    }
  });
});
