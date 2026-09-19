---
impacto: nada_mudou
secao: adicionado
titulo: O banco ganha as rotinas que fazem uma tabela criada depois da instalação nascer protegida
---

Preparo para os módulos opcionais com dados próprios (a comanda do financeiro é o primeiro). Até aqui, tabela criada depois que o schema foi aplicado não recebia sozinha as proteções que o schema aplica em lote — ficava sem isolamento entre organizações e alcançável pela chave pública do navegador. Agora essas proteções moram em duas rotinas do próprio banco, e quem cria tabela depois as chama.

Para quem já roda o CRM: nada muda e nada precisa ser feito. A rotina foi medida contra o schema atual e é uma passagem em branco — as 119 tabelas de organização que existem hoje já estão protegidas, e a foto do banco antes e depois da mudança é idêntica, tirando as duas rotinas novas. Nenhuma tabela nova, nenhuma coluna nova, nenhum dado reescrito, nenhuma variável de ambiente.
