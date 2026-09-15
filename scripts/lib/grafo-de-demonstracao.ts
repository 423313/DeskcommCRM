/**
 * O grafo de follow-up que o seed de demonstração publica.
 *
 * ⚠️ VIVE FORA DO SEEDER DE PROPÓSITO, e a razão é poder ser TESTADO. O seeder
 * chama `main()` no topo do módulo — importá-lo de um teste rodaria o seed
 * contra o banco de quem rodou a suíte. Aqui é só dado, e
 * `tests/unit/grafo-de-demonstracao-e-valido.test.ts` o passa pelo
 * `flowGraphSchema` de verdade.
 *
 * Por que isso merece teste: um grafo que o validador recusa é gravado sem erro
 * (o INSERT só vê `jsonb`) e só falha quando alguém abre o construtor — ou seja,
 * na demonstração, na frente de quem se queria impressionar. O schema é
 * `strictObject` em quase toda parte, então uma chave a mais reprova, e o
 * `waitConfigSchema` tem piso de 300.000 ms que ninguém adivinha.
 */

/** Os ids são nomeados porque as inscrições do seed apontam para eles. */
export const NO_INICIO = "trigger-1";
export const NO_ESPERA = "wait-1";
export const NO_MENSAGEM = "action-1";
export const NO_FIM = "end-1";

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Início → espera → mensagem → fim. Não é um fluxo de vitrine: é o menor grafo
 * que o validador aceita e o motor sabe percorrer. Um grafo bonito e inválido
 * não abre.
 */
export const GRAFO_DE_DEMONSTRACAO = {
  nodes: [
    { id: NO_INICIO, type: "trigger", label: "Início", position: { x: 0, y: 0 }, config: {} },
    {
      id: NO_ESPERA,
      type: "wait",
      label: "Espera 1 dia",
      position: { x: 240, y: 0 },
      config: { mode: "fixed", duration_ms: DIA_MS },
    },
    {
      id: NO_MENSAGEM,
      type: "action",
      label: "Retoma o contato",
      position: { x: 480, y: 0 },
      config: {
        mode: "text",
        body: "Oi! Passando para saber se você ainda tem interesse. Posso ajudar em algo?",
      },
    },
    {
      id: NO_FIM,
      type: "end",
      label: "Encerra",
      position: { x: 720, y: 0 },
      config: { outcome: "exhausted" },
    },
  ],
  edges: [
    { id: "e1", source: NO_INICIO, target: NO_ESPERA, priority: 0, condition: { type: "always" } },
    { id: "e2", source: NO_ESPERA, target: NO_MENSAGEM, priority: 0, condition: { type: "always" } },
    { id: "e3", source: NO_MENSAGEM, target: NO_FIM, priority: 0, condition: { type: "always" } },
  ],
};
