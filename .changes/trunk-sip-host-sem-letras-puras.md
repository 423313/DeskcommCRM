---
impacto: nada_mudou
secao: corrigido
titulo: e2e do Trunk SIP garante dígito no sufixo e remove host na varredura de chave crua
---

A spec `tests/e2e/trunk-sip-config.spec.ts` passa a garantir um dígito no sufixo aleatório derivado de `Date.now().toString(36)` e a limpar ocorrências de `host` em `corpoSemOBloco`, evitando que nomes de host gerados casem com o padrão de chave de tradução crua (`a.b.c`).
