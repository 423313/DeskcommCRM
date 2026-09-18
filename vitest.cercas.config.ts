import { defineConfig } from "vitest/config";
import { selecionarCercas } from "./tests/cercas/selecao";

// `pnpm cercas`: as guardas estruturais (baseline × cadeia, MANIFEST, varredura
// de anon, docs que apontam para o que existe, workflows…), sozinhas e primeiro.
//
// Existem porque o `verify` descobria esse tipo de erro no FIM da suíte de
// unit, depois de 7 a 12 minutos — medido em 18/09/2026 nos runs 35341823692
// (apêndice do baseline divergindo da cadeia, vermelho aos 417s do passo) e
// 35331913136 (path de doc inexistente + função criada depois da varredura, aos
// 722s). Nenhum dos três precisava de nada além de ler arquivo.
//
// Os mesmos arquivos continuam na suíte longa (`vitest.config.ts` não os
// exclui): isto ANTECIPA o vermelho, não substitui a medição. Quem é cerca é
// decidido em tests/cercas/selecao.ts, pelo que o arquivo importa.
export default defineConfig({
  test: {
    // Sem jsdom e sem o setup que carrega `.env`: uma cerca não importa código
    // do produto, então não há quem valide env nem quem toque em DOM. É daqui
    // que vem a maior parte do ganho — o ambiente jsdom é o custo dominante da
    // suíte longa.
    environment: "node",
    include: selecionarCercas(__dirname),
    globals: true,
    // Mesmo teto da suíte longa, pela mesma razão escrita em vitest.config.ts:
    // várias cercas varrem o repositório inteiro ou abrem `git`.
    testTimeout: 15_000,
  },
});
