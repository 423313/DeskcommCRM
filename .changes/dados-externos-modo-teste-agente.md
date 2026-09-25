---
impacto: capacidade_nova
secao: adicionado
titulo: Permitir consulta a banco conectado (crm_query_external_data) no modo Teste do agente
---

Inclui `crm_describe_external_data` e `crm_query_external_data` em `SCENARIO_READS` em `lib/agent-engine/agent/preview.ts`, permitindo que agentes que dependem de tabelas externas conectadas possam catalogar e consultar dados durante simulações na aba Teste sem exigir contato real associado.

Contribuição de @webtecnica.
