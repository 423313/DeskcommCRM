---
impacto: nada_mudou
secao: corrigido
titulo: A senha das rotinas automáticas deixa de ser gravada no log do servidor
---
A rotina que processa a fila de eventos a cada minuto levava a senha interna escrita na própria linha do agendamento, e o servidor anota cada execução no log do sistema: a senha ia parar lá uma vez por minuto. Agora ela fica num arquivo que só o administrador do servidor lê, e a linha do agendamento só aponta para ele. Instalações novas já nascem assim; nas existentes, a troca acontece sozinha a partir da atualização SEGUINTE a esta, porque a atualização em curso ainda roda o instalador da versão anterior. Crédito: @rafaeskytrabalho.
