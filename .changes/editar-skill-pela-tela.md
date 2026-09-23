---
impacto: capacidade_nova
secao: adicionado
titulo: Editar o texto de uma skill pela tela, com histórico de versões e restauração
---

Em **IA › Skills**, cada skill instalada ganha o botão **Editar**. Nele dá para mudar a descrição, as palavras-chave que ativam a skill e o procedimento que o agente segue. Cada vez que você salva, nasce uma versão nova, e a anterior fica guardada. No mesmo lugar aparece o histórico de versões, e **Restaurar** volta para qualquer uma delas na hora, sem reiniciar nada. Antes, a única forma de mudar o texto de uma skill era enviar um .zip de novo.

Uma skill que veio de um pacote com arquivos continua mudando só pelo pacote: a tela avisa e não deixa salvar, porque a versão nova perderia os arquivos.

O agente também deixa de "esquecer" uma skill quando o cliente responde só a escolha, como "a de 2025": para decidir que skill usar, ele passa a olhar as últimas mensagens do cliente, e não só a mais recente.

Nada para fazer. Quem edita e restaura é o gerente ou o administrador.

Construído a partir do trabalho de @vgamkt no #1130.
