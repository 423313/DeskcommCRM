---
impacto: exige_acao
secao: alterado
titulo: Endereço próprio de IA passa a exigir a chave da própria empresa também no atendimento
---
Em Agente de IA › Provedores, quem administra uma empresa pode apontar um ponto de IA para um endereço próprio — um gateway compatível ou um serviço alternativo. Quando essa empresa não tinha chave cadastrada e validada para o provedor do ponto, o sistema usava a chave de IA da instalação, a que paga a conta de todas as empresas do servidor, e a enviava para esse endereço. Numa instalação com várias empresas, era a chave do dono do servidor saindo para um endereço escolhido por uma delas.

A leitura de imagens já recusava essa combinação desde a versão 1.29.0. Agora as chamadas de IA do atendimento recusam também — identificar a etapa do lead, barrar manipulação, resumir e fechar a conversa e os demais pontos que aceitam endereço próprio. A chamada é recusada antes de sair do servidor, um aviso crítico abre na Central dizendo qual ponto corrigir e como, e a tela de Execuções mostra o motivo. Empresa sem endereço próprio não percebe diferença, e empresa com endereço próprio e chave própria cadastrada continua funcionando como antes.

## Requer atenção

Se alguma empresa desta instalação usa endereço próprio num ponto de IA sem ter a chave dela cadastrada e validada para o provedor desse ponto, as chamadas desse ponto passam a ser recusadas no instante em que a atualização entra — e, quando o ponto roda durante o atendimento, a IA dessa empresa pode parar de responder aos clientes. Antes de atualizar, abra Agente de IA › Provedores em cada empresa e, em todo ponto com endereço próprio preenchido, faça uma de duas coisas: cadastre e valide a chave da empresa para o provedor desse ponto, ou apague o endereço próprio para o ponto voltar ao provedor padrão da instalação. Se alguma escapar, o aviso "A IA recusou usar o endereço próprio desta empresa sem a chave dela" na Central diz qual ponto corrigir.
