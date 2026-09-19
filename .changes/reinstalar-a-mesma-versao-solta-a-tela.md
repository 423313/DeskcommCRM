---
impacto: nada_mudou
secao: corrigido
titulo: Reinstalar a versão que falhou deixa de travar a tela de atualização
---

Quando uma atualização falha e o sistema volta para a versão anterior, a tela de
Atualização mostra o aviso da falha sem o botão de atualizar. Ela já sabia
reconhecer que a falha tinha sido superada por uma instalação posterior — mas só
quando a versão instalada era **outra**.

Faltava justamente o caso mais comum de dar certo na segunda tentativa:
reinstalar a **mesma** versão que falhou. Medido numa instalação real: a versão
nova foi anunciada antes de as imagens dos contêineres ficarem prontas, a
atualização falhou com "imagem não encontrada" e, meia hora depois, a mesma
versão instalou sem nenhum problema. A tela continuou anunciando a falha e, sem
botão, bloqueou a versão seguinte que já havia saído.

Agora quem desfaz o engano é o próprio sistema em execução: se o aplicativo que
responde já está rodando a versão que o aviso diz ter falhado, o aviso sai e o
botão volta. Numa falha de verdade, em que o sistema voltou mesmo para a versão
anterior, o aviso continua aparecendo como antes, com o comando para retornar.
