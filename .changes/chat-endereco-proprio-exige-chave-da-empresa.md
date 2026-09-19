---
impacto: capacidade_nova
secao: alterado
titulo: A IA avisa quando uma empresa usa endereço próprio sem a chave dela — e passa a recusar em 19/10/2026
---
Em Agente de IA › Provedores, quem administra uma empresa pode apontar um ponto de IA para um endereço próprio — um gateway compatível ou um serviço alternativo. Quando essa empresa não tem chave cadastrada e validada para o provedor do ponto, o sistema usa a chave de IA da instalação, a que paga a conta de todas as empresas do servidor, e a envia para esse endereço. Numa instalação com várias empresas, é a chave do dono do servidor saindo para um endereço escolhido por uma delas.

A partir desta versão, toda vez que isso acontece **abre um aviso crítico na Central** dizendo qual ponto está nessa situação, qual empresa, e o que fazer — e o motivo também aparece na tela de Execuções. **A chamada continua funcionando**: nada para de responder quando você atualiza, e ninguém precisa mexer em configuração nenhuma para instalar esta versão.

O aviso traz a data em que isso muda: **a partir de 19/10/2026 essas chamadas passam a ser recusadas**, como a leitura de imagens já faz desde a versão 1.29.0. Até lá há tempo de sobra para corrigir, com o aviso apontando exatamente onde.

Para corrigir, em cada empresa que aparecer no aviso: abra Agente de IA › Provedores e, no ponto indicado, cadastre e valide a chave daquela empresa para o provedor — ou apague o endereço próprio, para o ponto voltar ao provedor padrão da instalação. Empresa sem endereço próprio não percebe diferença nenhuma, e empresa com endereço próprio e chave própria continua funcionando como sempre.
