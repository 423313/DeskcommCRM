---
impacto: nada_mudou
secao: corrigido
titulo: A atualização refaz o banco quando ele está ocupado, e para de mostrar três avisos falsos
---
Toda atualização de um CRM que já tinha materiais no acervo dos agentes terminava com três avisos de banco (`could not create unique index`), mesmo com tudo certo. Não havia dado errado: o instalador tentava recriar três regras antigas do acervo, que ele mesmo apaga logo depois, e elas não cabem mais no jeito atual de guardar os materiais. Essas três tentativas saíram. Nenhum dado foi apagado ou alterado.

Esse ruído escondia um problema de verdade. Com o CRM atendendo, o banco às vezes recusa um comando da atualização por disputa com o próprio app (`deadlock detected`). A atualização avisava e seguia, e o que não aplicou ficava para trás: numa instalação real, o acervo dos agentes ficou sem a regra que permite lê-lo. Agora, quando isso acontece, a atualização aplica o banco de novo, em até três passadas no total, antes de a tela dizer `✓ banco atualizado`, e só aparece aviso se o problema continuar. Nesse caso, a própria tela mostra o comando que refaz só o que faltou.

A nova tentativa vale a partir da atualização seguinte a esta: quem executa uma atualização é o instalador que já está no servidor. Os três avisos falsos, esses, somem já nesta.
