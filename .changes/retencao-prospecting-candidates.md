---
impacto: nada_mudou
secao: corrigido
titulo: Declaração da política de retenção para candidatos da prospecção nativa
---

Define prazos de retenção padrão e pisos em `lib/retencao/politica.ts` para registros de `prospecting_candidates`: 30 dias de padrão (piso de 7) para candidatos nunca contatados (`status='new'`), e 180 dias de padrão (piso de 30) para candidatos processados.

Preserva explicitamente a salvaguarda de que tokens de supressão (`suppression_*`) não são eliminados na expurgação, garantindo o direito de opt-out em futuras coletas. Atualiza a checagem de conformidade em `tests/unit/retencao-todo-piso-tem-dono.test.ts`.

Contribuição de @webtecnica.
