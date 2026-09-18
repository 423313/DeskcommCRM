---
impacto: capacidade_nova
secao: corrigido
titulo: A senha interna das rotinas que ficou no log do sistema é trocada sozinha
---

Versões anteriores do instalador escreviam a senha interna das rotinas (`INTERNAL_CRON_SECRET`) dentro da linha do agendamento, e o sistema da VPS gravava essa linha no log a cada minuto (`/var/log/syslog`, arquivos rotacionados e journal). O conserto que parou de gravar (#1054, achado por @rafaeskytrabalho) não desfazia o que já estava lá: a senha velha continuava abrindo as rotas internas para quem lesse esse log.

Agora a atualização troca essa senha sozinha, uma vez só: gera uma nova, grava no `.env`, reinicia o app e reescreve o agendamento. A senha que ficou no log deixa de valer. Quem atualiza pelo terminal vê a troca no fim da atualização; quem atualiza pelo botão da tela tem a troca feita pelo agente de atualização em até 5 minutos depois (o app reinicia por alguns segundos nesse momento). Nenhum arquivo precisa ser editado. Instalação nova já nasce com senha que nunca foi para o log e não passa pela troca.

Recomendado, não obrigatório: apagar os logs antigos, onde a senha velha aparece — o comando está no aviso do fim da atualização.
