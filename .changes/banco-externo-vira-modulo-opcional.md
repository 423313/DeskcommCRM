---
impacto: capacidade_nova
secao: alterado
titulo: O banco de dados externo vira módulo opcional da instalação, desligado por padrão
---

A tela **Dados externos** (conectar o banco de outro sistema para o agente consultar) aparecia para todas as empresas da instalação. Agora ela é um **módulo opcional**: quem administra o servidor liga ou desliga em **Modo administrador › Comportamento › Módulos opcionais › Banco de dados externo**, sem mexer no arquivo de ambiente.

Desligado, o módulo não existe para ninguém: a porta some do menu, do hub de Configurações e da busca, a tela e as rotas dele respondem "não encontrado", e as ferramentas de consulta ao banco externo não são oferecidas ao agente. Ligado, tudo funciona como antes.

**Quem já usava não perde nada na atualização:** se a instalação tinha pelo menos uma conexão de banco externo cadastrada, o módulo já nasce **ligado**. Nas outras, ele nasce desligado — e nada muda para quem nunca cadastrou conexão. A escolha feita na tela nunca é reescrita por uma atualização seguinte.

Decisão do dono no doc 37 (18/09), completando o #1372.
